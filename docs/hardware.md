# Hardware notes

## Tested camera

- Brand: Trueview
- Model: T18205-A
- Device type reported by firmware: IPCAM
- Software version observed during testing: 5.1.2.577015

Sensitive identifiers such as serial numbers, MAC addresses, SSIDs and cloud IDs are intentionally omitted.

## What is physically reused

Gini currently reuses the camera's existing:

- H.264 image sensor pipeline
- microphone
- PTZ motors
- built-in speaker
- Wi-Fi interface

The PC provides the higher-level intelligence.

## Capability observations

The camera capability endpoint exposed useful flags including PTZ support, manual sound control and alarm sound support.

One notable contradiction is that the firmware reported:

```json
"spTwowayTalk": false
```

while the native VOP2P talkback command was accepted and arbitrary G711A audio was heard from the physical speaker.

This means capability flags should be treated as hints, not always as definitive proof that a lower-level path is unavailable.

## Important security note

During development, the tested unit accepted local interfaces that should not be exposed to an untrusted network. Before using Gini on a normal LAN, configure a non-empty password if the firmware allows it.
