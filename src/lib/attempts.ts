import type { Schema } from '../../amplify/data/resource'
import { dataClient } from '@/lib/amplifyData'

export type Attempt = Schema['Attempt']['type']

export type AttemptPayload = {
  questions?: Array<{
    id: string
    type: string
    prompt: string
    choices?: string[]
    correctAnswer?: string
  }>
  answers?: Record<string, string>
  grades?: Array<{ id: string; score: number; feedback: string }>
  usedSample?: boolean
}

export async function listAttempts(limit = 100): Promise<Attempt[]> {
  const { data, errors } = await dataClient.models.Attempt.list({ limit })
  if (errors?.length) {
    throw new Error(errors.map((e) => e.message).join('; '))
  }
  return [...(data ?? [])].sort((a, b) =>
    (b.completedAt ?? '').localeCompare(a.completedAt ?? ''),
  )
}

export function parseAttemptPayload(attempt: Attempt): AttemptPayload {
  try {
    return JSON.parse(attempt.payloadJson || '{}') as AttemptPayload
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
