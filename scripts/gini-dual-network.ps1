param(
    [switch]$Apply
)

$ErrorActionPreference = "Stop"
$CameraIP = "172.14.10.1"
$CameraPort = 10000
$CameraEndpoint = "{0}:{1}" -f $CameraIP, $CameraPort

Write-Host ""
Write-Host "GINI DUAL NETWORK" -ForegroundColor Cyan
Write-Host "Goal: keep one adapter on Gini and another adapter on the internet." -ForegroundColor Gray
Write-Host ""

function Get-ConnectedIPv4Adapters {
    $interfaces = Get-NetIPInterface -AddressFamily IPv4 -ErrorAction SilentlyContinue |
        Where-Object { $_.ConnectionState -eq "Connected" }

    foreach ($iface in $interfaces) {
        $ips = Get-NetIPAddress -AddressFamily IPv4 -InterfaceIndex $iface.InterfaceIndex -ErrorAction SilentlyContinue |
            Where-Object {
                $_.IPAddress -notlike "169.254.*" -and
                $_.IPAddress -ne "127.0.0.1"
            }

        foreach ($ip in $ips) {
            [PSCustomObject]@{
                InterfaceIndex = $iface.InterfaceIndex
                InterfaceAlias = $iface.InterfaceAlias
                InterfaceMetric = $iface.InterfaceMetric
                IPv4 = $ip.IPAddress
            }
        }
    }
}

Write-Host "Testing Gini first..." -ForegroundColor Cyan
$cameraOk = Test-NetConnection $CameraIP -Port $CameraPort -InformationLevel Quiet -WarningAction SilentlyContinue

$cameraIf = $null
$cameraAddress = $null

if ($cameraOk) {
    try {
        $routeInfo = Find-NetRoute -RemoteIPAddress $CameraIP -ErrorAction Stop
        $cameraIf = Get-NetIPInterface -AddressFamily IPv4 -InterfaceIndex $routeInfo.InterfaceIndex -ErrorAction SilentlyContinue
        $cameraAddress = Get-NetIPAddress -AddressFamily IPv4 -InterfaceIndex $routeInfo.InterfaceIndex -ErrorAction SilentlyContinue |
            Where-Object {
                $_.IPAddress -notlike "169.254.*" -and
                $_.IPAddress -ne "127.0.0.1"
            } |
            Select-Object -First 1
    } catch {}

    if (-not $cameraIf) {
        $cameraAddress = Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
            Where-Object {
                $_.IPAddress -like "172.14.10.*" -and
                $_.IPAddress -ne $CameraIP
            } |
            Select-Object -First 1

        if ($cameraAddress) {
            $cameraIf = Get-NetIPInterface -AddressFamily IPv4 -InterfaceIndex $cameraAddress.InterfaceIndex -ErrorAction SilentlyContinue
        }
    }
}

if (-not $cameraOk -or -not $cameraIf) {
    Write-Host "Gini camera: NOT REACHABLE" -ForegroundColor Red
    Write-Host ("  Expected: " + $CameraEndpoint) -ForegroundColor Gray
    Write-Host ""
    Write-Host "Connected IPv4 adapters right now:" -ForegroundColor Yellow

    $connected = @(Get-ConnectedIPv4Adapters)

    if ($connected.Count -eq 0) {
        Write-Host "  none"
    } else {
        foreach ($item in $connected) {
            Write-Host ("  {0,-28} {1,-16} metric {2}" -f $item.InterfaceAlias, $item.IPv4, $item.InterfaceMetric)
        }
    }

    Write-Host ""
    Write-Host "One of the two Wi-Fi adapters is currently not connected to Gini." -ForegroundColor Yellow
    Write-Host "Keep the adapter that already has internet as-is."
    Write-Host "Connect the OTHER Wi-Fi adapter to the Gini camera Wi-Fi once, then rerun this script."
    Write-Host ""
    Write-Host "No hotspot switching is needed after both adapters are connected simultaneously."
    exit 2
}

Write-Host "Camera interface" -ForegroundColor Yellow
Write-Host "  Name   : $($cameraIf.InterfaceAlias)"
Write-Host "  IPv4   : $($cameraAddress.IPAddress)"
Write-Host "  Metric : $($cameraIf.InterfaceMetric)"
Write-Host ("  Camera : " + $CameraEndpoint + " READY")
Write-Host ""

$internetCandidates = Get-NetRoute -AddressFamily IPv4 -DestinationPrefix "0.0.0.0/0" -ErrorAction SilentlyContinue |
    Where-Object {
        $_.InterfaceIndex -ne $cameraIf.InterfaceIndex
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
    Sort-Object EffectiveMetric

$internetRoute = $internetCandidates | Select-Object -First 1

if (-not $internetRoute) {
    Write-Host "Second internet interface: NOT FOUND" -ForegroundColor Red
    Write-Host ""
    Write-Host "Gini is connected, but Windows has no second connected default route."
    Write-Host "Use the other Wi-Fi adapter, USB tethering, or Ethernet for internet."
    exit 3
}

$internetIf = $internetRoute.Interface
$internetRouteRecord = $internetRoute.Route

Write-Host "Internet interface" -ForegroundColor Green
Write-Host "  Name             : $($internetIf.InterfaceAlias)"
Write-Host "  Interface metric : $($internetIf.InterfaceMetric)"
Write-Host "  Route metric     : $($internetRouteRecord.RouteMetric)"
Write-Host "  Effective metric : $($internetRoute.EffectiveMetric)"
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
    Write-Host "  Gini adapter metric     = 80"
    Write-Host ""
}

Write-Host "Testing both paths..." -ForegroundColor Cyan
$cameraOk = Test-NetConnection $CameraIP -Port $CameraPort -InformationLevel Quiet -WarningAction SilentlyContinue
$internetOk = Test-NetConnection github.com -Port 443 -InformationLevel Quiet -WarningAction SilentlyContinue

Write-Host ("  Gini " + $CameraEndpoint + " : " + $(if ($cameraOk) { "READY" } else { "FAILED" }))
Write-Host ("  Internet github.com:443 : " + $(if ($internetOk) { "READY" } else { "FAILED" }))
Write-Host ""

if ($cameraOk -and $internetOk) {
    Write-Host "PASS: Gini and internet are available at the same time." -ForegroundColor Green
    Write-Host "Keep both adapters connected. No more hotspot/camera switching."
    exit 0
}

if (-not $Apply) {
    Write-Host "Both adapters exist, but route priority may need one correction." -ForegroundColor Yellow
    Write-Host "Open PowerShell as Administrator and run:"
    Write-Host "  .\scripts\gini-dual-network.ps1 -Apply" -ForegroundColor White
}

exit 1
