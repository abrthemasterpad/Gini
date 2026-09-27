$ErrorActionPreference = "Stop"

$Root = "D:\Gini"
$Scripts = Join-Path $Root "scripts"

Write-Host ""
Write-Host "GINI NIGHT BUILD CHECK" -ForegroundColor Cyan
Write-Host "No microphone, no camera speaker, no PTZ, no camera connection." -ForegroundColor DarkGray
Write-Host ""

$files = @(
    "gini-assistant-security.js",
    "gini-assistant-memory.js",
    "gini-assistant-brain.js",
    "gini-assistant-console.js",
    "gini-assistant-status.js",
    "gini-assistant-live.js"
)

foreach ($name in $files) {
    $file = Join-Path $Scripts $name

    if (!(Test-Path $file)) {
        throw "Missing file: $file"
    }

    & node.exe --check $file

    if ($LASTEXITCODE -ne 0) {
        throw "Syntax check failed: $name"
    }

    Write-Host "PASS syntax: $name" -ForegroundColor Green
}

Write-Host ""
Write-Host "Running assistant security self-test..." -ForegroundColor Cyan
& node.exe (Join-Path $Scripts "gini-assistant-console.js") --self-test

if ($LASTEXITCODE -ne 0) {
    throw "Security self-test failed."
}

Write-Host ""
Write-Host "Running read-only security audit..." -ForegroundColor Cyan
& node.exe (Join-Path $Scripts "gini-security-audit.js")

Write-Host ""
Write-Host "Checking local AI provider..." -ForegroundColor Cyan
& node.exe (Join-Path $Scripts "gini-assistant-status.js")
$providerCode = $LASTEXITCODE

Write-Host ""
if ($providerCode -eq 0) {
    Write-Host "GINI AI FOUNDATION READY FOR SILENT TEXT TESTING." -ForegroundColor Green
} else {
    Write-Host "Code/security checks passed. Local AI model is not ready yet." -ForegroundColor Yellow
    Write-Host "This does not affect the verified v0.3.4 hardware core." -ForegroundColor DarkGray
}

exit 0
