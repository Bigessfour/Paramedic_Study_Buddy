# Paramedic Study Buddy — Phased Cursor Workflow & Definition of Done

**Repo:** https://github.com/Bigessfour/Paramedic_Study_Buddy  
**Stack:** React (Vite) + TypeScript + shadcn/ui + Tailwind + selective Syncfusion (Community License) + AWS Amplify (Cognito multi-tenant) + S3 + xAI API  
**Goal:** Ship a usable multi-tenant practice-test tool for Mallorie and her classmates. Stop when the Definition of Done is met.

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

## Phase 0 — Setup & Guardrails (Do this first in Cursor)

**Done when:** Repo exists, Cursor has the project open, `.cursor/rules` or project skill is present, and the Definition of Done above is committed.

### Cursor Prompt 0
```
You are working in the Paramedic Study Buddy repo (https://github.com/Bigessfour/Paramedic_Study_Buddy).

Create the initial project structure for a React + Vite + TypeScript + shadcn/ui app.

1. Initialize a Vite React-TS project.
2. Add shadcn/ui (Tailwind).
3. Add a root README.md that includes the Project Definition of Done from the workflow document.
4. Create .cursor/rules/project.md with:
   - Stack decisions
   - Multi-tenant rules (Cognito custom attribute or group for tenant/user isolation)
   - Syncfusion license registration pattern
   - xAI API usage rules (never hardcode keys)
5. Create .env.example with placeholders for server-side XAI_API_KEY (never VITE_), Amplify config, Syncfusion license.
6. Commit with message: "chore: initial scaffold and definition of done"

Do not add features yet. Stop when the above files exist and the project builds.
```

---

## Phase 1 — Auth + App Shell + Multi-tenant Isolation

**Done when:** User can sign up, log in, log out with Cognito. A protected route shows the user’s identity. Tenant/user ID is available in the app context. Basic shadcn layout (sidebar + header) is in place.

### Cursor Prompt 1
```
Implement Cognito authentication with AWS Amplify in the Paramedic Study Buddy app.

Requirements:
- Use Amplify Auth with a Cognito User Pool.
- Support email/password sign-up, confirmation, sign-in, and sign-out.
- Store a tenant or user-scope identifier (prefer custom attribute `custom:tenantId` or use the Cognito sub as the isolation key).
- Create an AuthProvider / useAuth hook that exposes user, isAuthenticated, and signOut.
- Protect routes so unauthenticated users see only the login/signup screens.
- Build a minimal app shell with shadcn/ui: sidebar navigation (Dashboard, Materials, Practice Test, History) and header with user menu.
- Add a simple Dashboard page that greets the logged-in user.

Do not implement materials or test generation yet. Ensure the app builds and auth flow works locally.
```

---

## Phase 2 — Knowledge Base (S3 Upload + Processing)

**Done when:** Authenticated user can upload a PDF or DOCX. File lands in S3 under a user-scoped prefix. Basic text extraction or metadata is stored so it can be used as context later. Upload list is visible.

### Cursor Prompt 2
```
Add course material upload and storage for Paramedic Study Buddy.

Requirements:
- S3 bucket (or Amplify Storage) with user-scoped prefixes (e.g. `private/${userId}/materials/`).
- UI page "Materials" using shadcn components: file dropzone or input, list of uploaded files with name, size, date.
- On upload, store the file and extract plain text (use a simple client-side or Lambda approach; PDF.js or a lightweight parser is fine for v1).
- Persist metadata (filename, s3Key, extractedText or textUri, uploadedAt) in a way that is user-isolated (DynamoDB table or Amplify Data is acceptable).
- Show success/error states.

Keep the extraction simple. The goal is retrievable context for the next phase, not perfect OCR.
```

---

## Phase 3 — Test Generation Engine (xAI)

**Done when:** User can enter an exam scope (e.g. “Chapters 4–6: Airway and Ventilation”) and generate a practice test containing MC and written questions. Questions are grounded in the user’s uploaded materials. Written answers can be submitted and receive an AI grade + feedback.

### Cursor Prompt 3
```
Implement the practice test generation and grading engine using the xAI API.

Requirements:
- New page "Practice Test".
- Form: exam scope / topics (text area), number of questions, mix of types (default: 60% MC, 40% written).
- Retrieve relevant context from the user’s uploaded materials (simple keyword or full-text search over extracted text is fine for v1).
- Call xAI (Grok) with a well-structured prompt that:
  - Instructs the model to stay within the provided course material.
  - Returns structured JSON: questions with type, stem, options (if MC), correct answer or rubric, explanation.
- Render the test: MC with radio buttons, written with text areas.
- On submit, score MC locally and send written answers + original context to xAI for grading + feedback.
- Store the completed attempt (questions, user answers, scores, feedback) under the user.

Handle API errors and loading states. Never log the full API key.
```

---

## Phase 4 — Progress Dashboard & History

**Done when:** Dashboard shows recent attempts and a simple score trend. History page lists past tests with date, scope, and score. Clicking an attempt shows the questions, answers, and feedback. Uses Syncfusion Grid (and optional Chart) for the list/trend.

