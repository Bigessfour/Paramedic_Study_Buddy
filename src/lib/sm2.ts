/** Minimal SM-2 spaced repetition helpers for flashcard review. */

export type Sm2State = {
  ease: number
  intervalDays: number
  repetitions: number
  dueAt: string
}

export type Sm2Rating = 'again' | 'hard' | 'good' | 'easy'

export function initialSm2(now = new Date()): Sm2State {
  return {
    ease: 2.5,
    intervalDays: 0,
    repetitions: 0,
    dueAt: now.toISOString(),
  }
}

/**
 * Apply SM-2 style update. Ratings map to quality 0–5.
 * again=1, hard=3, good=4, easy=5
 */
export function applySm2(prev: Sm2State, rating: Sm2Rating, now = new Date()): Sm2State {
  const quality =
    rating === 'again' ? 1 : rating === 'hard' ? 3 : rating === 'good' ? 4 : 5

  let { ease, intervalDays, repetitions } = prev

  if (quality < 3) {
    repetitions = 0
    intervalDays = 0
  } else {
    if (repetitions === 0) intervalDays = 1
    else if (repetitions === 1) intervalDays = 3
    else intervalDays = Math.max(1, Math.round(intervalDays * ease))
    repetitions += 1
  }

  ease = Math.max(
    1.3,
    ease + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02)),
  )

  if (rating === 'hard' && intervalDays > 1) {
    intervalDays = Math.max(1, Math.round(intervalDays * 0.8))
  }
  if (rating === 'easy') {
    intervalDays = Math.max(1, Math.round(intervalDays * 1.3))
    ease += 0.15
  }

  const due = new Date(now.getTime() + intervalDays * 24 * 60 * 60 * 1000)
  return {
    ease: Math.round(ease * 100) / 100,
    intervalDays,
    repetitions,
    dueAt: due.toISOString(),
  }
}
