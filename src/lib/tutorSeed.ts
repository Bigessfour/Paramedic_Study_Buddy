export type TutorExplainSeed = {
  stem: string
  userAnswer: string
  correctAnswer?: string
  rubric?: string
  explanation?: string
  scope: string
  attemptId?: string
}

const KEY = 'psb.tutorExplainSeed'

export function saveTutorExplainSeed(seed: TutorExplainSeed): void {
  sessionStorage.setItem(KEY, JSON.stringify(seed))
}

export function consumeTutorExplainSeed(): TutorExplainSeed | null {
  const raw = sessionStorage.getItem(KEY)
  if (!raw) return null
  sessionStorage.removeItem(KEY)
  try {
    return JSON.parse(raw) as TutorExplainSeed
  } catch {
    return null
  }
}

export function formatExplainPrompt(seed: TutorExplainSeed): string {
  const parts = [
    `Please explain this missed practice question using my course materials.`,
    ``,
    `Scope: ${seed.scope}`,
    `Question: ${seed.stem}`,
    `My answer: ${seed.userAnswer || '(blank)'}`,
  ]
  if (seed.correctAnswer) parts.push(`Correct answer: ${seed.correctAnswer}`)
  if (seed.rubric) parts.push(`Rubric: ${seed.rubric}`)
  if (seed.explanation) parts.push(`Provided explanation: ${seed.explanation}`)
  parts.push(
    ``,
    `Explain why the correct approach is right, what I likely misunderstood, and a short study tip.`,
  )
  return parts.join('\n')
}
