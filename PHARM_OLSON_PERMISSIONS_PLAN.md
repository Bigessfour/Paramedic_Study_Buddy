# Plan — Olson / MedMaster pharmacology embed (permissions-gated)

**Status:** ⏳ **Waiting on MedMaster written reply** — do **not** ingest or embed Olson until permission is granted in writing.
**Owner:** Stephen McKitrick (`bigessfour@gmail.com`)
**Beneficiary:** Mallorie (paramedic student; dyslexia-friendly study helper)
**Course scope:** St. Anthony Paramedic Academy — **Cycle 17** only
**Related docs:** [`COPYRIGHT.md`](./COPYRIGHT.md) · in-app `/about` · [`RAG_STATUS.md`](./RAG_STATUS.md) · [`INGEST_PLAN.md`](./INGEST_PLAN.md)

---

## Why this plan exists

On **2026-11-27** we researched legitimate access to *Clinical Pharmacology Made Ridiculously Simple* (Ed. 6) so pharmacology study could eventually feed a **separate** private RAG corpus in Paramedic Study Buddy. Consumer eBook terms **block** bulk database ingest without prior written permission. A permissions email was sent. This document preserves research + the post-approval build plan so context is not lost while waiting.

---

## Title identity

| Field         | Value                                                                       |
| ------------- | --------------------------------------------------------------------------- |
| Title         | *Clinical Pharmacology Made Ridiculously Simple* — Color Edition            |
| Edition       | 6 (publication noted Jan 1, 2024 on MedMaster)                              |
| Author        | James Olson, M.D., Ph.D.                                                    |
| Publisher     | MedMaster, Inc.                                                             |
| Print ISBN    | 978-1-935660-70-5 (`1935660705`)                                            |
| eISBN         | 978-1-935660-71-2 (`1935660713`)                                            |
| Approx. pages | 183                                                                         |
| Delivery      | MedMaster eBook Library (Kitaboo-powered reader) + VitalSource fixed-layout |

Cover was photographed / referenced in-session; purchase confirmed via MedMaster welcome email to Stephen’s account.

---

## Legitimate purchase / access (no pirate PDFs)

### Immediate digital (preferred — no shipment)

| Priority | Source                             | Notes                                                                                                                                | URL                                                                                                                     |
| -------- | ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------- |
| 1        | **MedMaster eBook**                | ~$27.95; My Bookshelf (web) + MedMaster iOS/Android app; typically **24 months** access; **max 2 devices**; **printing not allowed** | https://medmaster.net/products/clinical-pharmacology-made-ridiculously-simple                                           |
| 2        | **VitalSource**                    | Fixed-layout eTextbook; ~$29.95 (1 year) / ~$30.95 (lifetime SKU seen 2026-11-27)                                                    | https://www.vitalsource.com/products/clinical-pharmacology-made-ridiculously-simple-james-olson-m-d-ph-d-v9781935660712 |
| 3        | Apple Books / Google Play / Kindle | Also listed by MedMaster                                                                                                             | Via MedMaster product page / each store                                                                                 |

### Slower (print — shipment + scan)

| Source                    | Notes                                                               | URL                                                                                 |
| ------------------------- | ------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| Amazon paperback          | Shipment required; do not treat scan-of-print as a license to share | https://www.amazon.com/Clinical-Pharmacology-Made-Ridiculously-Simple/dp/1935660705 |
| MedMaster paperback / B&N | Linked from MedMaster product page                                  | Same MedMaster product URL                                                          |

**Purchase state (Stephen):** MedMaster eBook Library account active (`bigessfour@gmail.com`). Welcome email showed Launch MedMaster + app store links (Kitaboo footer). **Password was briefly exposed in chat — rotate if not already done.**

---

## License research (why we cannot embed yet)

Sources reviewed:

- https://medmaster.net/pages/faq — eBooks **cannot be printed**; support/orders → **info@medmaster.net**; bulk/class discounts exist via same address
- https://medmaster.net/pages/terms-and-conditions — may download content for personal non-commercial informational/scholarly use with notices intact; **may not** systematically retrieve Content to create a collection, compilation, **database**, or directory **without prior written permission**; no robots/scrapers to extract/index Content
- https://medmaster.net/pages/contact-us — general inquiries / faculty & group discounts form
- App Store / Play listings confirm MedMaster reader app (offline after site purchase); users report no export-to-PDF / Kindle transfer

### Interpretation for Study Buddy

| Goal                                                     | Allowed under consumer license?                             |
| -------------------------------------------------------- | ----------------------------------------------------------- |
| Read in MedMaster web/app                                | Yes (licensed reading)                                      |
| Dump full text into RAG / DynamoDB / S3 chunks           | **No** — needs **prior written permission**                 |
| Circumvent DRM / scrape Kitaboo reader                   | **No** — refuse; DMCA + terms                               |
| Put Olson in **shared class library**                    | **No** unless license explicitly multi-user / institutional |
| Use academy Cycle materials for pharm practice meanwhile | Yes (existing authorized corpus)                            |

---

## Permissions email (sent)

