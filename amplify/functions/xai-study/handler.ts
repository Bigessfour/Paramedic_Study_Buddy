type AppSyncEvent = {
  fieldName?: string
  info?: { fieldName?: string }
  arguments?: Record<string, unknown>
}

type GeneratedQuestion = {
  id: string
  type: 'multiple_choice' | 'written' | 'true_false'
  stem: string
  options?: string[]
  correctAnswer?: string
  rubric?: string
  explanation?: string
}

function fieldName(event: AppSyncEvent): string {
  return event.info?.fieldName ?? event.fieldName ?? ''
}

function requireString(value: unknown, name: string): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`${name} is required`)
  }
  return value.trim()
}

function optionalCourseFormat(value: unknown): boolean {
  return value === true || value === 1 || value === 'true' || value === '1'
}

function redactKey(message: string): string {
  return message.replace(/xai-[A-Za-z0-9_-]+/g, 'xai-[REDACTED]')
}

async function callXai(
  system: string,
  user: string,
  temperature = 0.3,
): Promise<string> {
  const apiKey = process.env.XAI_API_KEY
  if (!apiKey) {
    throw new Error('XAI_API_KEY is not configured on the server')
  }
  const model = process.env.XAI_MODEL || 'grok-3-mini'

  const response = await fetch('https://api.x.ai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      temperature,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
    }),
  })

  if (!response.ok) {
    const body = redactKey(await response.text())
    throw new Error(`xAI request failed (${response.status}): ${body.slice(0, 400)}`)
  }

  const payload = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>
  }
  const content = payload.choices?.[0]?.message?.content
  if (!content) {
    throw new Error('xAI returned an empty response')
  }
  return content
}

function parseJsonObject(text: string): Record<string, unknown> {
  try {
    return JSON.parse(text) as Record<string, unknown>
  } catch {
    const start = text.indexOf('{')
    const end = text.lastIndexOf('}')
    if (start >= 0 && end > start) {
      return JSON.parse(text.slice(start, end + 1)) as Record<string, unknown>
    }
    throw new Error('Model did not return valid JSON')
  }
}


function canonicalizeAnswer(raw: string, options: string[]): string {
  if (!raw || options.length === 0) return raw
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
  const rawNorm = norm(raw)

  // Exact or normalized match
  for (const opt of options) {
    if (opt.toLowerCase() === raw.toLowerCase() || norm(opt) === rawNorm) return opt
  }

  // Letter index: A/B/C/D or "A." / "option a" etc.
  const letter = raw.match(/^[a-d]$/i)?.[0]?.toUpperCase()
    ?? raw.match(/\b([a-d])\b/i)?.[1]?.toUpperCase()
  if (letter) {
    const idx = letter.charCodeAt(0) - 65
    if (idx >= 0 && idx < options.length) return options[idx]
  }

  // Starts-with or contains fallback (prefer longest matching option)
  const candidates = options.filter(opt => rawNorm.includes(norm(opt)) || norm(opt).includes(rawNorm))
  if (candidates.length === 1) return candidates[0]
  if (candidates.length > 1) {
    return candidates.sort((a, b) => norm(b).length - norm(a).length)[0]
  }

  return raw // leave as-is; frontend will also try
}

