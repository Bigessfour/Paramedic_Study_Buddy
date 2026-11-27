import type { Schema } from '../../amplify/data/resource'
import type { AuthUser } from '@/auth/AuthProvider'
import { dataClient } from '@/lib/amplifyData'

export type StudentProfile = Schema['StudentProfile']['type']
export type StudyCheckIn = Schema['StudyCheckIn']['type']
export type TextScale = 'normal' | 'large' | 'xl'
export type CheckInKind = 'external_exam' | 'weekly_feel' | 'focus_request'

export type ProfileDraft = {
  preferredName: string
  textScale: TextScale
  defaultQuestionCount: number
  tutorGreetByName: boolean
  tutorAskAboutTests: boolean
  courseConfidence: number
  selfWeakTopics: string
  notesForTutor: string
}

export const DEFAULT_PROFILE_DRAFT: ProfileDraft = {
  preferredName: '',
  textScale: 'normal',
  defaultQuestionCount: 5,
  tutorGreetByName: true,
  tutorAskAboutTests: true,
  courseConfidence: 3,
  selfWeakTopics: '',
  notesForTutor: '',
}

export function displayName(
  user: AuthUser | null | undefined,
  profile: StudentProfile | null | undefined,
): string {
  const preferred = profile?.preferredName?.trim()
  if (preferred) return preferred
  const email = user?.email?.trim()
  if (email) {
    const local = email.split('@')[0]?.trim()
    if (local) return local
  }
  return 'there'
}

export function profileToDraft(profile: StudentProfile | null): ProfileDraft {
  if (!profile) return { ...DEFAULT_PROFILE_DRAFT }
  const scale = profile.textScale
  return {
    preferredName: profile.preferredName?.trim() ?? '',
    textScale:
      scale === 'large' || scale === 'xl' || scale === 'normal' ? scale : 'normal',
    defaultQuestionCount: clampQuestionCount(profile.defaultQuestionCount ?? 5),
    tutorGreetByName: profile.tutorGreetByName !== false,
    tutorAskAboutTests: profile.tutorAskAboutTests !== false,
    courseConfidence: clampConfidence(profile.courseConfidence ?? 3),
    selfWeakTopics: profile.selfWeakTopics?.trim() ?? '',
    notesForTutor: profile.notesForTutor?.trim() ?? '',
  }
}

export function clampQuestionCount(n: number): number {
  if (!Number.isFinite(n)) return 5
  return Math.min(15, Math.max(3, Math.round(n)))
}

export function clampConfidence(n: number): number {
  if (!Number.isFinite(n)) return 3
  return Math.min(5, Math.max(1, Math.round(n)))
}

export async function loadStudentProfile(): Promise<StudentProfile | null> {
  const { data, errors } = await dataClient.models.StudentProfile.list({
    limit: 10,
  })
  if (errors?.length) {
    throw new Error(errors.map((e) => e.message).join('; '))
  }
  const rows = [...(data ?? [])].sort((a, b) =>
    (b.updatedAt ?? '').localeCompare(a.updatedAt ?? ''),
  )
  return rows[0] ?? null
}

export async function upsertStudentProfile(
  draft: ProfileDraft,
  existing: StudentProfile | null,
): Promise<StudentProfile> {
  const preferredName = draft.preferredName.trim().slice(0, 80)
  if (!preferredName) {
    throw new Error('Preferred name is required')
  }
  const payload = {
    preferredName,
    textScale: draft.textScale,
    defaultQuestionCount: clampQuestionCount(draft.defaultQuestionCount),
    tutorGreetByName: draft.tutorGreetByName,
    tutorAskAboutTests: draft.tutorAskAboutTests,
    courseConfidence: clampConfidence(draft.courseConfidence),
    selfWeakTopics: draft.selfWeakTopics.trim().slice(0, 500) || null,
    notesForTutor: draft.notesForTutor.trim().slice(0, 1000) || null,
    updatedAt: new Date().toISOString(),
  }

  if (existing?.id) {
    const { data, errors } = await dataClient.models.StudentProfile.update({
      id: existing.id,
      ...payload,
    })
    if (errors?.length) {
      throw new Error(errors.map((e) => e.message).join('; '))
    }
    if (!data) throw new Error('Profile update returned no data')
    return data
  }

  const { data, errors } = await dataClient.models.StudentProfile.create(payload)
  if (errors?.length) {
    throw new Error(errors.map((e) => e.message).join('; '))
  }
  if (!data) throw new Error('Profile create returned no data')
  return data
}

export async function listStudyCheckIns(limit = 20): Promise<StudyCheckIn[]> {
  const { data, errors } = await dataClient.models.StudyCheckIn.list({
    limit: Math.min(50, Math.max(1, limit)),
  })
  if (errors?.length) {
    throw new Error(errors.map((e) => e.message).join('; '))
  }
  return [...(data ?? [])].sort((a, b) =>
    (b.createdAt ?? '').localeCompare(a.createdAt ?? ''),
  )
}

export async function createStudyCheckIn(input: {
  kind: CheckInKind
  feeling: string
  relatedScope?: string
  scoreOrOutcome?: string
}): Promise<StudyCheckIn> {
  const feeling = input.feeling.trim().slice(0, 400)
  if (!feeling) throw new Error('Check-in feeling is required')
  const { data, errors } = await dataClient.models.StudyCheckIn.create({
    kind: input.kind,
    feeling,
    relatedScope: input.relatedScope?.trim().slice(0, 200) || null,
    scoreOrOutcome: input.scoreOrOutcome?.trim().slice(0, 200) || null,
    createdAt: new Date().toISOString(),
  })
  if (errors?.length) {
    throw new Error(errors.map((e) => e.message).join('; '))
  }
  if (!data) throw new Error('Check-in create returned no data')
  return data
}

/** Clears profile fields + all check-ins. Attempts are left intact. */
export async function clearLearningProfile(
  existing: StudentProfile | null,
): Promise<void> {
  const checkIns = await listStudyCheckIns(50)
  for (const row of checkIns) {
    if (!row.id) continue
    await dataClient.models.StudyCheckIn.delete({ id: row.id })
  }
  if (existing?.id) {
    await dataClient.models.StudentProfile.delete({ id: existing.id })
  }
}

export function textScaleClass(scale: TextScale | null | undefined): string {
  if (scale === 'large') return 'text-base leading-relaxed [&_p]:leading-relaxed'
  if (scale === 'xl') {
    return 'text-lg leading-loose [&_p]:leading-loose [&_li]:leading-loose'
  }
  return ''
}
