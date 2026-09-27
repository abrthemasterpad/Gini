param(
    [int]$TimeoutSeconds = 120
)

$ErrorActionPreference = "Stop"

$Root = Split-Path -Parent $PSScriptRoot
$RebootJs = Join-Path $PSScriptRoot "gini-camera-reboot.js"
$OriginalMicTest = Join-Path $Root "gini-native-mic-test.js"
$RecoveryTest = Join-Path $PSScriptRoot "gini-mic-recovery-test.js"

Write-Host ""
Write-Host "GINI MIC RECOVERY - CAMERA REBOOT" -ForegroundColor Cyan
Write-Host "This performs a normal software reboot only." -ForegroundColor DarkGray
Write-Host ""

& node.exe $RebootJs

if ($LASTEXITCODE -ne 0) {
    throw "Camera reboot command failed before it was sent."
}

Write-Host ""
Write-Host "Waiting for camera to go offline..." -ForegroundColor Yellow

$deadline = (Get-Date).AddSeconds($TimeoutSeconds)
$wentOffline = $false

while ((Get-Date) -lt $deadline) {
    if (!(Test-Connection 172.14.10.1 -Count 1 -Quiet -ErrorAction SilentlyContinue)) {
        $wentOffline = $true
        Write-Host "Camera rebooting..." -ForegroundColor Yellow
        break
    }

    Start-Sleep -Seconds 2
}

if (!$wentOffline) {
    Write-Host "Camera did not visibly drop from ping, but continuing with recovery wait." -ForegroundColor Yellow
}

Write-Host "Waiting for camera to come back..." -ForegroundColor Yellow

$deadline = (Get-Date).AddSeconds($TimeoutSeconds)

while ((Get-Date) -lt $deadline) {
    if (Test-Connection 172.14.10.1 -Count 1 -Quiet -ErrorAction SilentlyContinue) {
        Start-Sleep -Seconds 5
        Write-Host "Camera is back online." -ForegroundColor Green
        break
    }

    Start-Sleep -Seconds 2
}

if (!(Test-Connection 172.14.10.1 -Count 1 -Quiet -ErrorAction SilentlyContinue)) {
    throw "Camera did not return within $TimeoutSeconds seconds. Reconnect to its Wi-Fi and rerun the mic test."
}

Write-Host ""
Write-Host "Now testing the microphone after the clean reboot..." -ForegroundColor Cyan
Write-Host "Speak clearly when the test starts." -ForegroundColor Yellow
Write-Host ""

if (Test-Path $OriginalMicTest) {
    Write-Host "Using the exact original native mic test that worked before." -ForegroundColor Green
    & node.exe $OriginalMicTest
}
elseif (Test-Path $RecoveryTest) {
    Write-Host "Original test not found; using recovery mic test." -ForegroundColor Yellow
    & node.exe $RecoveryTest
}
else {
    throw "No microphone test script was found."
}
