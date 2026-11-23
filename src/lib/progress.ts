import type { Schema } from '../../amplify/data/resource'
import { buildTopicBreakdown } from '@/lib/topics'

type Attempt = Schema['Attempt']['type']
type Flashcard = Schema['Flashcard']['type']

export type ProgressRow = {
  key: string
  label: string
  kind: 'chapter' | 'topic'
  attemptCount: number
  avgScore: number | null
  lastStudiedAt: string | null
  dueCards: number
  weak: boolean
}

const CHAPTER_COUNT = 53

export function buildProgressMap(
  attempts: Attempt[],
  flashcards: Flashcard[],
): ProgressRow[] {
  const breakdown = buildTopicBreakdown(attempts)
  const byTopic = new Map(breakdown.map((t) => [t.topic, t]))

  const lastByTopic = new Map<string, string>()
  for (const a of attempts) {
    let topics: string[] = []
    try {
      const parsed = JSON.parse(a.topicsJson || '[]') as unknown
      if (Array.isArray(parsed)) topics = parsed.map(String)
    } catch {
      topics = []
    }
    const at = a.completedAt ?? ''
    for (const topic of topics) {
      const prev = lastByTopic.get(topic)
      if (!prev || at > prev) lastByTopic.set(topic, at)
    }
  }

  const dueByTopic = new Map<string, number>()
  const now = Date.now()
  for (const c of flashcards) {
    if (new Date(c.dueAt).getTime() > now) continue
    const topic = c.topic || 'General'
    dueByTopic.set(topic, (dueByTopic.get(topic) ?? 0) + 1)
  }

  const rows: ProgressRow[] = []
  for (let n = 1; n <= CHAPTER_COUNT; n += 1) {
    const label = `Chapter ${n}`
    const t = byTopic.get(label)
    const avg = t?.avgScore ?? null
    rows.push({
      key: `ch-${n}`,
      label,
      kind: 'chapter',
      attemptCount: t?.attempts ?? 0,
      avgScore: avg,
      lastStudiedAt: lastByTopic.get(label) ?? null,
      dueCards: dueByTopic.get(label) ?? 0,
      weak: avg != null && avg < 70,
    })
  }

  for (const t of breakdown) {
    if (/^Chapter\s+\d+$/i.test(t.topic)) continue
    rows.push({
      key: `topic-${t.topic}`,
      label: t.topic,
      kind: 'topic',
      attemptCount: t.attempts,
      avgScore: t.avgScore,
      lastStudiedAt: lastByTopic.get(t.topic) ?? null,
      dueCards: dueByTopic.get(t.topic) ?? 0,
      weak: t.avgScore < 70,
    })
  }

  return rows
}