function normalizeQuestions(
  raw: unknown,
  expectedCount: number,
): GeneratedQuestion[] {
  if (!Array.isArray(raw)) {
    throw new Error('Model JSON missing questions array')
  }

  const questions: GeneratedQuestion[] = []
  for (let i = 0; i < raw.length; i += 1) {
    const item = raw[i] as Record<string, unknown>
    const typeRaw = String(item.type ?? '')
    let type: GeneratedQuestion['type']
    if (typeRaw === 'multiple_choice' || typeRaw === 'mc') {
      type = 'multiple_choice'
    } else if (typeRaw === 'true_false' || typeRaw === 'true/false') {
      type = 'true_false'
    } else if (typeRaw === 'written' || typeRaw === 'short_answer') {
      type = 'written'
    } else {
      continue
    }

    const stem = String(item.stem ?? item.question ?? '').trim()
    if (!stem) continue

    const question: GeneratedQuestion = {
      id: String(item.id ?? `q${i + 1}`),
      type,
      stem,
      explanation:
        typeof item.explanation === 'string' ? item.explanation : undefined,
    }

    if (type === 'multiple_choice') {
      const options = Array.isArray(item.options)
        ? item.options.map((o) => String(o).trim()).filter(Boolean)
        : []
      if (options.length < 2) continue
      question.options = options
      const rawAnswer = String(item.correctAnswer ?? item.answer ?? '').trim()
      question.correctAnswer = canonicalizeAnswer(rawAnswer, options)
    } else if (type === 'true_false') {
      question.options = ['True', 'False']
      const answer = String(item.correctAnswer ?? item.answer ?? '').toLowerCase()
      question.correctAnswer = answer.startsWith('t') ? 'True' : 'False'
    } else {
      question.rubric = String(item.rubric ?? item.correctAnswer ?? '')
    }

    questions.push(question)
    if (questions.length >= expectedCount) break
  }

  if (questions.length === 0) {
    throw new Error('No usable questions returned by the model')
  }
  return questions
}

async function generatePracticeTest(args: Record<string, unknown>) {
  const scope = requireString(args.scope, 'scope')
  const context = requireString(args.context, 'context')
  const courseFormat = optionalCourseFormat(args.courseFormat)
  const rawCount = Number(args.questionCount ?? 5)
  const rawMc = Number(args.mcPercent ?? 60)
  const questionCount = Math.min(
    Math.max(Number.isFinite(rawCount) ? Math.round(rawCount) : 5, 3),
    15,
  )
  const mcPercent = Math.min(
    Math.max(Number.isFinite(rawMc) ? Math.round(rawMc) : 60, 0),
    100,
  )

  let system: string
  let user: string

  if (courseFormat) {
    const recallCount = Math.floor(questionCount / 2)
    const scenarioCount = questionCount - recallCount

    system = `You are a paramedic education exam writer mimicking the Navigate2 course exam style. Use ONLY the provided course material context. Do not invent protocols or facts outside the context. Every item is multiple choice, "Select one", exactly four options, exactly one best answer. No true/false, no short-answer, no multi-step scenarios. Return JSON only.`

    user = `Exam scope: ${scope}

Create exactly ${questionCount} multiple-choice questions grounded ONLY in this material context:
---
${context.slice(0, 24000)}
---

Course exam rules (follow strictly):
- Every question has "type": "multiple_choice" only.
- Exactly 4 answer options per question (short clauses; distractors must be plausible, clinically reasonable wrong choices—not joke answers or obviously incorrect options).
- "correctAnswer" must match one option string exactly (verbatim).
- Include a concise one-line "explanation" teaching why the correct answer is right.

Question shapes (blend roughly ${recallCount} recall + ${scenarioCount} clinical vignette):
1) RECALL / SENTENCE-COMPLETION (~half): stem is a fragment ending with a colon; options complete the sentence (e.g. "Cor pulmonale is defined as:", "The main stem bronchus ends at the level of the:"). Options are short finishing clauses (often start lowercase).
2) CLINICAL SCENARIO VIGNETTE (~half): brief patient (age/history), presenting complaint, vital signs, then a CHANGE ON REASSESSMENT (e.g. SpO2 drops, respirations slow). End the stem with "You should:" and offer four plausible next interventions where exactly one is best.

Return JSON:
{
  "questions": [
    {
      "id": "q1",
      "type": "multiple_choice",
      "stem": "question text",
      "options": ["option A text", "option B text", "option C text", "option D text"],
      "correctAnswer": "exact text of the correct option",
      "explanation": "one concise teaching line"
    }
  ]
}`
  } else {
    const mcCount = Math.round((questionCount * mcPercent) / 100)
    const tfCount = Math.max(1, Math.round(questionCount * 0.15))
    const writtenCount = Math.max(1, questionCount - mcCount - tfCount)

    system = `You are a paramedic education exam writer. Use ONLY the provided course material context. Do not invent protocols outside the context. Return JSON only.`

    user = `Exam scope: ${scope}

Create ${questionCount} practice questions grounded ONLY in this material context:
---
${context.slice(0, 24000)}
---

Target mix (approximate): ${mcCount} multiple_choice, ${writtenCount} written, ${tfCount} true_false.

Return JSON:
{
  "questions": [
    {
      "id": "q1",
      "type": "multiple_choice" | "written" | "true_false",
      "stem": "question text",
      "options": ["A","B","C","D"],
      "correctAnswer": "for MC/TF",
      "rubric": "for written grading criteria",
      "explanation": "brief teaching point"
    }
  ]
}`
  }

  const content = await callXai(system, user)
  const parsed = parseJsonObject(content)
  const questions = normalizeQuestions(parsed.questions, questionCount)
  return { questions, modelNotes: typeof parsed.notes === 'string' ? parsed.notes : null }
}

