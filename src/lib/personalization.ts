import type { Attempt } from '@/lib/attempts'
import type { StudentProfile, StudyCheckIn } from '@/lib/studentProfile'

const MAX_CHARS = 1800

const CONFIDENCE_LABEL: Record<number, string> = {
  1: 'struggling',
  2: 'below average',
  3: 'okay',
  4: 'solid',
  5: 'confident',
}

export function buildPersonalizationSummary(opts: {
  profile: StudentProfile | null
  checkIns: StudyCheckIn[]
  recentAttempts: Attempt[]
}): string {
  const { profile, checkIns, recentAttempts } = opts
  if (!profile && checkIns.length === 0 && recentAttempts.length === 0) {
    return ''
  }

  const lines: string[] = []

  if (profile?.preferredName?.trim()) {
    lines.push(`Preferred name: ${profile.preferredName.trim()}`)
  }
  if (profile) {
    lines.push(
      `Greet by name: ${profile.tutorGreetByName !== false ? 'yes' : 'no'}`,
    )
    lines.push(
      `Ask about external tests / check-ins: ${
        profile.tutorAskAboutTests !== false ? 'yes' : 'no'
      }`,
    )
    const conf = profile.courseConfidence
    if (typeof conf === 'number' && conf >= 1 && conf <= 5) {
      lines.push(
        `Self-reported course confidence: ${conf}/5 (${CONFIDENCE_LABEL[conf] ?? 'okay'})`,
      )
    }
    if (profile.selfWeakTopics?.trim()) {
      lines.push(`Self-reported weak topics (focus help here): ${profile.selfWeakTopics.trim()}`)
    }
    if (profile.notesForTutor?.trim()) {
      lines.push(`Notes for tutor: ${profile.notesForTutor.trim()}`)
    }
  }

  const attempts = recentAttempts.slice(0, 3)
  if (attempts.length) {
    lines.push('Recent in-app practice attempts:')
    for (const a of attempts) {
      const score =
        typeof a.scorePercent === 'number'
          ? `${Math.round(a.scorePercent)}%`
          : 'n/a'
      const when = a.completedAt
        ? new Date(a.completedAt).toLocaleDateString()
        : 'unknown date'
      lines.push(`- ${when}: scope "${a.scope}" → ${score}`)
    }
  }

  const recentCheckIns = checkIns.slice(0, 2)
  if (recentCheckIns.length) {
    lines.push('Recent student check-ins:')
    for (const c of recentCheckIns) {
      const bits = [
        c.kind ?? 'check_in',
        c.feeling,
        c.relatedScope ? `scope=${c.relatedScope}` : null,
        c.scoreOrOutcome ? `outcome=${c.scoreOrOutcome}` : null,
      ].filter(Boolean)
      lines.push(`- ${bits.join(' | ')}`)
    }
  }

  let out = lines.join('\n').trim()
  if (out.length > MAX_CHARS) out = out.slice(0, MAX_CHARS)
  return out
}
