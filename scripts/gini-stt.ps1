param(
    [Parameter(Mandatory=$true)]
    [string]$InputFile
)

$ErrorActionPreference = "Stop"

$Root = Split-Path -Parent $PSScriptRoot
$Tools = Join-Path $Root "tools\whisper"
$Model = Join-Path $Root "models\ggml-base-q5_1.bin"
$Runtime = Join-Path $Root "runtime"
$TranscriptBase = Join-Path $Runtime "gini-transcript"
$Transcript = "$TranscriptBase.txt"

if (!(Test-Path $InputFile)) {
    throw "Audio file not found: $InputFile"
}

if (!(Test-Path $Model)) {
    throw "Whisper model is missing. Run scripts\setup-stt.ps1 while internet is available."
}

$WhisperCli = Get-ChildItem $Tools -Filter "whisper-cli.exe" -Recurse -ErrorAction SilentlyContinue |
    Select-Object -First 1

if (!$WhisperCli) {
    throw "whisper-cli.exe is missing. Run scripts\setup-stt.ps1 while internet is available."
}

New-Item -ItemType Directory -Force -Path $Runtime | Out-Null
Remove-Item $Transcript -ErrorAction SilentlyContinue

$InputFull = (Resolve-Path $InputFile).Path

$args = @(
    "-m", $Model,
    "-f", $InputFull,
    "-l", "auto",
    "-t", "4",
    "--no-gpu",
    "--no-timestamps",
    "--output-txt",
    "--output-file", $TranscriptBase,
    "--prompt", "The assistant wake word is Gini, spelled G-i-n-i. Common commands: Gini turn left, Gini turn right, Gini look up, Gini look down.",
    "--no-prints"
)

& $WhisperCli.FullName @args

if ($LASTEXITCODE -ne 0) {
    throw "whisper.cpp transcription failed with exit code $LASTEXITCODE"
}

if (!(Test-Path $Transcript)) {
    throw "whisper.cpp completed but no transcript file was created."
}

$text = (Get-Content $Transcript -Raw).Trim()

Write-Host ""
if ([string]::IsNullOrWhiteSpace($text)) {
    Write-Host "GINI HEARD AUDIO, BUT NO SPEECH WAS RECOGNIZED." -ForegroundColor Yellow
    return
}

Write-Host "YOU SAID:" -ForegroundColor Cyan
Write-Host $text -ForegroundColor Green

