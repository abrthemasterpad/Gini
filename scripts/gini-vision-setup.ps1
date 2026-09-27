$ErrorActionPreference = "Stop"

$Root = "D:\Gini"
$Go2Rtc = Join-Path $Root "go2rtc.exe"
$Tracker = Join-Path $Root "scripts\gini-vision-track.py"

Write-Host ""
Write-Host "GINI VISION v0.5 SETUP CHECK" -ForegroundColor Cyan
Write-Host ""

if (!(Get-Command py.exe -ErrorAction SilentlyContinue)) {
    Write-Host "Python launcher not found." -ForegroundColor Yellow
    Write-Host "Install Python 3 for Windows before running vision."
    exit 2
}

if (!(Get-Command ffmpeg.exe -ErrorAction SilentlyContinue)) {
    Write-Host "ffmpeg.exe is not on PATH." -ForegroundColor Yellow
    Write-Host "Gini already uses FFmpeg for audio/video work; keep the existing working FFmpeg available."
    exit 2
}

if (!(Test-Path $Go2Rtc)) {
    Write-Host "Missing: $Go2Rtc" -ForegroundColor Yellow
    Write-Host "The vision stream expects the existing Gini go2rtc bridge."
    exit 2
}

if (!(Test-Path $Tracker)) {
    throw "Missing tracker: $Tracker"
}

Write-Host "Checking OpenCV..." -ForegroundColor Cyan
& py.exe -3 -c "import cv2; print('OpenCV', cv2.__version__)"

if ($LASTEXITCODE -ne 0) {
    Write-Host ""
    Write-Host "Installing lightweight vision dependency..." -ForegroundColor Yellow
    & py.exe -3 -m pip install --user opencv-python-headless

    if ($LASTEXITCODE -ne 0) {
        throw "OpenCV installation failed."
    }
}

Write-Host ""
Write-Host "PASS: Python" -ForegroundColor Green
Write-Host "PASS: FFmpeg" -ForegroundColor Green
Write-Host "PASS: go2rtc" -ForegroundColor Green
Write-Host "PASS: OpenCV" -ForegroundColor Green
Write-Host ""
Write-Host "First test is DRY RUN. Motors remain disabled." -ForegroundColor Cyan
Write-Host "Run:"
Write-Host "  py -3 .\scripts\gini-vision-track.py --preview"
Write-Host ""
Write-Host "Do NOT use --live until dry-run face centering is confirmed." -ForegroundColor Yellow
