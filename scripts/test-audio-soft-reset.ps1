$ErrorActionPreference = "Stop"

$Root = "D:\Gini"
$Reset = Join-Path $Root "scripts\gini-audio-soft-reset.js"
$MicTest = Join-Path $Root "gini-native-mic-test.js"

Write-Host ""
Write-Host "GINI AUDIO SOFT-RESET TEST" -ForegroundColor Cyan
Write-Host "This does NOT reboot the camera." -ForegroundColor DarkGray
Write-Host "It temporarily toggles AudioEnabled OFF, then back ON." -ForegroundColor DarkGray
Write-Host ""

& node.exe $Reset

if ($LASTEXITCODE -ne 0) {
    throw "Audio soft reset failed. Camera settings were not confirmed."
}

Write-Host ""
Write-Host "Soft reset completed. Testing the microphone now..." -ForegroundColor Green
Write-Host "Speak near Gini during the next 8 seconds." -ForegroundColor Yellow
Write-Host ""

& node.exe $MicTest

exit $LASTEXITCODE
