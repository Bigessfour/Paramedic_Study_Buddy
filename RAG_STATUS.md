# Course pack RAG status

Private study use of `Paramedic Book/` → local text → S3 + embeddings → semantic retrieval for practice tests (and shared helpers). Prefer local/cheap work; AWS on-demand only.

**Do not commit** `Paramedic Book/` or `course-context/` (gitignored).

---

## Definition of Done — course pack RAG-ready

The course pack is RAG-ready when all of the following are true:

1. `Paramedic Book/` has been processed by `scripts/ingest-course-pack.mjs` (with `--ocr` where needed) and `course-context/` contains manifests + by-chapter text for chapters 1–53 **and** chapter-less extras as `chapter-00-*.md`.
2. Text artifacts are uploaded to the shared class library (`ClassMaterial` / `class-library/…`) via `npm run upload:course`.
3. An embedding pipeline exists that chunks the course text, generates embeddings (Bedrock Titan), and stores them in `ClassChunk` + S3 backup.
4. Practice-test generation (and shared retrieval helpers) can retrieve relevant chunks via semantic search (not only keyword matching), including chapter-less extras (chapter `"0"`).
5. Fallback to the existing keyword path remains available if embeddings are missing.
6. README documents the ingest + embed + upload steps and required env vars.
7. Existing v1 flows (auth, materials UI, practice tests, history) still work.

---

## Checklist

- [x] Local ingest QC green (manifest + chapters 1–53 + 55 extras) — 351 ok, 0 needsOcr
- [x] Embeddings written under `course-context/embeddings/` (gitignored) — **5726** chunks (3262 chapter + 2464 extras)
- [x] Upload pushes text + `ClassChunk` rows for the class library
- [x] Practice uses semantic retrieval when chunks exist; keyword fallback otherwise (`src/lib/ragContext.ts`); chapter `"0"` extras always eligible
- [x] README + `.env.example` document commands and embedding env

**Embedding provider:** Bedrock Titan Embed Text v2 (`amazon.titan-embed-text-v2:0`, us-east-2).

### Coverage notes

- PDF / DOCX / PPTX with a chapter number → `chapter-01.md` … `chapter-53.md`
- Same formats **without** a chapter number → `chapter-00-*.md` (one file per source), embedded as chapter `"0"` / “Course extras”
- Not ingested: `Course inventory.tsv` (unsupported)

### Tutor quality (course-first)

- DOCX ingest prefers HTML→markdown tables; PDF OCR also targets “refer to Table …” pages.
- When Chapter 1 extract only points at Table 1-1 without the list, ingest prepends [`scripts/course-supplements/ems-systems-act-1973-15-components.md`](./scripts/course-supplements/ems-systems-act-1973-15-components.md).
- Retrieval is hybrid (semantic + keyword + chapter windows); tutor Lambda may attach a gated allowlisted/curated supplement if context is still thin.

---

## Commands (local)

```bash
npm run ingest:course:ocr
# or rebuild bundles only (after prior extract):
node scripts/ingest-course-pack.mjs --rebuild-only

AWS_PROFILE=steve npm run embed:course
# INGEST_EMAIL / INGEST_PASSWORD in .env.local
npm run upload:course
```

See [`README.md`](./README.md) and [`INGEST_PLAN.md`](./INGEST_PLAN.md).
