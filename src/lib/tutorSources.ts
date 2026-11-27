/** Structured attribution for Tutor replies (course RAG, schedule, supplements). */

export type TutorSourceKind =
  | 'course'
  | 'schedule'
  | 'profile'
  | 'supplement'
  | 'external'

export type TutorSource = {
  id: string
  kind: TutorSourceKind
  label: string
  detail?: string
  excerpt?: string
  /** In-app path or external https URL */
  href?: string
}

export type TutorCitation = {
  sourceId: string
  label: string
  kind: TutorSourceKind
  href?: string
  excerpt?: string
  note?: string
}

export function createSourceIdFactory(start = 1) {
  let n = start
  return () => `src-${n++}`
}

export function materialsHref(filename: string): string {
  return `/materials?file=${encodeURIComponent(filename)}`
}

export function resolveCitations(
  raw: unknown,
  catalog: TutorSource[],
): TutorCitation[] {
  const byId = new Map(catalog.map((s) => [s.id, s]))
  if (!Array.isArray(raw)) return []
  const out: TutorCitation[] = []
  const seen = new Set<string>()
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue
    const row = item as Record<string, unknown>
    const sourceId = String(row.sourceId ?? row.id ?? '').trim()
    if (!sourceId || seen.has(sourceId)) continue
    const src = byId.get(sourceId)
    if (!src) continue
    seen.add(sourceId)
    out.push({
      sourceId,
      label: src.label,
      kind: src.kind,
      href: src.href,
      excerpt: src.excerpt,
      note: row.note != null ? String(row.note).slice(0, 200) : undefined,
    })
  }
  return out.slice(0, 12)
}

export function sourcesCatalogJson(sources: TutorSource[]): string {
  return JSON.stringify(
    sources.map((s) => ({
      id: s.id,
      kind: s.kind,
      label: s.label,
      detail: s.detail,
    })),
  ).slice(0, 6000)
}