async function gradeWrittenAnswers(args: Record<string, unknown>) {
  const context = requireString(args.context, 'context')
  const itemsJson = requireString(args.itemsJson, 'itemsJson')
  let items: unknown
  try {
    items = JSON.parse(itemsJson)
  } catch {
    throw new Error('itemsJson must be valid JSON')
  }

  const system = `You are a paramedic instructor grading short written answers. Grade ONLY against the provided course material and rubric. Return JSON only.`
  const user = `Course material context:
---
${context.slice(0, 20000)}
---

Grade each item (0-100 score + brief feedback). Items JSON:
${JSON.stringify(items).slice(0, 12000)}

Return JSON:
{
  "grades": [
    { "id": "q1", "score": 80, "feedback": "..." }
  ]
}`

  const content = await callXai(system, user)
  const parsed = parseJsonObject(content)
  return { grades: normalizeGrades(parsed.grades) }
}

function normalizeGrades(raw: unknown): Array<{
  id: string
  score: number
  feedback: string
}> {
  if (!Array.isArray(raw)) return []
  const byId = new Map<string, { id: string; score: number; feedback: string }>()
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue
    const row = item as Record<string, unknown>
    const id = String(row.id ?? '').trim()
    if (!id) continue
    const scoreNum = Number(row.score)
    const score = Number.isFinite(scoreNum)
      ? Math.min(100, Math.max(0, Math.round(scoreNum)))
      : 0
    const feedback = String(row.feedback ?? row.comment ?? '').trim()
    byId.set(id, { id, score, feedback })
  }
  return [...byId.values()]
}

const TABLE_POINTER_RE = /refer to table\s*[\d.-]+/i
const LIST_PRESENT_RE =
  /manpower[\s\S]{0,200}training[\s\S]{0,200}communications/i

/** Curated EMS Systems Act (1973) 15 components — course-aligned when Table 1-1 is missing from extracts. */
const EMS_15_COMPONENTS_SUPPLEMENT = `EMS Systems Act of 1973 — 15 required components (standard AAOS/Nancy Caroline Chapter 1 Table 1-1 enumeration):
1. Manpower
2. Training
3. Communications
4. Transportation
5. Facilities
6. Critical care units
7. Public safety agencies
8. Consumer participation
9. Access to care
10. Patient transfer
11. Standardized record-keeping
12. Public information and education
13. System review and evaluation
14. Disaster planning
15. Mutual aid`

const WEB_ALLOWLIST: Array<{ match: RegExp; urls: string[] }> = [
  {
    match: /ems system|15 required|table\s*1-1|nhtsa|white paper/i,
    urls: [
      'https://en.wikipedia.org/wiki/Emergency_Medical_Services_Systems_Act_of_1973',
    ],
  },
]

