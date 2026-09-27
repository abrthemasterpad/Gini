$ErrorActionPreference = "Stop"

$Root = "D:\Gini"
$Source = Join-Path $Root "scripts\gini-say-safe.js"
$Target = Join-Path $Root "gini-say.js"
$Backup = Join-Path $Root "gini-say.before-safe-talkback.js"

if (!(Test-Path $Source)) {
    throw "Safe talkback file not found: $Source"
}

if (Test-Path $Target) {
    Copy-Item $Target $Backup -Force
    Write-Host "Backup saved: $Backup" -ForegroundColor DarkGray
}

Copy-Item $Source $Target -Force

Write-Host ""
Write-Host "SAFE TALKBACK FIX INSTALLED" -ForegroundColor Green
Write-Host "Updated: $Target"
Write-Host "Original gini-say.ps1 is unchanged."
