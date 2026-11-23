# Course pack RAG status

Private study use of `Paramedic Book/` → local text → S3 + embeddings → semantic retrieval for practice tests (and shared helpers). Prefer local/cheap work; AWS on-demand only.

**Do not commit** `Paramedic Book/` or `course-context/` (gitignored).

---

## Definition of Done — course pack RAG-ready

The course pack is RAG-ready when all of the following are true:

1. `Paramedic Book/` has been processed by `scripts/ingest-course-pack.mjs` (with `--ocr` where needed) and `course-context/` contains manifests + by-chapter text for chapters 1–53.
2. Text artifacts are uploaded to private S3 under the user’s identity prefix via the existing upload script (or an updated version).
3. An embedding pipeline exists that chunks the course text, generates embeddings (xAI or Bedrock Titan), and stores them in a queryable form (Amplify Data `CourseChunk` + S3 backup).
4. Practice-test generation (and shared retrieval helpers) can retrieve relevant chunks via semantic search (not only keyword matching).
5. Fallback to the existing keyword path remains available if embeddings are missing.
6. README documents the ingest + embed + upload steps and required env vars.
7. Existing v1 flows (auth, materials UI, practice tests, history) still work.

---

## Checklist

- [x] Local ingest QC green (manifest + chapters 1–53) — 351 ok, 0 needsOcr, 53 chapters
- [x] Embeddings written under `course-context/embeddings/` (gitignored) — 3127 chunks
- [x] Upload pushes text + `CourseChunk` rows for the Cognito owner
- [x] Practice uses semantic retrieval when chunks exist; keyword fallback otherwise (`src/lib/ragContext.ts`)
- [x] README + `.env.example` document commands and embedding env

**Embedding provider:** Bedrock Titan Embed Text v2 (`amazon.titan-embed-text-v2:0`, us-east-2). xAI `/v1/embeddings` returned 404.

### Tutor quality (course-first)

- DOCX ingest prefers HTML→markdown tables; PDF OCR also targets “refer to Table …” pages.
- When Chapter 1 extract only points at Table 1-1 without the list, ingest prepends [`scripts/course-supplements/ems-systems-act-1973-15-components.md`](./scripts/course-supplements/ems-systems-act-1973-15-components.md).
- Retrieval is hybrid (semantic + keyword + chapter windows); tutor Lambda may attach a gated allowlisted/curated supplement if context is still thin.

---

## Commands (local)

```bash
npm run ingest:course:ocr
npm run embed:course
# INGEST_EMAIL / INGEST_PASSWORD in .env.local
npm run upload:course
```

See [`README.md`](./README.md) and [`INGEST_PLAN.md`](./INGEST_PLAN.md).
