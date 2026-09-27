param(
    [switch]$SkipTest
)

$ErrorActionPreference = "Stop"

$Root = Split-Path -Parent $PSScriptRoot
$Tools = Join-Path $Root "tools\whisper"
$Models = Join-Path $Root "models"
$Model = Join-Path $Models "ggml-base-q5_1.bin"
$TestWav = Join-Path $Root "gini-native-mic-s0.wav"

$WhisperZip = Join-Path $Root "tools\whisper-bin-x64.zip"
$WhisperUrl = "https://github.com/ggml-org/whisper.cpp/releases/download/b5130/whisper-bin-x64.zip"
$ModelUrl = "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base-q5_1.bin"

Write-Host ""
Write-Host "GINI STT SETUP" -ForegroundColor Cyan
Write-Host "Using whisper.cpp CLI (CPU, fully local after setup)." -ForegroundColor DarkGray

New-Item -ItemType Directory -Force -Path (Join-Path $Root "tools") | Out-Null
New-Item -ItemType Directory -Force -Path $Models | Out-Null

$WhisperCli = Get-ChildItem $Tools -Filter "whisper-cli.exe" -Recurse -ErrorAction SilentlyContinue |
    Select-Object -First 1

if (!$WhisperCli) {
    Write-Host ""
    Write-Host "Downloading official whisper.cpp Windows x64 CPU build..." -ForegroundColor Yellow

    & curl.exe -L --fail --progress-bar $WhisperUrl -o $WhisperZip

    if ($LASTEXITCODE -ne 0 -or !(Test-Path $WhisperZip)) {
        throw "whisper.cpp download failed."
    }

    Remove-Item $Tools -Recurse -Force -ErrorAction SilentlyContinue
    New-Item -ItemType Directory -Force -Path $Tools | Out-Null

    Expand-Archive -Path $WhisperZip -DestinationPath $Tools -Force

    $WhisperCli = Get-ChildItem $Tools -Filter "whisper-cli.exe" -Recurse |
        Select-Object -First 1

    if (!$WhisperCli) {
        throw "whisper-cli.exe was not found after extraction."
    }
}

Write-Host "whisper.cpp ready: $($WhisperCli.FullName)" -ForegroundColor Green

if (!(Test-Path $Model) -or ((Get-Item $Model).Length -lt 50000000)) {
    Write-Host ""
    Write-Host "Downloading multilingual Whisper base-q5_1 model (~60 MB)..." -ForegroundColor Yellow

    & curl.exe -L --fail --progress-bar $ModelUrl -o $Model

    if ($LASTEXITCODE -ne 0 -or !(Test-Path $Model)) {
        throw "Whisper model download failed."
    }
}

$sizeMB = [math]::Round((Get-Item $Model).Length / 1MB, 1)
Write-Host "Whisper model ready: $sizeMB MB" -ForegroundColor Green

if (!$SkipTest -and (Test-Path $TestWav)) {
    Write-Host ""
    Write-Host "Testing STT on Gini's already-verified microphone recording..." -ForegroundColor Cyan
    & (Join-Path $PSScriptRoot "gini-stt.ps1") -InputFile $TestWav
}
else {
    Write-Host ""
    Write-Host "Setup complete." -ForegroundColor Green
}
