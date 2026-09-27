param(
    [int]$Seconds = 6,
    [switch]$NoVoiceReply
)

$ErrorActionPreference = "Stop"

$Root = Split-Path -Parent $PSScriptRoot
$Listen = Join-Path $PSScriptRoot "gini-listen.ps1"
$Transcript = Join-Path $Root "runtime\gini-transcript.txt"
$PTZ = Join-Path $Root "gini.ps1"
$Say = Join-Path $Root "gini-say.ps1"

Write-Host ""
Write-Host "GINI BRAIN v0.1" -ForegroundColor Cyan
Write-Host "Say one command after Gini starts listening." -ForegroundColor Yellow
Write-Host ""

& $Listen -Seconds $Seconds

if (!(Test-Path $Transcript)) {
    throw "No transcript was produced."
}

$heard = (Get-Content $Transcript -Raw).Trim()

if ([string]::IsNullOrWhiteSpace($heard)) {
    Write-Host "No speech recognized." -ForegroundColor Yellow
    exit 2
}

# Normalize punctuation/case and common Whisper spellings of the wake word.
$normalized = $heard.ToLowerInvariant()
$normalized = $normalized -replace '[“”"]',''
$normalized = $normalized -replace '[.,!?;:]',' '
$normalized = $normalized -replace '\s+',' '
$normalized = $normalized.Trim()

$wakeAliases = @(
    'gini',
    'jeanie',
    'genie',
    'ginny',
    'jini',
    'jenny'
)

$wakeFound = $false
foreach ($alias in $wakeAliases) {
    if ($normalized -match "(^|\s)$([regex]::Escape($alias))(\s|$)") {
        $wakeFound = $true
        $normalized = $normalized -replace "(^|\s)$([regex]::Escape($alias))(\s|$)", ' '
        break
    }
}

$normalized = ($normalized -replace '\s+',' ').Trim()

Write-Host ""
Write-Host "BRAIN HEARD:" -ForegroundColor Cyan
Write-Host $heard -ForegroundColor Green
Write-Host "COMMAND TEXT: $normalized" -ForegroundColor DarkGray

if (-not $wakeFound) {
    Write-Host ""
    Write-Host "Wake word not detected, so Gini will not move." -ForegroundColor Yellow
    exit 3
}

$action = $null
$reply = $null

switch -Regex ($normalized) {
    '(turn|look|move)\s+(to\s+the\s+)?left|\bleft\b' {
        $action = 'left'
        $reply = 'Turning left.'
        break
    }

    '(turn|look|move)\s+(to\s+the\s+)?right|\bright\b' {
        $action = 'right'
        $reply = 'Turning right.'
        break
    }

    '(look|move|turn)\s+up|\bup\b' {
        $action = 'up'
        $reply = 'Looking up.'
        break
    }

    '(look|move|turn)\s+down|\bdown\b' {
        $action = 'down'
        $reply = 'Looking down.'
        break
    }

    'can you hear me|do you hear me|hear me' {
        $reply = 'Yes. I can hear you.'
        break
    }

    'say hello|hello' {
        $reply = 'Hello. I am Gini.'
        break
    }

    default {
        $reply = 'I heard you, but I do not know that command yet.'
    }
}

if ($action) {
    if (!(Test-Path $PTZ)) {
        throw "PTZ script not found: $PTZ"
    }

    Write-Host ""
    Write-Host "ACTION: $action" -ForegroundColor Magenta

    & $PTZ $action -Step 1 -Speed 8
}

if (!$NoVoiceReply) {
    if (Test-Path $Say) {
        Write-Host "REPLY: $reply" -ForegroundColor Cyan
        & $Say $reply
    }
    else {
        Write-Host "REPLY: $reply" -ForegroundColor Cyan
        Write-Host "(gini-say.ps1 not found, so reply was not spoken.)" -ForegroundColor Yellow
    }
}

Write-Host ""
Write-Host "GINI BRAIN v0.1 COMPLETE" -ForegroundColor Green
