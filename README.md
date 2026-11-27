# Paramedic Study Buddy

Multi-tenant practice-test app for paramedic coursework. Students upload course materials, generate scoped practice tests (multiple choice + written answers graded by AI), and track progress.

**Repo:** https://github.com/Bigessfour/Paramedic_Study_Buddy

**Stack:** React (Vite) + TypeScript + shadcn/ui + Tailwind + selective Syncfusion (Community License) + AWS Amplify (Cognito) + S3 + xAI API

Phased build plan: see [`PHASED_WORKFLOW.md`](./PHASED_WORKFLOW.md).

> Study aid only — not a substitute for official course materials, protocols, or certification exams.

---

## Project Definition of Done (v1 — Ship When This Is True)

The app is done when all of the following are true:

1. A user can sign up / log in with Cognito. Progress and materials are isolated per user (multi-tenant ready for classmates).
2. A user can upload course materials (PDF/DOCX) to S3. Materials are processed into retrievable context.
3. A user can specify “next exam covers [topic range / chapters / objectives]” and generate a practice test.
4. Generated tests support at least:
   - Multiple choice (with immediate or end-of-test scoring)
   - Written/short-answer questions that the AI grades against the course material
   - At least one additional common format (e.g., true/false, matching, or scenario-based)
5. Results and history are stored per user and visible in a simple dashboard (Syncfusion Grid + basic Charts acceptable).
6. The app is deployed to S3 + CloudFront via Amplify (or equivalent) on the personal AWS account and is reachable by a URL.
7. Basic error handling and empty states exist. No critical console errors on the happy path.
8. A short README exists with: how to run locally, how to deploy, required env vars, and license notes (Syncfusion + xAI).

v1, v1.1, and v1.2 (Phase 7 daily-use) are shipped. Production readiness DoD: [`PROD_READY.md`](./PROD_READY.md). See also [`PHASED_WORKFLOW.md`](./PHASED_WORKFLOW.md).

### Definition of Done — v1.1 (condensed)

Ship when: AI Tutor chat uses user materials (or labeled sample context); flashcards generate from material/attempt with basic SM-2 review; Dashboard shows topic/chapter performance; practice tests use improved retrieval; new data is user-isolated; empty/error states exist; README covers any new setup; v1 flows still build and work.

Full checklist and Phase 6 scope: see **Phase 6** and **Definition of Done — v1.1** in [`PHASED_WORKFLOW.md`](./PHASED_WORKFLOW.md).

### Definition of Done — v1.2 (condensed)

Ship when: Dashboard “Practice my weak topics”; Practice exam mode + timer; Attempt Detail “Explain this” → Tutor; chapter/topic progress map; lightweight clinical scenarios; Review today (due cards + weak quiz); attempt Markdown export; flashcards from chapter/wrong answers with edit-before-save; owner isolation; empty/error states; v1/v1.1 still work.

Full checklist: **Phase 7** and **Definition of Done — v1.2** in [`PHASED_WORKFLOW.md`](./PHASED_WORKFLOW.md). Routes: `/practice`, `/tutor`, `/flashcards`, `/progress`, `/review`.

### Production readiness

See [`PROD_READY.md`](./PROD_READY.md). Smoke log: [`SMOKE_TEST.md`](./SMOKE_TEST.md).

- **Telemetry:** Unhandled errors → owner-scoped `ErrorLog`; feature usage via `track()` → `UsageEvent`. No secrets logged.
- **Feature requests:** `/requests` — title + description; owner sees their own list only.
- **Contact the developer:** `/contact` — page, recent actions, latest error, and optional screenshots. The email is a short summary; a downloaded zip holds the full report. Set `VITE_DEVELOPER_EMAIL` before building.
- **Amplify models:** owner-private `Material`, `Attempt`, `TutorThread`, `Flashcard`, `CourseChunk`, `ErrorLog`, `UsageEvent`, `FeatureRequest`, `StudentProfile`, `StudyCheckIn`; shared-read `ClassMaterial`, `ClassChunk`.
- Keep `VITE_SYNCFUSION_LICENSE` set so Grid/Charts have no license banner.

Routes: `/dashboard`, `/materials`, `/practice`, `/history`, `/tutor`, `/flashcards`, `/progress`, `/review`, `/requests`, `/contact`, `/settings`, `/about`.

