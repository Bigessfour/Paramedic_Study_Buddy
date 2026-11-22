import type { Schema } from '../../amplify/data/resource'
import { listAllAttempts } from '@/lib/listAll'

export type Attempt = Schema['Attempt']['type']

export type AttemptQuestion = {
  id: string
  type: string
  /** Canonical field from xAI / PracticeTestPage */
  stem: string
  options?: string[]
  correctAnswer?: string
  explanation?: string
}

export type AttemptPayload = {
  questions?: AttemptQuestion[]
  answers?: Record<string, string>
  grades?: Array<{ id: string; score: number; feedback: string }>
  usedSample?: boolean
}

/** Normalize older prompt/choices payloads and current stem/options. */
export function normalizeAttemptQuestions(raw: unknown): AttemptQuestion[] {
  if (!Array.isArray(raw)) return []
  const out: AttemptQuestion[] = []
  raw.forEach((item, index) => {
    if (!item || typeof item !== 'object') return
    const q = item as Record<string, unknown>
    const stem = String(q.stem ?? q.prompt ?? q.question ?? '').trim()
    if (!stem) return
    const optionsRaw = q.options ?? q.choices
    const question: AttemptQuestion = {
      id: String(q.id ?? `q-${index + 1}`),
      type: String(q.type ?? 'multiple_choice'),
      stem,
    }
    if (Array.isArray(optionsRaw)) {
      question.options = optionsRaw.map((o) => String(o))
    }
    if (q.correctAnswer != null) question.correctAnswer = String(q.correctAnswer)
    if (q.explanation != null) question.explanation = String(q.explanation)
    out.push(question)
  })
  return out
}

export async function listAttempts(limit = 100): Promise<Attempt[]> {
  const data = await listAllAttempts()
  const sorted = [...data].sort((a, b) =>
    (b.completedAt ?? '').localeCompare(a.completedAt ?? ''),
  )
  return Number.isFinite(limit) && limit > 0 ? sorted.slice(0, limit) : sorted
}

export function parseAttemptPayload(attempt: Attempt): AttemptPayload {
  try {
    const parsed = JSON.parse(attempt.payloadJson || '{}') as AttemptPayload & {
      questions?: unknown
    }
    return {
      ...parsed,
      questions: normalizeAttemptQuestions(parsed.questions),
    }
  } catch {
    return {}
  }
}

export function attemptStats(attempts: Attempt[]) {
  if (attempts.length === 0) {
    return {
      total: 0,
      averageScore: null as number | null,
      lastScore: null as number | null,
      lastAt: null as string | null,
      lastScope: null as string | null,
    }
  }
  const total = attempts.length
  const averageScore =
    Math.round(
      (attempts.reduce((sum, a) => sum + (a.scorePercent ?? 0), 0) / total) * 10,
    ) / 10
  const last = attempts[0]
  return {
    total,
    averageScore,
    lastScore: last.scorePercent ?? null,
    lastAt: last.completedAt ?? null,
    lastScope: last.scope ?? null,
  }
}
