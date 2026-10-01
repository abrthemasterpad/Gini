# Gini repository structure steering

- `scripts/`: runnable experiments, hardware tests, assistant entry points, teacher mode, and verification scripts.
- `src/`: reusable implementation modules.
- `docs/`: product direction, protocol discoveries, roadmap, hardware notes, and feature docs.
- `research/`: references and external technical findings.
- `lab/`: local testing/dashboard experiments.
- `assets/`: project media.
- `runtime/`: local temporary/persistent runtime data; must stay out of Git.

## Stability rule
The hardware-verified v0.3.x core is the rollback baseline. New AI/vision work must remain separable until hardware verified.

## Change discipline
For every feature:
1. define acceptance criteria,
2. implement in isolated modules when possible,
3. run syntax/unit/dry-run checks,
4. run hardware verification separately,
5. update docs only after observed hardware behavior,
6. preserve a rollback path.

Do not silently rewrite the verified transport, PTZ, microphone, or talkback paths while implementing higher-level features.
