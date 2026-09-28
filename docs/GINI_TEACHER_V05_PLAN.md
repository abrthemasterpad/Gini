# Gini Teacher v0.5 Direction

## Priority languages

1. Tamil
2. English
3. Hindi

Japanese is parked for now.

## Voice-started language sessions

Supported child intents:

- "Gini, teach me English."
- "Gini, teach me Hindi."
- "Gini, teach me Tamil."

The live assistant should hand off the camera session to the dedicated Teacher runtime, then resume normal Gini listening after the class ends.

## Teaching style

Gini should feel like a patient learning companion, not a commanding classroom teacher.

Rules:

- one small idea at a time
- short sentences
- calm voice and slower pace
- allow wait time before repeating
- never shame or scold
- avoid sharp commands such as "listen carefully" or "say it now"
- invite instead: "when you are ready, shall we try?"
- do not call an answer wrong if recognition is uncertain
- give one hint before giving the answer
- simplify after repeated difficulty
- praise concrete effort, not every response automatically
- stop before the child becomes overloaded
- revisit difficult items later
- use Tamil as the support/explanation language for English and Hindi sessions
- do not invent pronunciation scores

## Current pronunciation policy

English target-word recognition may be used experimentally.

Tamil and Hindi pronunciation correctness must not be judged from free-form Whisper transcription. Until a phoneme/reference-audio verifier is available, Teacher may confirm that the child spoke but must not claim the pronunciation was correct or wrong.

## Book / page teaching mode

Target child request:

- "Gini, teach this page."
- "Gini, explain this book."
- "Gini, help me with this."

Planned flow:

1. Gini asks the child to hold the page steady.
2. Gini captures a clear frame from the camera.
3. If the page is unclear, Gini asks gently to move it closer or hold still.
4. Vision identifies the page content without assuming missing text.
5. Gini determines the likely subject: reading, language, maths, science, social studies, etc.
6. Gini breaks the page into tiny learnable chunks.
7. Gini explains the first chunk in age-simple language.
8. Gini asks one small check-for-understanding question.
9. Gini waits.
10. If the child struggles, Gini gives a hint or easier example instead of simply repeating.
11. Gini moves on only after enough understanding, or parks the difficult point for later.
12. At the end, Gini gives a very short recap and one confidence-building practice question.

## Book mode technical requirement

The current live assistant receives video frames but does not yet expose a verified decoded still-image capture path for Teacher mode.

Before book teaching is marked READY:

- capture one camera page frame safely
- decode it to an image without disrupting mic/talkback
- add local or explicitly configured vision analysis
- verify real book pages physically
- test printed English, Tamil and Hindi pages
- test diagrams and mixed text/image pages
- reject blurry/partial pages instead of hallucinating content

Do not call book teaching complete until those physical tests pass.
