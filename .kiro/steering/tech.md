# Gini technical steering

## Runtime
- Primary platform: Windows PC
- Main implementation: Node.js / JavaScript
- Hardware: Trueview T18205-A PTZ camera
- Native transport: plain WebSocket to camera port 10000
- Video: Bubble stream -> go2rtc -> local RTSP -> FFmpeg
- STT: local whisper.cpp
- Local AI: Ollama first, currently qwen3:0.6b
- TTS/talkback: generated WAV -> PCM16 -> G711A 8 kHz mono -> native camera talkback
- Teacher voice dependency: local Rebuildo Voice Artist server

## Hardware control invariants
- Use native SDK PTZ for autonomous/live tracking.
- Do not use CGI PTZ in the live assistant/tracker because it was proven to freeze the native AAC microphone path.
- Known native PTZ commands:
  - UP = type 2, param 6
  - DOWN = type 3, param 6
  - LEFT = type 4, param 6
  - RIGHT = type 5, param 6
  - STOP = type 0, param 0
- Vision mirror/inversion defaults for the tested device:
  - GINI_VISION_MIRROR_X=1
  - GINI_VISION_PTZ_INVERT_X=1
  - GINI_VISION_PTZ_INVERT_Y=0

## AI boundaries
- Deterministic commands and hardware safety rules run before the LLM.
- Model output is untrusted.
- Current allowlisted physical actions are bounded PTZ commands and sleep.
- Never let model text execute arbitrary shell commands, file writes, browser actions, purchases, messages, credentials, or arbitrary network calls.

## Privacy
- No video recording for tracking.
- Temporary STT/audio artifacts should be deleted in privacy mode.
- Persistent memory remains OFF by default.
- Never commit camera credentials, device IDs, recordings, Wi-Fi secrets, API keys, or MAC addresses.

## Verification rule
Software tests are not sufficient for hardware claims. Every physical feature must have an explicit hardware verification step and rollback path.
