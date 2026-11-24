# Smoke test — production readiness

**Date:** 2026-11-22
**Environment:** Local Vite `http://127.0.0.1:5173` + Amplify sandbox (`AWS_PROFILE=steve`, account `570912405222`)
**Build:** `npm run lint` (warnings only) + `npm run build` OK
**Note:** CloudFront was not redeployed in this pass; smoke used local SPA against live sandbox AppSync.

| Surface                | Result | Notes                                                                                                                                            |
| ---------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Auth (login)           | PASS   | Cognito email/password → `/dashboard`                                                                                                            |
| Dashboard              | PASS   | Stats, CTAs, Requests nav; no Syncfusion license banner                                                                                          |
| Materials              | PASS   | Upload UI + private-storage copy; empty/list OK                                                                                                  |
| Practice test          | PASS   | Context loaded (materials + RAG chunks); generate reached **taking** phase                                                                       |
| Exam mode UI           | PASS   | Checkbox + timer field present on setup (not full timed run)                                                                                     |
| Scenario mode UI       | PASS   | Radio + pack size; scope must name a chapter; verified badge on taking                                                                           |
| Scenario verified pack | PASS   | Chapter 12 count=1 verified; pack default 1; sequential multi-pack; mid-pack submit guard; full evidence-quote match |
| History                | PASS   | Empty state OK (no submitted attempt in this session)                                                                                            |
| Attempt detail         | SKIP   | No saved attempt id this session; code path unchanged from v1.2                                                                                  |
| Tutor                  | PASS   | Page + threads panel load                                                                                                                        |
| Flashcards             | PASS   | Generate/review UI loads                                                                                                                         |
| Review today           | PASS   | Due cards / empty + quiz CTA                                                                                                                     |
| Progress               | PASS   | Chapter/topic map loads                                                                                                                          |
| Feature requests       | PASS   | Submit + list: “Smoke test request” persisted (owner-isolated)                                                                                   |
| Syncfusion Grid/Chart  | PASS   | `registerLicense` at startup; no license banner on Dashboard; History empty (no grid rows)                                                       |
| Error/usage models     | PASS   | Schema deployed (`ErrorLog`, `UsageEvent`, `FeatureRequest`); track wired on success paths                                                       |

## Blocking issues

None.

## Follow-ups (non-blocking)

- Redeploy web (`npm run deploy:web`) when ready so CloudFront picks up `/requests` + telemetry.
- Complete a full verified scenario pack submit + attempt-detail export (badge + vignettes).
