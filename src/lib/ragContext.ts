import type { Schema } from '../../amplify/data/resource'
import { dataClient } from '@/lib/amplifyData'
import { selectMaterialContext } from '@/lib/materialContext'

type Material = Schema['Material']['type']
type CourseChunk = Schema['CourseChunk']['type']

export type RagSelection = {
  context: string
  usedSample: boolean
  matchedCount: number
  topics: string[]
  retrieval: 'semantic' | 'enhanced-lexical' | 'sample'
}

function cosine(a: number[], b: number[]): number {
  const n = Math.min(a.length, b.length)
  if (n === 0) return 0
  let dot = 0
  let na = 0
  let nb = 0
  for (let i = 0; i < n; i++) {
    const x = a[i] ?? 0
    const y = b[i] ?? 0
    dot += x * y
    na += x * x
    nb += y * y
  }
  if (na === 0 || nb === 0) return 0
  return dot / (Math.sqrt(na) * Math.sqrt(nb))
}

function parseEmbedding(json: string | null | undefined): number[] | null {
  if (!json) return null
  try {
    const parsed = JSON.parse(json) as unknown
    if (!Array.isArray(parsed) || parsed.length === 0) return null
    return parsed.map((n) => Number(n))
  } catch {
    return null
  }
}

/** Paginate all owner CourseChunk rows (embeddings included). */
export async function listAllCourseChunks(pageSize = 100): Promise<CourseChunk[]> {
  const out: CourseChunk[] = []
  let nextToken: string | null | undefined
  do {
    const page = await dataClient.models.CourseChunk.list({
      limit: pageSize,
      nextToken: nextToken ?? undefined,
    })
    if (page.errors?.length) {
      throw new Error(page.errors.map((err: { message: string }) => err.message).join('; '))
    }
    out.push(...(page.data ?? []))
    nextToken = page.nextToken
  } while (nextToken)
  return out
}

function chaptersFromScope(scope: string): Set<string> | null {
  const found = new Set<string>()
  const re = /(?:chapter|ch\.?)\s*(\d{1,2})\b/gi
  let m: RegExpExecArray | null
  while ((m = re.exec(scope)) !== null) {
    found.add(String(Number(m[1])))
  }
  const bare = scope.match(/\b(\d{1,2})\b/g)
  if (bare && /chapter/i.test(scope)) {
    for (const n of bare) found.add(String(Number(n)))
  }
  return found.size > 0 ? found : null
}

/**
 * Semantic RAG when CourseChunks exist; falls back to keyword selectMaterialContext.
 */
export async function selectRagContext(
  materials: Material[],
  scope: string,
  chunks: CourseChunk[],
  maxChars = 20000,
): Promise<RagSelection> {
  if (!chunks.length) {
    const fallback = selectMaterialContext(materials, scope, maxChars)
    return { ...fallback }
  }

  try {
    const { data, errors } = await dataClient.mutations.embedQuery({
      query: scope.trim() || 'paramedic course review',
    })
    if (errors?.length) {
      throw new Error(errors.map((e) => e.message).join('; '))
    }
    const payload =
      typeof data === 'string'
        ? (JSON.parse(data) as { embedding?: number[] })
        : ((data ?? {}) as { embedding?: number[] })
    const queryVec = payload.embedding
    if (!Array.isArray(queryVec) || queryVec.length === 0) {
      throw new Error('embedQuery returned no vector')
    }

    const chapterFilter = chaptersFromScope(scope)
    const candidates = chapterFilter
      ? chunks.filter((c) => chapterFilter.has(String(c.chapter)))
      : chunks
    const pool = candidates.length > 0 ? candidates : chunks

    const scored: Array<{ chunk: CourseChunk; score: number }> = []
    for (const chunk of pool) {
      const vec = parseEmbedding(chunk.embeddingJson)
      if (!vec) continue
      scored.push({ chunk, score: cosine(queryVec, vec) })
    }
    scored.sort((a, b) => b.score - a.score)

    const parts: string[] = []
    const topics = new Set<string>()
    let total = 0
    let matchedCount = 0
    for (const item of scored.slice(0, 40)) {
      if (total >= maxChars) break
      if (item.score < 0.15 && matchedCount > 0) continue
      const label = `Chapter ${item.chunk.chapter}`
      const header = `Source: ${item.chunk.source} (${label})\n`
      const remaining = maxChars - total - header.length
      if (remaining <= 80) break
      const body = (item.chunk.text ?? '').slice(0, remaining)
      parts.push(header + body)
      total += header.length + body.length
      topics.add(label)
      matchedCount += 1
    }

    if (parts.length === 0) {
      const fallback = selectMaterialContext(materials, scope, maxChars)
      return { ...fallback }
    }

    return {
      context: parts.join('\n\n---\n\n'),
      usedSample: false,
      matchedCount,
      topics: [...topics].slice(0, 12),
      retrieval: 'semantic',
    }
  } catch {
    const fallback = selectMaterialContext(materials, scope, maxChars)
    return { ...fallback }
  }
}
