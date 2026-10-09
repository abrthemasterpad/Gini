# Gini safety and truthfulness steering

These rules override convenience.

- Never expose camera HTTP/native control interfaces to the public internet.
- Treat the tested camera's blank/weak admin credential state as a known security risk.
- Do not change camera credentials until a recovery-safe credential-change path is verified.
- Tracking must start in dry-run mode; live PTZ requires an explicit live flag.
- Use dead zones, stable-frame checks, one-axis corrections, short pulses, acknowledgements, settle windows, and cooldowns.
- If tracking loses the face after a move, hold position; never continue moving blindly.
- Do not claim a feature is "verified" because code compiles or an API returns success.
- Hardware verification means an observed result on the physical Gini camera.
- Do not save child voice/video or add identity recognition by default.
- Teacher mode must not claim phoneme-level pronunciation grading unless such accuracy is actually validated.
