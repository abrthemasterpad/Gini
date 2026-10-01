# Gini product steering

Gini is a local-first physical AI presence built from a low-cost PTZ camera and a PC.

## Product promise
Gini should feel physically present rather than like a chatbot inside a camera. It should notice a person, turn toward them, hear a wake word, converse naturally, use safe local skills, and physically react through PTZ and speech.

## Core principles
- Local-first: core operation must continue without cloud access.
- Private by default: no default recording archive; persistent memory is opt-in.
- Safe: AI output never receives unrestricted shell, network, filesystem, or camera control.
- Affordable: reuse the Trueview T18205-A hardware already verified.
- Hardware-truthful: never mark a capability complete until it works on the physical device.
- Quiet and natural: awareness should not mean constant speech or jittery movement.

## Current verified baseline
- H.264 video
- Native ESee/Juan WebSocket transport
- Native login
- Native AAC microphone
- Local whisper.cpp STT
- Wake word "Gini"
- Native PTZ left/right/up/down/stop
- G711A talkback through the built-in speaker
- Repeated hear -> understand -> move -> speak -> hear loop

## Current product milestone
Vision + physical presence:
person enters -> Gini detects face -> centers face with bounded native PTZ -> user says "Gini" -> engaged conversation -> safe local skill -> idle/aware state.

## Non-goals for the alpha
- No wheels or mobile base
- No robot arms
- No unrestricted remote shell
- No silent surveillance
- No cloud-only dependency
- No medical/security guarantees
- No identity recognition unless explicitly opted in later
