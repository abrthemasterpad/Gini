param(
    [double]$SpeechThresholdDb = -36,
    [int]$Step = 1,
    [int]$Speed = 8,
    [switch]$NoVoiceReply
)

$ErrorActionPreference = "Stop"

$Root = Split-Path -Parent $PSScriptRoot
$Runtime = Join-Path $Root "runtime"
$ChunkDir = Join-Path $Runtime "listen-chunks"

$Listener = Join-Path $PSScriptRoot "gini-native-listener.js"
$Stt = Join-Path $PSScriptRoot "gini-stt.ps1"
$PTZ = Join-Path $Root "gini.ps1"
$Say = Join-Path $Root "gini-say.ps1"

$Ready = Join-Path $Runtime "gini-listener-ready.flag"
$StopFlag = Join-Path $Runtime "gini-listener-stop.flag"
$Status = Join-Path $Runtime "gini-listener-status.json"
$ListenerOut = Join-Path $Runtime "gini-listener.stdout.log"
$ListenerErr = Join-Path $Runtime "gini-listener.stderr.log"

$Wav = Join-Path $Runtime "gini-listen-window.wav"
$Transcript = Join-Path $Runtime "gini-transcript.txt"
$Model = Join-Path $Root "models\ggml-base-q5_1.bin"

if (!(Test-Path $Listener)) { throw "Missing persistent listener: $Listener" }
if (!(Test-Path $Stt)) { throw "Missing STT script: $Stt" }
if (!(Test-Path $PTZ)) { throw "Missing PTZ script: $PTZ" }
if (!(Test-Path $Model)) { throw "Missing Whisper model. Run scripts\setup-stt.ps1 while online." }

if (!(Test-Connection 172.14.10.1 -Count 1 -Quiet)) {
    throw "Gini camera is not reachable. Connect this PC to Gini camera Wi-Fi."
}

New-Item -ItemType Directory -Force -Path $Runtime | Out-Null
New-Item -ItemType Directory -Force -Path $ChunkDir | Out-Null

$wakeAliases = @("gini","jeanie","genie","ginny","jini","jenny")

function Normalize-GiniText([string]$Text) {
    $n = $Text.ToLowerInvariant()
    $n = $n -replace '[“”"]',''
    $n = $n -replace '[\.,!?;:]',' '
    $n = $n -replace '\s+',' '
    return $n.Trim()
}

function Get-WakeCommand([string]$Text) {
    $n = Normalize-GiniText $Text

    foreach ($alias in $wakeAliases) {
        $pattern = "^$([regex]::Escape($alias))(\s+|$)"
        if ($n -match $pattern) {
            return [PSCustomObject]@{
                Wake = $true
                Alias = $alias
                Command = (($n -replace $pattern, "").Trim())
            }
        }
    }

    return [PSCustomObject]@{
        Wake = $false
        Alias = ""
        Command = $n
    }
}

function Stop-NativeListener($Process) {
    New-Item -ItemType File -Force -Path $StopFlag | Out-Null

    if ($Process) {
        try {
            Wait-Process -Id $Process.Id -Timeout 3 -ErrorAction SilentlyContinue
        } catch {}

        if (Get-Process -Id $Process.Id -ErrorAction SilentlyContinue) {
            Stop-Process -Id $Process.Id -Force -ErrorAction SilentlyContinue
        }
    }

    Remove-Item $StopFlag -ErrorAction SilentlyContinue
    Remove-Item $Ready -ErrorAction SilentlyContinue
}

function Start-NativeListener {
    Remove-Item $StopFlag,$Ready,$Status,$ListenerOut,$ListenerErr -ErrorAction SilentlyContinue
    Get-ChildItem $ChunkDir -Filter "chunk-*.aac" -ErrorAction SilentlyContinue | Remove-Item -Force -ErrorAction SilentlyContinue

    $p = Start-Process -FilePath "node.exe" -ArgumentList @($Listener) -WorkingDirectory $Root -RedirectStandardOutput $ListenerOut -RedirectStandardError $ListenerErr -PassThru

    $deadline = (Get-Date).AddSeconds(15)

    while ((Get-Date) -lt $deadline) {
        if (Test-Path $Ready) {
            Write-Host "Native stream open OK - Gini is ready for speech" -ForegroundColor Green
            return $p
        }

        if ($p.HasExited) {
            $errText = ""
            if (Test-Path $ListenerErr) {
                $errText = Get-Content $ListenerErr -Raw
            }
            throw "Persistent listener exited before becoming ready. $errText"
        }

        Start-Sleep -Milliseconds 200
    }

    Stop-NativeListener $p
    throw "Persistent native stream did not open within 15 seconds."
}

function Invoke-GiniReply([string]$Reply) {
    Write-Host "GINI: $Reply" -ForegroundColor Cyan

    if ($NoVoiceReply) { return }

    if (Test-Path $Say) {
        & $Say $Reply
    }
}

