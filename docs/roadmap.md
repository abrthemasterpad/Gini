# Gini roadmap

The rule for this project is simple:

- ✅ VERIFIED ON HARDWARE
- 🧪 EXPERIMENTAL
- 📋 PLANNED

We do not mark a feature complete because an API exists. It must work on the physical device.

## Phase 0 — Reverse engineering

- ✅ Discover local camera IP
- ✅ Discover Bubble media stream
- ✅ Verify H.264 video
- ✅ Detect camera audio track
- ✅ Discover PTZ CGI
- ✅ Control left/right/up/down
- ✅ Discover NetSDK capabilities
- ✅ Identify native WebSocket transport on port 10000
- ✅ Fix SDK WS/WSS transport issue
- ✅ Native protocol login
- ✅ Trigger built-in alarm sound
- ✅ Open VOP2P talkback
- ✅ Send arbitrary G711A audio
- ✅ Speak generated TTS through camera speaker

## Phase 1 — Gini Core

- 🧪 Import and sanitize speech scripts; repository version awaits hardware retest
- 🧪 Speech configuration via environment variables
- 📋 One CLI entry point
- 📋 Commands: say, left, right, up, down, status
- 📋 `gini doctor` health checks
- 📋 Remove hard-coded credentials
- 📋 Add repeatable installation instructions

## Phase 2 — Ears

**Immediate next milestone.**

- 🧪 Camera audio track already detected
- 📋 Extract continuously
- 📋 Decode to PCM
- 📋 Verify live listening
- 📋 Record a short WAV and compare quality
- 📋 Add noise gate / level normalization if needed

Success condition:

```text
Speak near Gini → clean recording on PC
```

## Phase 3 — Speech recognition

- 📋 Local/free STT first
- 📋 Voice activity detection
- 📋 Transcript output
- 📋 Command recognition

Success condition:

```text
"Gini, look left" → correct transcript
```

## Phase 4 — Wake word and conversation loop

- 📋 Wake on "Gini"
- 📋 Listen until silence
- 📋 STT
- 📋 Reason / route command
- 📋 TTS
- 📋 Play reply through camera speaker

## Phase 5 — Vision and tracking

- 📋 Person detection
- 📋 Face / head position
- 📋 PTZ tracking
- 📋 Motion-aware scan behavior
- 📋 Speaker-facing behavior

## Phase 6 — Memory and autonomy

- 📋 Familiar-person memory
- 📋 Conversation memory
- 📋 Object/location observations
- 📋 Security/watch mode
- 📋 Home-automation integrations

## Later hardware options

Wheels or a mobile base are intentionally postponed until the camera-only robot head is stable.
