param(
    [double]$SpeechThresholdDb = -36,
    [int]$Step = 1,
    [int]$Speed = 8
)

$ErrorActionPreference = "Stop"

$Root = Split-Path -Parent $PSScriptRoot
$Direct = Join-Path $PSScriptRoot "gini-continuous-direct.js"

if (!(Test-Path $Direct)) {
    throw "Missing direct continuous brain: $Direct"
}


$env:GINI_SPEECH_THRESHOLD_DB = $SpeechThresholdDb.ToString(
    [System.Globalization.CultureInfo]::InvariantCulture
)
$env:GINI_PTZ_STEP = $Step.ToString()
$env:GINI_PTZ_SPEED = $Speed.ToString()

Write-Host ""
Write-Host "Starting Gini continuous brain directly in the foreground..." -ForegroundColor Cyan
Write-Host "No background listener process is used in this version." -ForegroundColor DarkGray
Write-Host ""

& node.exe $Direct

exit $LASTEXITCODE
