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

function redactKey(message: string): string {
  return message.replace(/xai-[A-Za-z0-9_-]+/g, 'xai-[REDACTED]')
}

async function callXai(system: string, user: string): Promise<string> {
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
      temperature: 0.3,
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
        ? item.options.map((o) => String(o))
        : []
      if (options.length < 2) continue
      question.options = options
      question.correctAnswer = String(item.correctAnswer ?? item.answer ?? '')
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
  const mcCount = Math.round((questionCount * mcPercent) / 100)
  const tfCount = Math.max(1, Math.round(questionCount * 0.15))
  const writtenCount = Math.max(1, questionCount - mcCount - tfCount)

  const system = `You are a paramedic education exam writer. Use ONLY the provided course material context. Do not invent protocols outside the context. Return JSON only.`

  const user = `Exam scope: ${scope}

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

  const system = `You are a paramedic study tutor. Answer ONLY using the provided course material context. If the answer is not in the context, say you cannot find it in the uploaded materials and suggest what topic to review. Be concise and clinically accurate. Return JSON only.`

  const user = `Course material context:
---
${context.slice(0, 22000)}
---

Recent chat (oldest first):
${JSON.stringify(history).slice(0, 8000)}

Student message: ${message}

Return JSON:
{
  "reply": "tutor response",
  "followUps": ["optional follow-up question 1", "optional follow-up question 2"],
  "citedTopics": ["topic labels from context if any"]
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
  return { reply, followUps, citedTopics }
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
    throw new Error(`Unsupported field: ${name || 'unknown'}`)
  } catch (error) {
    const message =
      error instanceof Error ? redactKey(error.message) : 'Unknown error'
    throw new Error(message)
  }
}
