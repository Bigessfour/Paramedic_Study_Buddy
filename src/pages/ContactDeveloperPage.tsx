import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { useLocation } from 'react-router-dom'
import { useAuth } from '@/auth/AuthProvider'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
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
import { developerEmail } from '@/lib/developerContact'
import {
  FEEDBACK_AREAS,
  MAX_FEEDBACK_IMAGES,
  buildFeedbackReport,
  buildFeedbackZip,
  buildMailtoUrl,
  feedbackZipName,
  isAcceptedImage,
  isDeliverableEmail,
  pickLatestError,
  screenshotFileName,
  shouldIncludeError,
  suggestArea,
} from '@/lib/feedbackReport'
import type { FeedbackError } from '@/lib/feedbackTypes'
import { dataClient } from '@/lib/amplifyData'
import {
  clearPendingError,
  listBreadcrumbs,
  readPendingError,
} from '@/lib/feedbackTrail'
import { track } from '@/lib/telemetry'

type LocalImage = {
  id: string
  name: string
  url: string
  bytes: Uint8Array
}

const fieldClass =
  'border-input bg-background focus-visible:ring-ring w-full rounded-md border px-3 py-2 text-sm outline-none focus-visible:ring-2'

function filesFromClipboard(data: DataTransfer | null): File[] {
  if (!data) return []
  if (data.files.length) return [...data.files]
  const files: File[] = []
  for (const item of data.items) {
    if (item.kind !== 'file') continue
    const file = item.getAsFile()
    if (file) files.push(file)
  }
  return files
}