### Cursor Prompt 4
```
Add progress tracking and history views.

Requirements:
- Dashboard: summary cards (total tests, average score, last test) + a small chart or list of recent scores.
- History page: Syncfusion Grid listing past attempts (date, scope, score, question count).
- Detail view: show full attempt with MC correctness and written feedback.
- All data is user-scoped.
- Register the Syncfusion license key early in the app (from env).

Use the Community License. Prefer Material or Fluent theme for Syncfusion components so they sit cleanly with the shadcn/Tailwind shell.
```

---

## Phase 5 — Deploy & Ship

**Done when:** App is live on CloudFront (via Amplify Hosting or manual S3+CloudFront). Environment variables are set in the hosting environment. README has deploy instructions. A classmate can sign up and see only their own data.

### Cursor Prompt 5
```
Prepare the app for deployment and write the final README.

Requirements:
- Amplify Hosting configuration (or clear S3 + CloudFront + Amplify Auth instructions).
- Document required environment variables and how to set them in Amplify console.
- Confirm Cognito user pool allows self-sign-up.
- Add a simple “About” or footer note that this is a study tool and not a substitute for official course materials.
- Verify the Definition of Done checklist is met.
- Final commit message: "feat: v1 ready for Mallorie and classmates"

Once this is done, stop. Do not add new features.
```

---

## Phase 6 — AI Tutor, Flashcards & Weakness Analytics (v1.1)

**Done when:** The Definition of Done — v1.1 below is green.

### Scope

- **Conversational AI Tutor** grounded in the user’s uploaded materials (chat that explains concepts, clarifies wrong answers, and generates follow-up questions while staying within course context).
- **Flashcard generation + simple spaced repetition** from materials or completed attempts; basic SM-2-style scheduling is sufficient.
- **Weakness analytics by topic** — tag questions/attempts and show performance breakdown on the Dashboard.
- **Improved material retrieval** — upgrade context selection beyond simple keyword matching (enhanced lexical scoring or embeddings).
- Optional lightweight clinical scenario mode only if time remains after the above.

### Out of scope for v1.1

Full CAT simulator, leaderboards, image-based ECG questions, class-wide shared materials, Anki export, and other polish beyond the bullets above.

### Cursor Prompt 6
```
Implement Phase 6 (v1.1) for Paramedic Study Buddy after the Definition of Done — v1.1 is committed.

Order: improved retrieval → AI Tutor → flashcards + SM-2 → weakness analytics on Dashboard.
Extend Amplify Data (owner-scoped) and the existing xAI Lambda. Prefer shadcn UI; Syncfusion charts only where useful.
Never hard-code API keys. Stay within Phase 6 scope.
Final commit: "feat: v1.1 AI tutor, flashcards, and weakness analytics"
```

### Definition of Done — v1.1 (Ship When This Is True)

The v1.1 features are done when all of the following are true:

1. Authenticated user can open an AI Tutor chat that answers questions using only the user’s uploaded materials as context (or clearly labeled sample context when none exist).
2. User can generate flashcards from a material or a completed attempt and review them with a basic spaced-repetition schedule.
3. Dashboard (or a dedicated view) shows performance broken down by topic/chapter with at least a simple list or chart.
4. Practice-test generation uses the improved retrieval path when materials are available.
5. All new data (tutor threads, flashcards, topic tags) is user-isolated.
6. Basic error handling and empty states exist for the new screens.
7. README is updated with any new env vars or setup steps.
8. The app still builds and the existing v1 flows (auth, materials, practice test, history) continue to work.

Do not start feature implementation until this Definition of Done is committed. When it is met, stop.

---

## Usage Notes for Cursor

- Paste one phase prompt at a time.
- After each phase, manually verify the “Done when” criteria before moving on.
- Keep the Definition of Done visible (pin the README section or a rules file).
- If Cursor starts adding extra features, reply: “Stay within the current phase. Do not expand scope.”
- Syncfusion license key and xAI key stay in environment variables only.

v1 (Phases 0–5) is shipped. Work Phase 6 against the v1.1 Definition of Done above; then stop.

---

## Course pack RAG (embeddings)

Status and checklist: [`RAG_STATUS.md`](./RAG_STATUS.md).

### Definition of Done — course pack RAG-ready

The course pack is RAG-ready when all of the following are true:

1. `Paramedic Book/` has been processed by `scripts/ingest-course-pack.mjs` (with `--ocr` where needed) and `course-context/` contains manifests + by-chapter text for chapters 1–53.
2. Text artifacts are uploaded to private S3 under the user’s identity prefix via the existing upload script (or an updated version).
3. An embedding pipeline exists that chunks the course text, generates embeddings (xAI or a lightweight compatible model), and stores them in a queryable form (DynamoDB + S3, or a simple vector-friendly structure).
4. Practice-test generation and any future tutor can retrieve relevant chunks via semantic search (not only keyword matching).
5. Fallback to the existing keyword path remains available if embeddings are missing.
6. README documents the ingest + embed + upload steps and required env vars.
7. Existing v1 flows (auth, materials UI, practice tests, history) still work.

Commit the Definition of Done before heavy embedding work. When it is met, stop (do not expand into unrelated features in the same pass).
