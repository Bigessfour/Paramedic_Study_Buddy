import type { Schema } from '../../amplify/data/resource'
import {
  createSourceIdFactory,
  materialsHref,
  type TutorSource,
} from '@/lib/tutorSources'

type Material = Schema['Material']['type']

/** Lightweight fallback so Phase 3 can be exercised before textbooks are uploaded. */
export const SAMPLE_CONTEXT = `SAMPLE PARAMEDIC STUDY NOTES (not an official textbook)

Airway and Ventilation
- Open the airway with head-tilt/chin-lift in non-trauma patients; use jaw-thrust when cervical spine injury is suspected.
- Oropharyngeal airways are for unconscious patients without a gag reflex; nasopharyngeal airways may be used with an intact gag reflex if no basilar skull fracture is suspected.
- Adequate ventilation is assessed by chest rise, oxygen saturation trends, and clinical response.
- Bag-valve-mask ventilation should be performed with a good seal and appropriate rate to avoid hyperventilation.
- Signs of severe respiratory distress include tripoding, accessory muscle use, inability to speak full sentences, and declining mental status.

Shock overview
- Shock is inadequate tissue perfusion. Compensated shock may present with tachycardia and normal blood pressure; decompensated shock includes hypotension and altered mentation.
- Hypovolemic shock is treated with hemorrhage control and fluid resuscitation per protocol.
- Distributive shock (including anaphylaxis and sepsis) requires recognition of mechanism and protocol-directed medications/fluids.

Cardiac basics
- High-quality CPR emphasizes adequate rate and depth with minimal interruptions.
- For witnessed monitored VF/pVT, defibrillation is indicated as soon as a defibrillator is available.
- Aspirin is commonly indicated in suspected ACS when not contraindicated; follow local protocol for nitrates and analgesia.
`

const STOP = new Set([
  'that',
  'this',
  'with',
  'from',
  'have',
  'what',
  'when',
  'where',
  'which',
  'about',
  'into',
  'your',
  'their',
  'them',
  'then',
  'than',
  'also',
  'only',
  'some',
  'such',
  'chapter',
  'chapters',
  'exam',
  'test',
  'study',
  'topic',
  'topics',
])

export function tokenizeQuery(scope: string): string[] {
  return scope
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 2 && !STOP.has(t))
}

function termFrequency(haystack: string, term: string): number {
  if (!term) return 0
  let count = 0
  let idx = 0
  while (idx < haystack.length) {
    const found = haystack.indexOf(term, idx)
    if (found < 0) break
    count += 1
    idx = found + term.length
  }
  return count
}

type ScoredChunk = {
  material: Material
  chunk: string
  score: number
  topicHint: string
}

function chunkText(text: string, size = 1200, overlap = 150): string[] {
  const clean = text.replace(/\s+/g, ' ').trim()
  if (clean.length <= size) return [clean]
  const parts: string[] = []
  let start = 0
  while (start < clean.length) {
    const end = Math.min(clean.length, start + size)
    parts.push(clean.slice(start, end))
    if (end >= clean.length) break
    start = Math.max(0, end - overlap)
  }
  return parts
}

function topicFromFilename(filename: string): string {
  const chapter = filename.match(/chapter-(\d+)/i)
  if (chapter) return `Chapter ${Number(chapter[1])}`
  return filename.replace(/\.(md|txt|pdf|docx)$/i, '').slice(0, 60)
}

/**
 * Improved lexical retrieval: multi-term TF scoring, filename/chapter boost,
 * and chunk-level selection (replaces single includes() matching).
 */
export function selectMaterialContext(
  materials: Material[],
  scope: string,
  maxChars = 20000,
): {
  context: string
  usedSample: boolean
  matchedCount: number
  topics: string[]
  retrieval: 'enhanced-lexical' | 'sample'
  sources: TutorSource[]
} {
  const nextId = createSourceIdFactory()
  const ready = materials.filter(
    (m) => m.extractStatus === 'ready' && (m.extractedText?.trim()?.length ?? 0) > 0,
  )

  if (ready.length === 0) {
    const id = nextId()
    return {
      context: `[${id}] ${SAMPLE_CONTEXT}`,
      usedSample: true,
      matchedCount: 0,
      topics: ['sample'],
      retrieval: 'sample',
      sources: [
        {
          id,
          kind: 'supplement',
          label: 'Sample study context',
          excerpt: SAMPLE_CONTEXT.slice(0, 400),
          href: '/materials',
        },
      ],
    }
  }

  const terms = tokenizeQuery(scope)
  const scored: ScoredChunk[] = []

  for (const material of ready) {
    const filename = (material.filename ?? '').toLowerCase()
    const topicHint = topicFromFilename(material.filename ?? 'material')
    const chunks = chunkText(material.extractedText ?? '')
    for (const chunk of chunks) {
      const lower = chunk.toLowerCase()
      let score = 0
      if (terms.length === 0) {
        score = Math.min(chunk.length / 500, 8)
      } else {
        for (const term of terms) {
          const tf = termFrequency(lower, term)
          score += Math.min(tf, 8) * (term.length > 5 ? 3 : 2)
          if (filename.includes(term)) score += 12
        }
      }
      if (score > 0 || terms.length === 0) {
        scored.push({ material, chunk, score, topicHint })
      }
    }
  }

  scored.sort((a, b) => b.score - a.score)

  const chunksOut: string[] = []
  const sources: TutorSource[] = []
  const topics = new Set<string>()
  let total = 0
  let matchedCount = 0
  const seenMaterials = new Set<string>()

  for (const item of scored) {
    if (total >= maxChars) break
    if (item.score <= 0 && terms.length > 0 && matchedCount > 0) continue
    const id = nextId()
    const filename = item.material.filename ?? 'material'
    const body = item.chunk.slice(0, Math.max(80, maxChars - total - 80))
    const header = `[${id}] Source: ${filename} (${item.topicHint})\n`
    const remaining = maxChars - total - header.length
    if (remaining <= 80) break
    const clipped = body.slice(0, remaining)
    chunksOut.push(header + clipped)
    sources.push({
      id,
      kind: 'course',
      label: `${filename} (${item.topicHint})`,
      detail: item.topicHint,
      excerpt: clipped.slice(0, 500),
      href: materialsHref(filename),
    })
    total += header.length + clipped.length
    topics.add(item.topicHint)
    const mid = item.material.id ?? item.material.filename
    if (mid && !seenMaterials.has(mid)) {
      seenMaterials.add(mid)
      matchedCount += 1
    }
  }

  if (chunksOut.length === 0) {
    const byLen = [...ready].sort(
      (a, b) => (b.extractedText?.length ?? 0) - (a.extractedText?.length ?? 0),
    )
    for (const m of byLen.slice(0, 3)) {
      const id = nextId()
      const filename = m.filename ?? 'material'
      const body = (m.extractedText ?? '').slice(0, Math.floor(maxChars / 3))
      chunksOut.push(`[${id}] Source: ${filename}\n${body}`)
      sources.push({
        id,
        kind: 'course',
        label: filename,
        excerpt: body.slice(0, 500),
        href: materialsHref(filename),
      })
      topics.add(topicFromFilename(filename))
      matchedCount += 1
    }
  }

  return {
    context: chunksOut.join('\n\n---\n\n'),
    usedSample: false,
    matchedCount,
    topics: [...topics].slice(0, 12),
    retrieval: 'enhanced-lexical',
    sources,
  }
}