function downloadZip(filename: string, bytes: Uint8Array) {
  const copy = new ArrayBuffer(bytes.byteLength)
  new Uint8Array(copy).set(bytes)
  const blob = new Blob([copy], { type: 'application/zip' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}

async function fetchLatestError(): Promise<FeedbackError | null> {
  const { data, errors } = await dataClient.models.ErrorLog.list({ limit: 25 })
  if (errors?.length) return null
  return pickLatestError(
    (data ?? []).map((row) => ({
      message: row.message,
      stack: row.stack ?? undefined,
      route: row.route ?? undefined,
      componentHint: row.componentHint ?? undefined,
      createdAt: row.createdAt ?? undefined,
    })),
  )
}

export function ContactDeveloperPage() {
  const { user } = useAuth()
  const location = useLocation()
  const imagesRef = useRef<LocalImage[]>([])
  const [pending] = useState(() => readPendingError())
  const [logged, setLogged] = useState<FeedbackError | null>(null)
  const [includeError, setIncludeError] = useState(() =>
    shouldIncludeError(pending, new Date(), Boolean(pending)),
  )
  const [area, setArea] = useState(() =>
    suggestArea(pending?.route, listBreadcrumbs()),
  )
  const [happened, setHappened] = useState('')
  const [expected, setExpected] = useState('')
  const [steps, setSteps] = useState('')
  const [images, setImages] = useState<LocalImage[]>([])
  const [dragOver, setDragOver] = useState(false)
  const [busy, setBusy] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [delivery, setDelivery] = useState<{
    filename: string
    mailto: string
    truncated: boolean
    summary: string
  } | null>(null)

  const address = developerEmail()
  const canEmail = isDeliverableEmail(address)
  const chosenError = includeError ? (pending ?? logged) : null

  useEffect(() => {
    imagesRef.current = images
  }, [images])

  useEffect(() => {
    return () => {
      for (const image of imagesRef.current) URL.revokeObjectURL(image.url)
    }
  }, [])

  useEffect(() => {
    if (pending) return
    let cancelled = false
    void (async () => {
      try {
        const latest = await fetchLatestError()
        if (cancelled || !latest) return
        setLogged(latest)
        setIncludeError(shouldIncludeError(latest, new Date(), false))
      } catch {
        // The form still works if the error log cannot be read.
      }
    })()
    return () => {
      cancelled = true
    }
  }, [pending])

  const addFiles = useCallback(async (files: File[]) => {
    const problems: string[] = []
    const accepted: LocalImage[] = []
    for (const file of files) {
      const problem = isAcceptedImage(file)
      if (problem) {
        problems.push(`${file.name || 'File'}: ${problem}`)
        continue
      }
      accepted.push({
        id: crypto.randomUUID(),
        name: file.name || 'screenshot.png',
        url: URL.createObjectURL(file),
        bytes: new Uint8Array(await file.arrayBuffer()),
      })
    }
    const room = MAX_FEEDBACK_IMAGES - imagesRef.current.length
    const next = accepted.slice(0, Math.max(room, 0))
    for (const image of accepted.slice(next.length)) URL.revokeObjectURL(image.url)
    if (room <= 0 && accepted.length) {
      problems.push(`You can attach up to ${MAX_FEEDBACK_IMAGES} screenshots.`)
    } else if (accepted.length > next.length) {
      problems.push(`You can attach up to ${MAX_FEEDBACK_IMAGES} screenshots.`)
    }
    if (next.length) {
      setImages((current) => [...current, ...next])
      setFormError(null)
    }
    if (problems.length) setFormError(problems[0] ?? null)
  }, [])

  useEffect(() => {
    function onPaste(event: ClipboardEvent) {
      const target = event.target
      if (
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement
      ) {
        return
      }
      const files = filesFromClipboard(event.clipboardData)
      if (!files.length) return
      event.preventDefault()
      void addFiles(files)
    }
    window.addEventListener('paste', onPaste)
    return () => window.removeEventListener('paste', onPaste)
  }, [addFiles])

  function removeImage(id: string) {
    setImages((current) => {
      const image = current.find((item) => item.id === id)
      if (image) URL.revokeObjectURL(image.url)
      return current.filter((item) => item.id !== id)
    })
  }

  const imageNames = images.map((image, index) =>
    screenshotFileName(index, image.name),
  )
  const draft = buildFeedbackReport({
    email: user?.email,
    userId: user?.userId,
    area,
    page: `${location.pathname}${location.search}`,
    happened,
    expected,
    steps,
    breadcrumbs: listBreadcrumbs(),
    error: chosenError,
    viewport:
      typeof window !== 'undefined'
        ? `${window.innerWidth}x${window.innerHeight}`
        : undefined,
    userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : undefined,
    timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    imageNames,
  })

  async function onSubmit(event: FormEvent) {
    event.preventDefault()
    const note = happened.trim()
    if (!note) return
    setBusy(true)
    setFormError(null)
    try {
      const capturedAt = new Date()
      const filename = feedbackZipName(capturedAt)
      const report = buildFeedbackReport({
        email: user?.email,
        userId: user?.userId,
        area,
        page: `${location.pathname}${location.search}`,
        happened: note,
        expected,
        steps,
        breadcrumbs: listBreadcrumbs(),
        error: chosenError,
        viewport: `${window.innerWidth}x${window.innerHeight}`,
        userAgent: navigator.userAgent,
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        capturedAt: capturedAt.toISOString(),
        imageNames,
      })
      const zipBytes = await buildFeedbackZip(
        report.fullText,
        images.map((image, index) => ({
          name: imageNames[index] ?? image.name,
          bytes: image.bytes,
        })),
      )
      const footer = `\n\nPlease attach ${filename}.`
      const mailed = canEmail
        ? buildMailtoUrl(address, report.subject, report.mailBody, footer)
        : { url: '', truncated: false }
      downloadZip(filename, zipBytes)
      if (mailed.url) {
        const link = document.createElement('a')
        link.href = mailed.url
        document.body.appendChild(link)
        link.click()
        link.remove()
      }
      if (includeError && pending) clearPendingError()
      track('feedback_report_prepared', {
        images: images.length,
        area,
        emailed: Boolean(mailed.url),
      })
      setDelivery({
        filename,
        mailto: mailed.url,
        truncated: mailed.truncated,
        summary: `${report.mailBody}${footer}`,
      })
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Could not prepare the report')
    } finally {
      setBusy(false)
    }
  }

  async function copySummary() {
    const text = delivery?.summary ?? `${draft.mailBody}\n\nPlease attach the downloaded zip.`
    try {
      await navigator.clipboard.writeText(text)
      setFormError(null)
    } catch {
      setFormError('Copy failed. Select the report text and copy it manually.')
    }
  }

  const visibleError = pending ?? logged

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Contact the developer</h1>
        <p className="text-muted-foreground text-sm">
          Describe what the app did. The report adds this page, what you did
          this visit, and a recent error if there is one. Screenshots go in a
          zip you attach to the email. Do not paste textbook pages or anything
          about a real patient.
        </p>
      </div>

      {formError ? (
        <Alert variant="destructive">
          <AlertTitle>Check the report</AlertTitle>
          <AlertDescription>{formError}</AlertDescription>
        </Alert>
      ) : null}

      {delivery ? (
        <Alert>
          <AlertTitle>Report downloaded</AlertTitle>
          <AlertDescription className="flex flex-col gap-2">
            <p>
              {canEmail ? (
                <>
                  Attach <span className="font-medium">{delivery.filename}</span>{' '}
                  to the email to {address}.
                </>
              ) : (
                <>
                  Downloaded <span className="font-medium">{delivery.filename}</span>.
                </>
              )}{' '}
              The zip has the full report{images.length ? ' and your screenshots' : ''}.
              {delivery.truncated
                ? ' The email text was shortened so the mail app would open. The zip is complete.'
                : null}
            </p>
            {delivery.mailto ? (
              <a className="underline underline-offset-2" href={delivery.mailto}>
                Open the email again
              </a>
            ) : (
              <p>
                This build does not have a developer address yet. Send the zip
                manually after the address is configured.
              </p>
            )}
          </AlertDescription>
        </Alert>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>What went wrong</CardTitle>
          <CardDescription>
            {canEmail
              ? `This opens an email to ${address} and downloads the zip.`
              : 'This downloads a zip. A developer address is not set for this build.'}
          </CardDescription>
        </CardHeader>
        <form onSubmit={onSubmit}>
          <CardContent className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="feedback-area">Which part of the app</Label>
              <select
                id="feedback-area"
                className={fieldClass}
                value={area}
                onChange={(event) => setArea(event.target.value as (typeof FEEDBACK_AREAS)[number])}
              >
                {FEEDBACK_AREAS.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="feedback-happened">What happened</Label>
              <textarea
                id="feedback-happened"
                required
                rows={4}
                maxLength={2000}
                className={fieldClass}
                value={happened}
                onChange={(event) => setHappened(event.target.value)}
                placeholder="Generate spins, then the page stays blank."
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="feedback-expected">What you expected</Label>
              <textarea
                id="feedback-expected"
                rows={2}
                maxLength={2000}
                className={fieldClass}
                value={expected}
                onChange={(event) => setExpected(event.target.value)}
                placeholder="A practice test for the chapter I typed."
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="feedback-steps">Steps to repeat</Label>
              <textarea
                id="feedback-steps"
                rows={3}
                maxLength={2000}
                className={fieldClass}
                value={steps}
                onChange={(event) => setSteps(event.target.value)}
                placeholder={'1. Open Practice Test\n2. Enter Chapter 12\n3. Click Generate'}
              />
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="feedback-shots">Screenshots</Label>
              <div
                className={`rounded-md border border-dashed px-3 py-4 text-sm ${
                  dragOver ? 'border-foreground bg-muted/60' : 'border-border'
                }`}
                onDragOver={(event) => {
                  event.preventDefault()
                  setDragOver(true)
                }}
                onDragLeave={() => setDragOver(false)}
                onDrop={(event) => {
                  event.preventDefault()
                  setDragOver(false)
                  void addFiles([...event.dataTransfer.files])
                }}
              >
                <p className="text-muted-foreground">
                  Paste, drop, or choose up to {MAX_FEEDBACK_IMAGES} images
                  (PNG, JPEG, WebP, or GIF, 1.5 MB each).
                </p>
                <input
                  id="feedback-shots"
                  className="mt-3 block text-sm"
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/gif"
                  multiple
                  onChange={(event) => {
                    const list = event.target.files
                    if (list?.length) void addFiles([...list])
                    event.target.value = ''
                  }}
                />
              </div>
              {images.length ? (
                <ul className="flex flex-wrap gap-3">
                  {images.map((image, index) => (
                    <li key={image.id} className="flex w-28 flex-col gap-1">
                      <img
                        src={image.url}
                        alt={imageNames[index] ?? 'Screenshot'}
                        className="border-border h-20 w-full rounded-md border object-cover"
                      />
                      <button
                        type="button"
                        className="text-muted-foreground text-left text-xs underline"
                        onClick={() => removeImage(image.id)}
                      >
                        Remove
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>

            {visibleError ? (
              <label className="flex items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  className="mt-1"
                  checked={includeError}
                  onChange={(event) => setIncludeError(event.target.checked)}
                />
                <span>
                  Include the latest error
                  <span className="text-muted-foreground block">
                    {visibleError.message}
                    {visibleError.route ? ` (${visibleError.route})` : ''}
                  </span>
                </span>
              </label>
            ) : null}

            <details className="text-sm">
              <summary className="cursor-pointer font-medium">
                Context that will be included
              </summary>
              <p className="text-muted-foreground mt-2">
                The email gets this summary. The zip also includes the stack
                trace when there is one. Course text and test answers are left
                out.
              </p>
              <pre className="bg-muted mt-2 max-h-64 overflow-auto rounded-md p-3 text-xs whitespace-pre-wrap">
                {draft.mailBody}
              </pre>
            </details>
          </CardContent>
          <CardFooter className="flex flex-wrap gap-2">
            <Button type="submit" disabled={busy || !happened.trim()}>
              {busy
                ? 'Preparing…'
                : canEmail
                  ? 'Download report and open email'
                  : 'Download report'}
            </Button>
            <Button type="button" variant="outline" onClick={() => void copySummary()}>
              Copy summary
            </Button>
          </CardFooter>
        </form>
      </Card>
    </div>
  )
}
