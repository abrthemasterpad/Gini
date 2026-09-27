param(
    [ValidateSet("baseline","compare")]
    [string]$Mode = "baseline"
)

$ErrorActionPreference = "Stop"

$Root = "D:\Gini"
$Runtime = Join-Path $Root "runtime"
$BaselineFile = Join-Path $Runtime "gini-usb-baseline.json"

New-Item -ItemType Directory -Path $Runtime -Force | Out-Null

function Get-GiniUsbSnapshot {
    $pnp = Get-PnpDevice -PresentOnly |
        Where-Object {
            $_.Class -in @("USB","Ports","Net") -or
            $_.FriendlyName -match "USB|Serial|Ethernet|RNDIS|Camera|Android|Composite"
        } |
        ForEach-Object {
            [PSCustomObject]@{
                Kind = "PnP"
                Class = $_.Class
                Name = $_.FriendlyName
                Id = $_.InstanceId
                Status = $_.Status
            }
        }

    $net = Get-NetAdapter |
        ForEach-Object {
            [PSCustomObject]@{
                Kind = "Net"
                Class = "NetAdapter"
                Name = $_.Name
                Id = $_.InterfaceDescription
                Status = $_.Status
            }
        }

    @($pnp + $net) | Sort-Object Kind, Class, Name, Id -Unique
}

if ($Mode -eq "baseline") {
    $snapshot = Get-GiniUsbSnapshot
    $snapshot | ConvertTo-Json -Depth 4 | Set-Content -Encoding UTF8 $BaselineFile

    Write-Host ""
    Write-Host "GINI USB BASELINE SAVED" -ForegroundColor Green
    Write-Host "File: $BaselineFile" -ForegroundColor DarkGray
    Write-Host ""
    Write-Host "Next:" -ForegroundColor Cyan
    Write-Host "1. Plug Gini's USB-C into the PC."
    Write-Host "2. Wait about 10 seconds."
    Write-Host "3. Run:"
    Write-Host "   powershell -ExecutionPolicy Bypass -File .\scripts\gini-usb-diff.ps1 compare"
    Write-Host ""
    exit 0
}

if (!(Test-Path $BaselineFile)) {
    throw "No baseline exists. Run with 'baseline' first."
}

$before = @(Get-Content $BaselineFile -Raw | ConvertFrom-Json)
$after = @(Get-GiniUsbSnapshot)

$beforeKeys = @{}
foreach ($item in $before) {
    $key = "$($item.Kind)|$($item.Class)|$($item.Name)|$($item.Id)"
    $beforeKeys[$key] = $true
}

$newItems = @()

foreach ($item in $after) {
    $key = "$($item.Kind)|$($item.Class)|$($item.Name)|$($item.Id)"

    if (!$beforeKeys.ContainsKey($key)) {
        $newItems += $item
    }
}

Write-Host ""
Write-Host "GINI USB DIFFERENCE CHECK" -ForegroundColor Cyan
Write-Host ""

if ($newItems.Count -eq 0) {
    Write-Host "No new Windows USB/COM/network device appeared." -ForegroundColor Yellow
    Write-Host "Current evidence: Gini's Type-C connection is behaving as power-only." -ForegroundColor Yellow
    Write-Host "This does not prove the data pins are physically absent; only that Windows did not enumerate a data device."
} else {
    Write-Host "NEW DEVICE(S) DETECTED:" -ForegroundColor Green
    $newItems | Format-Table Kind, Class, Name, Status, Id -AutoSize

    Write-Host ""
    Write-Host "A new device means USB data may be usable." -ForegroundColor Green
    Write-Host "Do not install random drivers. Save this output for protocol identification."
}

Write-Host ""
Write-Host "No settings were changed by this test." -ForegroundColor DarkGray
