import type { Schema } from '../../amplify/data/resource'
import type { Attempt } from '@/lib/attempts'
import { buildPersonalizationSummary } from '@/lib/personalization'
import {
  isThinCourseContext,
  selectRagContext,
  type RagSelection,
} from '@/lib/ragContext'
import {
  loadCycleSchedule,
  pickStudyNow,
  scopeFromSession,
} from '@/lib/schedule'
import type { StudentProfile, StudyCheckIn } from '@/lib/studentProfile'
import {
  createSourceIdFactory,
  materialsHref,
  type TutorSource,
} from '@/lib/tutorSources'

type Material = Schema['Material']['type']
type CourseChunk = Schema['CourseChunk']['type']

/** Curated gap-fill (same spirit as Lambda EMS supplement). Olson stays gated. */
const EMS_15_COMPONENTS = `EMS Systems Act of 1973 — 15 required components (course-aligned Table 1-1 style):
1. Manpower
2. Training
3. Communications
4. Transportation
5. Facilities
6. Critical care units
7. Public safety agencies
8. Consumer participation
9. Access to care
10. Patient transfer
11. Standardized record-keeping
12. Public information and education
13. System review and evaluation
14. Disaster planning
15. Mutual aid`

export type TutorToolBundle = {
  context: string
  studentContext: string
  sources: TutorSource[]
  usedSample: boolean
  retrieval: RagSelection['retrieval']
  toolsUsed: string[]
  studyNowScope: string | null
}

function withTaggedSources(rag: RagSelection): {
  context: string
  sources: TutorSource[]
} {
  // Prefer sources already attached by selectRagContext when present.
  if (rag.sources && rag.sources.length > 0) {
    return { context: rag.context, sources: rag.sources }
  }
  // Legacy untagged context — wrap as a single course blob.
  const nextId = createSourceIdFactory()
  const id = nextId()
  const source: TutorSource = {
    id,
    kind: rag.usedSample ? 'supplement' : 'course',
    label: rag.usedSample ? 'Sample study context' : 'Course materials',
    detail: rag.topics.slice(0, 4).join(', ') || undefined,
    excerpt: rag.context.slice(0, 400),
    href: '/materials',
  }
  return {
    context: `[${id}] ${rag.context}`,
    sources: [source],
  }
}

/**
 * Client-side Tutor tools (course search, study-now, student focus, official gap-fill).
 * Olson / MedMaster commercial texts are not included.
 */
export async function runTutorTools(opts: {
  message: string
  materials: Material[]
  chunks: CourseChunk[]
  profile: StudentProfile | null
  checkIns: StudyCheckIn[]
  recentAttempts: Attempt[]
}): Promise<TutorToolBundle> {
  const toolsUsed: string[] = []
  const sources: TutorSource[] = []
  const blocks: string[] = []

  // Tool: search_course_materials
  toolsUsed.push('search_course_materials')
  const rag = await selectRagContext(
    opts.materials,
    opts.message,
    opts.chunks,
  )
  const tagged = withTaggedSources(rag)
  for (const s of tagged.sources) sources.push(s)
  const maxSrc = sources.reduce((max, s) => {
    const n = Number(String(s.id).replace(/^src-/, ''))
    return Number.isFinite(n) && n > max ? n : max
  }, 0)
  const nextId = createSourceIdFactory(maxSrc + 1)
  blocks.push(
    `### Tool: search_course_materials (${rag.retrieval})\n${tagged.context}`,
  )

  // Tool: get_study_now
  toolsUsed.push('get_study_now')
  let studyNowScope: string | null = null
  try {
    const schedule = await loadCycleSchedule()
    if (schedule) {
      const study = pickStudyNow(schedule)
      const focus = study.focus
      if (focus) {
        studyNowScope = scopeFromSession(focus)
        const id = nextId()
        const summary = [
          `Cycle ${schedule.cycle}`,
          `Today (${study.today}): ${focus.date} — ${focus.label}`,
          focus.chapters.length
            ? `Chapters: ${focus.chapters.slice(0, 8).join(', ')}`
            : null,
          focus.topics.length ? `Topics: ${focus.topics.join(', ')}` : null,
          study.upcoming.length > 1
            ? `Upcoming: ${study.upcoming
                .slice(0, 4)
                .map((s) => `${s.date} ${s.label}`)
                .join('; ')}`
            : null,
        ]
          .filter(Boolean)
          .join('\n')
        sources.push({
          id,
          kind: 'schedule',
          label: `Cycle ${schedule.cycle} schedule — ${focus.label}`,
          detail: focus.date,
          excerpt: summary.slice(0, 500),
          href: '/dashboard',
        })
        blocks.push(`### Tool: get_study_now\n[${id}]\n${summary}`)
      } else {
        blocks.push('### Tool: get_study_now\nNo upcoming session found.')
      }
    } else {
      blocks.push('### Tool: get_study_now\nSchedule not loaded.')
    }
  } catch {
    blocks.push('### Tool: get_study_now\nSchedule unavailable.')
  }

  // Tool: get_student_focus
  toolsUsed.push('get_student_focus')
  const studentContext = buildPersonalizationSummary({
    profile: opts.profile,
    checkIns: opts.checkIns,
    recentAttempts: opts.recentAttempts,
  })
  if (studentContext) {
    const id = nextId()
    sources.push({
      id,
      kind: 'profile',
      label: 'Your study profile / check-ins',
      detail: 'Owner-private Settings data',
      excerpt: studentContext.slice(0, 400),
      href: '/settings',
    })
    blocks.push(
      `### Tool: get_student_focus\n[${id}]\n(Personalization is also passed separately; do not invent course facts from this.)\n${studentContext}`,
    )
  } else {
    blocks.push('### Tool: get_student_focus\nNo profile check-ins yet.')
  }

  // Tool: fetch_official_supplement (curated / allowlisted gaps only — not Olson)
  const hay = `${opts.message}\n${tagged.context}`
  if (
    isThinCourseContext(tagged.context) ||
    /ems system|15 required|table\s*1-1|nhtsa/i.test(hay)
  ) {
    toolsUsed.push('fetch_official_supplement')
    const id = nextId()
    sources.push({
      id,
      kind: 'supplement',
      label: 'EMS Systems Act 1973 — 15 components (course-aligned supplement)',
      detail: 'curated-course-aligned',
      excerpt: EMS_15_COMPONENTS.slice(0, 400),
      href: 'https://en.wikipedia.org/wiki/Emergency_Medical_Services_Systems_Act_of_1973',
    })
    blocks.push(
      `### Tool: fetch_official_supplement\n[${id}]\nUse only to fill table/list gaps; label as supplement.\n${EMS_15_COMPONENTS}`,
    )
  }

  return {
    context: blocks.join('\n\n---\n\n').slice(0, 28000),
    studentContext,
    sources,
    usedSample: rag.usedSample,
    retrieval: rag.retrieval,
    toolsUsed,
    studyNowScope,
  }
}

/** Re-export helper for building course source rows from a chunk. */
export function courseSourceFromChunk(
  id: string,
  chunk: CourseChunk,
  excerpt: string,
): TutorSource {
  const chapterLabel =
    String(chunk.chapter) === '0'
      ? 'Course extras'
      : `Chapter ${chunk.chapter}`
  const filename = chunk.source || 'course-material'
  return {
    id,
    kind: 'course',
    label: `${filename} (${chapterLabel})`,
    detail: chapterLabel,
    excerpt: excerpt.slice(0, 500),
    href: materialsHref(filename),
  }
}
