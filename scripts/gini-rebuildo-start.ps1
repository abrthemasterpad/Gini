param(
    [int]$TimeoutSeconds = 35
)

$ErrorActionPreference = "Stop"

$Root = Split-Path -Parent $PSScriptRoot
$Runtime = Join-Path $Root "runtime"
$Renderer = if ($env:GINI_REBUILDO_RENDERER) {
    $env:GINI_REBUILDO_RENDERER
} else {
    "D:\Rebuildo\renderer"
}
$Server = Join-Path $Renderer "server.mjs"
$Health = "http://127.0.0.1:8787/health"

New-Item -ItemType Directory -Force -Path $Runtime | Out-Null

function Test-Rebuildo {
    try {
        $r = Invoke-RestMethod -Uri $Health -Method Get -TimeoutSec 2
        return [bool]$r.ok
    } catch {
        return $false
    }
}

if (Test-Rebuildo) {
    Write-Host "Rebuildo voice server: READY" -ForegroundColor Green
    exit 0
}

if (!(Test-Path $Server)) {
    throw "Rebuildo renderer not found: $Server"
}

$stdout = Join-Path $Runtime "rebuildo-renderer.out.log"
$stderr = Join-Path $Runtime "rebuildo-renderer.err.log"

Write-Host "Starting Rebuildo voice server..." -ForegroundColor Cyan
Write-Host "  Renderer: $Renderer"

Start-Process -FilePath "node.exe" -ArgumentList "server.mjs" -WorkingDirectory $Renderer -WindowStyle Hidden -RedirectStandardOutput $stdout -RedirectStandardError $stderr

$deadline = (Get-Date).AddSeconds($TimeoutSeconds)

while ((Get-Date) -lt $deadline) {
    Start-Sleep -Milliseconds 500
    if (Test-Rebuildo) {
        Write-Host "Rebuildo voice server: READY" -ForegroundColor Green
        exit 0
    }
}

Write-Host "Rebuildo did not become ready within $TimeoutSeconds seconds." -ForegroundColor Red
Write-Host "Last logs:" -ForegroundColor Yellow

if (Test-Path $stderr) {
    Get-Content $stderr -Tail 20
}

throw "Rebuildo startup failed. See $stderr"
