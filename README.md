# Gini

Gini is an open-source project that turns a low-cost Trueview / ESee-compatible PTZ Wi-Fi camera into a locally controlled AI robot head.

The first tested device is the **Trueview T18205-A**. The goal is to reuse the camera's existing hardware as much as possible:

- camera = eyes
- microphone = ears
- PTZ motors = neck
- built-in speaker = mouth
- PC = brain

## Hardware-verified status

| Capability | Status | Notes |
|---|---|---|
| H.264 video | ✅ Verified | Local Bubble stream works |
| PTZ left/right/up/down | ✅ Verified | Local CGI control works |
| Native ESee transport | ✅ Verified | WebSocket on port 10000 |
| Native login | ✅ Verified | Protocol login returns success |
| Built-in alarm sound | ✅ Verified | `R/SoundManCtrl` works |
| Arbitrary speech through built-in speaker | ✅ Verified | G711A talkback works |
| Camera microphone | 🧪 Partial | Audio track detected; clean capture pipeline is next |
| Speech-to-text | 📋 Planned | Local/free first |
| Wake word | 📋 Planned | "Gini" |
| Person tracking | 📋 Planned | Vision + PTZ |
| Conversation engine | 📋 Planned | STT → brain → TTS |
| Memory | 📋 Planned | Later phase |

## Key discovery

The camera reports:

```text
spTwowayTalk: false
```

but the native ESee/Juan talkback path still accepts:

```text
vop2p_call -> result 0
vop2p_send -> G711A 8000 Hz mono
vop2p_hangup
```

and arbitrary generated speech was physically heard through the camera speaker.

Another important finding: the public SDK we tested passed the string `"ws"` into a boolean-style transport selector. Because a non-empty string is truthy, it selected **WSS** instead of plain **WS**. The camera accepts:

```text
ws://CAMERA_IP:10000
```

not WSS. Changing that selector to `false` allowed the native connection to succeed.

## Tested local interfaces

```text
Video:
http://CAMERA_IP/bubble/live?ch=0&stream=0

Capabilities:
http://CAMERA_IP/NetSDK/System/Capabilities

PTZ:
http://CAMERA_IP/cgi-bin/hi3510/ptzctrl.cgi

Native ESee/Juan transport:
ws://CAMERA_IP:10000
```

Do not assume these interfaces are identical on every firmware or model.

## Documentation

- [Hardware notes](docs/hardware.md)
- [Protocol discovery](docs/protocol-discovery.md)
- [Talkback / speaker protocol](docs/talkback.md)
- [Roadmap](docs/roadmap.md)
- [Troubleshooting](docs/troubleshooting.md)
- [Article draft](docs/article-draft.md)
- [Research references](research/references.md)

## Run Gini speech on Windows (experimental repo integration)

This command packages the speech pipeline previously heard on the tested camera. This repository version has **not yet been rerun against the hardware**. It needs Node.js, Windows PowerShell with `System.Speech`, and your local ESee CameraSDK at `esee-sdk/CameraSDK/play.js`. The SDK is not bundled; check its license before redistribution. The tested SDK needed its transport selector changed from the truthy string `"ws"` to `false` to connect with plain WebSocket.

1. Clone this repository on the PC connected to the camera Wi-Fi. Place your **existing working, patched** CameraSDK in `esee-sdk/` under the clone. Do not copy recordings, secrets, or device IDs into Git.
2. Copy `.env.example` to `.env` and set your camera IP, port, username and password. `.env` is ignored by Git.
3. In PowerShell from the repository root run:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\gini-say.ps1 "Hello, I am Gini."
```

The wrapper synthesizes a temporary 16 kHz WAV, transmits 8 kHz G711A frames through native talkback, and removes the WAV afterward. The voice still depends on the SAPI voices installed on Windows; a youthful female voice is a later milestone. If a local SDK uses a different layout, adjust its path in `src/audio/talkback.js`.

## Current next milestone

**Capture the camera microphone cleanly on the PC.**

Target:

```text
camera mic
   ↓
local stream
   ↓
decoded PCM
   ↓
record / listen
   ↓
speech-to-text
```

## Security

This project is for hardware you own or are authorized to test.

Do not expose camera control interfaces directly to the public internet. Use a strong camera password where the firmware supports it, and never commit credentials, device IDs, Wi-Fi secrets, API keys, MAC addresses, or personal recordings.

## License

This repository currently uses the license selected by the repository owner. See [LICENSE](LICENSE).
