import { useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '@/auth/AuthProvider'
import { useStudentProfile } from '@/auth/StudentProfileProvider'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button, buttonVariants } from '@/components/ui/button'
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
import { cn } from '@/lib/utils'
import { track } from '@/lib/telemetry'
import {
  clearLearningProfile,
  createStudyCheckIn,
  profileToDraft,
  upsertStudentProfile,
  type CheckInKind,
  type ProfileDraft,
  type TextScale,
} from '@/lib/studentProfile'

const CONFIDENCE_OPTIONS = [
  { value: 1, label: '1 — Struggling' },
  { value: 2, label: '2 — Below average' },
  { value: 3, label: '3 — Okay' },
  { value: 4, label: '4 — Solid' },
  { value: 5, label: '5 — Confident' },
] as const

const CHECK_IN_KINDS: { value: CheckInKind; label: string }[] = [
  { value: 'external_exam', label: 'External / class test' },
  { value: 'weekly_feel', label: 'How I’m feeling this week' },
  { value: 'focus_request', label: 'Focus request' },
]

export function SettingsPage() {
  const { user } = useAuth()
  const { profile, checkIns, refreshProfile } = useStudentProfile()
  const [draft, setDraft] = useState<ProfileDraft>(profileToDraft(profile))
  const [busy, setBusy] = useState(false)
  const [checkBusy, setCheckBusy] = useState(false)
  const [clearBusy, setClearBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  const [checkKind, setCheckKind] = useState<CheckInKind>('external_exam')
  const [feeling, setFeeling] = useState('')
  const [relatedScope, setRelatedScope] = useState('')
  const [scoreOrOutcome, setScoreOrOutcome] = useState('')

  useEffect(() => {
    setDraft(profileToDraft(profile))
  }, [profile])

  function patch<K extends keyof ProfileDraft>(key: K, value: ProfileDraft[K]) {
    setDraft((prev) => ({ ...prev, [key]: value }))
    setSaved(false)
  }

  async function onSave(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError(null)
    setSaved(false)
    try {
      await upsertStudentProfile(draft, profile)
      track('settings_saved', {
        textScale: draft.textScale,
        hasWeakTopics: Boolean(draft.selfWeakTopics.trim()),
        confidence: draft.courseConfidence,
      })
      await refreshProfile()
      setSaved(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save settings')
    } finally {
      setBusy(false)
    }
  }

  async function onCheckIn(event: FormEvent) {
    event.preventDefault()
    setCheckBusy(true)
    setError(null)
    try {
      await createStudyCheckIn({
        kind: checkKind,
        feeling,
        relatedScope,
        scoreOrOutcome,
      })
      track('study_checkin', { kind: checkKind })
      setFeeling('')
      setRelatedScope('')
      setScoreOrOutcome('')
      await refreshProfile()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Check-in failed')
    } finally {
      setCheckBusy(false)
    }
  }

  async function onClear() {
    if (
      !window.confirm(
        'Clear your preferred name, preferences, and check-ins? Practice attempt history will be kept.',
      )
    ) {
      return
    }
    setClearBusy(true)
    setError(null)
    try {
      await clearLearningProfile(profile)
      track('settings_cleared', {})
      await refreshProfile()
      setDraft(profileToDraft(null))
      setSaved(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Clear failed')
    } finally {
      setClearBusy(false)
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Preferred name, study layout, and private learning memory. Classmates
          cannot see this data.
        </p>
      </div>

      {error ? (
        <Alert variant="destructive">
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Account</CardTitle>
          <CardDescription>
            Sign-in email stays private to you. The app greets you by preferred
            name instead.
          </CardDescription>
        </CardHeader>
        <CardContent className="text-muted-foreground space-y-1 text-sm">
          <p>
            Email:{' '}
            <span className="text-foreground font-medium">
              {user?.email ?? '—'}
            </span>
          </p>
          <p className="font-mono text-[10px] break-all">
            User id: {user?.userId ?? '—'}
          </p>
        </CardContent>
      </Card>

      <form onSubmit={onSave} className="flex flex-col gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Identity</CardTitle>
            <CardDescription>
              What should we call you in the dashboard and Tutor?
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor="preferredName">Preferred name</Label>
              <Input
                id="preferredName"
                value={draft.preferredName}
                onChange={(e) => patch('preferredName', e.target.value)}
                placeholder="e.g. Mallorie"
                maxLength={80}
                required
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Layout</CardTitle>
            <CardDescription>
              Larger text and spacing can help with reading fatigue (including
              dyslexia-friendly study).
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <Label htmlFor="textScale">Text size</Label>
            <select
              id="textScale"
              className="border-input bg-background ring-offset-background focus-visible:ring-ring flex h-9 w-full rounded-md border px-3 text-sm focus-visible:ring-2 focus-visible:outline-none"
              value={draft.textScale}
              onChange={(e) =>
                patch('textScale', e.target.value as TextScale)
              }
            >
              <option value="normal">Normal</option>
              <option value="large">Large</option>
              <option value="xl">Extra large / more spacing</option>
            </select>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Study defaults</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <Label htmlFor="defaultQuestionCount">
              Default practice question count (3–15)
            </Label>
            <Input
              id="defaultQuestionCount"
              type="number"
              min={3}
              max={15}
              value={draft.defaultQuestionCount}
              onChange={(e) =>
                patch('defaultQuestionCount', Number(e.target.value) || 5)
              }
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>How I’m doing</CardTitle>
            <CardDescription>
              Self-report for personalized Tutor focus. Not shared with
              classmates.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="courseConfidence">Course confidence</Label>
              <select
                id="courseConfidence"
                className="border-input bg-background ring-offset-background focus-visible:ring-ring flex h-9 w-full rounded-md border px-3 text-sm focus-visible:ring-2 focus-visible:outline-none"
                value={draft.courseConfidence}
                onChange={(e) =>
                  patch('courseConfidence', Number(e.target.value) || 3)
                }
              >
                {CONFIDENCE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="selfWeakTopics">
                Topics I want focused help on
              </Label>
              <textarea
                id="selfWeakTopics"
                className="border-input bg-background ring-offset-background placeholder:text-muted-foreground focus-visible:ring-ring flex min-h-[72px] w-full rounded-md border px-3 py-2 text-sm focus-visible:ring-2 focus-visible:outline-none"
                value={draft.selfWeakTopics}
                onChange={(e) => patch('selfWeakTopics', e.target.value)}
                placeholder="e.g. cardiac rhythms, pharmacology doses, airway"
                maxLength={500}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="notesForTutor">What helps me learn</Label>
              <textarea
                id="notesForTutor"
                className="border-input bg-background ring-offset-background placeholder:text-muted-foreground focus-visible:ring-ring flex min-h-[72px] w-full rounded-md border px-3 py-2 text-sm focus-visible:ring-2 focus-visible:outline-none"
                value={draft.notesForTutor}
                onChange={(e) => patch('notesForTutor', e.target.value)}
                placeholder="e.g. shorter explanations, more mnemonics, check understanding"
                maxLength={1000}
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Tutor preferences</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={draft.tutorGreetByName}
                onChange={(e) => patch('tutorGreetByName', e.target.checked)}
              />
              Greet me by preferred name
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={draft.tutorAskAboutTests}
                onChange={(e) => patch('tutorAskAboutTests', e.target.checked)}
              />
              Allow Tutor to ask about recent tests / check-ins
            </label>
          </CardContent>
          <CardFooter className="flex flex-wrap items-center gap-3">
            <Button type="submit" disabled={busy}>
              {busy ? 'Saving…' : 'Save preferences'}
            </Button>
            {saved ? (
              <span className="text-muted-foreground text-xs">Saved.</span>
            ) : null}
          </CardFooter>
        </Card>
      </form>

      <Card>
        <CardHeader>
          <CardTitle>Study check-in</CardTitle>
          <CardDescription>
            Tell Study Buddy how a class test went or how you feel this week —
            used only for your Tutor personalization.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={onCheckIn} className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor="checkKind">Type</Label>
              <select
                id="checkKind"
                className="border-input bg-background ring-offset-background focus-visible:ring-ring flex h-9 w-full rounded-md border px-3 text-sm focus-visible:ring-2 focus-visible:outline-none"
                value={checkKind}
                onChange={(e) => setCheckKind(e.target.value as CheckInKind)}
              >
                {CHECK_IN_KINDS.map((k) => (
                  <option key={k.value} value={k.value}>
                    {k.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="feeling">How it went / how you feel</Label>
              <textarea
                id="feeling"
                className="border-input bg-background ring-offset-background placeholder:text-muted-foreground focus-visible:ring-ring flex min-h-[72px] w-full rounded-md border px-3 py-2 text-sm focus-visible:ring-2 focus-visible:outline-none"
                value={feeling}
                onChange={(e) => setFeeling(e.target.value)}
                placeholder="e.g. Got an 82 on airway but still shaky on meds"
                required
                maxLength={400}
              />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="relatedScope">Topic / chapter (optional)</Label>
                <Input
                  id="relatedScope"
                  value={relatedScope}
                  onChange={(e) => setRelatedScope(e.target.value)}
                  placeholder="Chapter 12"
                  maxLength={200}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="scoreOrOutcome">Score / outcome (optional)</Label>
                <Input
                  id="scoreOrOutcome"
                  value={scoreOrOutcome}
                  onChange={(e) => setScoreOrOutcome(e.target.value)}
                  placeholder="82%"
                  maxLength={200}
                />
              </div>
            </div>
            <Button type="submit" disabled={checkBusy || !feeling.trim()}>
              {checkBusy ? 'Saving…' : 'Save check-in'}
            </Button>
          </form>
          {checkIns.length > 0 ? (
            <ul className="text-muted-foreground mt-4 space-y-2 text-xs">
              {checkIns.slice(0, 5).map((c) => (
                <li key={c.id} className="border-border rounded-md border p-2">
                  <span className="text-foreground font-medium">
                    {c.kind}
                  </span>
                  {' · '}
                  {c.createdAt
                    ? new Date(c.createdAt).toLocaleString()
                    : ''}
                  <p className="text-foreground mt-1">{c.feeling}</p>
                </li>
              ))}
            </ul>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Privacy</CardTitle>
          <CardDescription>
            Learning profile and check-ins are owner-private in AWS (Amplify).
            A short summary may be sent with Tutor requests to xAI for that
            reply only — we do not store a long-term profile at xAI. Email is
            never included in that summary.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-3">
          <Button
            type="button"
            variant="outline"
            disabled={clearBusy}
            onClick={() => {
              void onClear()
            }}
          >
            {clearBusy ? 'Clearing…' : 'Clear learning profile'}
          </Button>
          <Link
            to="/about"
            className={cn(buttonVariants({ variant: 'ghost' }))}
          >
            About & copyright
          </Link>
        </CardContent>
      </Card>
    </div>
  )
}
