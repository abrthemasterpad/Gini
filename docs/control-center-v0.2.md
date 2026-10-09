# Gini Robot Control Center v0.2

This milestone turns the existing Gini Lab into one diagnostic console for the real robot loop.

## Modules

- **CAMERA** — checks the native camera endpoint used by the robot.
- **HEARING** — camera microphone capture, VAD and local Whisper transcription.
- **VISION** — doctor, dry-run face tracking, and a deliberately bounded live tracking test.
- **SPEECH** — Rebuildo voice plus camera talkback.
- **HEAD** — single bounded PTZ pulses and semantic expressions.
- **TEACHER** — existing child-friendly teaching loop.
- **AUTONOMY** — wake word, STT, command/AI decision, speech and safe movement.

The page also includes **FULL ROBOT TEST**, which reports each stage separately instead of collapsing all failures into one generic error.

## Start it

From the repository root:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\gini-control-center.ps1
```

Default local URL:

```text
http://127.0.0.1:8790
```

## Safety limits

The Control Center does not allow concurrent camera tasks.

Manual head diagnostics:

- native PTZ only
- speed 1
- default 90 ms pulse
- accepted range 60–140 ms
- MOVE acknowledgement required
- STOP acknowledgement required

Live vision from the Control Center:

- maximum 4 physical moves
- maximum 20 seconds
- 85 ms pulse
- 3 stable face frames required
- 900 ms cooldown
- 1000 ms post-move settle

Live vision inside FULL ROBOT TEST is stricter:

- explicit UI acknowledgement required
- maximum 2 physical moves
- maximum 10 seconds

## Live assistant PTZ hardening

The previous live assistant still used an older timed PTZ path. v0.2 replaces that path with the same safety model used by the newer PTZ bridge:

1. send one bounded movement command
2. wait for camera MOVE acknowledgement
3. run a short movement pulse
4. send STOP
5. require STOP acknowledgement
6. block further movement if any stage times out or fails

This change is code-reviewed but still requires physical verification on the T18205-A before it should be considered hardware-verified.

## Hearing reliability changes

The live assistant no longer primes Whisper with example wake phrases such as “Gini turn left.” That prompt could bias recognition toward commands that were never spoken.

The live path now uses deterministic Whisper settings and rejects obvious instruction leakage or implausibly long transcripts before wake-word parsing.

After Gini speaks, the microphone also remains suppressed for a configurable echo-guard period before new audio is accepted:

```text
GINI_ECHO_GUARD_MS=800
```

Default: 800 ms.

## Speaker quality experiment

The modular camera talkback path now avoids zero-delay frame catch-up bursts. It keeps a minimum gap between G.711A frames and prints timing metrics such as:

```text
GINI TALKBACK METRICS: ...
```

The Control Center **SPEECH** test explicitly uses this smooth-pacing candidate.

Teacher and autonomy do **not** silently switch to the new path yet. They retain the previously verified local talkback path when it exists. Only make the new pacing path the default after the physical speaker test confirms that the trembling/vibration is improved rather than worse.

## Recommended physical test order

1. Open Control Center and confirm CAMERA is ready.
2. Run **HEAD → left/right/up/down** one pulse each. Stop immediately if direction or release is wrong.
3. Run **HEARING** three times from normal child distance.
4. Run **SPEECH** and listen specifically for vibration, gaps and pitch instability. Save the printed talkback metrics.
5. Run **VISION dry-run** with a face moving left/right.
6. Only then run **VISION bounded live**.
7. Run **FULL ROBOT TEST → dry vision**.
8. Finally, enable the checkbox and run **FULL ROBOT TEST → LIVE vision**.
9. Start **AUTONOMY** only after the above stages pass.

Do not mark this milestone hardware-verified from code checks alone.
