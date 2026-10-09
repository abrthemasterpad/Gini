# Gini Alpha design

## Architecture

```text
Trueview camera
  |-- H.264 video --> go2rtc/FFmpeg --> face detector --> tracker policy --> native PTZ bridge
  |-- AAC mic ------> whisper.cpp ----> command/session router
  |                                      |-- deterministic skills
  |                                      |-- local Ollama fallback
  |                                      |-- reminder/memory services
  |                                      '-- Teacher mode -> Rebuildo
  '-- speaker <------ safe talkback <----- short reply / lesson audio
```

## Design decisions
1. Preserve the existing verified hardware core as a rollback baseline.
2. Keep vision, session state, reminders, memory, and Teacher mode modular.
3. Use deterministic routing for known hardware commands and local skills.
4. Keep LLM actions behind a strict validator and allowlist.
5. Keep tracking closed-loop: detect -> decide -> one pulse -> ack -> settle -> reacquire.
6. Keep memory opt-in and local.
7. Keep video transient; do not record by default.

## Presence state machine
```text
SLEEPING
  -> AWARE       when person detected
AWARE
  -> ENGAGED     on wake word/direct engagement
ENGAGED
  -> TRACKING    when look-at-me/tracking requested
TRACKING
  -> ENGAGED     when tracking ends but session remains active
ENGAGED
  -> AWARE       on conversation timeout
AWARE
  -> SLEEPING    on room-empty timeout
```

## Alpha demo
1. Person walks into room.
2. Gini notices silently.
3. User says "Gini, look at me."
4. Gini acquires and gently centers the face.
5. User asks a short question or local skill.
6. Gini replies through the camera speaker.
7. User says "Remind me in twenty minutes."
8. Gini confirms and stores the reminder locally.
9. Gini returns to aware/idle behavior.

## Verification strategy
- Static/syntax tests
- Dry-run tests with no camera motion
- Recorded fixtures only when they contain no personal/private footage
- Daytime live hardware tests for PTZ/speaker/mic
- Repeated-loop test to prove microphone resumes after speech
- Regression check against v0.3.x core
