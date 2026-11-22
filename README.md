# Paramedic Study Buddy

Multi-tenant practice-test app for paramedic coursework. Students upload course materials, generate scoped practice tests (multiple choice + written answers graded by AI), and track progress.

**Repo:** https://github.com/Bigessfour/Paramedic_Study_Buddy

**Stack:** React (Vite) + TypeScript + shadcn/ui + Tailwind + selective Syncfusion (Community License) + AWS Amplify (Cognito) + S3 + xAI API

Phased build plan: see [`PHASED_WORKFLOW.md`](./PHASED_WORKFLOW.md).

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

Anything beyond this is v1.1+. Do not keep polishing once the above is green.

---

## Local development

```bash
npm install
cp .env.example .env.local   # Syncfusion / local secrets only
cp amplify_outputs.stub.json amplify_outputs.json   # until sandbox generates real outputs
```

Auth backend (personal AWS account `570912405222`):

```bash
export AWS_PROFILE=steve          # personal bigessfour; fallback: steve-copilot
export AWS_REGION=us-east-2
npm run sandbox:once              # deploy once, then exit (no watcher)
```

Cost posture: Cognito + on-demand AppSync/DynamoDB + S3 only. Use `--once` so nothing watches continuously. When idle for a while: `npx ampx sandbox delete --profile steve`.

Then:

```bash
npm run dev
```

Build check:

```bash
npm run build
npm run lint
```

## Environment variables

See [`.env.example`](./.env.example). Never commit real keys.

- **Client (`VITE_*`):** Cognito/Amplify public config, Syncfusion license.
- **Server only:** `XAI_API_KEY` — must not use a `VITE_` prefix; keep it on an Amplify Function / backend.

## Deploy

Amplify Hosting / S3 + CloudFront steps will be documented in Phase 5.

## License notes

- **Syncfusion:** Community License — register the key from `VITE_SYNCFUSION_LICENSE` at app startup (Phase 4).
- **xAI:** Server-side `XAI_API_KEY` only. Never ship the key in the browser bundle.
- This is a study aid, not a substitute for official course materials or certification exams.