function contextLooksThin(context: string): boolean {
  if (LIST_PRESENT_RE.test(context)) return false
  if (TABLE_POINTER_RE.test(context)) return true
  if (/15 required components/i.test(context) && !/manpower/i.test(context)) {
    return true
  }
  return context.replace(/\s+/g, ' ').trim().length < 400
}

async function fetchAllowlistedSupplement(
  message: string,
  context: string,
): Promise<{ text: string; source: string } | null> {
  const hay = `${message}\n${context}`
  const entry = WEB_ALLOWLIST.find((e) => e.match.test(hay))
  if (!entry) {
    if (/ems system|15 required|table\s*1-1/i.test(hay)) {
      return {
        text: EMS_15_COMPONENTS_SUPPLEMENT,
        source: 'curated-course-aligned:EMS-Systems-Act-1973',
      }
    }
    return null
  }

  for (const url of entry.urls) {
    try {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), 4000)
      const res = await fetch(url, {
        signal: controller.signal,
        headers: { 'User-Agent': 'ParamedicStudyBuddy/1.0 (study aid)' },
      })
      clearTimeout(timer)
      if (!res.ok) continue
      const html = await res.text()
      const text = html
        .replace(/<script[\s\S]*?<\/script>/gi, ' ')
        .replace(/<style[\s\S]*?<\/style>/gi, ' ')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 6000)
      if (text.length < 200) continue
      // Prefer curated list if the page does not clearly enumerate components.
      if (!/manpower/i.test(text)) {
        return {
          text: EMS_15_COMPONENTS_SUPPLEMENT,
          source: `curated-after-fetch:${url}`,
        }
      }
      return { text, source: url }
    } catch {
      // try next url / fall through
    }
  }

  return {
    text: EMS_15_COMPONENTS_SUPPLEMENT,
    source: 'curated-course-aligned:EMS-Systems-Act-1973',
  }
}

