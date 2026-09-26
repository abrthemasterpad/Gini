# Protocol discovery

This document records the interfaces verified on the tested Trueview T18205-A.

## 1. Local network

In direct AP mode, the tested camera was reachable at:

```text
172.14.10.1
```

The exact address may differ on other firmware or network modes.

## 2. Discovery

The camera family uses ESee/Juan-style discovery messages.

Examples observed during testing included UDP discovery traffic on ports 9014 and 9015.

Sensitive per-device identifiers are omitted here.

## 3. HTTP service

Port 80 runs nginx on the tested unit.

### Capabilities

```text
GET /NetSDK/System/Capabilities
```

This exposed model, firmware and feature flags.

### Bubble live stream

```text
GET /bubble/live?ch=0&stream=0
```

The server responds with a continuous Bubble media stream. In our tests it carried H.264 video and an audio track.

## 4. PTZ

The tested local CGI endpoint is:

```text
/cgi-bin/hi3510/ptzctrl.cgi
```

Example parameter shape:

```text
?-step=1&-act=left&-speed=8
```

Verified actions:

- left
- right
- up
- down

Do not assume undocumented actions such as stop, center or preset until they are verified on the target firmware.

## 5. Native ESee/Juan transport

Port 10000 is not DVRIP on this unit.

A plain WebSocket handshake succeeds:

```text
ws://CAMERA_IP:10000
```

while WSS fails.

The native transport then performs its own protocol handshake and login.

Verified sequence:

```text
WebSocket open
    ↓
ESee/Juan transport handshake
    ↓
CONNECT: 0
    ↓
protocol login
    ↓
LOGIN: 0
```

## 6. SDK transport bug found during testing

The public CameraSDK we studied called its WebSocket helper with the literal string:

```js
"ws"
```

The helper treated that value as a boolean. Because any non-empty string is truthy in JavaScript, it selected `wss://`.

The tested camera does not speak TLS on port 10000, producing a failed connection.

Changing the selector to a false boolean caused the SDK to use:

```text
ws://CAMERA_IP:10000
```

and the camera connected successfully.

## 7. Speaker control

Manual alarm sound control uses the V2 configuration key:

```text
R/SoundManCtrl
```

The same native connection also exposes VOP2P talkback. See [talkback.md](talkback.md).

## Status labels used in this repository

- ✅ Verified on physical hardware
- 🧪 Experimental / partially verified
- 📋 Planned
