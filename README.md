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
cp .env.example .env.local   # fill in values as phases add integrations
npm run dev
```

Build check:

```bash
npm run build
```

## Environment variables

See [`.env.example`](./.env.example). Never commit real keys. Syncfusion and xAI credentials belong in env only.

## Deploy

Amplify Hosting / S3 + CloudFront steps will be documented in Phase 5.

## License notes

- **Syncfusion:** Community License — register the key from `VITE_SYNCFUSION_LICENSE` at app startup (Phase 4).
- **xAI:** API key via `VITE_XAI_API_KEY` (or a server-side proxy in later hardening). Never hardcode.
- This is a study aid, not a substitute for official course materials or certification exams.
