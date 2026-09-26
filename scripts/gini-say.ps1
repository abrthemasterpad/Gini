param(
    [Parameter(Mandatory = $true, Position = 0)]
    [ValidateNotNullOrEmpty()]
    [string]$Text
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$wav = Join-Path ([System.IO.Path]::GetTempPath()) ("gini-{0}.wav" -f [guid]::NewGuid())
$synth = $null

try {
    Add-Type -AssemblyName System.Speech
    $synth = New-Object System.Speech.Synthesis.SpeechSynthesizer
    $format = New-Object System.Speech.AudioFormat.SpeechAudioFormatInfo -ArgumentList 16000, ([System.Speech.AudioFormat.AudioBitsPerSample]::Sixteen), ([System.Speech.AudioFormat.AudioChannel]::Mono)
    $synth.Rate = -1
    $synth.Volume = 100
    $synth.SetOutputToWaveFile($wav, $format)
    $synth.Speak($Text)
    $synth.Dispose()
    $synth = $null

    $env:GINI_WAV_PATH = $wav
    & node (Join-Path $root 'src/audio/talkback.js')
    if ($LASTEXITCODE -ne 0) { throw "Gini talkback failed (exit code $LASTEXITCODE)." }
}
finally {
    if ($null -ne $synth) { $synth.Dispose() }
    Remove-Item Env:GINI_WAV_PATH -ErrorAction SilentlyContinue
    Remove-Item -LiteralPath $wav -ErrorAction SilentlyContinue
}
