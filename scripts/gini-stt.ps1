param(
    [Parameter(Mandatory=$true)]
    [string]$InputFile
)

$ErrorActionPreference = "Stop"

$Root = Split-Path -Parent $PSScriptRoot
$Model = Join-Path $Root "models\\ggml-base-q5_1.bin"
$Runtime = Join-Path $Root "runtime"
$Transcript = Join-Path $Runtime "gini-transcript.txt"

if (!(Test-Path $InputFile)) {
    throw "Audio file not found: $InputFile"
}

if (!(Test-Path $Model)) {
    throw "Whisper model is missing. While internet is available run: powershell -ExecutionPolicy Bypass -File .\\scripts\\setup-stt.ps1"
}

New-Item -ItemType Directory -Force -Path $Runtime | Out-Null
Remove-Item $Transcript -ErrorAction SilentlyContinue

$InputFull = (Resolve-Path $InputFile).Path

Push-Location $Root
try {
    $filter = "aresample=16000,aformat=channel_layouts=mono,whisper=model=models/ggml-base-q5_1.bin:language=eval:queue=3:use_gpu=0:destination=runtime/gini-transcript.txt:format=text"

    $args = @(
        "-hide_banner",
        "-loglevel", "warning",
        "-i", $InputFull,
        "-vn",
        "-af", $filter,
        "-f", "null",
        "NUL"
    )

    & ffmpeg.exe @args

    if ($LASTEXITCODE -ne 0) {
        throw "FFmpeg Whisper transcription failed with exit code $LASTEXITCODE"
    }
}
finally {
    Pop-Location
}

if (!(Test-Path $Transcript)) {
    throw "Whisper completed but no transcript file was created."
}

$text = (Get-Content $Transcript -Raw).Trim()

Write-Host ""
if ([string]::IsNullOrWhiteSpace($text)) {
    Write-Host "GINI HEARD AUDIO, BUT NO SPEECH WAS RECOGNIZED." -ForegroundColor Yellow
    exit 2
}

Write-Host "YOU SAID:" -ForegroundColor Cyan
Write-Host $text -ForegroundColor Green

$text
