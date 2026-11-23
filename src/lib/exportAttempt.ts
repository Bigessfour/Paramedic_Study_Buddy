import type { Attempt, AttemptPayload } from '@/lib/attempts'

export function attemptToMarkdown(
  attempt: Attempt,
  payload: AttemptPayload,
): string {
  const lines: string[] = [
    `# Practice attempt`,
    '',
    `- **Scope:** ${attempt.scope}`,
    `- **Score:** ${attempt.scorePercent}%`,
    `- **Completed:** ${attempt.completedAt ?? '—'}`,
    `- **Questions:** ${attempt.questionCount}`,
    `- **MC:** ${attempt.mcCorrect}/${attempt.mcTotal}`,
  ]
  if (attempt.writtenTotal > 0) {
    lines.push(`- **Written avg:** ${attempt.writtenAvgScore ?? '—'}`)
  }
  if (attempt.usedSampleContext) {
    lines.push(`- **Context:** sample notes`)
  }
  lines.push('', '---', '')

  const gradeById = new Map(
    (payload.grades ?? []).map((g) => [g.id, g] as const),
  )

  for (const [index, q] of (payload.questions ?? []).entries()) {
    const answer = payload.answers?.[q.id] ?? ''
    const grade = gradeById.get(q.id)
    const isObjective = q.type === 'multiple_choice' || q.type === 'true_false'
    const correct =
      isObjective && q.correctAnswer
        ? answer.trim().toLowerCase() ===
          String(q.correctAnswer).trim().toLowerCase()
        : null

    lines.push(`## Q${index + 1}. ${q.stem}`)
    lines.push('')
    lines.push(`_Type: ${q.type.replaceAll('_', ' ')}_`)
    if (q.options?.length) {
      lines.push('')
      for (const opt of q.options) lines.push(`- ${opt}`)
    }
    lines.push('')
    lines.push(`**Your answer:** ${answer || '—'}`)
    if (isObjective && q.correctAnswer) {
      lines.push(`**Correct:** ${q.correctAnswer}`)
      lines.push(
        `**Result:** ${correct === true ? 'correct' : correct === false ? 'incorrect' : '—'}`,
      )
    }
    if (grade) {
      lines.push(`**Written score:** ${grade.score}/100 — ${grade.feedback}`)
    }
    if (q.explanation) {
      lines.push('')
      lines.push(`**Explanation:** ${q.explanation}`)
    }
    lines.push('')
  }

  return lines.join('\n').trim() + '\n'
}

export async function copyText(text: string): Promise<void> {
  await navigator.clipboard.writeText(text)
}

export function downloadText(filename: string, text: string): void {
  const blob = new Blob([text], { type: 'text/markdown;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