function Invoke-GiniCommand([string]$Command) {
    $action = $null
    $reply = $null
    $sleepRequested = $false

    switch -Regex ($Command) {
        '^(go to sleep|sleep|stop listening|stop)$' {
            $reply = "Okay. I am going to sleep."
            $sleepRequested = $true
            break
        }
        '(turn|look|move)\s+(to\s+the\s+)?left|\bleft\b' {
            $action = "left"
            $reply = "Turning left."
            break
        }
        '(turn|look|move)\s+(to\s+the\s+)?right|\bright\b' {
            $action = "right"
            $reply = "Turning right."
            break
        }
        '(look|move|turn)\s+up|\bup\b' {
            $action = "up"
            $reply = "Looking up."
            break
        }
        '(look|move|turn)\s+down|\bdown\b' {
            $action = "down"
            $reply = "Looking down."
            break
        }
        'can you hear me|do you hear me|hear me' {
            $reply = "Yes. I can hear you."
            break
        }
        'are you there|you there' {
            $reply = "Yes. I am here."
            break
        }
        'say hello|hello|hi' {
            $reply = "Hello. I am Gini."
            break
        }
        default {
            $reply = "I heard you, but I do not know that command yet."
        }
    }

    if ($action) {
        Write-Host "ACTION: $action" -ForegroundColor Magenta
        & $PTZ $action -Step $Step -Speed $Speed
    }

    Invoke-GiniReply $reply
    return $sleepRequested
}

function Get-MaxVolumeDb([string]$AudioFile) {
    $args = @("-hide_banner","-nostats","-i",$AudioFile,"-af","volumedetect","-f","null","NUL")
    $out = (& ffmpeg.exe @args 2>&1 | Out-String)
    $match = [regex]::Match($out, 'max_volume:\s*(-?\d+(?:\.\d+)?)\s*dB')

    if (!$match.Success) { return -100.0 }

    return [double]::Parse(
        $match.Groups[1].Value,
        [System.Globalization.CultureInfo]::InvariantCulture
    )
}

Write-Host ""
Write-Host "==================================================" -ForegroundColor Cyan
Write-Host "GINI CONTINUOUS LISTENING v0.2.1" -ForegroundColor Cyan
Write-Host "==================================================" -ForegroundColor Cyan
Write-Host "Persistent native microphone connection" -ForegroundColor Green
Write-Host "Wake word: Gini"
Write-Host "VAD threshold: $SpeechThresholdDb dB"
Write-Host "Say: Gini turn left / right / look up / look down"
Write-Host "Say: Gini sleep to stop"
Write-Host "Ctrl+C also stops it."
Write-Host ""

$listenerProcess = $null
$running = $true
$lastName = ""

try {
    $listenerProcess = Start-NativeListener
    Write-Host "Gini is continuously listening..." -ForegroundColor Cyan

    while ($running) {
        $chunk = Get-ChildItem $ChunkDir -Filter "chunk-*.aac" -ErrorAction SilentlyContinue |
            Sort-Object Name |
            Where-Object { $_.Name -gt $lastName } |
            Select-Object -First 1

        if (!$chunk) {
            if ($listenerProcess.HasExited) {
                throw "Native microphone listener stopped unexpectedly. See $ListenerErr"
            }

            Start-Sleep -Milliseconds 150
            continue
        }

        $lastName = $chunk.Name

        $decodeArgs = @("-y","-hide_banner","-loglevel","error","-f","aac","-i",$chunk.FullName,"-ac","1","-ar","16000","-c:a","pcm_s16le",$Wav)
        & ffmpeg.exe @decodeArgs

        if ($LASTEXITCODE -ne 0 -or !(Test-Path $Wav)) { continue }

        $maxDb = Get-MaxVolumeDb $Wav

        if ($maxDb -lt $SpeechThresholdDb) {
            Write-Host "." -NoNewline -ForegroundColor DarkGray
            continue
        }

        Write-Host ""
        Write-Host "Voice activity: $maxDb dB -> understanding..." -ForegroundColor DarkCyan

        Remove-Item $Transcript -ErrorAction SilentlyContinue
        & $Stt -InputFile $Wav *> $null

        if (!(Test-Path $Transcript)) { continue }

        $heard = (Get-Content $Transcript -Raw).Trim()

        if ([string]::IsNullOrWhiteSpace($heard)) { continue }

        Write-Host "HEARD: $heard" -ForegroundColor Green

        $wake = Get-WakeCommand $heard

        if (-not $wake.Wake) {
            Write-Host "No Gini wake word -> ignored" -ForegroundColor DarkGray
            continue
        }

        Write-Host "WAKE WORD OK" -ForegroundColor Cyan

        Stop-NativeListener $listenerProcess
        $listenerProcess = $null

        if ([string]::IsNullOrWhiteSpace($wake.Command)) {
            Invoke-GiniReply "Yes?"
            Start-Sleep -Milliseconds 800
            $listenerProcess = Start-NativeListener
            $lastName = ""
            continue
        }

        Write-Host "COMMAND: $($wake.Command)" -ForegroundColor Cyan

        $sleepRequested = Invoke-GiniCommand $wake.Command

        if ($sleepRequested) {
            $running = $false
            break
        }

        Start-Sleep -Milliseconds 700
        $listenerProcess = Start-NativeListener
        $lastName = ""
        Write-Host "Listening again..." -ForegroundColor Cyan
    }
}
finally {
    if ($listenerProcess) {
        Stop-NativeListener $listenerProcess
    }
}

Write-Host ""
Write-Host "GINI CONTINUOUS LISTENING STOPPED" -ForegroundColor Green
