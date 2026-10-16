# Mandatory Engineering Architecture & Verification Standard

> Binding repository engineering policy for future work. Established 2026-10-16. Documentation policy only; it does not assert code has implemented these patterns.

**Repository:** `abrthemasterpad/Gini`

## Binding system-engineering decision rules

**Effective scope.** Mandatory for future product changes, refactors, API/database/schema alterations, agent/worker changes, deployment decisions and performance fixes. This is a design/verification contract, **not** evidence that any runtime change has been implemented. If project security, privacy, authorization, product or provenance contracts are stricter, those win. Do not weaken prior rules.

### 1. Scale reads — measure, then optimize
- MUST measure a reproducible read path (query plan, latency distribution, volume, owner/tenant scope) before changing the architecture.
- Prefer corrected database indexes and bounded queries, then explicit cache policy with key scoping, TTL/invalidation and stale-data semantics. Track cache hit rate and stale-read risks.
- Read replicas are **conditional**, not default: require measured primary saturation, documented replica lag/consistency acceptance and failover/rollback plan. Never let a stale replica decide a financial action, authorization, approval or evidence mutation.

### 2. Scale writes — preserve durability and exact meaning
- Batching is conditional on demonstrated volume. Define maximum batch size, maximum delay, partial-failure handling, per-event unique identifiers, deterministic ordering policy and duplicate rejection.
- Client success/ACK MUST mean committed/durable according to the stated contract, never merely enqueued in volatile memory. If async acceptance is used, explicitly say `accepted/pending`, expose a durable job/event ID and distinguish it from `completed`.
- Sharding/partitioning across databases is last-resort work requiring a measured bottleneck, concrete partition key, cross-partition consistency impact, migration, rollback, and test plan. Never implement sharding just because a system-design checklist mentions it.

### 3. Real-time — make freshness honest
- Choose SSE for server-to-client state/progress; use WebSockets only for demonstrated bidirectional needs; use bounded polling when simpler. Record reason and load/failure trade-offs.
- Streaming is a delivery channel, **not** the source of truth. Provide persistent state/read-after-reconnect recovery, cursor or sequence IDs where needed, replay/idempotent UI updates, timestamps, heartbeat/expiry and an explicit delayed/offline state.
- Verify reconnect, missed events, reordered events, duplicate messages, client sleep and network transitions. Do not claim real-time freshness from an old cached snapshot.

### 4. Background jobs — durable, bounded, reviewable
- Move truly slow/high-variance work outside latency-sensitive requests when necessary. Jobs MUST have persistent IDs, explicit states (`queued/running/succeeded/failed/cancelled`), scoped ownership, bounded concurrency, attempt limits, timeouts, resource/cost budgets, progress evidence and terminal reasons.
- Workers MUST claim/lease jobs safely, handle restarts, recover stuck leases, expose retry/backoff + jitter for transient failures, and quarantine poison jobs. Side effects MUST have stable idempotency keys.
- A queue does not authorize new external actions. Human review and approval gates for sending, publishing, spending and irreversible actions remain intact. Report `pending` honestly when no worker is running.

### 5. Reliability — prove behavior when things break
- Classify transient vs permanent errors; retry only safe/idempotent steps with finite budgets and exponential backoff plus jitter. Use circuit breakers for repeat-failing external dependencies where measured/justified; include reopening criteria.
- Every externally triggered or replayed write MUST be idempotent at its actual transaction boundary (unique constraint or atomic check), not just with a client boolean.
- Define observability around queue age, processing latency (p50/p95), delivery lag, failure reason, retries, dropped/duplicate records, stale reads, worker health and resource/cost limits when relevant. Guard sensitive data in logs.
- Failure injection MUST cover provider 429/5xx, timeouts, unavailable database, interrupted workers, duplicate/out-of-order input, stale cache and authorization rejection for impacted paths.

### 6. Separate writes from reads — only where useful
- Distinguish mutable commands, canonical writes and projections. For critical provenance, store source/evidence and audit events append-only; derive read models from them when needed.
- Full CQRS or separate read/write databases are OPTIONAL, only with measured query isolation or audit/projection requirements. Document eventual consistency, rebuild process, projection versioning and user-facing lag; never overwrite source records to repair a projection.

## Mandatory change workflow and acceptance gate

1. **Baseline first.** Read README + root AGENTS + project continuity/security docs and inspect current code, tests, deployment claims and available infrastructure. Identify one concrete failure or bottleneck; don't fabricate metrics.
2. **Decision matrix.** For each of six patterns record `APPLY / DEFER / NOT APPLICABLE`, evidence, proposed design, consistency/privacy risk and why the smallest solution is enough. A DEFER is a valid engineering outcome.
3. **Design before mutation.** Specify data ownership, boundary/tenant/authorization, durable commit vs pending state, dedupe key, delivery/retry semantics, observability, run/cost limit, failure mode and rollback; use existing free/included stack when possible.
4. **Build vertical slice.** Implement with schema constraints and explicit status contracts, not a mocked green UI. No hard-coded success, fake tests, fake production footage, fabricated customer outcomes or unverified provider support.
5. **Regression harness.** Add deterministic positive/negative integration tests and fault injection: duplicates, cancellation/restart, queue recovery, network/proxy outage, dead-letter, stale/eventual reads, tenant leakage, authentication failure and budget caps as applicable. Always preserve existing project-specific harness and run available checks.
6. **Verification evidence.** In PR/commit notes record exact commands and true results (`PASS / FAIL / NOT RUN`), changed behavior, baseline vs after measurement, residual risk, migration steps and safe rollback. `Not run` is never `pass`; architecture-only docs never prove runtime adoption.
7. **Change control.** Do not deploy, merge protected work, execute real-world external actions, spend money, send messages or publish without the project's existing authorization gates. Prefer one coherent change/commit per milestone over cosmetic micro-commits.

**Hard stop:** A change that breaks the project's evidence provenance, authenticated isolation, safety boundaries or truthful status reporting MUST NOT be marked complete just because unit tests or builds pass. An operational feature is complete only after its relevant failure tests and reproducible evidence pass.

## Repository-specific contract

### Gini — local-first physical AI presence
- Keep camera video, microphone/STT, speaker, PTZ control, and AI inference in separately bounded asynchronous loops. Prefer dropping old vision observations over unbounded queues or stale physical commands.
- Essential wake/presence/interaction behavior MUST work without internet. Do not enable default recording, retained face data, silent surveillance or persistent memory without explicit owner opt-in.
- Native camera WS transport is NOT a generic internet-facing cloud service. Reconnect with bounded jitter; do not replay stale PTZ movement or speech. Enforce motor movement range, rate, cancellation and safe-stop controls.
- Honor device/session/user authorization, privacy and consent. Never grant unrestricted remote shell control to the language model.
- Test camera disconnection, WS reauth/reconnect, packet loss, host restart, stalled STT, silent audio, queue overflow, person motion, privacy toggle, motor limits and emergency stop. Distinguish physical hardware proof from simulation.
