# Gini roadmap

The rule for this project is simple:

- ✅ VERIFIED ON HARDWARE
- 🧪 EXPERIMENTAL
- 📋 PLANNED

We do not mark a feature complete because an API exists. It must work on the physical device.

The product north star is documented in [core-product-direction.md](core-product-direction.md).

## Phase 0 — Reverse engineering ✅

- ✅ Discover local camera IP
- ✅ Discover Bubble media stream
- ✅ Verify H.264 video
- ✅ Discover native WebSocket transport on port 10000
- ✅ Fix SDK WS/WSS transport issue
- ✅ Native login
- ✅ Discover PTZ CGI
- ✅ Verify CGI physical PTZ
- ✅ Open VOP2P talkback
- ✅ Send arbitrary G711A audio
- ✅ Speak generated TTS through camera speaker
- ✅ Verify native AAC1 microphone
- ✅ Prove CGI PTZ freezes native AAC
- ✅ Find native SDK PTZ path
- ✅ Verify native physical PTZ with param 6 / stop 0
- ✅ Verify native PTZ preserves AAC

## Phase 1 — Physical Gini core ✅

- ✅ Camera = eyes
- ✅ Microphone = ears
- ✅ Native PTZ = neck
- ✅ Built-in speaker = mouth
- ✅ PC = brain
- ✅ Continuous camera mic
- ✅ Local whisper.cpp STT
- ✅ Wake word "Gini"
- ✅ Native PTZ command routing
- ✅ Safe camera talkback hangup
- ✅ Fresh microphone resume after talkback
- ✅ Repeated physical command loop
- ✅ Frozen rollback snapshot: `gini-core-v0.3.4-verified.js`

Success condition:

```text
hear → understand → move → speak → hear again
```

Status: ✅ VERIFIED ON HARDWARE

## Phase 2 — Secure Mini-Jarvis assistant 🧪

- 🧪 Offline-first small local AI brain
- 🧪 Deterministic local skills before LLM
- ✅ Model action allowlist
- ✅ Secret redaction
- ✅ Physical action rate limiting
- ✅ Privacy mode for transient STT files
- 🧪 Opt-in local memory, OFF by default
- 🧪 Silent text-only AI console
- 📋 Conversation session state
- 📋 Reminders
- 📋 Owner permission model
- 📋 Optional stronger online fallback for difficult questions

Success condition:

```text
"Gini, explain this" → short useful local answer
known physical commands → instant deterministic action
```

## Phase 3 — Vision + presence ← CURRENT CORE MILESTONE 🧪

See [vision-v0.5.md](vision-v0.5.md).

- 🧪 Low-CPU live video processing
- 🧪 Face detection
- 🧪 One-target selection
- 🧪 Face-center error calculation
- 🧪 PTZ dead zone
- 🧪 Stable-frame filter
- 🧪 PTZ movement cooldown
- 🧪 Dry-run tracker
- 🧪 Bounded native PTZ bridge
- 📋 Hardware-verify short native PTZ tracking pulses
- 📋 Face follows left/right
- 📋 Face follows up/down
- 📋 Target reacquisition
- 📋 Idle behavior
- 📋 Person detection when face is not visible

Success condition:

```text
person moves in frame
      ↓
Gini detects face
      ↓
native PTZ gently recenters face
```

Hardware target:

> **"Gini, look at me." → finds the face → turns toward the user → keeps them centered.**

## Phase 4 — Presence state + natural conversation 📋

- 📋 SLEEPING
- 📋 AWARE
- 📋 ENGAGED
- 📋 TRACKING
- 📋 Conversation timeout
- 📋 No repeated wake word during an engaged session
- 📋 Speaker-facing behavior while talking
- 📋 Return to aware/idle after conversation

Success condition:

```text
walk into room → Gini notices → "Gini" → conversation → follow user gently
```

## Phase 5 — Useful daily skills 📋

- ✅ Time/date local skill
- ✅ PC status local skill
- ✅ Local notes
- 📋 Reminders and timers
- 📋 Calendar integration
- 📋 Weather/information when internet is available
- 📋 Home Assistant / MQTT
- 📋 Safe PC controls
- 📋 Remote-presence mode

## Phase 6 — Recognition + memory 📋

- 📋 Owner recognition
- 📋 Familiar-person opt-in recognition
- 📋 Permission levels by person
- 📋 Encrypted local memory option
- 📋 Object/location observations
- 📋 "Where did I leave..." experiments

Recognition must be opt-in and local-first.

## Phase 7 — Product hardening 📋

- 📋 Safe camera password change
- 📋 One-command installer
- 📋 Automatic startup
- 📋 Watchdog/recovery
- 📋 Resource limits
- 📋 Hardware privacy state
- 📋 Visible listening / thinking / remote-presence state
- 📋 Dashboard
- 📋 Update/rollback path

## Later hardware

Wheels, mobile bases and robot arms remain deliberately later.

Gini first needs to become a convincing, useful stationary physical AI presence.
