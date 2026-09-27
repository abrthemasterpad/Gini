$ErrorActionPreference = "Stop"

Write-Host ""
Write-Host "GINI USB / NETWORK READ-ONLY PROBE" -ForegroundColor Cyan
Write-Host "This changes nothing. It only shows what Windows can currently see." -ForegroundColor DarkGray
Write-Host ""

Write-Host "=== USB devices ===" -ForegroundColor Yellow
Get-PnpDevice -PresentOnly |
    Where-Object {
        $_.Class -in @("USB","Ports","Net") -or
        $_.FriendlyName -match "USB|Serial|Ethernet|RNDIS|Camera|Android"
    } |
    Select-Object Class, Status, FriendlyName, InstanceId |
    Sort-Object Class, FriendlyName |
    Format-Table -AutoSize

Write-Host ""
Write-Host "=== Network adapters ===" -ForegroundColor Yellow
Get-NetAdapter |
    Select-Object Name, InterfaceDescription, Status, LinkSpeed, MacAddress |
    Format-Table -AutoSize

Write-Host ""
Write-Host "=== IP configuration ===" -ForegroundColor Yellow
Get-NetIPConfiguration |
    Select-Object InterfaceAlias, InterfaceDescription, IPv4Address, IPv4DefaultGateway |
    Format-List

Write-Host ""
Write-Host "Interpretation:" -ForegroundColor Cyan
Write-Host "- If plugging Gini USB-C into the PC creates a NEW USB/COM/RNDIS/Ethernet device, USB data may be usable."
Write-Host "- If nothing new appears and only power changes, the Type-C port is acting as power-only."
Write-Host "- Do not install random drivers or flash firmware based on this probe."
