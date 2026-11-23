import { useEffect, useMemo, useState } from 'react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { dataClient } from '@/lib/amplifyData'
import {
  normalizeAttemptQuestions,
  parseAttemptPayload,
} from '@/lib/attempts'
import { listAllAttempts, listAllMaterials } from '@/lib/listAll'
import { selectMaterialContext } from '@/lib/materialContext'
import { applySm2, initialSm2, type Sm2Rating } from '@/lib/sm2'
import type { Schema } from '../../amplify/data/resource'

type Material = Schema['Material']['type']
type Attempt = Schema['Attempt']['type']
type Flashcard = Schema['Flashcard']['type']

type DraftCard = {
  front: string
  back: string
  topic: string
}

async function listFlashcards(): Promise<Flashcard[]> {
  const rows: Flashcard[] = []
  let nextToken: string | null | undefined
  do {
    const result = await dataClient.models.Flashcard.list({
      limit: 100,
      nextToken: nextToken ?? undefined,
    })
    if (result.errors?.length) {
      throw new Error(result.errors.map((e) => e.message).join('; '))
    }
    rows.push(...(result.data ?? []))
    nextToken = result.nextToken
  } while (nextToken)
  return rows
}

function wrongAnswerContext(attempt: Attempt): string | null {
  const payload = parseAttemptPayload(attempt)
  const questions = normalizeAttemptQuestions(payload.questions)
  const grades = new Map((payload.grades ?? []).map((g) => [g.id, g]))
  const misses: string[] = []
  for (const q of questions) {
    const answer = (payload.answers?.[q.id] ?? '').trim()
    const isObjective = q.type === 'multiple_choice' || q.type === 'true_false'
    if (isObjective && q.correctAnswer) {
      const ok =
        answer.toLowerCase() === String(q.correctAnswer).trim().toLowerCase()
      if (!ok) {
        misses.push(
          `Q: ${q.stem}\nStudent: ${answer || '(blank)'}\nCorrect: ${q.correctAnswer}\nExplain: ${q.explanation ?? ''}`,
        )
      }
      continue
    }
    const grade = grades.get(q.id)
    if (grade && grade.score < 70) {
      misses.push(
        `Q: ${q.stem}\nStudent: ${answer || '(blank)'}\nScore: ${grade.score}\nFeedback: ${grade.feedback}`,
      )
    }
  }
  if (misses.length === 0) return null
  return `Practice attempt scope: ${attempt.scope}\nMissed items to turn into flashcards:\n\n${misses.slice(0, 12).join('\n\n')}`
}

