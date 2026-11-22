import type { Schema } from '../../amplify/data/resource'
import { tokenizeQuery } from '@/lib/materialContext'

type Attempt = Schema['Attempt']['type']

export function inferTopicsFromScope(scope: string): string[] {
  const topics: string[] = []
  const chapterMatches = [...scope.matchAll(/chapter\s*(\d+)/gi)]
  for (const m of chapterMatches) {
    topics.push(`Chapter ${Number(m[1])}`)
  }
  const tokens = tokenizeQuery(scope).slice(0, 6)
  for (const t of tokens) {
    const label = t.charAt(0).toUpperCase() + t.slice(1)
    if (!topics.includes(label)) topics.push(label)
  }
  if (topics.length === 0) topics.push('General')
  return topics.slice(0, 8)
}

export type TopicBreakdown = {
  topic: string
  attempts: number
  avgScore: number
  totalQuestions: number
}

export function buildTopicBreakdown(attempts: Attempt[]): TopicBreakdown[] {
  const map = new Map<
    string,
    { sum: number; attempts: number; questions: number }
  >()

  for (const a of attempts) {
    let topics: string[] = []
    try {
      const parsed = JSON.parse(a.topicsJson || '[]') as unknown
      if (Array.isArray(parsed)) topics = parsed.map(String)
    } catch {
      topics = inferTopicsFromScope(a.scope)
    }
    if (topics.length === 0) topics = ['General']
    for (const topic of topics) {
      const row = map.get(topic) ?? { sum: 0, attempts: 0, questions: 0 }
      row.sum += a.scorePercent ?? 0
      row.attempts += 1
      row.questions += a.questionCount ?? 0
      map.set(topic, row)
    }
  }

  return [...map.entries()]
    .map(([topic, row]) => ({
      topic,
      attempts: row.attempts,
      avgScore: Math.round((row.sum / row.attempts) * 10) / 10,
      totalQuestions: row.questions,
    }))
    .sort((a, b) => a.avgScore - b.avgScore)
}
