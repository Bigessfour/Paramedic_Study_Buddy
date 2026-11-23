# v1.1 + RAG verification

**Date:** 2026-11-22
**Commit base:** `8ab0eb4` + follow-up polish (context load race / retrieval badges)
**Live:** https://dnj53034ll3wq.cloudfront.net
**Account:** course-pack Cognito owner (Mallorie)

## Build / deploy

| Step                                           | Result                                 |
| ---------------------------------------------- | -------------------------------------- |
| `npm ci && npm run lint && npm run build`      | Pass (lint warnings only; build clean) |
| `AWS_PROFILE=steve-copilot npm run deploy:web` | Pass → CloudFront invalidated          |
| Account `570912405222`                         | Confirmed                              |

## Checklist

| Item                                                 | Result | Notes                                                                                                                                                                                                                                                                                 |
| ---------------------------------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Sign in as course-pack owner                         | Pass   | Dashboard welcome + nav                                                                                                                                                                                                                                                               |
| Practice Test semantic retrieval (or clear fallback) | Pass*  | API smoke: **3127** `CourseChunk`s, Bedrock `embedQuery` 1024-d, top cosine &gt; 0.45. UI: generate gated until materials/chunks load; shows RAG chunk count; badge **Semantic retrieval** when used. *Early verify hit sample notes due to Promise.all race — fixed and redeployed.* |
| AI Tutor uses course context                         | Pass   | Replied citing chapter materials (Table 1-1 / EMS components), not labeled sample notes. Empty thread state present.                                                                                                                                                                  |
| Flashcards generate + SM-2 review                    | Pass   | Empty state → generate from material; review due cards control present                                                                                                                                                                                                                |
| Dashboard topic/chapter weakness                     | Pass   | Empty state until attempts; chart/list wired (`Weakness by topic`)                                                                                                                                                                                                                    |
| v1 flows (materials, history, attempt detail)        | Pass   | Materials list chapters 1–53 (duplicate rows from re-upload); History empty state + CTA                                                                                                                                                                                               |
| Empty states / errors on new screens                 | Pass   | Tutor “No threads”, Flashcards “No flashcards yet”, History empty, Practice loading/sample alerts                                                                                                                                                                                     |
| Nav links `/tutor` `/flashcards`                     | Pass   | Shell + Dashboard shortcuts                                                                                                                                                                                                                                                           |

## RAG API smoke (same owner)

```
courseChunks: 3127
embedProvider: bedrock
embedDims: 1024
semanticOk: true
```

## Known polish / follow-ups (not blocking)

- Materials list shows **duplicate** chapter rows (text uploaded twice); safe to dedupe later.
- Loading all CourseChunk embeddings in the browser is slow (~1–2 min); generate/send stay disabled until ready.
- Dashboard weakness fills after scored practice attempts exist.

## Verdict

**v1.1 Definition of Done + course-pack RAG path: green on live.**
