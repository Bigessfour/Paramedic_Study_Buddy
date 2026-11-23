import type { Schema } from '../../amplify/data/resource'
import { dataClient } from '@/lib/amplifyData'
import {
  selectMaterialContext,
  tokenizeQuery,
} from '@/lib/materialContext'

type Material = Schema['Material']['type']
type CourseChunk = Schema['CourseChunk']['type']

export type RagSelection = {
  context: string
  usedSample: boolean
  matchedCount: number
  topics: string[]
  retrieval: 'semantic' | 'enhanced-lexical' | 'sample'
  /** True when context still looks like a table pointer without list body. */
  thinContext?: boolean
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

export function chaptersFromScope(scope: string): Set<string> | null {
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

const TABLE_POINTER_RE = /refer to table\s*[\d.-]+/i
const LIST_PRESENT_RE =
  /manpower[\s\S]{0,200}training[\s\S]{0,200}communications/i

export function isThinCourseContext(context: string): boolean {
  if (!context.trim()) return true
  if (LIST_PRESENT_RE.test(context)) return false
  if (TABLE_POINTER_RE.test(context)) return true
  if (/15 required components/i.test(context) && !/manpower/i.test(context)) {
    return true
  }
  // Very short retrieved context is unlikely to ground a good answer.
  return context.replace(/\s+/g, ' ').trim().length < 400
}

function keywordBoost(text: string, terms: string[]): number {
  const lower = text.toLowerCase()
  let score = 0
  for (const term of terms) {
    if (!term) continue
    let idx = 0
    let hits = 0
    while (hits < 6) {
      const found = lower.indexOf(term, idx)
      if (found < 0) break
      hits += 1
      idx = found + term.length
    }
    score += hits * (term.length > 5 ? 3 : 2)
  }
  if (/table\s*1-1|15 required|manpower|supplement/i.test(text)) score += 20
  return score
}

function chapterWindowFromMaterials(
  materials: Material[],
  chapter: string,
  scope: string,
  maxChars: number,
): string | null {
  const needle = `chapter-${chapter.padStart(2, '0')}`
  const match = materials.find((m) =>
    (m.filename ?? '').toLowerCase().includes(needle),
  )
  if (!match) return null
  const text = match.extractedText?.trim()
  if (!text) return null

  const terms = tokenizeQuery(scope)
  const lower = text.toLowerCase()
  let bestIdx = 0
  let bestScore = -1
  const step = 500
  for (let i = 0; i < text.length; i += step) {
    const slice = lower.slice(i, i + 2000)
    let score = 0
    for (const t of terms) {
      if (slice.includes(t)) score += 1
    }
    if (/table\s*1-1|manpower|15 required|supplement/i.test(slice)) score += 5
    if (score > bestScore) {
      bestScore = score
      bestIdx = i
    }
  }
  const start = Math.max(0, bestIdx - 400)
  const body = text.slice(start, start + maxChars)
  return `Source: ${match.filename ?? needle} (Chapter ${chapter} window)\n${body}`
}

function expandTableNeighbors(
  chunks: CourseChunk[],
  selected: CourseChunk[],
): CourseChunk[] {
  const bySource = new Map<string, CourseChunk[]>()
  for (const c of chunks) {
    const key = c.source
    if (!bySource.has(key)) bySource.set(key, [])
    bySource.get(key)!.push(c)
  }
  for (const list of bySource.values()) {
    list.sort((a, b) => (a.charStart ?? 0) - (b.charStart ?? 0))
  }

  const out = [...selected]
  const seen = new Set(selected.map((c) => c.id ?? c.chunkKey))
  for (const hit of selected) {
    if (!TABLE_POINTER_RE.test(hit.text ?? '') && !/table\s*1-1/i.test(hit.text ?? '')) {
      continue
    }
    const siblings = bySource.get(hit.source) ?? []
    const idx = siblings.findIndex((c) => (c.id ?? c.chunkKey) === (hit.id ?? hit.chunkKey))
    for (const j of [idx - 1, idx + 1, idx + 2]) {
      if (j < 0 || j >= siblings.length) continue
      const sib = siblings[j]
      const key = sib.id ?? sib.chunkKey
      if (!key || seen.has(key)) continue
      // Prefer neighbors that look like table/list content.
      if (
        /manpower|extracted table|supplement|training|communications/i.test(
          sib.text ?? '',
        ) ||
        TABLE_POINTER_RE.test(sib.text ?? '')
      ) {
        out.push(sib)
        seen.add(key)
      }
    }
  }
  return out
}

/**
 * Semantic RAG merged with keyword boost + chapter windows;
 * falls back to keyword selectMaterialContext.
 */
export async function selectRagContext(
  materials: Material[],
  scope: string,
  chunks: CourseChunk[],
  maxChars = 20000,
): Promise<RagSelection> {
  if (!chunks.length) {
    const fallback = selectMaterialContext(materials, scope, maxChars)
    return {
      ...fallback,
      thinContext: isThinCourseContext(fallback.context),
    }
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
    const terms = tokenizeQuery(scope)

    const scored: Array<{ chunk: CourseChunk; score: number }> = []
    for (const chunk of pool) {
      const vec = parseEmbedding(chunk.embeddingJson)
      if (!vec) continue
      const semantic = cosine(queryVec, vec)
      const lexical = keywordBoost(chunk.text ?? '', terms) / 40
      scored.push({ chunk, score: semantic + lexical })
    }
    scored.sort((a, b) => b.score - a.score)

    let topChunks = scored.slice(0, 30).map((s) => s.chunk)
    topChunks = expandTableNeighbors(pool, topChunks)

    // Prefer supplement / manpower chunks when the question looks like EMS components.
    if (/ems system|components|table\s*1-1|nhtsa/i.test(scope)) {
      const boost = pool.filter((c) =>
        /manpower|course supplement|15 required|mutual aid/i.test(c.text ?? ''),
      )
      for (const c of boost.slice(0, 8)) {
        if (!topChunks.some((t) => (t.id ?? t.chunkKey) === (c.id ?? c.chunkKey))) {
          topChunks.unshift(c)
        }
      }
    }

    const parts: string[] = []
    const topics = new Set<string>()
    let total = 0
    let matchedCount = 0

    if (chapterFilter) {
      for (const ch of chapterFilter) {
        const window = chapterWindowFromMaterials(
          materials,
          ch,
          scope,
          Math.min(6000, Math.floor(maxChars / 3)),
        )
        if (window) {
          parts.push(window)
          total += window.length
          topics.add(`Chapter ${ch}`)
          matchedCount += 1
        }
      }
    }

    for (const chunk of topChunks) {
      if (total >= maxChars) break
      const label = `Chapter ${chunk.chapter}`
      const header = `Source: ${chunk.source} (${label})\n`
      const remaining = maxChars - total - header.length
      if (remaining <= 80) break
      const body = (chunk.text ?? '').slice(0, remaining)
      parts.push(header + body)
      total += header.length + body.length
      topics.add(label)
      matchedCount += 1
    }

    if (parts.length === 0) {
      const fallback = selectMaterialContext(materials, scope, maxChars)
      return {
        ...fallback,
        thinContext: isThinCourseContext(fallback.context),
      }
    }

    const context = parts.join('\n\n---\n\n')
    return {
      context,
      usedSample: false,
      matchedCount,
      topics: [...topics].slice(0, 12),
      retrieval: 'semantic',
      thinContext: isThinCourseContext(context),
    }
  } catch {
    const fallback = selectMaterialContext(materials, scope, maxChars)
    return {
      ...fallback,
      thinContext: isThinCourseContext(fallback.context),
    }
  }
}