async function tutorChat(args: Record<string, unknown>) {
  const message = requireString(args.message, 'message')
  const context = requireString(args.context, 'context')
  let history: Array<{ role: string; content: string }> = []
  if (typeof args.historyJson === 'string' && args.historyJson.trim()) {
    try {
      const parsed = JSON.parse(args.historyJson) as unknown
      if (Array.isArray(parsed)) {
        history = parsed
          .filter((m) => m && typeof m === 'object')
          .map((m) => {
            const row = m as Record<string, unknown>
            return {
              role: String(row.role ?? 'user'),
              content: String(row.content ?? ''),
            }
          })
          .filter((m) => m.content.trim())
          .slice(-12)
      }
    } catch {
      throw new Error('historyJson must be valid JSON')
    }
  }

  let enrichedContext = context
  let usedWebSupplement = false
  let webSource: string | null = null
  if (contextLooksThin(context)) {
    const supplement = await fetchAllowlistedSupplement(message, context)
    if (supplement) {
      usedWebSupplement = true
      webSource = supplement.source
      enrichedContext = `${context}

---
SUPPLEMENT (use only to fill gaps the course extract points at, e.g. Table 1-1; stay consistent with course wording; label this as a supplement in your reply):
Source: ${supplement.source}
${supplement.text}`
    }
  }

  const studentContext =
    typeof args.studentContext === 'string' ? args.studentContext.trim() : ''
  const studentBlock = studentContext
    ? `Student personalization (owner-private; use for tone and focus only — do not invent course facts from this block; never ask for or repeat email/passwords):
---
${studentContext.slice(0, 2000)}
---
`
    : ''

  let sourcesCatalog: Array<{ id: string; label?: string; kind?: string }> = []
  if (typeof args.sourcesJson === 'string' && args.sourcesJson.trim()) {
    try {
      const parsedSources = JSON.parse(args.sourcesJson) as unknown
      if (Array.isArray(parsedSources)) {
        sourcesCatalog = parsedSources
          .filter((s) => s && typeof s === 'object')
          .map((s) => {
            const row = s as Record<string, unknown>
            return {
              id: String(row.id ?? '').trim(),
              label: row.label != null ? String(row.label) : undefined,
              kind: row.kind != null ? String(row.kind) : undefined,
            }
          })
          .filter((s) => s.id)
          .slice(0, 40)
      }
    } catch {
      // ignore bad catalog; still answer from context
    }
  }

  const catalogHint =
    sourcesCatalog.length > 0
      ? `Available source ids (cite with these ids only):\n${JSON.stringify(sourcesCatalog).slice(0, 4000)}\n`
      : ''

  const system = `You are a paramedic study tutor for a multi-tenant study app.
Rules:
- Prefer facts from the course material context. When listing items (e.g. EMS system components), quote or enumerate them from context when present.
- Context blocks are tagged like [src-1]. When you use a fact, cite that source id in the citations array.
- If a SUPPLEMENT / fetch_official_supplement tool result is present, you MAY use it for table/list gaps and MUST cite it; say it is a course-aligned supplement.
- Do NOT use or invent MedMaster / Olson textbook content. Commercial texts stay out of scope unless separately licensed.
- If neither course context nor supplement has the answer, say you cannot find it in the uploaded materials and suggest which chapter/table to review.
- When student personalization is provided: address them by preferred name if greet-by-name is on; bias practice suggestions toward their self-reported weak topics; if ask-about-tests is on and a recent check-in mentions an external exam, you may briefly ask how it went — once, not every message.
- Be concise and clinically accurate. Return JSON only.`

  const user = `${studentBlock}${catalogHint}Tool results + course material context:
---
${enrichedContext.slice(0, 24000)}
---

Recent chat (oldest first):
${JSON.stringify(history).slice(0, 8000)}

Student message: ${message}

Return JSON:
{
  "reply": "tutor response (you may mention source labels in prose)",
  "followUps": ["optional follow-up question 1", "optional follow-up question 2"],
  "citedTopics": ["topic labels from context if any"],
  "citations": [{"sourceId": "src-1", "note": "optional short note"}],
  "usedSupplement": ${usedWebSupplement ? 'true' : 'false'}
}`

  const content = await callXai(system, user)
  const parsed = parseJsonObject(content)
  const reply = String(parsed.reply ?? parsed.answer ?? '').trim()
  if (!reply) throw new Error('Tutor returned an empty reply')
  const followUps = Array.isArray(parsed.followUps)
    ? parsed.followUps.map((f) => String(f)).filter(Boolean).slice(0, 4)
    : []
  const citedTopics = Array.isArray(parsed.citedTopics)
    ? parsed.citedTopics.map((t) => String(t)).filter(Boolean).slice(0, 8)
    : []
  const catalogIds = new Set(sourcesCatalog.map((s) => s.id))
  const citationsRaw = Array.isArray(parsed.citations) ? parsed.citations : []
  const citations = citationsRaw
    .filter((c) => c && typeof c === 'object')
    .map((c) => {
      const row = c as Record<string, unknown>
      return {
        sourceId: String(row.sourceId ?? row.id ?? '').trim(),
        note:
          row.note != null ? String(row.note).trim().slice(0, 200) : undefined,
      }
    })
    .filter((c) => c.sourceId && (catalogIds.size === 0 || catalogIds.has(c.sourceId)))
    .slice(0, 12)

  return {
    reply,
    followUps,
    citedTopics,
    citations,
    usedSupplement: usedWebSupplement,
    supplementSource: webSource,
  }
}

