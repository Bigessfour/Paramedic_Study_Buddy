import { useEffect, useMemo, useState, type FormEvent } from 'react'
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
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { dataClient } from '@/lib/amplifyData'
import { selectMaterialContext } from '@/lib/materialContext'
import type { Schema } from '../../amplify/data/resource'

type Material = Schema['Material']['type']

type Question = {
  id: string
  type: 'multiple_choice' | 'written' | 'true_false'
  stem: string
  options?: string[]
  correctAnswer?: string
  rubric?: string
  explanation?: string
}

type WrittenGrade = {
  id: string
  score: number
  feedback: string
}

type Phase = 'setup' | 'taking' | 'results'

export function PracticeTestPage() {
  const [materials, setMaterials] = useState<Material[]>([])
  const [scope, setScope] = useState('Chapters on airway and ventilation')
  const [questionCount, setQuestionCount] = useState(5)
  const [mcPercent, setMcPercent] = useState(60)
  const [phase, setPhase] = useState<Phase>('setup')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [questions, setQuestions] = useState<Question[]>([])
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [usedSample, setUsedSample] = useState(false)
  const [contextUsed, setContextUsed] = useState('')
  const [writtenGrades, setWrittenGrades] = useState<WrittenGrade[]>([])
  const [mcCorrect, setMcCorrect] = useState(0)
  const [mcTotal, setMcTotal] = useState(0)
  const [scorePercent, setScorePercent] = useState(0)

  useEffect(() => {
    void (async () => {
      const { data } = await dataClient.models.Material.list({ limit: 200 })
      setMaterials(data ?? [])
    })()
  }, [])

  const readyCount = useMemo(
    () =>
      materials.filter(
        (m) => m.extractStatus === 'ready' && (m.extractedText?.trim()?.length ?? 0) > 0,
      ).length,
    [materials],
  )

  async function onGenerate(event: FormEvent) {
    event.preventDefault()
    setError(null)
    setBusy(true)
    try {
      const selected = selectMaterialContext(materials, scope)
      setUsedSample(selected.usedSample)
      setContextUsed(selected.context)

      const { data, errors } = await dataClient.mutations.generatePracticeTest({
        scope: scope.trim(),
        questionCount,
        mcPercent,
        context: selected.context,
      })
      if (errors?.length) {
        throw new Error(errors.map((e) => e.message).join('; '))
      }

      const payload =
        typeof data === 'string'
          ? (JSON.parse(data) as { questions?: Question[] })
          : ((data ?? {}) as { questions?: Question[] })

      const nextQuestions = Array.isArray(payload.questions)
        ? payload.questions
        : []
      if (nextQuestions.length === 0) {
        throw new Error('No questions were generated. Try a broader scope.')
      }

      setQuestions(nextQuestions)
      setAnswers({})
      setWrittenGrades([])
      setPhase('taking')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Generation failed')
    } finally {
      setBusy(false)
    }
  }

  async function onSubmitTest(event: FormEvent) {
    event.preventDefault()
    setError(null)
    setBusy(true)
    try {
      const objective = questions.filter(
        (q) => q.type === 'multiple_choice' || q.type === 'true_false',
      )
      let correct = 0
      for (const q of objective) {
        const given = (answers[q.id] ?? '').trim()
        if (
          given &&
          q.correctAnswer &&
          given.toLowerCase() === q.correctAnswer.toLowerCase()
        ) {
          correct += 1
        }
      }

      const written = questions.filter((q) => q.type === 'written')
      let grades: WrittenGrade[] = []
      if (written.length > 0) {
        const items = written.map((q) => ({
          id: q.id,
          stem: q.stem,
          rubric: q.rubric ?? '',
          answer: answers[q.id] ?? '',
        }))
        const { data, errors } = await dataClient.mutations.gradeWrittenAnswers({
          context: contextUsed,
          itemsJson: JSON.stringify(items),
        })
        if (errors?.length) {
          throw new Error(errors.map((e) => e.message).join('; '))
        }
        const payload =
          typeof data === 'string'
            ? (JSON.parse(data) as { grades?: WrittenGrade[] })
            : ((data ?? {}) as { grades?: WrittenGrade[] })
        grades = Array.isArray(payload.grades)
          ? payload.grades.map((g) => ({
              id: String(g.id),
              score: Number(g.score) || 0,
              feedback: String(g.feedback ?? ''),
            }))
          : []
      }

      const writtenAvg =
        grades.length > 0
          ? grades.reduce((sum, g) => sum + g.score, 0) / grades.length
          : null
      const objectiveScore =
        objective.length > 0 ? (correct / objective.length) * 100 : null

      let overall = 0
      if (objectiveScore != null && writtenAvg != null) {
        overall = objectiveScore * 0.6 + writtenAvg * 0.4
      } else if (objectiveScore != null) {
        overall = objectiveScore
      } else if (writtenAvg != null) {
        overall = writtenAvg
      }

      const payloadJson = JSON.stringify({
        questions,
        answers,
        grades,
        usedSample,
      })

      const { errors: saveErrors } = await dataClient.models.Attempt.create({
        scope: scope.trim(),
        questionCount: questions.length,
        scorePercent: Math.round(overall * 10) / 10,
        mcCorrect: correct,
        mcTotal: objective.length,
        writtenAvgScore: writtenAvg ?? undefined,
        writtenTotal: written.length,
        usedSampleContext: usedSample,
        payloadJson,
        completedAt: new Date().toISOString(),
      })
      if (saveErrors?.length) {
        throw new Error(saveErrors.map((e) => e.message).join('; '))
      }

      setMcCorrect(correct)
      setMcTotal(objective.length)
      setWrittenGrades(grades)
      setScorePercent(Math.round(overall * 10) / 10)
      setPhase('results')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Submit failed')
    } finally {
      setBusy(false)
    }
  }

  function setAnswer(id: string, value: string) {
    setAnswers((prev) => ({ ...prev, [id]: value }))
  }

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Practice Test</h1>
        <p className="text-muted-foreground text-sm">
          Generate MC, true/false, and written questions from your materials
          (or sample notes until textbooks are uploaded).
        </p>
      </div>

      {readyCount === 0 ? (
        <Alert>
          <AlertTitle>No textbook materials yet</AlertTitle>
          <AlertDescription>
            Generation will use labeled sample paramedic notes so you can test
            the flow. Upload PDFs/DOCX on Materials when you have access.
          </AlertDescription>
        </Alert>
      ) : (
        <Alert>
          <AlertTitle>{readyCount} material(s) ready</AlertTitle>
          <AlertDescription>
            Relevant extracted text will be selected from your uploads for this
            scope.
          </AlertDescription>
        </Alert>
      )}

      {error ? (
        <Alert variant="destructive">
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      {phase === 'setup' ? (
        <Card>
          <CardHeader>
            <CardTitle>Exam scope</CardTitle>
            <CardDescription>
              Describe what the next exam covers. Default mix is ~60% multiple
              choice.
            </CardDescription>
          </CardHeader>
          <form onSubmit={onGenerate}>
            <CardContent className="flex flex-col gap-4">
              <div className="flex flex-col gap-2">
                <Label htmlFor="scope">Scope / topics</Label>
                <textarea
                  id="scope"
                  required
                  rows={4}
                  className="border-input bg-background focus-visible:ring-ring min-h-24 w-full rounded-md border px-3 py-2 text-sm outline-none focus-visible:ring-2"
                  value={scope}
                  onChange={(e) => setScope(e.target.value)}
                />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="flex flex-col gap-2">
                  <Label htmlFor="count">Number of questions</Label>
                  <Input
                    id="count"
                    type="number"
                    min={3}
                    max={15}
                    value={questionCount}
                    onChange={(e) => setQuestionCount(Number(e.target.value))}
                  />
                </div>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="mc">Multiple choice %</Label>
                  <Input
                    id="mc"
                    type="number"
                    min={0}
                    max={100}
                    value={mcPercent}
                    onChange={(e) => setMcPercent(Number(e.target.value))}
                  />
                </div>
              </div>
            </CardContent>
            <CardFooter>
              <Button type="submit" disabled={busy}>
                {busy ? 'Generating…' : 'Generate practice test'}
              </Button>
            </CardFooter>
          </form>
        </Card>
      ) : null}

      {phase === 'taking' ? (
        <form className="flex flex-col gap-4" onSubmit={onSubmitTest}>
          {usedSample ? (
            <Badge variant="outline">Using sample context</Badge>
          ) : (
            <Badge variant="secondary">Using your materials</Badge>
          )}
          {questions.map((q, index) => (
            <Card key={q.id}>
              <CardHeader>
                <CardTitle className="text-base">
                  {index + 1}. {q.stem}
                </CardTitle>
                <CardDescription className="capitalize">
                  {q.type.replace('_', ' ')}
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-2">
                {q.type === 'written' ? (
                  <textarea
                    required
                    rows={4}
                    className="border-input bg-background focus-visible:ring-ring w-full rounded-md border px-3 py-2 text-sm outline-none focus-visible:ring-2"
                    value={answers[q.id] ?? ''}
                    onChange={(e) => setAnswer(q.id, e.target.value)}
                  />
                ) : (
                  (q.options ?? []).map((option) => (
                    <label
                      key={option}
                      className="border-border hover:bg-muted/40 flex items-center gap-2 rounded-md border px-3 py-2 text-sm"
                    >
                      <input
                        type="radio"
                        name={q.id}
                        required
                        value={option}
                        checked={(answers[q.id] ?? '') === option}
                        onChange={() => setAnswer(q.id, option)}
                      />
                      {option}
                    </label>
                  ))
                )}
              </CardContent>
            </Card>
          ))}
          <div className="flex gap-2">
            <Button type="submit" disabled={busy}>
              {busy ? 'Scoring…' : 'Submit answers'}
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={() => setPhase('setup')}
            >
              Cancel
            </Button>
          </div>
        </form>
      ) : null}

      {phase === 'results' ? (
        <div className="flex flex-col gap-4">
          <Card>
            <CardHeader>
              <CardTitle>Results</CardTitle>
              <CardDescription>
                Overall score {scorePercent}% · Objective {mcCorrect}/{mcTotal}
                {writtenGrades.length
                  ? ` · Written avg ${Math.round(
                      writtenGrades.reduce((s, g) => s + g.score, 0) /
                        writtenGrades.length,
                    )}%`
                  : ''}
              </CardDescription>
            </CardHeader>
            <CardContent className="text-muted-foreground text-sm">
              Attempt saved to your history for Phase 4.
            </CardContent>
            <CardFooter>
              <Button type="button" onClick={() => setPhase('setup')}>
                New practice test
              </Button>
            </CardFooter>
          </Card>

          {questions.map((q) => {
            const grade = writtenGrades.find((g) => g.id === q.id)
            const given = answers[q.id] ?? ''
            const objectiveOk =
              (q.type === 'multiple_choice' || q.type === 'true_false') &&
              given.toLowerCase() === (q.correctAnswer ?? '').toLowerCase()
            return (
              <Card key={q.id}>
                <CardHeader>
                  <CardTitle className="text-base">{q.stem}</CardTitle>
                  <CardDescription>
                    Your answer: {given || '—'}
                    {q.type !== 'written' ? (
                      <>
                        {' '}
                        · Correct: {q.correctAnswer}{' '}
                        <Badge variant={objectiveOk ? 'secondary' : 'destructive'}>
                          {objectiveOk ? 'Correct' : 'Incorrect'}
                        </Badge>
                      </>
                    ) : null}
                  </CardDescription>
                </CardHeader>
                <CardContent className="text-sm">
                  {grade ? (
                    <p>
                      Written score {grade.score}/100 — {grade.feedback}
                    </p>
                  ) : null}
                  {q.explanation ? (
                    <p className="text-muted-foreground mt-2">{q.explanation}</p>
                  ) : null}
                </CardContent>
              </Card>
            )
          })}
        </div>
      ) : null}
    </div>
  )
}
