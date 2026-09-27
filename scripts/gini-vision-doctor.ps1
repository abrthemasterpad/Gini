$ErrorActionPreference = "Stop"

$Root = "D:\Gini"

Write-Host ""
Write-Host "GINI VISION v0.5 DOCTOR" -ForegroundColor Cyan
Write-Host "Read-only checks. No PTZ movement." -ForegroundColor DarkGray
Write-Host ""

$checks = @()

function Add-Check([string]$Name, [bool]$Ok, [string]$Detail) {
    $script:checks += [PSCustomObject]@{
        Check = $Name
        Status = $(if ($Ok) { "PASS" } else { "FAIL" })
        Detail = $Detail
    }
}

$python = Get-Command py.exe -ErrorAction SilentlyContinue
Add-Check "Python" ($null -ne $python) $(if ($python) { $python.Source } else { "not found" })

$ffmpeg = Get-Command ffmpeg.exe -ErrorAction SilentlyContinue
Add-Check "FFmpeg" ($null -ne $ffmpeg) $(if ($ffmpeg) { $ffmpeg.Source } else { "not found" })

$go2rtc = Join-Path $Root "go2rtc.exe"
Add-Check "go2rtc" (Test-Path $go2rtc) $go2rtc

$tracker = Join-Path $Root "scripts\gini-vision-track.py"
Add-Check "Vision tracker" (Test-Path $tracker) $tracker

$bridge = Join-Path $Root "scripts\gini-vision-ptz-bridge.js"
Add-Check "Native PTZ bridge" (Test-Path $bridge) $bridge

if ($python) {
    & py.exe -3 -c "import cv2" 2>$null
    Add-Check "OpenCV" ($LASTEXITCODE -eq 0) "opencv-python-headless"
}

$checks | Format-Table -AutoSize

if (($checks | Where-Object { $_.Status -eq "FAIL" }).Count -gt 0) {
    Write-Host ""
    Write-Host "Vision prerequisites are incomplete." -ForegroundColor Yellow
    exit 2
}

Write-Host ""
Write-Host "Vision prerequisites are ready for DRY-RUN testing." -ForegroundColor Green
