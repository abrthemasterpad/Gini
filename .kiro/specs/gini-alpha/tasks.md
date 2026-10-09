# Gini Alpha tasks

## Wave 1 — Establish baseline
- [ ] 1. Run repository syntax/security checks and record the current baseline.
- [ ] 2. Verify the frozen v0.3.x hardware core still completes hear -> understand -> move -> speak -> hear.
- [ ] 3. Add automated regression checks that do not require hardware for modules that can be tested locally.

## Wave 2 — Vision v0.5 hardware close
- [ ] 4. Validate low-rate face detection against the live local RTSP feed in dry-run mode.
- [ ] 5. Verify mirror correction and target-center coordinates.
- [ ] 6. Hardware-test one native PTZ correction pulse on each axis with acknowledgement/settle timing.
- [ ] 7. Tune dead zone, stable-frame threshold, pulse duration, settle window, and cooldown.
- [ ] 8. Verify face reacquisition and "hold when lost" behavior.
- [ ] 9. Mark Vision v0.5 verified only after "Gini, look at me" physically recenters a user reliably.

## Wave 3 — Presence + conversation
- [ ] 10. Implement SLEEPING/AWARE/ENGAGED/TRACKING state machine.
- [ ] 11. Add engaged-session timeout so the wake word is not required for every sentence.
- [ ] 12. Add speaker-facing behavior without continuous jitter.
- [ ] 13. Verify conversation -> talkback -> fresh microphone resume across repeated turns.

## Wave 4 — Daily usefulness
- [ ] 14. Add local reminders/timers with persistence and expiry handling.
- [ ] 15. Harden existing time/date, PC status, and local notes skills.
- [ ] 16. Add explicit confirmation gates before any future higher-impact skill.
- [ ] 17. Test failure isolation when Ollama or optional services are offline.

## Wave 5 — Teacher mode
- [ ] 18. Hardware-verify current Rebuildo-backed lesson playback.
- [ ] 19. Connect Teacher mode to one repeat-after-me microphone turn.
- [ ] 20. Use local Whisper for coarse understood / try-again / not-understood classification only.
- [ ] 21. Verify Teacher mode cannot break the normal assistant audio loop.

## Wave 6 — Alpha hardening
- [ ] 22. Add one-command health check for camera, mic, speaker, PTZ, STT, vision, Ollama, and Rebuildo.
- [ ] 23. Add watchdog/recovery for recoverable local failures.
- [ ] 24. Add visible listening/thinking/tracking/privacy states to the local dashboard.
- [ ] 25. Create a one-command alpha launcher and clean shutdown path.
- [ ] 26. Run the full physical alpha demo three consecutive times without manual repair.
- [ ] 27. Update README/roadmap with only hardware-observed results and tag the alpha milestone.
