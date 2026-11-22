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

v1 is shipped. Further work is Phase 6 (v1.1) in [`PHASED_WORKFLOW.md`](./PHASED_WORKFLOW.md).

### Definition of Done — v1.1 (condensed)

Ship when: AI Tutor chat uses user materials (or labeled sample context); flashcards generate from material/attempt with basic SM-2 review; Dashboard shows topic/chapter performance; practice tests use improved retrieval; new data is user-isolated; empty/error states exist; README covers any new setup; v1 flows still build and work.

Full checklist and Phase 6 scope: see **Phase 6** and **Definition of Done — v1.1** in [`PHASED_WORKFLOW.md`](./PHASED_WORKFLOW.md).

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
AWS_PROFILE=steve-copilot npm run embed:course   # Bedrock Titan → embeddings/chunks.jsonl
# set INGEST_EMAIL / INGEST_PASSWORD in .env.local (Cognito user)
npm run upload:course        # S3 text + Material rows + CourseChunk embeddings
# text-only re-run: npm run upload:course -- --skip-embeddings
# embeddings only:  npm run upload:course -- --embeddings-only
```

Embeddings use **Amazon Bedrock Titan Embed Text v2** (`amazon.titan-embed-text-v2:0`, 1024-d) for both batch embed and query-time `embedQuery`. Practice/Tutor prefer semantic retrieval when `CourseChunk` rows exist; keyword fallback otherwise.

---

## Environment variables

See [`.env.example`](./.env.example). Never commit real keys.

| Name                               | Where                   | Notes                                    |
| ---------------------------------- | ----------------------- | ---------------------------------------- |
| `VITE_SYNCFUSION_LICENSE`          | Client build            | Community license; registered at startup |
| `XAI_API_KEY`                      | Amplify Function secret | Server-only; never `VITE_`               |
| `INGEST_EMAIL` / `INGEST_PASSWORD` | Local scripts only      | Cognito user for course-pack upload      |
| `EMBEDDING_PROVIDER` / `EMBEDDING_MODEL` | Local embed + Lambda | Default `bedrock` + Titan v2             |
| `BEDROCK_REGION`                   | Local embed + Lambda    | Default `us-east-2`                      |
| `amplify_outputs.json`             | Client build            | From `sandbox:once` (gitignored)         |

Self-sign-up is enabled (Cognito email/password). Classmates each get their own materials and attempts via owner authorization.

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
- This is a study aid, not a substitute for official course materials or certification exams.