async function embedQuery(args: Record<string, unknown>) {
  const query = requireString(args.query, 'query')
  const model =
    process.env.EMBEDDING_MODEL || 'amazon.titan-embed-text-v2:0'
  const region =
    process.env.BEDROCK_REGION || process.env.AWS_REGION || 'us-east-2'

  const { BedrockRuntimeClient, InvokeModelCommand } = await import(
    '@aws-sdk/client-bedrock-runtime'
  )
  const client = new BedrockRuntimeClient({ region })
  const body = JSON.stringify({
    inputText: query.slice(0, 8000),
    dimensions: 1024,
    normalize: true,
  })
  const res = await client.send(
    new InvokeModelCommand({
      modelId: model,
      contentType: 'application/json',
      accept: 'application/json',
      body: Buffer.from(body),
    }),
  )
  const payload = JSON.parse(new TextDecoder().decode(res.body)) as {
    embedding?: number[]
  }
  if (!Array.isArray(payload.embedding) || payload.embedding.length === 0) {
    throw new Error('Bedrock returned an empty embedding')
  }
  return {
    embedding: payload.embedding,
    model,
    provider: 'bedrock',
    dimensions: payload.embedding.length,
  }
}

async function generateFlashcards(args: Record<string, unknown>) {
  const context = requireString(args.context, 'context')
  const rawCount = Number(args.count ?? 8)
  const count = Math.min(
    Math.max(Number.isFinite(rawCount) ? Math.round(rawCount) : 8, 3),
    20,
  )
  const topicHint =
    typeof args.topicHint === 'string' && args.topicHint.trim()
      ? args.topicHint.trim()
      : 'course material'

  const system = `You are a paramedic educator creating study flashcards. Use ONLY the provided course material. Return JSON only.`
  const user = `Topic hint: ${topicHint}

Material:
---
${context.slice(0, 20000)}
---

Create ${count} flashcards (front = prompt, back = concise answer).

Return JSON:
{
  "cards": [
    { "front": "...", "back": "...", "topic": "short topic label" }
  ]
}`

  const content = await callXai(system, user)
  const parsed = parseJsonObject(content)
  const raw = Array.isArray(parsed.cards) ? parsed.cards : []
  const cards: Array<{ front: string; back: string; topic: string }> = []
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue
    const row = item as Record<string, unknown>
    const front = String(row.front ?? row.question ?? '').trim()
    const back = String(row.back ?? row.answer ?? '').trim()
    if (!front || !back) continue
    cards.push({
      front,
      back,
      topic: String(row.topic ?? topicHint).trim() || topicHint,
    })
    if (cards.length >= count) break
  }
  if (cards.length === 0) {
    throw new Error('No usable flashcards returned by the model')
  }
  return { cards }
}

type ScenarioStepOut = {
  id: string
  prompt: string
  expectedPoints: string
  evidenceQuotes: string[]
}

type ScenarioCandidate = {
  vignette: string
  steps: ScenarioStepOut[]
}

type VerifiedScenario = ScenarioCandidate & {
  verified: true
  verificationNotes: string
}

function clampCount(value: unknown, min: number, max: number, fallback: number) {
  const n = Number(value)
  if (!Number.isFinite(n)) return fallback
  return Math.min(max, Math.max(min, Math.round(n)))
}

function normalizeMatchText(text: string): string {
  return text.toLowerCase().replace(/\s+/g, ' ').trim()
}

/** Evidence quote must appear in full in context (whitespace-normalized). */
function quoteGroundedInContext(quote: string, context: string): boolean {
  const q = normalizeMatchText(quote)
  if (q.length < 12) return false
  return normalizeMatchText(context).includes(q)
}

function parseScenarioCandidate(parsed: Record<string, unknown>): ScenarioCandidate {
  const vignette = String(parsed.vignette ?? '').trim()
  const rawSteps = Array.isArray(parsed.steps) ? parsed.steps : []
  const steps: ScenarioStepOut[] = []
  for (const [index, item] of rawSteps.entries()) {
    if (!item || typeof item !== 'object') continue
    const row = item as Record<string, unknown>
    const prompt = String(row.prompt ?? row.question ?? '').trim()
    if (!prompt) continue
    const expectedPoints = String(
      row.expectedPoints ?? row.rubric ?? row.points ?? '',
    ).trim()
    const quotesRaw = row.evidenceQuotes ?? row.evidence ?? row.quotes
    const evidenceQuotes = Array.isArray(quotesRaw)
      ? quotesRaw.map((q) => String(q ?? '').trim()).filter(Boolean).slice(0, 4)
      : []
    steps.push({
      id: String(row.id ?? `s${index + 1}`).trim() || `s${index + 1}`,
      prompt,
      expectedPoints,
      evidenceQuotes,
    })
    if (steps.length >= 5) break
  }
  return { vignette, steps }
}

