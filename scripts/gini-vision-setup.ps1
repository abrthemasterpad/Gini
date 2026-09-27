$ErrorActionPreference = "Stop"

$Root = "D:\Gini"
$Go2Rtc = Join-Path $Root "go2rtc.exe"
$Tracker = Join-Path $Root "scripts\gini-vision-track.py"
$Checker = Join-Path $Root "scripts\gini-vision-env-check.py"
$RequiredOpenCV = "4.14.0.94"

Write-Host ""
Write-Host "GINI VISION v0.5 SETUP / REPAIR" -ForegroundColor Cyan
Write-Host ""

if (!(Get-Command py.exe -ErrorAction SilentlyContinue)) {
    Write-Host "Python launcher not found." -ForegroundColor Yellow
    exit 2
}

if (!(Get-Command ffmpeg.exe -ErrorAction SilentlyContinue)) {
    Write-Host "ffmpeg.exe is not on PATH." -ForegroundColor Yellow
    exit 2
}

if (!(Test-Path $Go2Rtc)) {
    Write-Host "Missing: $Go2Rtc" -ForegroundColor Yellow
    exit 2
}

if (!(Test-Path $Tracker)) {
    throw "Missing tracker: $Tracker"
}

if (!(Test-Path $Checker)) {
    throw "Missing checker: $Checker"
}

function Test-GiniOpenCV {
    $oldPreference = $ErrorActionPreference
    $ErrorActionPreference = "Continue"
    $output = & py.exe -3 $Checker 2>&1
    $code = $LASTEXITCODE
    $ErrorActionPreference = $oldPreference

    return [PSCustomObject]@{
        Code = $code
        Output = ($output | Out-String).Trim()
        Good = ($code -eq 0)
    }
}

$check = Test-GiniOpenCV

if ($check.Good) {
    Write-Host "Compatible OpenCV already installed:" -ForegroundColor Green
    Write-Host $check.Output
} else {
    Write-Host "Current OpenCV is incompatible with Gini Vision v0.5." -ForegroundColor Yellow
    Write-Host $check.Output
    Write-Host ""
    Write-Host "Repairing with pinned OpenCV $RequiredOpenCV..." -ForegroundColor Cyan

    $oldPreference = $ErrorActionPreference
    $ErrorActionPreference = "Continue"

    & py.exe -3 -m pip uninstall -y opencv-python opencv-python-headless opencv-contrib-python opencv-contrib-python-headless
    & py.exe -3 -m pip install --user --no-cache-dir "opencv-python==$RequiredOpenCV"
    $pipCode = $LASTEXITCODE

    $ErrorActionPreference = $oldPreference

    if ($pipCode -ne 0) {
        throw "Pinned OpenCV installation failed."
    }

    $check = Test-GiniOpenCV

    if (!$check.Good) {
        Write-Host $check.Output
        throw "OpenCV repair completed, but Gini-required face classifier support is still unavailable."
    }

    Write-Host ""
    Write-Host "OpenCV repair complete:" -ForegroundColor Green
    Write-Host $check.Output
}

Write-Host ""
Write-Host "PASS: Python" -ForegroundColor Green
Write-Host "PASS: FFmpeg" -ForegroundColor Green
Write-Host "PASS: go2rtc" -ForegroundColor Green
Write-Host "PASS: OpenCV face classifier" -ForegroundColor Green
Write-Host ""
Write-Host "First tracker test is DRY RUN. Motors remain disabled." -ForegroundColor Cyan
Write-Host "Run:"
Write-Host "  py -3 .\scripts\gini-vision-track.py --preview"
Write-Host ""
Write-Host "Do NOT use --live until dry-run direction mapping is confirmed." -ForegroundColor Yellow
