# Gini core product direction

This document is the product north star for Gini.

## Core idea

**Gini is a small physical AI presence for a room.**

Gini should not become a generic chatbot inside a camera. The product becomes valuable when the software, camera, motors, microphone and speaker create the feeling that a helpful AI is physically present.

The essential experience is:

```text
person enters
    ↓
Gini notices
    ↓
Gini turns toward the person
    ↓
"Gini..."
    ↓
natural conversation
    ↓
safe local skill / memory / action
    ↓
short spoken response
    ↓
Gini continues looking toward the speaker
```

## Product promise

Gini should be:

- **present** — sees, hears and physically reacts
- **useful** — reminders, notes, information and approved actions
- **local-first** — core operation should continue without cloud access
- **private** — no default recording archive; explicit memory only
- **safe** — AI output never receives unrestricted control of the computer or camera
- **affordable** — reuse low-cost PTZ camera hardware instead of requiring an expensive robot
- **quiet when unnecessary** — awareness should not mean constant talking

## What creates the "mini Jarvis" feeling

The priority is not a huge language model.

The feeling comes from combining:

1. **Presence awareness** — knows when somebody is in the room.
2. **Speaker-facing behavior** — turns toward the person speaking.
3. **Session conversation** — after wake-up, the user should not repeat "Gini" every sentence.
4. **Useful skills** — reminders, notes, time, PC status and later approved automations.
5. **Context and memory** — remembers only what the owner explicitly wants saved.
6. **Natural physical behavior** — bounded tracking, idle pose and sensible movement.
7. **Security and privacy** — visible states and tightly controlled actions.

## Target demo

The core product demo is intentionally small:

> A person walks into the room. Gini notices and turns toward them.  
> The person says, "Gini, look at me."  
> Gini centers the person's face and keeps them in frame.  
> The person asks, "What was I supposed to do tonight?"  
> Gini answers from approved local context.  
> The person says, "Remind me in twenty minutes."  
> Gini confirms.  
> As the person moves, Gini follows gently and then returns to an idle state.

If this demo feels natural, Gini is becoming a product rather than a camera experiment.

## Presence state model

```text
SLEEPING
   │ person detected
   ▼
AWARE
   │ wake word / direct engagement
   ▼
ENGAGED
   │ conversation timeout
   ▼
AWARE
   │ room empty timeout
   ▼
SLEEPING
```

Later states may include:

- TRACKING
- PRIVACY
- REMOTE_PRESENCE
- WATCH_MODE

## Product boundaries

Gini should not become:

- unrestricted remote shell access
- silent surveillance software
- a cloud-only assistant
- a feature dump with no coherent physical experience
- a medical or security device making guarantees it cannot support

## Engineering order

The core order is now:

```text
verified hardware loop
        ↓
secure mini AI assistant
        ↓
VISION + PRESENCE  ← current core milestone
        ↓
speaker-facing tracking
        ↓
engaged conversation sessions
        ↓
reminders + useful skills
        ↓
owner recognition / permissions
        ↓
optional advanced automations
```

Wheels and a mobile body stay later. Gini first needs to become a convincing stationary robot head.
