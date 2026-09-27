param(
    [switch]$SkipTest
)

$ErrorActionPreference = "Stop"

$Root = Split-Path -Parent $PSScriptRoot
$Models = Join-Path $Root "models"
$Model = Join-Path $Models "ggml-base-q5_1.bin"
$TestWav = Join-Path $Root "gini-native-mic-s0.wav"

Write-Host ""
Write-Host "GINI STT SETUP" -ForegroundColor Cyan

$filters = & ffmpeg.exe -hide_banner -filters 2>&1
if (($filters | Out-String) -notmatch "\\bwhisper\\b") {
    throw "This FFmpeg build does not expose the whisper filter."
}

Write-Host "FFmpeg Whisper filter: OK" -ForegroundColor Green

New-Item -ItemType Directory -Force -Path $Models | Out-Null

if (!(Test-Path $Model) -or ((Get-Item $Model).Length -lt 50000000)) {
    Write-Host ""
    Write-Host "Downloading multilingual Whisper base-q5_1 model (~60 MB)..." -ForegroundColor Yellow

    $url = "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base-q5_1.bin"

    & curl.exe -L --fail --progress-bar $url -o $Model

    if ($LASTEXITCODE -ne 0) {
        throw "Model download failed."
    }
}

$sizeMB = [math]::Round((Get-Item $Model).Length / 1MB, 1)
Write-Host "Whisper model ready: $sizeMB MB" -ForegroundColor Green

if (!$SkipTest -and (Test-Path $TestWav)) {
    Write-Host ""
    Write-Host "Testing STT on the microphone recording Gini already captured..." -ForegroundColor Cyan
    & (Join-Path $PSScriptRoot "gini-stt.ps1") -InputFile $TestWav
}
else {
    Write-Host ""
    Write-Host "Setup complete." -ForegroundColor Green
}
