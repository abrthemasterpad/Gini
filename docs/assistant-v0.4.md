# Gini AI Assistant v0.4

Status: **🧪 Experimental assistant layer on top of the hardware-verified v0.3.4 core.**

The verified camera control path is intentionally preserved. New AI work lives in separate scripts so AI changes cannot silently break the proven microphone/PTZ/talkback loop.

## Architecture

```text
Trueview camera mic (AAC1)
        ↓
whisper.cpp STT
        ↓
local command parser ─────→ native SDK PTZ
        │
        └─ unknown/general request
                  ↓
             Gini AI brain
          (local Ollama first)
                  ↓
        strict security validator
                  ↓
       short reply + allowlisted action
                  ↓
        real camera speaker
```

The fast local command path remains deterministic. AI is used only when the utterance is not already a known command.

## Files

- `scripts/gini-core-v0.3.4-verified.js` — frozen fallback snapshot of the verified hardware core.
- `scripts/gini-continuous-direct.js` — current deterministic continuous assistant.
- `scripts/gini-assistant-live.js` — experimental live AI assistant.
- `scripts/gini-assistant-brain.js` — offline-first AI provider and prompting.
- `scripts/gini-assistant-security.js` — action allowlist, secret redaction, reply limits and action rate limits.
- `scripts/gini-assistant-memory.js` — opt-in local memory.
- `scripts/gini-assistant-console.js` — silent text-only dry-run console.
- `scripts/gini-assistant-status.js` — local AI provider readiness check.
- `scripts/gini-security-audit.js` — read-only security report.
- `scripts/gini-night-build-check.ps1` — silent syntax/security/provider check.

## AI provider

Default:

```text
provider: Ollama
endpoint: http://127.0.0.1:11434
model: qwen3:4b
```

This is intentionally local-first because the PC is normally connected directly to the camera Wi-Fi and may have no internet route.

If the local model is unavailable, Gini falls back safely: verified local camera commands continue to work and general AI conversation reports that its AI brain is unavailable.

## Security model

Model output is **not trusted**.

The model may request only these actions:

```text
ptz.left
ptz.right
ptz.up
ptz.down
sleep
```

Everything else is discarded by the security layer. In particular, model output cannot directly execute:

- shell / PowerShell commands
- arbitrary files
- arbitrary network calls
- browser actions
- payments or purchases
- account changes
- messages or emails
- credential operations

AI actions are also rate-limited. The default limit is 6 physical actions per minute.

Future high-impact actions must use a separate confirmation gate rather than being added directly to this allowlist.

## Privacy

`GINI_PRIVACY_MODE=1` is the default for the AI live entry point.

With privacy mode enabled, temporary recognition files are deleted after each STT window:

- AAC
- WAV
- transcript TXT

Persistent conversation history is not required for v0.4.

## Memory

Persistent memory is **OFF by default**.

```text
GINI_MEMORY_ENABLED=0
```

If the owner enables it, Gini stores memory locally under `runtime/`, which is excluded from Git. The security layer accepts writes only when the user explicitly says **remember** and deletes only after an explicit **forget** request.

Do not use memory for passwords, API keys, financial credentials, identity documents or other secrets.

## Current camera security limitation

The tested camera currently accepts the local admin account with a blank password.

That is a security weakness. Do not expose the camera HTTP interface or native port 10000 to the internet.

Do not change the credential blindly. First verify a supported credential-change path and recovery method so the already-working native transport is not locked out.

Until then:

- keep Gini on the isolated direct camera network
- do not port-forward camera services
- do not publish device identifiers or recordings
- keep secrets outside Git

## Night / silent development

The assistant foundation can be tested without waking anyone and without connecting to the camera:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\gini-night-build-check.ps1
```

For a text-only dry run:

```powershell
node .\scripts\gini-assistant-console.js
```

This mode never uses the microphone, speaker or PTZ. AI-requested actions are printed only as `SAFE ACTIONS (DRY RUN)`.

## Live entry point

After the local AI provider is ready and daytime hardware testing is possible:

```powershell
node .\scripts\gini-assistant-live.js
```

This is experimental until it receives the same repeated hardware verification already completed for v0.3.x.

## Next security milestones

1. Verify a safe method for changing the camera admin password.
2. Add owner/speaker verification before expanding the action set.
3. Add an explicit confirmation state for future high-impact actions.
4. Add optional encrypted local memory if persistent personal memory becomes useful.
5. Keep the camera control plane isolated from public networks.