**Settings / personalization:** Preferred name, text size, study defaults, self-reported weak topics, and check-ins are owner-private (`StudentProfile` / `StudyCheckIn`). Tutor receives a compact `studentContext` summary per request only — see Settings privacy copy.

**Tutor tools + citations:** Each Tutor turn runs client tools (`search_course_materials`, `get_study_now`, `get_student_focus`, optional `fetch_official_supplement`), then Grok returns `citations` keyed to `[src-N]` sources. Course citations link to `/materials?file=…`; schedule → Dashboard; profile → Settings; supplements may open an external URL. Olson / MedMaster remain gated.

---

## Copyright & approved material use

Study Buddy uses copyrighted material **only in an approved manner**. We do not host pirate copies, scrape paywalled textbooks, or redistribute commercial eBooks. See [`COPYRIGHT.md`](./COPYRIGHT.md) and the in-app **About** page (`/about`).

**Example — *Clinical Pharmacology Made Ridiculously Simple* (Ed. 6, James Olson / MedMaster):**

Immediate digital (no shipment):

- [MedMaster eBook](https://medmaster.net/products/clinical-pharmacology-made-ridiculously-simple) — My Bookshelf / MedMaster app (~$27.95; printing not allowed)
- [VitalSource](https://www.vitalsource.com/products/clinical-pharmacology-made-ridiculously-simple-james-olson-m-d-ph-d-v9781935660712) — fixed-layout eTextbook from ~$29.95

A consumer eBook is for **licensed reading** in the seller’s reader. MedMaster terms forbid building a database from their content without written permission—so do **not** DRM-strip or bulk-ingest Olson into Study Buddy until MedMaster authorizes it. Use academy materials for RAG until then. See [`COPYRIGHT.md`](./COPYRIGHT.md).

**Permissions-gated plan (research + post-approval steps):** [`PHARM_OLSON_PERMISSIONS_PLAN.md`](./PHARM_OLSON_PERMISSIONS_PLAN.md) — status: waiting on MedMaster reply (email sent 2026-11-27).

---

## Local development

```bash
npm install
cp .env.example .env.local   # Syncfusion + optional ingest creds
# amplify_outputs.json comes from sandbox (gitignored)
```

Auth / data / storage / xAI Lambda (personal AWS `570912405222`):

```bash
export AWS_PROFILE=steve-copilot   # or steve when that profile works
export AWS_REGION=us-east-2
npm run sandbox:once               # deploy once, then exit (no watcher)
```

Cost posture: Cognito + on-demand AppSync/DynamoDB/S3/Lambda. Prefer **local** extract/OCR (`npm run ingest:course:ocr`) then `npm run upload:course` — do not run Textract. Use `--once` so nothing watches continuously.

xAI secret (never commit):

```bash
# reads XAI_API_KEY from .env.local without printing it
python3 - <<'PY'
from pathlib import Path
import os, subprocess
key = next(l.split("=",1)[1].strip() for l in Path(".env.local").read_text().splitlines() if l.startswith("XAI_API_KEY="))
subprocess.run(["npx","ampx","sandbox","secret","set","XAI_API_KEY","--profile",os.environ.get("AWS_PROFILE","steve-copilot")], input=key+"\n", text=True, check=True)
print("secret set")
PY
```

```bash
npm run dev
npm run build
```

### Course pack (local → AWS + RAG)

Status checklist: [`RAG_STATUS.md`](./RAG_STATUS.md). Live verification log: [`VERIFY_V1.1.md`](./VERIFY_V1.1.md).

```bash
npm run ingest:course:ocr    # PDF/DOCX/PPTX → course-context/ (Vision OCR on Mac)
# chapter-less files → chapter-00-*.md; rebuild only: node scripts/ingest-course-pack.mjs --rebuild-only
npm run parse:schedule       # Cycle 17 calendar → course-context/schedule/cycle-17.json
AWS_PROFILE=steve npm run embed:course   # Bedrock Titan → embeddings/chunks.jsonl
# set INGEST_EMAIL / INGEST_PASSWORD in .env.local (uploader Cognito user)
npm run upload:course        # Shared class library: ClassMaterial + ClassChunk + schedule JSON
# text-only re-run: npm run upload:course -- --skip-embeddings
# embeddings only:  npm run upload:course -- --embeddings-only
# schedule only:    npm run upload:course -- --schedule-only
# legacy private-only (not shared): npm run upload:course -- --personal
```

Drop new academy PDFs into `Paramedic Book/` (gitignored), OCR-ingest, then embed/upload. The Dashboard **Study now** card reads `schedule/cycle-17.json` and deep-links Practice / Scenario / Review for today’s (or next) session.

**Class library:** By default `upload:course` publishes to `ClassMaterial` / `ClassChunk` under `class-library/{identityId}/…`. Any signed-in classmate can **read** that library for Practice/Tutor/Flashcards. Personal PDF uploads on Materials stay owner-private. Attempts, tutor threads, and flashcard decks remain per-user.

Embeddings use **Amazon Bedrock Titan Embed Text v2** (`amazon.titan-embed-text-v2:0`, 1024-d) for both batch embed and query-time `embedQuery`. Practice/Tutor prefer hybrid semantic+keyword retrieval when class or personal chunks exist; keyword fallback otherwise. Table-gap supplements (e.g. EMS Systems Act 15 components for Chapter 1) live under `scripts/course-supplements/` and are merged at ingest when extracts only cite Table 1-1.

### Clinical scenarios (verified packs)

Practice → **Clinical scenario** generates a live vignette pack (1–5, default 1) for a named chapter (scope like `Chapter 12`). The Lambda **generate → verify → retry** loop requires full evidence-quote matches and per-step `stepGrounded`; unverified scenarios are never shown (fail closed). Multi-vignette packs call the API once per vignette to stay under AppSync’s resolver time limit. Study aid for course-material fidelity — not instructor clinical sign-off.

---

## Environment variables

See [`.env.example`](./.env.example). Never commit real keys.

| Name                                     | Where                   | Notes                                    |
| ---------------------------------------- | ----------------------- | ---------------------------------------- |
| `VITE_SYNCFUSION_LICENSE`                | Client build            | Community license; registered at startup |
| `VITE_DEVELOPER_EMAIL`                   | Client build            | Contact form recipient. Not a secret.    |
| `XAI_API_KEY`                            | Amplify Function secret | Server-only; never `VITE_`               |
| `INGEST_EMAIL` / `INGEST_PASSWORD`       | Local scripts only      | Cognito user for course-pack upload      |
| `EMBEDDING_PROVIDER` / `EMBEDDING_MODEL` | Local embed + Lambda    | Default `bedrock` + Titan v2             |
| `BEDROCK_REGION`                         | Local embed + Lambda    | Default `us-east-2`                      |
| `amplify_outputs.json`                   | Client build            | From `sandbox:once` (gitignored)         |

Self-sign-up is enabled (Cognito email/password). Classmates each get their own materials and attempts via owner authorization.

**Contact the developer** (`/contact`, also linked from an error screen and from Feature requests) builds the report in the browser. No new Lambda or email service. Put `VITE_DEVELOPER_EMAIL` in `.env.local` before `npm run build` or `npm run deploy:web` so the mail button has an address. Students attach the downloaded zip themselves.

---

## Deploy (S3 + CloudFront)

Build on this machine, push static assets (no Amplify Hosting builder required):

```bash
export AWS_PROFILE=steve-copilot
export AWS_REGION=us-east-2
npm run deploy:web
```

Creates (once) a private web bucket + CloudFront OAC distribution, syncs `dist/`, invalidates. URL prints at the end and is saved under `.amplify-hosting/` (gitignored).

**Live:** https://dnj53034ll3wq.cloudfront.net

v1.1 adds AI Tutor (`/tutor`), Flashcards with SM-2 (`/flashcards`), topic weakness on Dashboard, and enhanced lexical material retrieval for practice/tutor. No new env vars beyond existing Syncfusion + server `XAI_API_KEY`.

Optional CI: [`amplify.yml`](./amplify.yml) if you later connect Amplify Hosting to GitHub.

---

## License notes

- **Syncfusion:** Community License — `VITE_SYNCFUSION_LICENSE` at app startup.
- **xAI:** Server-side `XAI_API_KEY` only. Never ship the key in the browser bundle.
- **Course & third-party texts:** [`COPYRIGHT.md`](./COPYRIGHT.md) — legitimate purchase only; no unauthorized PDFs.
- This is a study aid, not a substitute for official course materials or certification exams.