function deterministicScenarioIssues(
  candidate: ScenarioCandidate,
  context: string,
): string[] {
  const issues: string[] = []
  if (!candidate.vignette || candidate.vignette.length < 40) {
    issues.push('Vignette missing or too short')
  }
  if (candidate.steps.length < 3 || candidate.steps.length > 5) {
    issues.push('Need 3 to 5 steps')
  }
  for (const [i, step] of candidate.steps.entries()) {
    if (!step.prompt) issues.push(`Step ${i + 1}: missing prompt`)
    if (!step.expectedPoints) {
      issues.push(`Step ${i + 1}: missing expectedPoints`)
    }
    if (step.evidenceQuotes.length === 0) {
      issues.push(`Step ${i + 1}: missing evidenceQuotes`)
    } else {
      const grounded = step.evidenceQuotes.some((q) =>
        quoteGroundedInContext(q, context),
      )
      if (!grounded) {
        issues.push(
          `Step ${i + 1}: evidenceQuotes not found in course context`,
        )
      }
    }
  }
  return issues
}

async function verifyScenarioWithModel(
  candidate: ScenarioCandidate,
  context: string,
): Promise<{ ok: boolean; issues: string[]; notes: string }> {
  const system = `You are a paramedic course-material auditor. Decide if a clinical scenario is fully grounded in the provided context. Reject invented protocols, doses, or facts not supported by the context. Return JSON only.`
  const user = `Course material context:
---
${context.slice(0, 22000)}
---

Candidate scenario JSON:
${JSON.stringify(candidate).slice(0, 8000)}

Return JSON:
{
  "ok": true,
  "issues": [],
  "stepGrounded": [true, true, true],
  "notes": "one short sentence"
}

Set ok=false if any step is ungrounded, expectedPoints invent unsupported facts, or the vignette contradicts the context.`

  const content = await callXai(system, user, 0.1)
  const parsed = parseJsonObject(content)
  const issues = Array.isArray(parsed.issues)
    ? parsed.issues.map((x) => String(x)).filter(Boolean).slice(0, 12)
    : []
  const stepGrounded = Array.isArray(parsed.stepGrounded)
    ? parsed.stepGrounded.map((x) => x === true)
    : []
  if (stepGrounded.length !== candidate.steps.length) {
    issues.push(
      `Verifier must return stepGrounded for all ${candidate.steps.length} steps`,
    )
  } else if (stepGrounded.some((g) => !g)) {
    issues.push('Verifier marked one or more steps as ungrounded')
  }
  if (parsed.ok !== true) {
    issues.push('Verifier did not set ok=true')
  }
  const ok = parsed.ok === true && issues.length === 0
  return {
    ok,
    issues,
    notes: String(parsed.notes ?? '').trim().slice(0, 240),
  }
}

