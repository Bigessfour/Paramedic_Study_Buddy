import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { useSearchParams } from 'react-router-dom'
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
import { listAllMaterials } from '@/lib/listAll'
import { listAllCourseChunks, selectRagContext } from '@/lib/ragContext'
import { inferTopicsFromScope } from '@/lib/topics'
import type { Schema } from '../../amplify/data/resource'

function clampInt(value: number, min: number, max: number, fallback: number) {
  if (!Number.isFinite(value)) return fallback
  return Math.min(max, Math.max(min, Math.round(value)))
}

type Material = Schema['Material']['type']
type CourseChunk = Schema['CourseChunk']['type']

type Question = {
  id: string
  type: 'multiple_choice' | 'written' | 'true_false'
  stem: string
  options?: string[]
  correctAnswer?: string
  rubric?: string
  explanation?: string
}

type ScenarioStep = {
  id: string
  prompt: string
  expectedPoints?: string
}

type WrittenGrade = {
  id: string
  score: number
  feedback: string
}

type Phase = 'setup' | 'taking' | 'results'
type PracticeMode = 'practice' | 'scenario'

export function PracticeTestPage() {
  const [searchParams] = useSearchParams()
  const [materials, setMaterials] = useState<Material[]>([])
  const [chunks, setChunks] = useState<CourseChunk[]>([])
  const [scope, setScope] = useState('Chapters on airway and ventilation')
  const [questionCount, setQuestionCount] = useState(5)
  const [mcPercent, setMcPercent] = useState(60)
  const [examMode, setExamMode] = useState(false)
  const [timeLimitMinutes, setTimeLimitMinutes] = useState(0)
  const [practiceMode, setPracticeMode] = useState<PracticeMode>('practice')
  const [phase, setPhase] = useState<Phase>('setup')
  const [busy, setBusy] = useState(false)
  const [contextLoading, setContextLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [questions, setQuestions] = useState<Question[]>([])
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [usedSample, setUsedSample] = useState(false)
  const [contextUsed, setContextUsed] = useState('')
  const [retrievalMode, setRetrievalMode] = useState<
    'semantic' | 'enhanced-lexical' | 'sample'
  >('sample')
  const [contextTopics, setContextTopics] = useState<string[]>([])
  const [writtenGrades, setWrittenGrades] = useState<WrittenGrade[]>([])
  const [mcCorrect, setMcCorrect] = useState(0)
  const [mcTotal, setMcTotal] = useState(0)
  const [scorePercent, setScorePercent] = useState(0)
  const [vignette, setVignette] = useState('')
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null)
  const [startedAt, setStartedAt] = useState<number | null>(null)
  const autoSubmitRef = useRef(false)
  const submitRef = useRef<(() => Promise<void>) | null>(null)

  useEffect(() => {
    const scopeParam = searchParams.get('scope')
    if (scopeParam?.trim()) setScope(scopeParam.trim())
    const modeParam = searchParams.get('mode')
    if (modeParam === 'scenario') setPracticeMode('scenario')
    const countParam = searchParams.get('count')
    if (countParam) {
      setQuestionCount(clampInt(Number(countParam), 3, 15, 5))
    }
  }, [searchParams])

  useEffect(() => {
    void (async () => {
      setContextLoading(true)
      try {
        const mats = await listAllMaterials()
        setMaterials(mats)
      } catch (err) {
        setMaterials([])
        setError(
          err instanceof Error
            ? `Could not load materials: ${err.message}`
            : 'Could not load materials',
        )
      }
      try {
        setChunks(await listAllCourseChunks())
      } catch {
        setChunks([])
      } finally {
        setContextLoading(false)
      }
    })()
  }, [])

  const readyCount = useMemo(
    () =>
      materials.filter(
        (m) => m.extractStatus === 'ready' && (m.extractedText?.trim()?.length ?? 0) > 0,
      ).length,
    [materials],
  )

  useEffect(() => {
    if (phase !== 'taking' || !examMode || !timeLimitMinutes || secondsLeft == null) {
      return
    }
    if (secondsLeft <= 0) {
      if (!autoSubmitRef.current) {
        autoSubmitRef.current = true
        void submitRef.current?.()
      }
      return
    }
    const id = window.setTimeout(() => {
      setSecondsLeft((s) => (s == null ? s : s - 1))
    }, 1000)
    return () => window.clearTimeout(id)
  }, [phase, examMode, timeLimitMinutes, secondsLeft])

  async function gradeWritten(
    written: Question[],
    context: string,
  ): Promise<WrittenGrade[]> {
    if (written.length === 0) return []
    const items = written.map((q) => ({
      id: q.id,
      stem: q.stem,
      rubric: q.rubric ?? '',
      answer: answers[q.id] ?? '',
    }))
    const { data, errors } = await dataClient.mutations.gradeWrittenAnswers({
      context,
      itemsJson: JSON.stringify(items),
    })
    if (errors?.length) {
      throw new Error(errors.map((e) => e.message).join('; '))
    }
    const payload =
      typeof data === 'string'
        ? (JSON.parse(data) as { grades?: WrittenGrade[] })
        : ((data ?? {}) as { grades?: WrittenGrade[] })
    const byId = new Map<string, WrittenGrade>()
    for (const g of Array.isArray(payload.grades) ? payload.grades : []) {
      const id = String(g.id ?? '').trim()
      if (!id) continue
      const scoreNum = Number(g.score)
      byId.set(id, {
        id,
        score: Number.isFinite(scoreNum)
          ? Math.min(100, Math.max(0, Math.round(scoreNum)))
          : 0,
        feedback: String(g.feedback ?? ''),
      })
    }
    return [...byId.values()]
  }

  async function finishAttempt(opts: {
    questions: Question[]
    grades: WrittenGrade[]
    correct: number
    objectiveCount: number
    overall: number
    writtenAvg: number | null
    writtenCount: number
    mode: 'practice' | 'exam' | 'scenario'
    vignetteText?: string
  }) {
    const topics = [
      ...new Set([...inferTopicsFromScope(scope), ...contextTopics]),
    ].slice(0, 10)
    const elapsedSeconds =
      startedAt != null ? Math.max(0, Math.round((Date.now() - startedAt) / 1000)) : undefined

    const payloadJson = JSON.stringify({
      questions: opts.questions,
      answers,
      grades: opts.grades,
      usedSample,
      topics,
      retrieval: retrievalMode,
      mode: opts.mode,
      examMode: examMode || opts.mode === 'exam',
      timeLimitMinutes: timeLimitMinutes > 0 ? timeLimitMinutes : undefined,
      elapsedSeconds,
      vignette: opts.vignetteText,
    })

    const { errors: saveErrors } = await dataClient.models.Attempt.create({
      scope: scope.trim(),
      questionCount: opts.questions.length,
      scorePercent: Math.round(opts.overall * 10) / 10,
      mcCorrect: opts.correct,
      mcTotal: opts.objectiveCount,
      writtenAvgScore: opts.writtenAvg ?? undefined,
      writtenTotal: opts.writtenCount,
      usedSampleContext: usedSample,
      payloadJson,
      topicsJson: JSON.stringify(topics),
      completedAt: new Date().toISOString(),
    })
    if (saveErrors?.length) {
      throw new Error(saveErrors.map((e) => e.message).join('; '))
    }

    setMcCorrect(opts.correct)
    setMcTotal(opts.objectiveCount)
    setWrittenGrades(opts.grades)
    setScorePercent(Math.round(opts.overall * 10) / 10)
    setPhase('results')
  }

  async function onGenerate(event: FormEvent) {
    event.preventDefault()
    setError(null)
    setBusy(true)
    autoSubmitRef.current = false
    try {
      const selected = await selectRagContext(materials, scope, chunks)
      setUsedSample(selected.usedSample)
      setContextUsed(selected.context)
      setRetrievalMode(selected.retrieval)
      setContextTopics(selected.topics)

      if (practiceMode === 'scenario') {
        const { data, errors } = await dataClient.mutations.generateClinicalScenario({
          scope: scope.trim(),
          context: selected.context,
        })
        if (errors?.length) {
          throw new Error(errors.map((e) => e.message).join('; '))
        }
        const payload =
          typeof data === 'string'
            ? (JSON.parse(data) as {
                vignette?: string
                steps?: ScenarioStep[]
              })
            : ((data ?? {}) as { vignette?: string; steps?: ScenarioStep[] })
        const steps = Array.isArray(payload.steps) ? payload.steps : []
        if (steps.length === 0) {
          throw new Error('No scenario steps were generated. Try a broader scope.')
        }
        const nextQuestions: Question[] = steps.map((s, i) => ({
          id: String(s.id || `s${i + 1}`),
          type: 'written',
          stem: String(s.prompt ?? '').trim(),
          rubric: String(s.expectedPoints ?? '').trim() || undefined,
        }))
        setVignette(String(payload.vignette ?? '').trim())
        setQuestions(nextQuestions)
        setAnswers({})
        setWrittenGrades([])
        setStartedAt(Date.now())
        setSecondsLeft(
          examMode && timeLimitMinutes > 0 ? timeLimitMinutes * 60 : null,
        )
        setPhase('taking')
        return
      }

      const safeCount = clampInt(questionCount, 3, 15, 5)
      const safeMc = clampInt(mcPercent, 0, 100, 60)
      setQuestionCount(safeCount)
      setMcPercent(safeMc)

      const { data, errors } = await dataClient.mutations.generatePracticeTest({
        scope: scope.trim(),
        questionCount: safeCount,
        mcPercent: safeMc,
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

      setVignette('')
      setQuestions(nextQuestions)
      setAnswers({})
      setWrittenGrades([])
      setStartedAt(Date.now())
      setSecondsLeft(
        examMode && timeLimitMinutes > 0 ? timeLimitMinutes * 60 : null,
      )
      setPhase('taking')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Generation failed')
    } finally {
      setBusy(false)
    }
  }

  async function onSubmitTest() {
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
      const grades = await gradeWritten(written, contextUsed)
      const gradeById = new Map(grades.map((g) => [g.id, g.score]))
      const writtenScores = written.map((q) => gradeById.get(q.id) ?? 0)
      const writtenAvg =
        written.length > 0
          ? writtenScores.reduce((sum, s) => sum + s, 0) / written.length
          : null

      const totalN = objective.length + written.length
      const overall =
        totalN > 0
          ? (correct * 100 + writtenScores.reduce((s, n) => s + n, 0)) / totalN
          : 0

      const mode: 'practice' | 'exam' | 'scenario' =
        practiceMode === 'scenario'
          ? 'scenario'
          : examMode
            ? 'exam'
            : 'practice'

      await finishAttempt({
        questions,
        grades,
        correct,
        objectiveCount: objective.length,
        overall,
        writtenAvg,
        writtenCount: written.length,
        mode,
        vignetteText: vignette || undefined,
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Submit failed')
    } finally {
      setBusy(false)
    }
  }

  submitRef.current = onSubmitTest

  function setAnswer(id: string, value: string) {
    setAnswers((prev) => ({ ...prev, [id]: value }))
  }

  function formatTimer(total: number) {
    const m = Math.floor(total / 60)
    const s = total % 60
    return `${m}:${s.toString().padStart(2, '0')}`
  }

  const sourceWeakness = searchParams.get('source') === 'weakness'

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Practice Test</h1>
        <p className="text-muted-foreground text-sm">
          Generate MC, true/false, and written questions from your materials
          (or sample notes until textbooks are uploaded).
        </p>
      </div>

      {contextLoading ? (
        <Alert>
          <AlertTitle>Loading course context…</AlertTitle>
          <AlertDescription>
            Materials load first; embeddings may take a moment for semantic
            retrieval.
          </AlertDescription>
        </Alert>
      ) : readyCount === 0 ? (
        <Alert>
          <AlertTitle>No textbook materials yet</AlertTitle>
          <AlertDescription>
            Generation will use labeled sample paramedic notes so you can test
            the flow. Upload PDFs/DOCX on Materials when you have access.
          </AlertDescription>
        </Alert>
      ) : (
        <Alert>
          <AlertTitle>
            {readyCount} material(s) ready
            {chunks.length > 0 ? ` · ${chunks.length} RAG chunks` : ''}
          </AlertTitle>
          <AlertDescription>
            {chunks.length > 0
              ? 'Semantic retrieval will be preferred; keyword matching is the fallback.'
              : 'Relevant extracted text will be selected from your uploads for this scope.'}
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
              {sourceWeakness
                ? 'Scoped from your weakest topics. Adjust before generating.'
                : 'Describe what the next exam covers. Optional exam mode defers feedback until submit.'}
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

              <div className="flex flex-wrap gap-4">
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="radio"
                    name="practiceMode"
                    checked={practiceMode === 'practice'}
                    onChange={() => setPracticeMode('practice')}
                  />
                  Standard practice
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="radio"
                    name="practiceMode"
                    checked={practiceMode === 'scenario'}
                    onChange={() => setPracticeMode('scenario')}
                  />
                  Clinical scenario
                </label>
              </div>

              {practiceMode === 'practice' ? (
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="flex flex-col gap-2">
                    <Label htmlFor="count">Number of questions</Label>
                    <Input
                      id="count"
                      type="number"
                      min={3}
                      max={15}
                      value={questionCount}
                      onChange={(e) =>
                        setQuestionCount(
                          clampInt(Number(e.target.value), 3, 15, 5),
                        )
                      }
                      onBlur={() =>
                        setQuestionCount((n) => clampInt(n, 3, 15, 5))
                      }
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
                      onChange={(e) =>
                        setMcPercent(clampInt(Number(e.target.value), 0, 100, 60))
                      }
                      onBlur={() =>
                        setMcPercent((n) => clampInt(n, 0, 100, 60))
                      }
                    />
                  </div>
                </div>
              ) : (
                <p className="text-muted-foreground text-sm">
                  Generates a short vignette plus ordered written decision steps
                  grounded in your materials.
                </p>
              )}

              <div className="border-border space-y-3 rounded-md border p-3">
                <label className="flex items-center gap-2 text-sm font-medium">
                  <input
                    type="checkbox"
                    checked={examMode}
                    onChange={(e) => setExamMode(e.target.checked)}
                  />
                  Exam mode (hide feedback until submit)
                </label>
                <div className="flex flex-col gap-2 sm:max-w-xs">
                  <Label htmlFor="timer">Time limit (minutes, 0 = none)</Label>
                  <Input
                    id="timer"
                    type="number"
                    min={0}
                    max={180}
                    disabled={!examMode}
                    value={timeLimitMinutes}
                    onChange={(e) =>
                      setTimeLimitMinutes(
                        clampInt(Number(e.target.value), 0, 180, 0),
                      )
                    }
                  />
                </div>
              </div>
            </CardContent>
            <CardFooter>
              <Button type="submit" disabled={busy || contextLoading}>
                {contextLoading
                  ? 'Loading context…'
                  : busy
                    ? 'Generating…'
                    : practiceMode === 'scenario'
                      ? 'Generate scenario'
                      : 'Generate practice test'}
              </Button>
            </CardFooter>
          </form>
        </Card>
      ) : null}

      {phase === 'taking' ? (
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault()
            void onSubmitTest()
          }}
        >
          <div className="flex flex-wrap items-center gap-2">
            {usedSample ? (
              <Badge variant="outline">Using sample context</Badge>
            ) : (
              <Badge variant="secondary">
                {retrievalMode === 'semantic'
                  ? 'Semantic retrieval'
                  : 'Using your materials'}
              </Badge>
            )}
            {examMode ? <Badge>Exam mode</Badge> : null}
            {practiceMode === 'scenario' ? (
              <Badge variant="outline">Scenario</Badge>
            ) : null}
            {secondsLeft != null ? (
              <Badge variant={secondsLeft <= 60 ? 'destructive' : 'secondary'}>
                Time left {formatTimer(secondsLeft)}
              </Badge>
            ) : null}
          </div>

          {vignette ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Clinical vignette</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="whitespace-pre-wrap text-sm">{vignette}</p>
              </CardContent>
            </Card>
          ) : null}

          {examMode ? (
            <Alert>
              <AlertTitle>Exam in progress</AlertTitle>
              <AlertDescription>
                Correctness and explanations stay hidden until you submit.
              </AlertDescription>
            </Alert>
          ) : null}

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
              onClick={() => {
                setPhase('setup')
                setQuestions([])
                setAnswers({})
                setWrittenGrades([])
                setVignette('')
                setSecondsLeft(null)
                setStartedAt(null)
                setError(null)
              }}
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
              Attempt saved to your history.
            </CardContent>
            <CardFooter>
              <Button
                type="button"
                onClick={() => {
                  setPhase('setup')
                  setSecondsLeft(null)
                  setStartedAt(null)
                }}
              >
                New practice test
              </Button>
            </CardFooter>
          </Card>

          {vignette ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Vignette</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="whitespace-pre-wrap text-sm">{vignette}</p>
              </CardContent>
            </Card>
          ) : null}

          {questions.map((q) => {
            const grade = writtenGrades.find((g) => g.id === q.id)
            const given = (answers[q.id] ?? '').trim()
            const expected = (q.correctAnswer ?? '').trim()
            const isObjective =
              q.type === 'multiple_choice' || q.type === 'true_false'
            const objectiveOk =
              isObjective &&
              Boolean(given) &&
              Boolean(expected) &&
              given.toLowerCase() === expected.toLowerCase()
            return (
              <Card key={q.id}>
                <CardHeader>
                  <CardTitle className="text-base">{q.stem}</CardTitle>
                  <CardDescription>
                    Your answer: {given || '—'}
                    {isObjective ? (
                      <>
                        {' '}
                        · Correct: {expected || '—'}{' '}
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
