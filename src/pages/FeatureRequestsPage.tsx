import { useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
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
import { track } from '@/lib/telemetry'
import type { Schema } from '../../amplify/data/resource'

type FeatureRequest = Schema['FeatureRequest']['type']

export function FeatureRequestsPage() {
  const [rows, setRows] = useState<FeatureRequest[]>([])
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  async function reload() {
    const { data, errors } = await dataClient.models.FeatureRequest.list({
      limit: 50,
    })
    if (errors?.length) {
      throw new Error(errors.map((e) => e.message).join('; '))
    }
    const sorted = [...(data ?? [])].sort((a, b) =>
      (b.createdAt ?? '').localeCompare(a.createdAt ?? ''),
    )
    setRows(sorted)
  }

  useEffect(() => {
    void (async () => {
      try {
        await reload()
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load requests')
      } finally {
        setLoading(false)
      }
    })()
  }, [])

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    const t = title.trim()
    const d = description.trim()
    if (!t || !d) return
    setBusy(true)
    setError(null)
    try {
      const { errors } = await dataClient.models.FeatureRequest.create({
        title: t.slice(0, 120),
        description: d.slice(0, 4000),
        status: 'open',
        createdAt: new Date().toISOString(),
      })
      if (errors?.length) {
        throw new Error(errors.map((e) => e.message).join('; '))
      }
      track('feature_request_submitted', { titleLength: t.length })
      setTitle('')
      setDescription('')
      await reload()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Submit failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Feature requests</h1>
        <p className="text-muted-foreground text-sm">
          Submit ideas for Mallorie and classmates. You only see your own
          requests (owner-isolated). If something is broken,{' '}
          <Link to="/contact" className="text-foreground underline underline-offset-2">
            contact the developer
          </Link>.
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
          <CardTitle>New request</CardTitle>
          <CardDescription>Title plus a short description.</CardDescription>
        </CardHeader>
        <form onSubmit={onSubmit}>
          <CardContent className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="req-title">Title</Label>
              <Input
                id="req-title"
                required
                maxLength={120}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Dark mode for late-night studying"
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="req-desc">Description</Label>
              <textarea
                id="req-desc"
                required
                rows={5}
                maxLength={4000}
                className="border-input bg-background focus-visible:ring-ring w-full rounded-md border px-3 py-2 text-sm outline-none focus-visible:ring-2"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="What problem does this solve?"
              />
            </div>
          </CardContent>
          <CardFooter>
            <Button type="submit" disabled={busy}>
              {busy ? 'Submitting…' : 'Submit request'}
            </Button>
          </CardFooter>
        </form>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Your requests</CardTitle>
          <CardDescription>Newest first.</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-muted-foreground text-sm">Loading…</p>
          ) : rows.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              No requests yet. Submit one above.
            </p>
          ) : (
            <ul className="divide-border divide-y text-sm">
              {rows.map((r) => (
                <li key={r.id} className="space-y-1 py-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-medium">{r.title}</p>
                    <Badge variant="outline">{r.status ?? 'open'}</Badge>
                  </div>
                  <p className="text-muted-foreground whitespace-pre-wrap">
                    {r.description}
                  </p>
                  <p className="text-muted-foreground text-xs">
                    {r.createdAt
                      ? new Date(r.createdAt).toLocaleString()
                      : '—'}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