async function generateOneVerifiedScenario(opts: {
  scope: string
  context: string
  chapter?: string
  priorVignettes: string[]
}): Promise<VerifiedScenario> {
  const context = opts.context
  const maxAttempts = 3 // initial + 2 retries
  let lastIssues: string[] = []

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const system = `You are a paramedic clinical educator. Create ONE lightweight scenario grounded ONLY in the provided course material. Every clinical claim in expectedPoints must be supportable by short evidenceQuotes copied from the context. Return JSON only.`
    const chapterLine = opts.chapter
      ? `Chapter focus: ${opts.chapter}\n`
      : ''
    const avoidLine =
      opts.priorVignettes.length > 0
        ? `Do NOT repeat these prior vignettes:\n- ${opts.priorVignettes.map((v) => v.slice(0, 120)).join('\n- ')}\n`
        : ''
    const fixLine =
      lastIssues.length > 0
        ? `Previous attempt failed verification. Fix these issues:\n- ${lastIssues.join('\n- ')}\n`
        : ''

    const user = `Scope: ${opts.scope}
${chapterLine}${avoidLine}${fixLine}
Course material context:
---
${context.slice(0, 24000)}
---

Return JSON:
{
  "vignette": "2-5 sentence patient/scene presentation",
  "steps": [
    {
      "id": "s1",
      "prompt": "What is your next assessment or action?",
      "expectedPoints": "Key points for grading this short answer",
      "evidenceQuotes": ["exact or near-exact span copied from the context"]
    }
  ]
}

Provide 3 to 5 ordered steps. Keep prompts answerable in 1-3 sentences.
Each step MUST include 1-3 evidenceQuotes that appear in the context above.`

    const content = await callXai(system, user, attempt === 0 ? 0.35 : 0.25)
    const candidate = parseScenarioCandidate(parseJsonObject(content))
    if (!candidate.vignette || candidate.steps.length === 0) {
      lastIssues = ['Model returned an incomplete clinical scenario']
      continue
    }

    const deterministic = deterministicScenarioIssues(candidate, context)
    if (deterministic.length > 0) {
      lastIssues = deterministic
      continue
    }

    const verified = await verifyScenarioWithModel(candidate, context)
    if (!verified.ok) {
      lastIssues =
        verified.issues.length > 0
          ? verified.issues
          : ['Verifier rejected the scenario']
      continue
    }

    return {
      ...candidate,
      verified: true,
      verificationNotes:
        verified.notes || 'Passed automated course-material grounding checks',
    }
  }

  throw new Error(
    `Could not generate a verified scenario after ${maxAttempts} attempts${
      lastIssues.length ? `: ${lastIssues.slice(0, 3).join('; ')}` : ''
    }. Try a clearer chapter scope or try again.`,
  )
}

async function generateClinicalScenario(args: Record<string, unknown>) {
  const scope = requireString(args.scope, 'scope')
  const context = requireString(args.context, 'context')
  const count = clampCount(args.count, 1, 5, 1)
  const chapter =
    typeof args.chapter === 'string' && args.chapter.trim()
      ? args.chapter.trim()
      : undefined

  const scenarios: VerifiedScenario[] = []
  const priorVignettes: string[] = []

  for (let i = 0; i < count; i += 1) {
    const scenario = await generateOneVerifiedScenario({
      scope,
      context,
      chapter,
      priorVignettes,
    })
    scenarios.push(scenario)
    priorVignettes.push(scenario.vignette)
  }

  // Backward-compatible top-level fields from the first scenario.
  const first = scenarios[0]
  return {
    verified: true as const,
    count: scenarios.length,
    chapter: chapter ?? null,
    scenarios,
    vignette: first.vignette,
    steps: first.steps,
    verificationNotes: first.verificationNotes,
  }
}

export const handler = async (event: AppSyncEvent) => {
  try {
    const name = fieldName(event)
    const args = event.arguments ?? {}
    if (name === 'generatePracticeTest') {
      return await generatePracticeTest(args)
    }
    if (name === 'gradeWrittenAnswers') {
      return await gradeWrittenAnswers(args)
    }
    if (name === 'tutorChat') {
      return await tutorChat(args)
    }
    if (name === 'generateFlashcards') {
      return await generateFlashcards(args)
    }
    if (name === 'generateClinicalScenario') {
      return await generateClinicalScenario(args)
    }
    if (name === 'embedQuery') {
      return await embedQuery(args)
    }
    throw new Error(`Unsupported field: ${name || 'unknown'}`)
  } catch (error) {
    const message =
      error instanceof Error ? redactKey(error.message) : 'Unknown error'
    throw new Error(message)
  }
}
