param(
    [switch]$Apply
)

$ErrorActionPreference = "Stop"

Write-Host ""
Write-Host "GINI DUAL NETWORK" -ForegroundColor Cyan
Write-Host "Goal: keep Wi-Fi on Gini while a second adapter carries internet." -ForegroundColor Gray
Write-Host ""

$cameraAddress = Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
    Where-Object {
        $_.IPAddress -like "172.14.10.*" -and
        $_.IPAddress -ne "172.14.10.1"
    } |
    Select-Object -First 1

if (-not $cameraAddress) {
    throw "Gini camera network not detected. Connect the normal PC Wi-Fi adapter to Gini first."
}

$cameraIf = Get-NetIPInterface -AddressFamily IPv4 -InterfaceIndex $cameraAddress.InterfaceIndex

$internetRoute = Get-NetRoute -AddressFamily IPv4 -DestinationPrefix "0.0.0.0/0" -ErrorAction SilentlyContinue |
    Where-Object {
        $_.InterfaceIndex -ne $cameraAddress.InterfaceIndex
    } |
    ForEach-Object {
        $route = $_
        $iface = Get-NetIPInterface -AddressFamily IPv4 -InterfaceIndex $route.InterfaceIndex -ErrorAction SilentlyContinue
        if ($iface -and $iface.ConnectionState -eq "Connected") {
            [PSCustomObject]@{
                Route = $route
                Interface = $iface
                EffectiveMetric = [int]$route.RouteMetric + [int]$iface.InterfaceMetric
            }
        }
    } |
    Where-Object { $_ } |
    Sort-Object EffectiveMetric |
    Select-Object -First 1

Write-Host "Camera interface" -ForegroundColor Yellow
Write-Host "  Name : $($cameraIf.InterfaceAlias)"
Write-Host "  IPv4 : $($cameraAddress.IPAddress)"
Write-Host "  Metric: $($cameraIf.InterfaceMetric)"
Write-Host ""

if (-not $internetRoute) {
    Write-Host "Second internet interface: NOT FOUND" -ForegroundColor Red
    Write-Host ""
    Write-Host "Connect ONE of these first:" -ForegroundColor Yellow
    Write-Host "  - phone USB tethering"
    Write-Host "  - Ethernet to router"
    Write-Host "  - second USB Wi-Fi adapter connected to hotspot/router"
    Write-Host ""
    Write-Host "Then run this script again."
    exit 2
}

$internetIf = $internetRoute.Interface
$internetRouteRecord = $internetRoute.Route

Write-Host "Internet interface" -ForegroundColor Green
Write-Host "  Name : $($internetIf.InterfaceAlias)"
Write-Host "  Metric: $($internetIf.InterfaceMetric)"
Write-Host "  Gateway route metric: $($internetRouteRecord.RouteMetric)"
Write-Host "  Effective metric: $($internetRoute.EffectiveMetric)"
Write-Host ""

if ($Apply) {
    $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
    $principal = New-Object Security.Principal.WindowsPrincipal($identity)

    if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
        throw "Run PowerShell as Administrator when using -Apply."
    }

    Set-NetIPInterface -AddressFamily IPv4 -InterfaceIndex $cameraIf.InterfaceIndex -AutomaticMetric Disabled -InterfaceMetric 80
    Set-NetIPInterface -AddressFamily IPv4 -InterfaceIndex $internetIf.InterfaceIndex -AutomaticMetric Disabled -InterfaceMetric 10

    Write-Host "Applied route preference:" -ForegroundColor Green
    Write-Host "  Internet adapter metric = 10"
    Write-Host "  Gini camera adapter metric = 80"
    Write-Host ""
}

Write-Host "Testing Gini native port..." -ForegroundColor Cyan
$cameraOk = Test-NetConnection 172.14.10.1 -Port 10000 -InformationLevel Quiet -WarningAction SilentlyContinue
Write-Host ("  Camera 172.14.10.1:10000 : " + $(if ($cameraOk) { "READY" } else { "FAILED" }))

Write-Host "Testing internet..." -ForegroundColor Cyan
$internetOk = Test-NetConnection github.com -Port 443 -InformationLevel Quiet -WarningAction SilentlyContinue
Write-Host ("  Internet github.com:443   : " + $(if ($internetOk) { "READY" } else { "FAILED" }))

Write-Host ""

if ($cameraOk -and $internetOk) {
    Write-Host "PASS: Gini and internet are available at the same time." -ForegroundColor Green
    Write-Host "No more hotspot/camera Wi-Fi switching is required."
    exit 0
}

if (-not $Apply) {
    Write-Host "If both adapters are connected but internet routing is wrong, reopen" -ForegroundColor Yellow
    Write-Host "PowerShell as Administrator and run:"
    Write-Host "  .\scripts\gini-dual-network.ps1 -Apply" -ForegroundColor White
}

exit 1
