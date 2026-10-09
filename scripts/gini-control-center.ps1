param(
    [int]$Port = 8790,
    [switch]$NoBrowser
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$server = Join-Path $root "lab\server.js"

if (-not (Get-Command node.exe -ErrorAction SilentlyContinue)) {
    throw "Node.js is required but node.exe was not found."
}

if (-not (Test-Path $server)) {
    throw "Missing Gini Control Center server: $server"
}

$env:GINI_LAB_PORT = [string]$Port
$url = "http://127.0.0.1:$Port"

Write-Host ""
Write-Host "GINI ROBOT CONTROL CENTER" -ForegroundColor Cyan
Write-Host "URL: $url"
Write-Host "Press Ctrl+C to stop the server."
Write-Host ""

if (-not $NoBrowser) {
    Start-Job -ScriptBlock {
        param($Target)
        Start-Sleep -Milliseconds 900
        Start-Process $Target
    } -ArgumentList $url | Out-Null
}

Push-Location $root
try {
    & node.exe $server
}
finally {
    Pop-Location
}
