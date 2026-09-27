$ErrorActionPreference = "Stop"

$Root = "D:\Gini"
$Say = Join-Path $Root "gini-say.ps1"
$MicTest = Join-Path $Root "gini-native-mic-test.js"

Write-Host ""
Write-Host "GINI TALKBACK -> MIC RECOVERY TEST" -ForegroundColor Cyan
Write-Host "1. Gini will speak." -ForegroundColor DarkGray
Write-Host "2. Safe talkback must receive a HANGUP acknowledgement." -ForegroundColor DarkGray
Write-Host "3. Then the original verified mic test runs immediately." -ForegroundColor DarkGray
Write-Host ""

& $Say "Gini safe talkback shutdown test."

if ($LASTEXITCODE -ne 0) {
    throw "Safe talkback exited with code $LASTEXITCODE. Do not run continuous mode yet."
}

Write-Host ""
Write-Host "Talkback process exited cleanly. Waiting 2 seconds..." -ForegroundColor Green
Start-Sleep -Seconds 2

if (!(Test-Path $MicTest)) {
    throw "Original mic test missing: $MicTest"
}

Write-Host ""
Write-Host "NOW SPEAK NEAR GINI DURING THE MIC TEST" -ForegroundColor Yellow
Write-Host ""

& node.exe $MicTest

if ($LASTEXITCODE -ne 0) {
    throw "Microphone test failed after talkback."
}
