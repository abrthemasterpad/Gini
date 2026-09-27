# Gini Vision v0.5

Status: **🧪 Experimental.**

Goal: make Gini visually aware without destabilizing the hardware-verified audio/PTZ/talkback core.

## First milestone

```text
camera video
    ↓
low-rate local frame stream
    ↓
face detection
    ↓
face-center error
    ↓
dead-zone + stability filter
    ↓
bounded native PTZ pulse
    ↓
face approaches center
```

The first version deliberately uses a lightweight face detector rather than a large vision model.

## Why face-first

The core demo is "Gini, look at me."

For that milestone we do not need a general object detector. A frontal-face detector gives us a small, CPU-friendly way to validate:

- live video ingestion
- target acquisition
- target-center measurement
- tracking stability
- PTZ direction mapping
- movement pulse calibration

General person detection and identity recognition come later.

## Performance target

Initial settings:

- 640 × 360 processing frame
- 4 FPS
- no video recording
- face detection only
- one target
- movement dead zone
- movement cooldown
- stable detection required before a move

The design intentionally trades frame rate for low CPU usage.

## Safety rules

Tracking is **DRY RUN by default**.

Dry run:

```text
FACE x=0.73 y=0.46 -> would move RIGHT
```

No motor command is sent until `--live` is explicitly supplied.

Live mode uses native SDK PTZ only:

- UP = type 2, param 6
- DOWN = type 3, param 6
- LEFT = type 4, param 6
- RIGHT = type 5, param 6
- STOP = type 0, param 0

CGI PTZ must not be used because it was proven to freeze the native AAC microphone path.

## Target selection

v0.5 tracks one face.

When there is no previous target, choose the largest detected face.

When there is an existing target, prefer the face nearest to the previous target center. This reduces jumping between two people.

Identity recognition is intentionally not part of v0.5.

## Movement rules

A motor move requires:

1. face detected
2. same target stable for multiple frames
3. target outside the configured dead zone
4. cooldown since previous movement
5. explicit live mode

Only one axis moves per correction. The larger error axis wins.

This is meant to avoid constant jitter.

## Video source

The tracker expects the existing local go2rtc bridge:

```text
camera Bubble stream
    ↓
go2rtc
    ↓
rtsp://127.0.0.1:8554/gini
```

The tracker uses FFmpeg to decode a low-rate raw frame stream.

## Privacy

v0.5 does not save frames or recordings.

Preview is optional and local.

Later recognition features must remain opt-in.
