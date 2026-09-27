$ErrorActionPreference = "Stop"

$Root = "D:\Gini"
$Checker = Join-Path $Root "scripts\gini-vision-env-check.py"

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

Add-Check "Vision checker" (Test-Path $Checker) $Checker

if ($python -and (Test-Path $Checker)) {
    $oldPreference = $ErrorActionPreference
    $ErrorActionPreference = "Continue"
    $cvOutput = & py.exe -3 $Checker 2>&1
    $cvCode = $LASTEXITCODE
    $ErrorActionPreference = $oldPreference

    $cvText = ($cvOutput | Out-String).Trim()

    Add-Check "OpenCV face API" ($cvCode -eq 0) $cvText
}

$checks | Format-Table -AutoSize -Wrap

$failed = @($checks | Where-Object { $_.Status -eq "FAIL" })

if ($failed.Count -gt 0) {
    Write-Host ""
    Write-Host "Vision prerequisites need repair." -ForegroundColor Yellow
    Write-Host "Run:" -ForegroundColor Cyan
    Write-Host "  powershell -ExecutionPolicy Bypass -File .\scripts\gini-vision-setup.ps1"
    exit 2
}

Write-Host ""
Write-Host "Vision prerequisites are ready for DRY-RUN testing." -ForegroundColor Green
