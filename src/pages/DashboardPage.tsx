import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Category,
  ChartComponent,
  ColumnSeries,
  Inject,
  Legend,
  LineSeries,
  SeriesCollectionDirective,
  SeriesDirective,
  Tooltip,
} from '@syncfusion/ej2-react-charts'
import { useStudentProfile } from '@/auth/StudentProfileProvider'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { attemptStats, listAttempts, type Attempt } from '@/lib/attempts'
import { buttonVariants } from '@/components/ui/button'
import {
  loadCycleSchedule,
  pickStudyNow,
  scopeFromSession,
  type CycleSchedule,
} from '@/lib/schedule'
import { buildTopicBreakdown, weakTopicsScope } from '@/lib/topics'
import { cn } from '@/lib/utils'

export function DashboardPage() {
  const { preferredName, profile } = useStudentProfile()
  const [attempts, setAttempts] = useState<Attempt[]>([])
  const [schedule, setSchedule] = useState<CycleSchedule | null>(null)
  const [scheduleReady, setScheduleReady] = useState(false)
  const [scheduleError, setScheduleError] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const rows = await listAttempts(50)
        if (!cancelled) setAttempts(rows)
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load attempts')
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const data = await loadCycleSchedule()
        if (!cancelled) {
          setSchedule(data)
          setScheduleError(null)
          setScheduleReady(true)
        }
      } catch (err) {
        if (!cancelled) {
          setSchedule(null)
          setScheduleError(
            err instanceof Error ? err.message : 'Could not load schedule',
          )
          setScheduleReady(true)
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const studyNow = useMemo(
    () => (schedule ? pickStudyNow(schedule) : null),
    [schedule],
  )
  const focusScope = studyNow?.focus ? scopeFromSession(studyNow.focus) : null
  const practiceTo = focusScope
    ? `/practice?scope=${encodeURIComponent(focusScope)}&source=schedule`
    : null
  const scenarioTo = focusScope
    ? `/practice?mode=scenario&scope=${encodeURIComponent(focusScope)}&source=schedule`
    : null
  const tutorTo = focusScope
    ? `/tutor?scope=${encodeURIComponent(focusScope)}`
    : '/tutor'

  const stats = attemptStats(attempts)
  const topicBreakdown = buildTopicBreakdown(attempts)
  const chartData = [...attempts]
    .reverse()
    .slice(-12)
    .map((a, i) => ({
      x: `${i + 1}`,
      label: new Date(a.completedAt ?? '').toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
      }),
      score: a.scorePercent ?? 0,
    }))
  const topicChart = topicBreakdown.slice(0, 10).map((t) => ({
    topic: t.topic.length > 18 ? `${t.topic.slice(0, 16)}…` : t.topic,
    avgScore: t.avgScore,
  }))
  const weakScope = weakTopicsScope(topicBreakdown)
  const weakPracticeTo = weakScope
    ? `/practice?scope=${encodeURIComponent(weakScope)}&source=weakness`
    : null

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
          <p className="text-muted-foreground text-sm">
            Welcome back, {preferredName}.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            to="/settings"
            className={cn(buttonVariants({ variant: 'outline' }))}
          >
            Settings
          </Link>
          <Link
            to="/review"
            className={cn(buttonVariants({ variant: 'outline' }))}
          >
            Review today
          </Link>
          <Link
            to="/progress"
            className={cn(buttonVariants({ variant: 'outline' }))}
          >
            Progress
          </Link>
          <Link
            to="/tutor"
            className={cn(buttonVariants({ variant: 'outline' }))}
          >
            Tutor
          </Link>
          <Link
            to="/flashcards"
            className={cn(buttonVariants({ variant: 'outline' }))}
          >
            Flashcards
          </Link>
          <Link
            to="/history"
            className={cn(buttonVariants({ variant: 'outline' }))}
          >
            History
          </Link>
          {weakPracticeTo ? (
            <Link to={weakPracticeTo} className={cn(buttonVariants({ variant: 'secondary' }))}>
              Practice my weak topics
            </Link>
          ) : (
            <span
              className={cn(
                buttonVariants({ variant: 'secondary' }),
                'pointer-events-none opacity-50',
              )}
              title="Complete a practice test to unlock weakness practice"
            >
              Practice my weak topics
            </span>
          )}
          <Link to="/practice" className={cn(buttonVariants())}>
            Practice test
          </Link>
        </div>
      </div>

      {error ? (
        <p className="text-destructive text-sm">{error}</p>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>How are you doing?</CardTitle>
          <CardDescription>
            Private check-ins and self-reported weak topics help Tutor focus —
            classmates never see this.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          {profile?.selfWeakTopics?.trim() ? (
            <p>
              <span className="text-muted-foreground">Focus areas: </span>
              {profile.selfWeakTopics.trim()}
            </p>
          ) : (
            <p className="text-muted-foreground">
              No self-reported weak topics yet. Add them in Settings.
            </p>
          )}
          {typeof profile?.courseConfidence === 'number' ? (
            <p className="text-muted-foreground">
              Course confidence: {profile.courseConfidence}/5
            </p>
          ) : null}
        </CardContent>
        <CardFooter className="flex flex-wrap gap-2">
          <Link
            to="/settings"
            className={cn(buttonVariants({ variant: 'secondary' }))}
          >
            Check in / update Settings
          </Link>
          {profile?.selfWeakTopics?.trim() ? (
            <Link
              to={`/practice?scope=${encodeURIComponent(profile.selfWeakTopics.trim())}&source=self_weak`}
              className={cn(buttonVariants({ variant: 'outline' }))}
            >
              Practice my focus areas
            </Link>
          ) : null}
        </CardFooter>
      </Card>

      <Card className="border-primary/30">
        <CardHeader>
          <CardTitle>Study now</CardTitle>
          <CardDescription>
            Cycle {schedule?.cycle ?? '17'} schedule — focus on what class is
            covering this week.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {!scheduleReady ? (
            <p className="text-muted-foreground text-sm">Loading schedule…</p>
          ) : scheduleError ? (
            <p className="text-destructive text-sm">{scheduleError}</p>
          ) : !schedule ? (
            <p className="text-muted-foreground text-sm">
              No schedule loaded. Run{' '}
              <code className="text-xs">npm run parse:schedule</code> then{' '}
              <code className="text-xs">npm run upload:course</code>.
            </p>
          ) : studyNow?.focus ? (
            <>
              <div>
                <p className="text-muted-foreground text-xs uppercase tracking-wide">
                  {studyNow.focus.date === studyNow.today
                    ? 'Today'
                    : 'Next session'}{' '}
                  · {studyNow.focus.date}
                  {studyNow.focus.week != null
                    ? ` · Week ${studyNow.focus.week}`
                    : ''}
                </p>
                <p className="mt-1 text-base font-medium leading-snug">
                  {studyNow.focus.label}
                </p>
                {studyNow.focus.chapters.length > 0 ? (
                  <p className="text-muted-foreground mt-1 text-sm">
                    Chapters {studyNow.focus.chapters.slice(0, 8).join(', ')}
                    {studyNow.focus.topics.length
                      ? ` · ${studyNow.focus.topics.join(', ')}`
                      : ''}
                  </p>
                ) : null}
              </div>
              {studyNow.upcoming.length > 1 ? (
                <ul className="text-muted-foreground space-y-1 text-sm">
                  {studyNow.upcoming.slice(0, 5).map((s) => (
                    <li key={`${s.date}-${s.label}`}>
                      <span className="text-foreground font-medium">
                        {s.date}
                      </span>
                      {' — '}
                      {s.label.length > 72
                        ? `${s.label.slice(0, 70)}…`
                        : s.label}
                    </li>
                  ))}
                </ul>
              ) : null}
            </>
          ) : (
            <p className="text-muted-foreground text-sm">
              Schedule is loaded but no upcoming sessions were found.
            </p>
          )}
        </CardContent>
        {focusScope ? (
          <CardFooter className="flex flex-wrap gap-2">
            {practiceTo ? (
              <Link to={practiceTo} className={cn(buttonVariants())}>
                Practice this topic
              </Link>
            ) : null}
            {scenarioTo ? (
              <Link
                to={scenarioTo}
                className={cn(buttonVariants({ variant: 'secondary' }))}
              >
                Clinical scenario
              </Link>
            ) : null}
            <Link
              to="/review"
              className={cn(buttonVariants({ variant: 'outline' }))}
            >
              Review today
            </Link>
            <Link
              to={tutorTo}
              className={cn(buttonVariants({ variant: 'outline' }))}
            >
              Tutor
            </Link>
          </CardFooter>
        ) : null}
      </Card>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Total tests</CardDescription>
            <CardTitle className="text-3xl">
              {loading ? '…' : stats.total}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Average score</CardDescription>
            <CardTitle className="text-3xl">
              {loading
                ? '…'
                : stats.averageScore == null
                  ? '—'
                  : `${stats.averageScore}%`}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Last score</CardDescription>
            <CardTitle className="text-3xl">
              {loading
                ? '…'
                : stats.lastScore == null
                  ? '—'
                  : `${stats.lastScore}%`}
            </CardTitle>
          </CardHeader>
          {stats.lastScope ? (
            <CardContent className="text-muted-foreground pt-0 text-xs">
              {stats.lastScope}
            </CardContent>
          ) : null}
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Score trend</CardTitle>
          <CardDescription>
            Recent practice scores (newest on the right).
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-muted-foreground text-sm">Loading…</p>
          ) : chartData.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              No attempts yet. Generate a practice test to see your trend.
            </p>
          ) : (
            <ChartComponent
              id="score-trend"
              primaryXAxis={{
                valueType: 'Category',
                labelStyle: { size: '11px' },
                majorGridLines: { width: 0 },
              }}
              primaryYAxis={{
                minimum: 0,
                maximum: 100,
                interval: 20,
                labelFormat: '{value}%',
                title: 'Score',
              }}
              tooltip={{ enable: true }}
              legendSettings={{ visible: false }}
              height="280px"
            >
              <Inject services={[LineSeries, Category, Tooltip, Legend]} />
              <SeriesCollectionDirective>
                <SeriesDirective
                  dataSource={chartData}
                  xName="label"
                  yName="score"
                  name="Score"
                  type="Line"
                  width={2}
                  marker={{ visible: true, width: 8, height: 8 }}
                />
              </SeriesCollectionDirective>
            </ChartComponent>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Weakness by topic</CardTitle>
          <CardDescription>
            Lower average scores first (from tagged practice attempts).
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-muted-foreground text-sm">Loading…</p>
          ) : topicBreakdown.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              Complete a practice test to see topic performance.
            </p>
          ) : (
            <div className="grid gap-4 lg:grid-cols-2">
              <ChartComponent
                id="topic-weakness"
                primaryXAxis={{
                  valueType: 'Category',
                  labelStyle: { size: '10px' },
                  majorGridLines: { width: 0 },
                }}
                primaryYAxis={{
                  minimum: 0,
                  maximum: 100,
                  interval: 20,
                  labelFormat: '{value}%',
                }}
                tooltip={{ enable: true }}
                legendSettings={{ visible: false }}
                height="260px"
              >
                <Inject services={[ColumnSeries, Category, Tooltip, Legend]} />
                <SeriesCollectionDirective>
                  <SeriesDirective
                    dataSource={topicChart}
                    xName="topic"
                    yName="avgScore"
                    name="Avg score"
                    type="Column"
                  />
                </SeriesCollectionDirective>
              </ChartComponent>
              <ul className="divide-border max-h-64 divide-y overflow-auto text-sm">
                {topicBreakdown.map((t) => (
                  <li
                    key={t.topic}
                    className="flex items-center justify-between gap-3 py-2"
                  >
                    <div className="min-w-0">
                      <p className="truncate font-medium">{t.topic}</p>
                      <p className="text-muted-foreground text-xs">
                        {t.attempts} attempt{t.attempts === 1 ? '' : 's'} ·{' '}
                        {t.totalQuestions} questions
                      </p>
                    </div>
                    <span className="font-mono text-sm">{t.avgScore}%</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Recent attempts</CardTitle>
          <CardDescription>Open History for the full list and detail.</CardDescription>
        </CardHeader>
        <CardContent>
          {attempts.length === 0 ? (
            <p className="text-muted-foreground text-sm">No practice history yet.</p>
          ) : (
            <ul className="divide-border divide-y text-sm">
              {attempts.slice(0, 5).map((a) => (
                <li key={a.id} className="flex items-center justify-between gap-3 py-2">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{a.scope}</p>
                    <p className="text-muted-foreground text-xs">
                      {a.completedAt
                        ? new Date(a.completedAt).toLocaleString()
                        : '—'}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="font-mono text-sm">{a.scorePercent}%</span>
                    <Link
                      className="text-primary text-xs underline-offset-2 hover:underline"
                      to={`/history/${a.id}`}
                    >
                      View
                    </Link>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
