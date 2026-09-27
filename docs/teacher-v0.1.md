# Gini Teacher v0.1

Status: **experimental / ready for local hardware test**

Gini Teacher reuses the already-built **Rebuildo Voice Artist** instead of creating another TTS stack.

## v0.1 goal

```text
Tamil explanation
    ↓
native Hindi / Japanese target voice
    ↓
Gini camera speaker
    ↓
child repeats
    ↓
repeat once more
```

v0.1 deliberately does **not** pretend to grade pronunciation.

The first hardware milestone is simply:

1. Rebuildo generates the correct language voice locally.
2. Gini converts the WAV to the camera's 16 kHz talkback input.
3. Gini speaks it through the physical camera speaker.
4. A short Tamil-led lesson can complete without breaking the camera audio path.

## Languages

### Ready for v0.1 test

- Tamil teacher/explanation voice: Rebuildo Piper Tamil
- Hindi target voice: Rebuildo Kokoro Hindi
- Japanese target voice: Rebuildo Kokoro Japanese

### Not enabled yet

- Arabic

Arabic is intentionally blocked until a local Arabic TTS engine is selected and verified for Windows compatibility, offline use, pronunciation, model size, license fit, and Gini talkback conversion.

## Rebuildo dependency

Run the Rebuildo local renderer/voice server first:

```powershell
cd D:\Rebuildo\renderer
npm start
```

Expected local endpoint: `http://127.0.0.1:8787`.

Gini uses Rebuildo's local `/health`, `/voice/jobs`, voice-job status, and returned WAV endpoints. No cloud TTS is required for this path.

## Commands

Check readiness:

```powershell
cd D:\Gini
node .\scripts\gini-teacher.js status
```

Hindi demo / lesson:

```powershell
node .\scripts\gini-teacher.js demo hi
node .\scripts\gini-teacher.js lesson hi
```

Japanese demo / lesson:

```powershell
node .\scripts\gini-teacher.js demo ja
node .\scripts\gini-teacher.js lesson ja
```

## Camera audio path

```text
Rebuildo WAV
  -> FFmpeg
  -> 16 kHz / mono / PCM16 WAV
  -> existing Gini safe talkback path
  -> G711A / 8 kHz camera speaker
```

This keeps Gini's tested native talkback transport unchanged.

## Safety / privacy

- temporary teacher WAV files live under `runtime/teacher`
- privacy mode deletes generated/transcoded WAVs after playback
- Rebuildo remains localhost by default
- no child voice recording is added in v0.1
- no pronunciation score is generated in v0.1

## Next milestone

After physical Tamil + Hindi + Japanese playback is verified:

1. connect teacher mode to Gini's native microphone
2. capture one repeat-after-me response
3. use local Whisper for a coarse transcription
4. classify only as understood / try again / not understood
5. do not claim phoneme-level pronunciation accuracy

Face tracking is not required for Teacher Mode.
