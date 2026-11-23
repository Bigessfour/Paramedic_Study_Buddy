import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { buttonVariants } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { listAttempts } from '@/lib/attempts'
import { dataClient } from '@/lib/amplifyData'
import { buildProgressMap, type ProgressRow } from '@/lib/progress'
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

export function ProgressPage() {
  const [rows, setRows] = useState<ProgressRow[]>([])
  const [filter, setFilter] = useState<'all' | 'studied' | 'weak'>('studied')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const [attempts, cards] = await Promise.all([
          listAttempts(200),
          listFlashcards(),
        ])
        if (!cancelled) setRows(buildProgressMap(attempts, cards))
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load progress')
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const visible = rows.filter((r) => {
    if (filter === 'all') return true
    if (filter === 'weak') return r.weak
    return r.attemptCount > 0 || r.dueCards > 0 || r.lastStudiedAt != null
  })

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Progress</h1>
          <p className="text-muted-foreground text-sm">
            Chapter and topic coverage from your attempts and flashcards.
          </p>
        </div>
        <Link to="/practice" className={cn(buttonVariants())}>
          Practice
        </Link>
      </div>

      {error ? <p className="text-destructive text-sm">{error}</p> : null}

      <Card>
        <CardHeader>
          <CardTitle>Chapter / topic map</CardTitle>
          <CardDescription>
            Basic coverage and last-studied signals. Weak = average under 70%.
          </CardDescription>
          <div className="flex flex-wrap gap-2 pt-2">
            {(
              [
                ['studied', 'Studied'],
                ['weak', 'Weak'],
                ['all', 'All chapters'],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                className={cn(
                  buttonVariants({
                    variant: filter === key ? 'default' : 'outline',
                    size: 'sm',
                  }),
                )}
                onClick={() => setFilter(key)}
              >
                {label}
              </button>
            ))}
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-muted-foreground text-sm">Loading…</p>
          ) : visible.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              No progress yet. Complete a practice test or review flashcards.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Topic</TableHead>
                  <TableHead className="text-right">Attempts</TableHead>
                  <TableHead className="text-right">Avg</TableHead>
                  <TableHead className="text-right">Due cards</TableHead>
                  <TableHead>Last studied</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {visible.slice(0, 80).map((r) => (
                  <TableRow key={r.key}>
                    <TableCell className="font-medium">
                      {r.label}
                      {r.weak ? (
                        <span className="text-destructive ml-2 text-xs">weak</span>
                      ) : null}
                    </TableCell>
                    <TableCell className="text-right">{r.attemptCount}</TableCell>
                    <TableCell className="text-right">
                      {r.avgScore == null ? '—' : `${r.avgScore}%`}
                    </TableCell>
                    <TableCell className="text-right">{r.dueCards}</TableCell>
                    <TableCell className="text-muted-foreground text-xs">
                      {r.lastStudiedAt
                        ? new Date(r.lastStudiedAt).toLocaleDateString()
                        : '—'}
                    </TableCell>
                    <TableCell className="text-right">
                      <Link
                        className="text-primary text-xs underline-offset-2 hover:underline"
                        to={`/practice?scope=${encodeURIComponent(r.label)}`}
                      >
                        Practice
                      </Link>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
