# Gini Alpha requirements

## Goal
Deliver a convincing stationary physical AI presence on the existing Trueview T18205-A hardware without breaking the hardware-verified audio/PTZ/talkback loop.

## R1 — Face acquisition
WHEN a supported local video feed is available,
THE SYSTEM SHALL detect a face locally at low CPU cost without recording video.

WHEN multiple faces are visible,
THE SYSTEM SHALL track one target using deterministic target-selection logic.

## R2 — Safe physical centering
WHEN the tracked face is stable and outside the configured dead zone,
THE SYSTEM SHALL issue at most one bounded native PTZ correction before waiting for acknowledgement and post-move settling.

WHEN the face is lost after a movement,
THE SYSTEM SHALL hold position and reacquire rather than continue moving blindly.

## R3 — Presence states
WHEN no person is present for the configured timeout,
THE SYSTEM SHALL enter SLEEPING or idle awareness.

WHEN a person becomes present,
THE SYSTEM SHALL enter AWARE without speaking unnecessarily.

WHEN the wake word or explicit engagement occurs,
THE SYSTEM SHALL enter ENGAGED and maintain a short conversation session without requiring the wake word for every sentence.

## R4 — Conversation and local skills
WHEN the user asks for a deterministic supported skill,
THE SYSTEM SHALL execute that skill without routing control through an unrestricted LLM action.

The alpha SHALL include:
- time/date
- PC status
- local notes
- reminders/timers

## R5 — Privacy and memory
Persistent memory SHALL remain disabled by default.

WHEN the user explicitly asks Gini to remember or forget supported local context,
THE SYSTEM SHALL apply the action only through the approved memory layer.

The system SHALL NOT create a default video or child-audio archive.

## R6 — Teacher mode
WHEN Teacher mode is explicitly started and Rebuildo is healthy,
THE SYSTEM SHALL play a short local lesson through the physical camera speaker.

The first verified lesson path SHALL support the already-integrated languages before adding new language engines.

## R7 — Failure isolation
WHEN the local LLM, Rebuildo, or an optional skill is unavailable,
THE SYSTEM SHALL preserve verified camera commands and fail safely without corrupting the core loop.

## R8 — Product verification
A feature SHALL NOT be marked verified until its observable physical success criteria pass on the actual Gini hardware.
