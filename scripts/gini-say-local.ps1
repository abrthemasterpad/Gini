param(
    [Parameter(Mandatory=$true, Position=0)]
    [string]$Text
)

$ErrorActionPreference = "Stop"

Write-Host "GINI LOCAL: $Text" -ForegroundColor Cyan

Add-Type -AssemblyName System.Speech

$synth = New-Object System.Speech.Synthesis.SpeechSynthesizer
$synth.Rate = -1
$synth.Volume = 100
$synth.SetOutputToDefaultAudioDevice()
$synth.Speak($Text)
$synth.Dispose()
