# Gini network and USB strategy

## Goal

Gini should eventually stay connected to the PC continuously while the PC also keeps internet access.

The preferred architecture is:

```text
Gini camera Wi-Fi -> PC Wi-Fi adapter -> local camera control only
Internet          -> Ethernet / phone USB tethering / second Wi-Fi adapter
```

Do **not** bridge these two networks and do not enable Internet Connection Sharing onto the camera network unless there is a specific tested reason. The camera control plane should remain isolated.

## USB-C investigation

The camera's USB-C port is currently treated as power-only until Windows proves otherwise.

Two read-only probes are provided:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\gini-usb-network-probe.ps1
```

For a before/after comparison:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\gini-usb-diff.ps1 baseline
```

Plug the camera USB-C into the PC, wait about 10 seconds, then:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\gini-usb-diff.ps1 compare
```

The comparison looks for a new USB, serial/COM, RNDIS/USB-Ethernet or network adapter device.

If nothing new appears, do not assume USB networking is possible and do not install random drivers.

If a new device appears, capture the exact Windows device name and hardware ID before doing anything else.

## Security rules

- Never port-forward camera HTTP or native port 10000.
- Keep the camera subnet local.
- Do not bridge the camera network to the internet.
- Keep Windows Firewall enabled.
- Keep Ollama on localhost unless a future authenticated LAN design is deliberately introduced.
- Do not store camera credentials in source code.
- Keep the real `.env` out of Git.
