# Mandatory project agent instructions

These instructions apply to coding agents and humans working on `abrthemasterpad/Gini`. Before edits, read `README.md`, this file, [docs/ENGINEERING_STANDARDS.md](docs/ENGINEERING_STANDARDS.md), and any stricter security/product/continuity documents. Do not silently add scope or bypass human approvals.


## REQUIRED: engineering architecture and failure-proofing

Before **any** code, schema, infrastructure, worker, UI status, performance or deployment change, read and follow [docs/ENGINEERING_STANDARDS.md](docs/ENGINEERING_STANDARDS.md). It is binding alongside existing continuity, security, evidence, quality, branch and human-approval rules. For each change explicitly evaluate the six engineering patterns (reads, writes, real-time, jobs, reliability and read/write separation), with APPLY/DEFER/N/A and measurements. Do not implement a pattern without proven need. Do not claim a feature, passing test, production readiness or deployment from policy-only edits. Hard stops: broken provenance, data isolation, idempotency, durable success semantics, unauthorized actions or missing failure tests. Preserve stricter existing rules.
