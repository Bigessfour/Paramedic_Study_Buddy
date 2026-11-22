# Course Pack Ingest Plan — Max Content, High Quality

**Source:** `Paramedic Book/` (~352 files, ~749 MB, chapters 1–53)
**Goal:** Transcode **all** usable text into private study context for practice tests. Prefer **slow / high quality** over fast / lossy.
**Constraint:** Keep AWS cheap (on-demand only). Do bulk work **locally**; cloud only stores results.

---

## Inventory (ordered for ingest)

| Order | Tier | Pattern                                | ~Count | Why this order                                 |
| ----: | ---- | -------------------------------------- | -----: | ---------------------------------------------- |
|     1 | A    | Lecture Outlines (`.docx`)             |     53 | Densest narrative text; best RAG signal        |
|     2 | B    | Learning Objectives (`.pdf`)           |     53 | Exam-scope anchors; clean digital text         |
|     3 | C    | Assessment in Action (`.pdf`)          |     52 | Scenario/Q style aligned with practice tests   |
|     4 | D    | Case Studies (`.pptx`)                 |     53 | Clinical vignettes; extract slide + notes text |
|     5 | E    | Skill drills / eval sheets             |    ~32 | Procedure checklists                           |
|     6 | F    | Other PDFs (EKG, pharma, policy, etc.) |    ~56 | Supplemental; mixed density                    |
|     7 | G    | Slides (`.pptx`)                       |     53 | Largest / sparsest; last on purpose            |
|     — | skip | `.DS_Store`, tiny `.tsv`               |      — | Noise                                          |

**Do not commit** `Paramedic Book/` or raw extracted dumps to Git (copyright + size). Gitignore both.

---

## Quality bar (slow path)

For **every** file:

1. **Native extract** (DOCX/PDF text layer / PPTX `a:t` + speaker notes).
2. **Quality gate** per file (and per PDF/PPTX page where useful):
   - If `chars / page` (or slide) is below a threshold → treat as image-heavy.
   - Threshold starting point: **&lt; ~400 chars/page** for PDFs; **&lt; ~80 chars/slide** for PPTX after native extract.
3. **OCR fallback** (local only) for gated pages/slides:
   - Render page/slide → image → OCR (macOS Vision and/or Tesseract).
   - Keep native text when good; OCR only the weak pages.
4. **Normalize** whitespace, drop repeated JBL copyright banners where safe, keep clinical content.
5. **Write artifacts** with provenance (source filename, chapter, tier, extract method, char counts).
6. **Idempotent:** skip unchanged files via content hash manifest.

EKG/slide-heavy PDFs in the sample sat ~250–320 chars/page — they **will** hit OCR under this plan.

---

## Output layout (local first)

```
course-context/                         # gitignored
  manifest.jsonl                        # one line per source file
  by-file/
    019-lecture-outlines-chapter-1.txt
    ...
  by-chapter/
    chapter-01.md                       # concatenated Tier A→G for that chapter
    ...
  by-tier/
    A-lecture-outlines/
    ...
```

Each text artifact header:

```text
---
source: 019 - Lecture Outlines - Chapter 1.docx
chapter: 1
tier: A
method: mammoth|pdfjs|pptx-xml|ocr-vision|ocr-tesseract
chars: 53224
---
```

**Cloud load (after local QC):**

- Upload **text artifacts** (not 749 MB binaries) to `private/materials/{identityId}/course-pack/...`
- Create one `Material` row per file **or** per chapter bundle (prefer **per-file** for filtering + **chapter rollup** file for broad scopes).
- Store **full text in S3**; keep DynamoDB `extractedText` as a truncated window (existing 80k cap) plus `s3Key` for full body.
- Raise ingest path above the UI 15 MB binary limit (script uses Amplify APIs / signed uploads of `.txt` only).

---

## Tooling (local batch)

New script: `scripts/ingest-course-pack.mjs` (or `.ts` via `tsx`)

| Step                    | Tool                                                                                      |
| ----------------------- | ----------------------------------------------------------------------------------------- |
| DOCX                    | `mammoth` (already in app)                                                                |
| PDF text                | `pdfjs-dist` (already in app)                                                             |
| PPTX text + notes       | `jszip` + XML (`a:t`, notes slides)                                                       |
| PDF/PPTX render for OCR | `pdfjs` canvas / LibreOffice or `pptx2json`+render; prefer macOS-friendly path            |
| OCR                     | **Primary:** macOS Vision (`swift`/`osascript`/CLI wrapper) or `tesseract` if installed   |
| Manifest                | JSONL + sha256 of source file                                                             |
| Upload                  | Separate `scripts/upload-course-context.mjs` using Amplify outputs + Cognito user session |

No always-on AWS OCR (Textract) unless local OCR fails quality checks — keeps cost low; Textract remains an optional Phase 2.1.

---

## Execution waves

### Wave 0 — Guardrails
- Gitignore `Paramedic Book/`, `course-context/`
- Document copyright: private study use only; not for redistribution
- Dry-run inventory → `course-context/manifest-preview.json`

### Wave 1 — Tier A–C (native only, then OCR gaps)
- Process Lecture Outlines → Learning Objectives → Assessment
- Build `by-chapter` stubs early so Practice Test can use real content ASAP
- QC report: files needing OCR

### Wave 2 — Tier D–F
- Case studies, skills, other PDFs
- Full OCR where density gate fails (EKG decks likely)

### Wave 3 — Tier G slides (slowest)
- Native PPTX text + notes first
- OCR image-dominant slides chapter-by-chapter (1→53) overnight-friendly
- Parallelism capped (e.g. 2 workers) to avoid melting the machine

### Wave 4 — Load into app
- Authenticate as Mallorie’s (or admin) Cognito user
- Upload text materials; verify Materials list + Practice Test scope “Chapter 1” uses real bundles
- Spot-check 3 chapters (early / mid / late)

---

## Success criteria

- [x] 100% of Tier A–G files appear in `manifest.jsonl` with status `ok` or `ok-partial` + reason
- [x] Every chapter 1–53 has a `by-chapter/chapter-XX.md` with non-empty Tier A or B content
- [x] OCR applied to low-density PDF/PPTX pages (not blanket OCR on good digital PDFs)
- [x] App Materials shows ingested items; Practice Test no longer falls back to sample notes when chapter scope matches
- [x] Raw pack never committed; secrets never printed

Verified locally: 351/351 ok, 0 needsOcr, 53 chapter bundles (see `course-context/qc-report.json`).

---

## Effort / runtime (order of magnitude)

| Wave                | Expectation                            |
| ------------------- | -------------------------------------- |
| A–C native          | Minutes                                |
| D–F + selective OCR | Tens of minutes–few hours              |
| G slides + OCR      | Longest (hours); fine to run overnight |
| Upload              | Minutes (text only)                    |

---

## Out of scope for this ingest

- Publishing materials publicly
- Replacing UI upload (keep for ad-hoc files)
- Perfect layout/tables reconstruction (plain text is enough for xAI grounding)
- Committing JBL/AAOS binaries to GitHub