| Field      | Value                                                                                                                                  |
| ---------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| Date       | **2026-11-27** (Mountain)                                                                                                              |
| From       | `bigessfour@gmail.com`                                                                                                                 |
| To         | `info@medmaster.net`                                                                                                                   |
| Subject    | Permission request: limited educational use of Clinical Pharmacology Made Ridiculously Simple (eBook) in a private AI study helper     |
| Gmail      | [Sent thread](https://mail.google.com/mail/?authuser=bigessfour@gmail.com#all/thread-f:1883031638274499968\|msg-f:1883031639956992849) |
| Draft tool | Cursor Gmail MCP (`create_draft` → `send_message`); Grok/Ollama unavailable that session                                               |

### Asks in the email (summary)

1. Who: Stephen McKitrick; building **Paramedic Study Buddy** for daughter with **dyslexia**
2. Course: St. Anthony Paramedic Academy **Cycle 17** only
3. Use: private owner-scoped RAG for practice/explanations grounded in purchased Olson eBook
4. Not: sold / charged to students (currently); not public redistribution; not DRM bypass as substitute for permission
5. Willing to accept conditions, attribution, time limits, or modest educational license fee

### When a reply arrives — agent checklist

1. Save reply PDF/EML or quote key grant language into this file under **Decision log**
2. Confirm scope: personal/family only vs classmates; time bound?; attribution?; fee?
3. Only if **explicit yes** for database/RAG use → execute **Post-approval implementation** below
4. If **no** or silence → keep studying via MedMaster reader + academy RAG; do not scrape

---

## Already shipped in-repo (copyright UX)

| Item           | Location                                                                     |
| -------------- | ---------------------------------------------------------------------------- |
| Policy         | [`COPYRIGHT.md`](./COPYRIGHT.md)                                             |
| README section | [`README.md`](./README.md) — Copyright & approved material use               |
| About page     | [`src/pages/AboutPage.tsx`](./src/pages/AboutPage.tsx) — `/about`            |
| Nav + footer   | [`src/components/layout/AppShell.tsx`](./src/components/layout/AppShell.tsx) |
| Route          | [`src/App.tsx`](./src/App.tsx)                                               |

---

## Post-approval implementation (do only after written yes)

**Milestone name:** `pharm-olson-private-rag` (v1.x optional — not blocking current DoD)

### Design constraints

1. **Separate corpus** from Cycle class library — do **not** default-upload Olson into `ClassMaterial` / `ClassChunk`.
2. **Owner-scoped** (Cognito `sub` / identityId): `private/${userId}/pharm-olson/…` (or equivalent).
3. Prefer **personal** Material + CourseChunk (or a dedicated `PharmCorpus` model) over shared class tables unless MedMaster explicitly allows cohort use.
4. Provenance on every chunk: title, author, ISBN, permission email date, “licensed educational use”.
5. About / COPYRIGHT: update status from “waiting” → “authorized under letter dated …”.
6. Still no public PDF download endpoint.

### Suggested technical steps

1. **Acquire text legally under the grant**
   - Follow whatever MedMaster specifies (file they provide, print allowance, API, etc.).
   - If they only allow limited excerpts, ingest only what is permitted.
   - **Never** scrape the Kitaboo reader unless they explicitly authorize an extraction method.

2. **Local ingest** (mirror course pack patterns)
   - Drop authorized text under a gitignored tree, e.g. `Paramedic Book/pharm-olson/` or `pharm-olson-source/`
   - Extend or twin `scripts/ingest-course-pack.mjs` with a `--pharm-olson` (or separate script) writing to `course-context/pharm-olson/`
   - Chapter map: Olson Ch 1–10 (Principles → Endocrine) — align tags to Cycle 17 pharm topics where possible

3. **Embed**
   - Reuse Bedrock Titan pipeline (`embed-course-context.mjs` pattern) → `course-context/pharm-olson/embeddings/`
   - Upload with **`--personal`** (or new flag) so chunks stay private

4. **Retrieval**
   - Practice / Tutor / Flashcards: optional scope `corpus=pharm-olson` or topic filter `pharmacology` that searches personal Olson chunks **in addition to** academy materials
   - System prompts: stay within retrieved licensed material; cite Olson when used

5. **UI**
   - Materials or About: badge “Olson pharmacology (licensed personal)”
   - Clear empty state if permission revoked / license expired (MedMaster often 24 months)

6. **Verification**
   - Smoke: one Practice pack + one Tutor answer that cite Olson chunks only when scoped
   - Confirm class-library classmates **cannot** read Olson S3/AppSync rows
   - Update [`RAG_STATUS.md`](./RAG_STATUS.md) checklist

7. **Optional later**
   - If MedMaster later allows cohort: documented re-upload to class library under institutional terms only

### Explicit non-goals until approval

- [ ] No DRM strip / PDF crack / reader scrape
- [ ] No unauthorized “free PDF” sites
- [ ] No class-library publish of Olson
- [ ] No monetization of MedMaster content

---

## Meanwhile (until reply)

- Study Olson in **MedMaster reader / app**
- Keep Study Buddy RAG on **authorized academy** materials (incl. any program pharm handouts already ingested)
- Do not expand scope into Olson embed work

---

## Decision log

| Date       | Event                                                         | Outcome                                  |
| ---------- | ------------------------------------------------------------- | ---------------------------------------- |
| 2026-11-27 | Research legitimate digital sources; MedMaster terms reviewed | Embed blocked without written permission |
| 2026-11-27 | About + COPYRIGHT + README                                    | Shipped locally (commit when ready)      |
| 2026-11-27 | Permissions email sent to info@medmaster.net                  | Awaiting reply                           |
| _TBD_      | MedMaster response                                            | _Record grant/denial language here_      |
| _TBD_      | Ingest/embed started                                          | _Only if grant allows_                   |

---

## Resume prompt for a future agent

```
Read PHARM_OLSON_PERMISSIONS_PLAN.md and COPYRIGHT.md.

If MedMaster has not granted written RAG/database permission: do not ingest Olson;
only update the Decision log if a new email arrived.

If written permission exists: follow “Post-approval implementation”, keep the corpus
owner-scoped (not class library unless the grant says so), update About/COPYRIGHT/
RAG_STATUS, and verify isolation.
```
