$ErrorActionPreference = "Stop"

$Root = "D:\Gini"
$EnvFile = Join-Path $Root ".env"
$Example = Join-Path $Root ".env.example"

Write-Host ""
Write-Host "GINI v0.4 LIGHTWEIGHT CONFIG MIGRATION" -ForegroundColor Cyan

if (!(Test-Path $EnvFile)) {
    if (Test-Path $Example) {
        Copy-Item $Example $EnvFile
        Write-Host "Created .env from .env.example" -ForegroundColor Green
    } else {
        throw "Neither $EnvFile nor $Example exists."
    }
}

$text = Get-Content $EnvFile -Raw

function Set-EnvValue([string]$Name, [string]$Value) {
    $pattern = "(?m)^" + [regex]::Escape($Name) + "=.*$"
    if ($script:text -match $pattern) {
        $script:text = [regex]::Replace($script:text, $pattern, "$Name=$Value")
    } else {
        $script:text += [Environment]::NewLine + "$Name=$Value"
    }
}

Set-EnvValue "GINI_AI_ENABLED" "1"
Set-EnvValue "GINI_AI_PROVIDER" "ollama"
Set-EnvValue "GINI_OLLAMA_URL" "http://127.0.0.1:11434"
Set-EnvValue "GINI_OLLAMA_MODEL" "qwen3:0.6b"
Set-EnvValue "GINI_PRIVACY_MODE" "1"
Set-EnvValue "GINI_MEMORY_ENABLED" "0"

Set-Content -Path $EnvFile -Value $text -Encoding UTF8

Write-Host "Updated local Gini config:" -ForegroundColor Green
Write-Host "  AI provider : ollama"
Write-Host "  AI model    : qwen3:0.6b"
Write-Host "  privacy     : ON"
Write-Host "  memory      : OFF"
Write-Host ""
Write-Host "No camera settings were changed." -ForegroundColor DarkGray