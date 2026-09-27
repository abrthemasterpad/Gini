param(
    [double]$WindowSeconds = 3.5,
    [double]$SpeechThresholdDb = -36,
    [int]$Step = 1,
    [int]$Speed = 8,
    [switch]$NoVoiceReply
)

$ErrorActionPreference = "Stop"

$Root = Split-Path -Parent $PSScriptRoot
$Runtime = Join-Path $Root "runtime"

$Capture = Join-Path $PSScriptRoot "gini-capture-mic.js"
$Stt = Join-Path $PSScriptRoot "gini-stt.ps1"
$PTZ = Join-Path $Root "gini.ps1"
$Say = Join-Path $Root "gini-say.ps1"

$Raw = Join-Path $Runtime "gini-mic.aac"
$Meta = Join-Path $Runtime "gini-mic-meta.json"
$Wav = Join-Path $Runtime "gini-mic.wav"
$Transcript = Join-Path $Runtime "gini-transcript.txt"
$Model = Join-Path $Root "models\ggml-base-q5_1.bin"

if (!(Test-Path $Capture)) { throw "Missing capture script: $Capture" }
if (!(Test-Path $Stt)) { throw "Missing STT script: $Stt" }
if (!(Test-Path $PTZ)) { throw "Missing PTZ script: $PTZ" }
if (!(Test-Path $Model)) { throw "Missing Whisper model. Run scripts\setup-stt.ps1 while online." }

if (!(Test-Connection 172.14.10.1 -Count 1 -Quiet)) {
    throw "Gini camera is not reachable. Connect this PC to Gini camera Wi-Fi."
}

New-Item -ItemType Directory -Force -Path $Runtime | Out-Null

$wakeAliases = @(
    "gini",
    "jeanie",
    "genie",
    "ginny",
    "jini",
    "jenny"
)

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
            $cmd = ($n -replace $pattern, "").Trim()
            return [PSCustomObject]@{
                Wake = $true
                Alias = $alias
                Command = $cmd
            }
        }
    }

    return [PSCustomObject]@{
        Wake = $false
        Alias = ""
        Command = $n
    }
}

function Invoke-GiniReply([string]$Reply) {
    Write-Host "GINI: $Reply" -ForegroundColor Cyan

    if ($NoVoiceReply) {
        return
    }

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

Write-Host ""
Write-Host "==============================================" -ForegroundColor Cyan
Write-Host "GINI CONTINUOUS LISTENING v0.2" -ForegroundColor Cyan
Write-Host "==============================================" -ForegroundColor Cyan
Write-Host "Wake word: Gini" -ForegroundColor Green
Write-Host "Window: $WindowSeconds sec | VAD threshold: $SpeechThresholdDb dB"
Write-Host "Say: Gini turn left / right / look up / look down"
Write-Host "Say: Gini sleep   to stop by voice"
Write-Host "Or press Ctrl+C to stop."
Write-Host ""

$cycle = 0
$running = $true

while ($running) {
    $cycle++

    Remove-Item $Raw,$Meta,$Wav,$Transcript -ErrorAction SilentlyContinue

    $env:GINI_CAPTURE_MS = ([int]($WindowSeconds * 1000)).ToString()

    Write-Host "[$cycle] Listening..." -ForegroundColor DarkGray

    & node.exe $Capture *> $null

    if ($LASTEXITCODE -ne 0 -or !(Test-Path $Raw) -or !(Test-Path $Meta)) {
        Write-Host "Capture failed. Retrying..." -ForegroundColor Yellow
        Start-Sleep -Milliseconds 800
        continue
    }

    $meta = Get-Content $Meta -Raw | ConvertFrom-Json

    if ([int]$meta.audioBytes -le 0) {
        Write-Host "No audio packets. Retrying..." -ForegroundColor Yellow
        Start-Sleep -Milliseconds 500
        continue
    }

    $decodeArgs = @(
        "-y",
        "-hide_banner",
        "-loglevel", "error",
        "-f", "aac",
        "-i", $Raw,
        "-ac", "1",
        "-ar", "16000",
        "-c:a", "pcm_s16le",
        $Wav
    )

    & ffmpeg.exe @decodeArgs

    if ($LASTEXITCODE -ne 0 -or !(Test-Path $Wav)) {
        Write-Host "Audio decode failed. Retrying..." -ForegroundColor Yellow
        Start-Sleep -Milliseconds 500
        continue
    }

    $volArgs = @(
        "-hide_banner",
        "-nostats",
        "-i", $Wav,
        "-af", "volumedetect",
        "-f", "null",
        "NUL"
    )

    $volOutput = (& ffmpeg.exe @volArgs 2>&1 | Out-String)

    $maxDb = -100.0
    $match = [regex]::Match($volOutput, 'max_volume:\s*(-?\d+(?:\.\d+)?)\s*dB')

    if ($match.Success) {
        $maxDb = [double]::Parse(
            $match.Groups[1].Value,
            [System.Globalization.CultureInfo]::InvariantCulture
        )
    }

    if ($maxDb -lt $SpeechThresholdDb) {
        Write-Host "    quiet ($maxDb dB) -> sleeping" -ForegroundColor DarkGray
        continue
    }

    Write-Host "    voice activity ($maxDb dB) -> understanding..." -ForegroundColor DarkCyan

    Remove-Item $Transcript -ErrorAction SilentlyContinue

    & $Stt -InputFile $Wav *> $null

    if (!(Test-Path $Transcript)) {
        Write-Host "    speech present, no useful words." -ForegroundColor DarkGray
        continue
    }

    $heard = (Get-Content $Transcript -Raw).Trim()

    if ([string]::IsNullOrWhiteSpace($heard)) {
        continue
    }

    Write-Host "HEARD: $heard" -ForegroundColor Green

    $wake = Get-WakeCommand $heard

    if (-not $wake.Wake) {
        Write-Host "    no Gini wake word -> ignored" -ForegroundColor DarkGray
        continue
    }

    Write-Host "WAKE WORD OK" -ForegroundColor Cyan

    if ([string]::IsNullOrWhiteSpace($wake.Command)) {
        Invoke-GiniReply "Yes?"
        Start-Sleep -Milliseconds 1200
        continue
    }

    Write-Host "COMMAND: $($wake.Command)" -ForegroundColor Cyan

    $sleepRequested = Invoke-GiniCommand $wake.Command

    Start-Sleep -Milliseconds 1400

    if ($sleepRequested) {
        $running = $false
    }
}

Write-Host ""
Write-Host "GINI CONTINUOUS LISTENING STOPPED" -ForegroundColor Green
