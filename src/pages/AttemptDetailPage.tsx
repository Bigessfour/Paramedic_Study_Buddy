import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { dataClient } from '@/lib/amplifyData'
import {
  parseAttemptPayload,
  type Attempt,
  type AttemptPayload,
} from '@/lib/attempts'
import {
  attemptToMarkdown,
  copyText,
  downloadText,
} from '@/lib/exportAttempt'
import { saveTutorExplainSeed } from '@/lib/tutorSeed'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Button, buttonVariants } from '@/components/ui/button'
import { cn } from 'cn'

export function AttemptDetailPage() {
  const { attemptId } = useParams<{ attemptId: string }>()
  const navigate = useNavigate()
  const [attempt, setAttempt] = useState<Attempt | null>(null)
  const [payload, setPayload] = useState<AttemptPayload>({})
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [exportMsg, setExportMsg] = useState<string | null>(null)

  useEffect(() => {
    if (!attemptId) return
    let cancelled = false
    ;(async () => {
      try {
        const { data, errors } = await dataClient.models.Attempt.get({
          id: attemptId,
        })
        if (errors?.length) {
          throw new Error(errors.map((e) => e.message).join('; '))
        }
        if (!data) throw new Error('Attempt not found')
        if (!cancelled) {
          setAttempt(data)
          setPayload(parseAttemptPayload(data))
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load attempt')
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [attemptId])

  const gradeById = new Map(
    (payload.grades ?? []).map((g) => [g.id, g] as const),
  )

  function exportMarkdown() {
    if (!attempt) return
    return attemptToMarkdown(attempt, payload)
  }

  async function onCopy() {
    const md = exportMarkdown()
    if (!md) return
    try {
      await copyText(md)
      setExportMsg('Copied Markdown to clipboard')
    } catch {
      setExportMsg('Could not copy — try Download instead')
    }
  }

  function onDownload() {
    const md = exportMarkdown()
    if (!md || !attempt) return
    const stamp = (attempt.completedAt ?? 'attempt').slice(0, 10)
    downloadText(`attempt-${stamp}.md`, md)
    setExportMsg('Download started')
  }

  function explainMissed(opts: {
    stem: string
    userAnswer: string
    correctAnswer?: string
    rubric?: string
    explanation?: string
  }) {
    if (!attempt) return
    saveTutorExplainSeed({
      ...opts,
      scope: attempt.scope,
      attemptId: attempt.id ?? undefined,
    })
    navigate('/tutor?explain=1')
  }

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Attempt detail</h1>
          <p className="text-muted-foreground text-sm">
            {attempt?.scope ?? (loading ? 'Loading…' : '—')}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" size="sm" onClick={() => void onCopy()}>
            Copy Markdown
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={onDownload}>
            Download .md
          </Button>
          <Link
            to="/history"
            className={cn(buttonVariants({ variant: 'outline' }))}
          >
            Back to history
          </Link>
        </div>
      </div>

      {error ? <p className="text-destructive text-sm">{error}</p> : null}
      {exportMsg ? <p className="text-muted-foreground text-sm">{exportMsg}</p> : null}

      {attempt ? (
        <Card>
          <CardHeader>
            <CardTitle>{attempt.scorePercent}%</CardTitle>
            <CardDescription>
              {attempt.completedAt
                ? new Date(attempt.completedAt).toLocaleString()
                : '—'}{' '}
              · {attempt.questionCount} questions · MC {attempt.mcCorrect}/
              {attempt.mcTotal}
              {attempt.writtenTotal > 0
                ? ` · Written avg ${attempt.writtenAvgScore ?? '—'}`
                : ''}
              {attempt.usedSampleContext ? ' · sample context' : ''}
              {payload.mode ? ` · ${payload.mode}` : ''}
            </CardDescription>
          </CardHeader>
        </Card>
      ) : null}

      {payload.vignette ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Vignette</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="whitespace-pre-wrap text-sm">{payload.vignette}</p>
          </CardContent>
        </Card>
      ) : null}

      <div className="flex flex-col gap-4">
        {(payload.questions ?? []).map((q, index) => {
          const answer = payload.answers?.[q.id] ?? ''
          const grade = gradeById.get(q.id)
          const isObjective = q.type === 'multiple_choice' || q.type === 'true_false'
          const correct =
            isObjective && q.correctAnswer
              ? answer.trim().toLowerCase() ===
                String(q.correctAnswer).trim().toLowerCase()
              : null
          const writtenMiss =
            !isObjective && grade != null && grade.score < 70
          const missed = correct === false || writtenMiss

          return (
            <Card key={q.id}>
              <CardHeader className="pb-2">
                <CardDescription>
                  Q{index + 1} · {q.type.replaceAll('_', ' ')}
                  {correct === true
                    ? ' · correct'
                    : correct === false
                      ? ' · incorrect'
                      : writtenMiss
                        ? ' · needs review'
                        : ''}
                </CardDescription>
                <CardTitle className="text-base font-medium leading-snug">
                  {q.stem}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                {q.options?.length ? (
                  <ul className="text-muted-foreground list-disc space-y-1 pl-5">
                    {q.options.map((c) => (
                      <li key={c}>{c}</li>
                    ))}
                  </ul>
                ) : null}
                <p>
                  <span className="text-muted-foreground">Your answer: </span>
                  {answer || '—'}
                </p>
                {isObjective && q.correctAnswer ? (
                  <p>
                    <span className="text-muted-foreground">Correct: </span>
                    {q.correctAnswer}
                  </p>
                ) : null}
                {grade ? (
                  <p>
                    Written score {grade.score}/100 — {grade.feedback}
                  </p>
                ) : null}
                {q.explanation ? (
                  <p className="text-muted-foreground">{q.explanation}</p>
                ) : null}
                {missed ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    onClick={() =>
                      explainMissed({
                        stem: q.stem,
                        userAnswer: answer,
                        correctAnswer: q.correctAnswer,
                        explanation: q.explanation,
                      })
                    }
                  >
                    Explain this
                  </Button>
                ) : null}
              </CardContent>
            </Card>
          )
        })}
        {!loading && (payload.questions?.length ?? 0) === 0 ? (
          <p className="text-muted-foreground text-sm">
            No question payload stored for this attempt.
          </p>
        ) : null}
      </div>
    </div>
  )
}