export function FlashcardsPage() {
  const [cards, setCards] = useState<Flashcard[]>([])
  const [materials, setMaterials] = useState<Material[]>([])
  const [attempts, setAttempts] = useState<Attempt[]>([])
  const [mode, setMode] = useState<'list' | 'review' | 'drafts'>('list')
  const [reviewIndex, setReviewIndex] = useState(0)
  const [flipped, setFlipped] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sourceMaterialId, setSourceMaterialId] = useState('')
  const [sourceAttemptId, setSourceAttemptId] = useState('')
  const [topicHint, setTopicHint] = useState('Paramedic coursework')
  const [drafts, setDrafts] = useState<DraftCard[]>([])
  const [pendingSource, setPendingSource] = useState<{
    sourceType: 'material' | 'attempt'
    sourceId?: string
  } | null>(null)

  const dueCards = useMemo(() => {
    const now = Date.now()
    return [...cards]
      .filter((c) => new Date(c.dueAt).getTime() <= now)
      .sort((a, b) => a.dueAt.localeCompare(b.dueAt))
  }, [cards])

  const current = mode === 'review' ? dueCards[reviewIndex] : undefined

  async function reload() {
    const [c, m, a] = await Promise.all([
      listFlashcards(),
      listAllMaterials(),
      listAllAttempts(),
    ])
    setCards(c)
    setMaterials(m)
    setAttempts(a)
    if (!sourceMaterialId && m[0]?.id) setSourceMaterialId(m[0].id)
    if (!sourceAttemptId && a[0]?.id) setSourceAttemptId(a[0].id)
  }

  useEffect(() => {
    void (async () => {
      try {
        await reload()
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load flashcards')
      }
    })()
  }, [])

  async function generateFromMaterial() {
    setBusy(true)
    setError(null)
    try {
      const material = materials.find((m) => m.id === sourceMaterialId)
      if (!material?.extractedText?.trim()) {
        throw new Error('Select a material with extracted text')
      }
      const selected = selectMaterialContext(
        [material],
        topicHint || material.filename,
        16000,
      )
      await draftFromContext(selected.context, 'material', material.id ?? undefined)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Generation failed')
    } finally {
      setBusy(false)
    }
  }

  async function generateFromAttempt() {
    setBusy(true)
    setError(null)
    try {
      const attempt = attempts.find((a) => a.id === sourceAttemptId)
      if (!attempt) throw new Error('Select an attempt')
      const context = `Practice attempt scope: ${attempt.scope}\nScore: ${attempt.scorePercent}%\nPayload:\n${attempt.payloadJson.slice(0, 16000)}`
      await draftFromContext(context, 'attempt', attempt.id ?? undefined)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Generation failed')
    } finally {
      setBusy(false)
    }
  }

  async function generateFromWrongAnswers() {
    setBusy(true)
    setError(null)
    try {
      const attempt = attempts.find((a) => a.id === sourceAttemptId)
      if (!attempt) throw new Error('Select an attempt')
      const context = wrongAnswerContext(attempt)
      if (!context) {
        throw new Error('No missed questions found on that attempt')
      }
      await draftFromContext(context, 'attempt', attempt.id ?? undefined)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Generation failed')
    } finally {
      setBusy(false)
    }
  }

  async function draftFromContext(
    context: string,
    sourceType: 'material' | 'attempt',
    sourceId?: string,
  ) {
    const { data, errors } = await dataClient.mutations.generateFlashcards({
      context,
      count: 8,
      topicHint,
    })
    if (errors?.length) throw new Error(errors.map((e) => e.message).join('; '))
    const payload =
      typeof data === 'string'
        ? (JSON.parse(data) as {
            cards?: Array<{ front: string; back: string; topic: string }>
          })
        : ((data ?? {}) as {
            cards?: Array<{ front: string; back: string; topic: string }>
          })
    const generated = Array.isArray(payload.cards) ? payload.cards : []
    if (generated.length === 0) throw new Error('No flashcards returned')

    setDrafts(
      generated.map((c) => ({
        front: c.front,
        back: c.back,
        topic: c.topic || topicHint,
      })),
    )
    setPendingSource({ sourceType, sourceId })
    setMode('drafts')
  }

  function updateDraft(index: number, patch: Partial<DraftCard>) {
    setDrafts((prev) =>
      prev.map((d, i) => (i === index ? { ...d, ...patch } : d)),
    )
  }

  function removeDraft(index: number) {
    setDrafts((prev) => prev.filter((_, i) => i !== index))
  }

  async function saveDrafts() {
    if (!pendingSource) return
    const usable = drafts.filter((d) => d.front.trim() && d.back.trim())
    if (usable.length === 0) {
      setError('Add at least one card with front and back text')
      return
    }
    setBusy(true)
    setError(null)
    try {
      const sm = initialSm2()
      const createdAt = new Date().toISOString()
      for (const card of usable) {
        const { errors: createErrors } = await dataClient.models.Flashcard.create({
          front: card.front.trim(),
          back: card.back.trim(),
          topic: card.topic.trim() || topicHint,
          sourceType: pendingSource.sourceType,
          sourceId: pendingSource.sourceId,
          ease: sm.ease,
          intervalDays: sm.intervalDays,
          repetitions: sm.repetitions,
          dueAt: sm.dueAt,
          createdAt,
        })
        if (createErrors?.length) {
          throw new Error(createErrors.map((e) => e.message).join('; '))
        }
      }
      setDrafts([])
      setPendingSource(null)
      setMode('list')
      await reload()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed')
    } finally {
      setBusy(false)
    }
  }

  function startReview() {
    if (dueCards.length === 0) {
      setError('No cards due. Generate some or wait for the next review interval.')
      return
    }
    setError(null)
    setMode('review')
    setReviewIndex(0)
    setFlipped(false)
  }

  async function rate(rating: Sm2Rating) {
    if (!current?.id) return
    setBusy(true)
    try {
      const next = applySm2(
        {
          ease: current.ease,
          intervalDays: current.intervalDays,
          repetitions: current.repetitions,
          dueAt: current.dueAt,
        },
        rating,
      )
      const { errors } = await dataClient.models.Flashcard.update({
        id: current.id,
        ease: next.ease,
        intervalDays: next.intervalDays,
        repetitions: next.repetitions,
        dueAt: next.dueAt,
      })
      if (errors?.length) throw new Error(errors.map((e) => e.message).join('; '))
      await reload()
      setFlipped(false)
      setReviewIndex((i) => {
        const remaining = dueCards.length - 1
        if (remaining <= 0) {
          setMode('list')
          return 0
        }
        return Math.min(i, remaining - 1)
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update card')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Flashcards</h1>
        <p className="text-muted-foreground text-sm">
          Generate from materials or wrong answers; edit drafts before saving.
        </p>
      </div>

      {error ? (
        <Alert>
          <AlertTitle>Flashcards</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      {mode === 'drafts' ? (
        <Card>
          <CardHeader>
            <CardTitle>Review drafts</CardTitle>
            <CardDescription>
              Edit front/back, remove weak cards, then save to your deck.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {drafts.length === 0 ? (
              <p className="text-muted-foreground text-sm">No drafts left.</p>
            ) : (
              drafts.map((d, i) => (
                <div
                  key={i}
                  className="border-border space-y-2 rounded-md border p-3"
                >
                  <Label htmlFor={`front-${i}`}>Front</Label>
                  <textarea
                    id={`front-${i}`}
                    rows={2}
                    className="border-input bg-background w-full rounded-md border px-3 py-2 text-sm"
                    value={d.front}
                    onChange={(e) => updateDraft(i, { front: e.target.value })}
                  />
                  <Label htmlFor={`back-${i}`}>Back</Label>
                  <textarea
                    id={`back-${i}`}
                    rows={2}
                    className="border-input bg-background w-full rounded-md border px-3 py-2 text-sm"
                    value={d.back}
                    onChange={(e) => updateDraft(i, { back: e.target.value })}
                  />
                  <Label htmlFor={`topic-${i}`}>Topic</Label>
                  <input
                    id={`topic-${i}`}
                    className="border-input bg-background w-full rounded-md border px-3 py-2 text-sm"
                    value={d.topic}
                    onChange={(e) => updateDraft(i, { topic: e.target.value })}
                  />
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => removeDraft(i)}
                  >
                    Remove
                  </Button>
                </div>
              ))
            )}
          </CardContent>
          <CardFooter className="flex flex-wrap gap-2">
            <Button type="button" disabled={busy} onClick={() => void saveDrafts()}>
              {busy ? 'Saving…' : 'Save cards'}
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={() => {
                setDrafts([])
                setPendingSource(null)
                setMode('list')
              }}
            >
              Discard
            </Button>
          </CardFooter>
        </Card>
      ) : null}

      {mode === 'list' ? (
        <>
          <Card>
            <CardHeader>
              <CardTitle>Generate</CardTitle>
              <CardDescription>
                Cards are private to your Cognito account. Drafts appear for
                edit-before-save.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <div className="flex flex-col gap-2">
                <Label htmlFor="topic">Topic hint</Label>
                <input
                  id="topic"
                  className="border-input bg-background focus-visible:ring-ring rounded-md border px-3 py-2 text-sm outline-none focus-visible:ring-2"
                  value={topicHint}
                  onChange={(e) => setTopicHint(e.target.value)}
                />
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="material">From material / chapter</Label>
                <select
                  id="material"
                  className="border-input bg-background rounded-md border px-3 py-2 text-sm"
                  value={sourceMaterialId}
                  onChange={(e) => setSourceMaterialId(e.target.value)}
                >
                  {materials.length === 0 ? (
                    <option value="">No materials</option>
                  ) : (
                    materials.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.filename}
                      </option>
                    ))
                  )}
                </select>
                <Button
                  type="button"
                  disabled={busy || materials.length === 0}
                  onClick={() => void generateFromMaterial()}
                >
                  {busy ? 'Generating…' : 'Generate from material'}
                </Button>
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="attempt">From attempt</Label>
                <select
                  id="attempt"
                  className="border-input bg-background rounded-md border px-3 py-2 text-sm"
                  value={sourceAttemptId}
                  onChange={(e) => setSourceAttemptId(e.target.value)}
                >
                  {attempts.length === 0 ? (
                    <option value="">No attempts</option>
                  ) : (
                    attempts.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.scope.slice(0, 60)} ({a.scorePercent}%)
                      </option>
                    ))
                  )}
                </select>
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    disabled={busy || attempts.length === 0}
                    onClick={() => void generateFromAttempt()}
                  >
                    Generate from attempt
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    disabled={busy || attempts.length === 0}
                    onClick={() => void generateFromWrongAnswers()}
                  >
                    From wrong answers
                  </Button>
                </div>
              </div>
            </CardContent>
            <CardFooter className="flex flex-wrap gap-2">
              <Badge variant="secondary">{cards.length} cards</Badge>
              <Badge variant="outline">{dueCards.length} due</Badge>
              <Button type="button" onClick={startReview}>
                Review due cards
              </Button>
            </CardFooter>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Deck</CardTitle>
            </CardHeader>
            <CardContent>
              {cards.length === 0 ? (
                <p className="text-muted-foreground text-sm">
                  No flashcards yet. Generate from a chapter or practice attempt.
                </p>
              ) : (
                <ul className="divide-border max-h-96 divide-y overflow-auto text-sm">
                  {cards.slice(0, 40).map((c) => (
                    <li key={c.id} className="py-2">
                      <p className="font-medium">{c.front}</p>
                      <p className="text-muted-foreground text-xs">
                        {c.topic} · due {new Date(c.dueAt).toLocaleString()}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </>
      ) : null}

      {mode === 'review' && current ? (
        <Card>
          <CardHeader>
            <CardDescription>
              Card {reviewIndex + 1} of {dueCards.length} · {current.topic}
            </CardDescription>
            <CardTitle className="text-lg">
              {flipped ? current.back : current.front}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Button
              type="button"
              variant="outline"
              onClick={() => setFlipped((f) => !f)}
            >
              {flipped ? 'Show front' : 'Show back'}
            </Button>
          </CardContent>
          <CardFooter className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="destructive"
              disabled={busy || !flipped}
              onClick={() => void rate('again')}
            >
              Again
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={busy || !flipped}
              onClick={() => void rate('hard')}
            >
              Hard
            </Button>
            <Button
              type="button"
              disabled={busy || !flipped}
              onClick={() => void rate('good')}
            >
              Good
            </Button>
            <Button
              type="button"
              variant="secondary"
              disabled={busy || !flipped}
              onClick={() => void rate('easy')}
            >
              Easy
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() => setMode('list')}
            >
              Exit review
            </Button>
          </CardFooter>
        </Card>
      ) : null}

      {mode === 'review' && !current ? (
        <Card>
          <CardHeader>
            <CardTitle>Review complete</CardTitle>
            <CardDescription>No more cards due right now.</CardDescription>
          </CardHeader>
          <CardFooter>
            <Button type="button" onClick={() => setMode('list')}>
              Back to deck
            </Button>
          </CardFooter>
        </Card>
      ) : null}
    </div>
  )
}
