# Gini Teaching Mode V1 — locked build contract

Status: **Day 1 foundation branch**

Branch: `feat/gini-teaching-mode-v1-day1`

Base commit: `ad18c89715cab5d3f615045013f10ee443621eb0`

## Why this branch is isolated

The GitHub `main` branch is older than the current local Gini autonomy work. The verified live microphone/talkback/autonomy files must not be edited from this older base and then merged blindly.

This branch therefore adds only new Teaching Mode modules, tests and documentation. Integration into the live robot must happen only after the current local hardware baseline is pushed and this branch is rebased or cherry-picked onto it.

## Product target

A child can say a teaching request and Gini can conduct a short interactive lesson through the physical robot:

```text
request -> plan -> explain -> ask -> listen -> evaluate understanding
        -> hint/retry when useful -> next concept -> recap -> complete
```

Teaching Mode is not the full OpenMAIC application. We reuse the useful architecture pattern: **plan first, then execute small interactive teaching scenes**. We do not import dashboards, PPT generation, browser classrooms or other unrelated OpenMAIC surface area into Gini.

## Non-negotiable rules

- Preserve the verified camera mic/talkback transport.
- No pronunciation score from free-form Whisper transcription.
- Recognition uncertainty must never be presented as the child being wrong.
- Malformed AI output fails closed and cannot crash the session state machine.
- Maximum 10 lesson steps.
- One small concept and one understanding check at a time.
- Stop and pause must remain deterministic local controls.
- AI-generated plans are data only; they do not get shell, file, browser or arbitrary device actions.

## Day 1 gate

Day 1 is complete only when all of these are true:

1. `gini-teaching-core.js` validates the lesson schema.
2. A malformed lesson is rejected without throwing the live runtime into an invalid state.
3. The deterministic session states cover intro, teaching, question, listening, evaluation, hint, completion and stop.
4. `gini-teaching-planner.js` uses a two-stage outline -> detailed lesson flow and validates the final output before use.
5. `node scripts/gini-teaching-smoke-test.js` exits successfully.
6. No existing verified hardware file is modified on this branch.

## Five-day readiness gates

### Day 1 — foundation

Pure state machine, validated lesson schema, fail-closed local planner adapter, smoke test.

### Day 2 — teaching intelligence

Add a hardware-free runtime around the core. Exercise correct, wrong, partial, uncertain, silence and "I don't know" responses. Add evaluator rules that judge understanding only.

### Day 3 — physical turn loop

Integrate with the newest verified local Gini mic/STT/talkback baseline. Pass repeated `speak -> listen -> evaluate -> speak` cycles without a stuck talkback or microphone session.

### Day 4 — durable sessions

Local session persistence, pause/resume after process restart, lesson history, age/difficulty settings, planner failure handling and structured logs.

### Day 5 — real-use qualification

Pass **10 consecutive complete lessons and at least 50 physical voice turns** with:

- zero crash
- zero stuck talkback session
- working stop/pause/resume
- no false pronunciation claims
- uncertainty handled without calling the child wrong
- usable lesson progression across multiple subjects

Only after this gate can Teaching Mode be called ready for normal use.
