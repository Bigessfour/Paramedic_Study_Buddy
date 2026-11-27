import { listStudyMaterials } from '@/lib/listAll'

export type ScheduleSession = {
  date: string
  week?: number | null
  label: string
  topics: string[]
  chapters: string[]
  raw?: string
}

export type CycleSchedule = {
  cycle: string
  source: string
  timezone: string
  sessions: ScheduleSession[]
}

const SCHEDULE_FILENAME = 'schedule/cycle-17.json'

function todayInTimezone(timeZone: string): string {
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date())
  } catch {
    return new Date().toISOString().slice(0, 10)
  }
}

function addDaysIso(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T12:00:00`)
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}

export function parseCycleSchedule(raw: string): CycleSchedule | null {
  try {
    const parsed = JSON.parse(raw) as CycleSchedule
    if (!parsed || !Array.isArray(parsed.sessions)) return null
    return {
      cycle: String(parsed.cycle ?? '17'),
      source: String(parsed.source ?? SCHEDULE_FILENAME),
      timezone: String(parsed.timezone ?? 'America/Denver'),
      sessions: parsed.sessions
        .map((s) => ({
          date: String(s.date ?? '').slice(0, 10),
          week: s.week ?? null,
          label: String(s.label ?? '').trim(),
          topics: Array.isArray(s.topics) ? s.topics.map(String) : [],
          chapters: Array.isArray(s.chapters) ? s.chapters.map(String) : [],
          raw: s.raw ? String(s.raw) : undefined,
        }))
        .filter((s) => s.date && s.label),
    }
  } catch {
    return null
  }
}

export async function loadCycleSchedule(): Promise<CycleSchedule | null> {
  const materials = await listStudyMaterials()
  const row = materials.find(
    (m) =>
      m.filename === SCHEDULE_FILENAME ||
      m.filename?.endsWith('cycle-17.json') ||
      m.s3Key?.endsWith(SCHEDULE_FILENAME),
  )
  const text = row?.extractedText?.trim()
  if (!text) return null
  return parseCycleSchedule(text)
}

export function scopeFromSession(session: ScheduleSession): string {
  if (session.chapters.length > 0) {
    const ch = session.chapters.slice(0, 4)
    const chapterPart =
      ch.length === 1 ? `Chapter ${ch[0]}` : `Chapters ${ch.join(', ')}`
    return `${chapterPart} — ${session.label}`.slice(0, 160)
  }
  return session.label.slice(0, 160)
}

export function pickStudyNow(
  schedule: CycleSchedule,
  nowIso?: string,
): {
  today: string
  focus: ScheduleSession | null
  upcoming: ScheduleSession[]
} {
  const today = nowIso ?? todayInTimezone(schedule.timezone)
  const weekEnd = addDaysIso(today, 7)
  const sorted = [...schedule.sessions].sort((a, b) =>
    a.date.localeCompare(b.date),
  )
  const onToday = sorted.filter((s) => s.date === today)
  const focus =
    onToday[0] ??
    sorted.find((s) => s.date > today) ??
    sorted[sorted.length - 1] ??
    null
  const upcoming = sorted
    .filter((s) => s.date >= today && s.date <= weekEnd)
    .slice(0, 6)
  return { today, focus, upcoming }
}
