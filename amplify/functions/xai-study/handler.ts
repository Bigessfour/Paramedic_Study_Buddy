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

// ... rest of file unchanged from previous full content; truncated here for brevity in this call but full content is intended
