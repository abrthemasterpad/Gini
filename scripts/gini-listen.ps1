param(
    [int]$Seconds = 8
)

$ErrorActionPreference = "Stop"

$Root = Split-Path -Parent $PSScriptRoot
$Runtime = Join-Path $Root "runtime"
$Raw = Join-Path $Runtime "gini-mic.aac"
$Meta = Join-Path $Runtime "gini-mic-meta.json"
$Wav = Join-Path $Runtime "gini-mic.wav"
$Model = Join-Path $Root "models\\ggml-base-q5_1.bin"

Write-Host ""
Write-Host "GINI LISTEN" -ForegroundColor Cyan

if (!(Test-Path $Model)) {
    throw "STT model missing. Connect to internet once and run scripts\\setup-stt.ps1 first."
}

if (!(Test-Connection 172.14.10.1 -Count 1 -Quiet)) {
    throw "Gini camera is not reachable. Connect this PC to Gini camera Wi-Fi."
}

New-Item -ItemType Directory -Force -Path $Runtime | Out-Null
Remove-Item $Raw,$Meta,$Wav -ErrorAction SilentlyContinue

$env:GINI_CAPTURE_MS = ($Seconds * 1000).ToString()

Write-Host "Speak for the next $Seconds seconds..." -ForegroundColor Yellow

& node.exe (Join-Path $PSScriptRoot "gini-capture-mic.js")

if ($LASTEXITCODE -ne 0 -or !(Test-Path $Meta) -or !(Test-Path $Raw)) {
    throw "Gini did not capture usable microphone audio."
}

$info = Get-Content $Meta -Raw | ConvertFrom-Json

Write-Host ""
Write-Host "Captured $($info.audioFrames) audio frames / $($info.audioBytes) bytes" -ForegroundColor Green
Write-Host "Codec: $($info.audio.codec)"

if ("$($info.audio.codec)" -notmatch "^AAC") {
    throw "Unexpected microphone codec: $($info.audio.codec)"
}

$ffargs = @(
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

& ffmpeg.exe @ffargs

if ($LASTEXITCODE -ne 0 -or !(Test-Path $Wav)) {
    throw "AAC microphone decode failed."
}

Write-Host ""
Write-Host "Transcribing locally..." -ForegroundColor Cyan

& (Join-Path $PSScriptRoot "gini-stt.ps1") -InputFile $Wav
