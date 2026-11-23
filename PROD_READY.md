# Production readiness

Study features through v1.2 are complete. This milestone is **production readiness only** — no new study features.

## Definition of Done — production readiness (Ship When This Is True)

1. Unhandled runtime errors are captured and stored (user-scoped or anonymized) with enough context to diagnose (route, message, stack or component, timestamp). No secrets or full API keys are logged.
2. Lightweight feature-usage events are recorded for key actions (practice test generated, tutor message sent, flashcard reviewed, scenario completed, review queue used, export clicked, feature request submitted). Events are user-scoped and queryable.
3. A Feature Request page exists (`/requests` or similar), reachable from the app shell. Users can submit a title + description. Submissions are stored and visible to the owner (simple list is fine).
4. Every primary surface has been smoke-tested (auth, dashboard, materials, practice test, history, attempt detail, tutor, flashcards, review queue, scenarios, feature requests). Critical paths work; empty and error states are acceptable.
5. Syncfusion components (Grid, Chart) are registered correctly (`registerLicense` from `@syncfusion/ej2-base` at startup via `VITE_SYNCFUSION_LICENSE`) and used in line with current React docs (no license banner, no obvious misconfiguration).
6. Build succeeds, lint is clean or warnings-only, no hardcoded secrets, and README notes the new logging/request surfaces and any new env vars.
7. Existing v1–v1.2 flows still work.

Do not start implementation until this Definition of Done is committed. When it is met, stop.

## Isolation choice

`ErrorLog`, `UsageEvent`, and `FeatureRequest` are **owner-isolated**. Feature requests show only the signed-in user’s submissions.

## Smoke test

Results: [`SMOKE_TEST.md`](./SMOKE_TEST.md) — **PASS** (2026-11-22 local + sandbox).
