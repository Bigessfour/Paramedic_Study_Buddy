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
import { listAllAttempts, listAllMaterials } from '@/lib/listAll'
import { selectMaterialContext } from '@/lib/materialContext'
import { applySm2, initialSm2, type Sm2Rating } from '@/lib/sm2'
import type { Schema } from '../../amplify/data/resource'

type Material = Schema['Material']['type']
type Attempt = Schema['Attempt']['type']
type Flashcard = Schema['Flashcard']['type']

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

export function FlashcardsPage() {
  const [cards, setCards] = useState<Flashcard[]>([])
  const [materials, setMaterials] = useState<Material[]>([])
  const [attempts, setAttempts] = useState<Attempt[]>([])
  const [mode, setMode] = useState<'list' | 'review'>('list')
  const [reviewIndex, setReviewIndex] = useState(0)
  const [flipped, setFlipped] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sourceMaterialId, setSourceMaterialId] = useState('')
  const [sourceAttemptId, setSourceAttemptId] = useState('')
  const [topicHint, setTopicHint] = useState('Paramedic coursework')

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
      await createFromContext(selected.context, 'material', material.id ?? undefined)
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
      await createFromContext(context, 'attempt', attempt.id ?? undefined)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Generation failed')
    } finally {
      setBusy(false)
    }
  }

  async function createFromContext(
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

    const sm = initialSm2()
    const createdAt = new Date().toISOString()
    for (const card of generated) {
      const { errors: createErrors } = await dataClient.models.Flashcard.create({
        front: card.front,
        back: card.back,
        topic: card.topic || topicHint,
        sourceType,
        sourceId,
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
    await reload()
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
          Generate from materials or attempts; review with basic SM-2 scheduling.
        </p>
      </div>

      {error ? (
        <Alert>
          <AlertTitle>Flashcards</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      {mode === 'list' ? (
        <>
          <Card>
            <CardHeader>
              <CardTitle>Generate</CardTitle>
              <CardDescription>
                Cards are private to your Cognito account.
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
                <Label htmlFor="material">From material</Label>
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
                <Button
                  type="button"
                  variant="outline"
                  disabled={busy || attempts.length === 0}
                  onClick={() => void generateFromAttempt()}
                >
                  Generate from attempt
                </Button>
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
