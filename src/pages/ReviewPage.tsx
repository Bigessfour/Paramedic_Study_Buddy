import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Badge } from '@/components/ui/badge'
import { Button, buttonVariants } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { listAttempts } from '@/lib/attempts'
import { dataClient } from '@/lib/amplifyData'
import { applySm2, type Sm2Rating } from '@/lib/sm2'
import { buildTopicBreakdown, weakTopicsScope } from '@/lib/topics'
import { cn } from '@/lib/utils'
import type { Schema } from '../../amplify/data/resource'

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

export function ReviewPage() {
  const [cards, setCards] = useState<Flashcard[]>([])
  const [weakScope, setWeakScope] = useState<string | null>(null)
  const [index, setIndex] = useState(0)
  const [flipped, setFlipped] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const dueCards = useMemo(() => {
    const now = Date.now()
    return [...cards]
      .filter((c) => new Date(c.dueAt).getTime() <= now)
      .sort((a, b) => a.dueAt.localeCompare(b.dueAt))
  }, [cards])

  const current = dueCards[index]

  async function reload() {
    const [flashcards, attempts] = await Promise.all([
      listFlashcards(),
      listAttempts(50),
    ])
    setCards(flashcards)
    setWeakScope(weakTopicsScope(buildTopicBreakdown(attempts), 3))
  }

  useEffect(() => {
    void (async () => {
      try {
        await reload()
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load review')
      } finally {
        setLoading(false)
      }
    })()
  }, [])

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
      setIndex((i) => {
        const remaining = dueCards.length - 1
        if (remaining <= 0) return 0
        return Math.min(i, remaining - 1)
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update card')
    } finally {
      setBusy(false)
    }
  }

  const quizHref = weakScope
    ? `/practice?scope=${encodeURIComponent(weakScope)}&source=weakness&count=4`
    : '/practice'

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Review today</h1>
        <p className="text-muted-foreground text-sm">
          Due flashcards plus a short weakness-scoped quiz.
        </p>
      </div>

      {error ? <p className="text-destructive text-sm">{error}</p> : null}

      <Card>
        <CardHeader>
          <CardTitle>Quick quiz</CardTitle>
          <CardDescription>
            {weakScope
              ? 'A few questions focused on your weaker topics.'
              : 'No weakness data yet — open a general practice test instead.'}
          </CardDescription>
        </CardHeader>
        <CardFooter>
          <Link to={quizHref} className={cn(buttonVariants())}>
            {weakScope ? 'Start weakness quiz (3–5 Q)' : 'Open practice'}
          </Link>
        </CardFooter>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center gap-2">
            <CardTitle>Due flashcards</CardTitle>
            <Badge variant="secondary">
              {loading ? '…' : `${dueCards.length} due`}
            </Badge>
          </div>
          <CardDescription>SM-2 review for cards due today.</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-muted-foreground text-sm">Loading…</p>
          ) : !current ? (
            <p className="text-muted-foreground text-sm">
              No cards due.{' '}
              <Link
                className="text-primary underline-offset-2 hover:underline"
                to="/flashcards"
              >
                Generate flashcards
              </Link>
              .
            </p>
          ) : (
            <div className="space-y-4">
              <p className="text-muted-foreground text-xs">
                Card {index + 1} of {dueCards.length} · {current.topic}
              </p>
              <p className="text-lg font-medium">
                {flipped ? current.back : current.front}
              </p>
              <Button
                type="button"
                variant="outline"
                onClick={() => setFlipped((f) => !f)}
              >
                {flipped ? 'Show front' : 'Show back'}
              </Button>
              <div className="flex flex-wrap gap-2">
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
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
