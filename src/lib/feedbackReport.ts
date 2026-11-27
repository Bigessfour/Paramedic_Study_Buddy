import JSZip from 'jszip'
import type { FeedbackBreadcrumb, FeedbackError, FeedbackImage } from './feedbackTypes.ts'
import { scrubSecrets } from './scrub.ts'

/** Keep mailto links under common client limits. The zip holds the rest. */
export const MAX_MAILTO_URL = 1800

export const MAX_FEEDBACK_IMAGES = 3
export const MAX_FEEDBACK_IMAGE_BYTES = 1_500_000

export const FEEDBACK_AREAS = [
  'Dashboard',
  'Materials',
  'Practice Test',
  'Review today',
  'Progress',
  'AI Tutor',
  'Flashcards',
  'Requests',
  'History',
  'Contact',
  'Sign in',
  'Something else',
] as const

export type FeedbackArea = (typeof FEEDBACK_AREAS)[number]

const AREA_ROUTES: { prefix: string; area: FeedbackArea }[] = [
  { prefix: '/dashboard', area: 'Dashboard' },
  { prefix: '/materials', area: 'Materials' },
  { prefix: '/practice', area: 'Practice Test' },
  { prefix: '/review', area: 'Review today' },
  { prefix: '/progress', area: 'Progress' },
  { prefix: '/tutor', area: 'AI Tutor' },
  { prefix: '/flashcards', area: 'Flashcards' },
  { prefix: '/requests', area: 'Requests' },
  { prefix: '/history', area: 'History' },
  { prefix: '/contact', area: 'Contact' },
  { prefix: '/login', area: 'Sign in' },
  { prefix: '/signup', area: 'Sign in' },
  { prefix: '/confirm', area: 'Sign in' },
]

const RECENT_ERROR_MS = 6 * 60 * 60 * 1000

export type FeedbackReportInput = {
  email?: string
  userId?: string
  area: string
  page: string
  happened: string
  expected?: string
  steps?: string
  breadcrumbs: FeedbackBreadcrumb[]
  error?: FeedbackError | null
  viewport?: string
  userAgent?: string
  timeZone?: string
  capturedAt?: string
  imageNames?: string[]
}

export type BuiltFeedbackReport = {
  fullText: string
  mailBody: string
  subject: string
}

export function isDeliverableEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim())
}

export function areaForPath(pathname: string): FeedbackArea {
  const hit = AREA_ROUTES.filter(
    (item) => pathname === item.prefix || pathname.startsWith(`${item.prefix}/`),
  ).sort((a, b) => b.prefix.length - a.prefix.length)[0]
  return hit?.area ?? 'Something else'
}

/** Prefer the page that broke, then the last place they opened before Contact. */
export function suggestArea(
  pathname: string | undefined,
  crumbs: FeedbackBreadcrumb[],
): FeedbackArea {
  if (pathname) {
    const fromPath = areaForPath(pathname)
    if (fromPath !== 'Something else' && fromPath !== 'Contact') return fromPath
  }
  for (let i = crumbs.length - 1; i >= 0; i--) {
    const match = /^Opened (.+)$/.exec(crumbs[i]?.action ?? '')
    if (!match) continue
    const label = match[1]
    if (label === 'Contact') continue
    if ((FEEDBACK_AREAS as readonly string[]).includes(label)) {
      return label as FeedbackArea
    }
  }
  return 'Something else'
}

export function pickLatestError(rows: FeedbackError[]): FeedbackError | null {
  const usable = rows.filter((row) => row.message.trim())
  if (!usable.length) return null
  return [...usable].sort((a, b) =>
    (b.createdAt ?? '').localeCompare(a.createdAt ?? ''),
  )[0]
}

export function shouldIncludeError(
  error: FeedbackError | null,
  now: Date,
  pending: boolean,
): boolean {
  if (!error?.message.trim()) return false
  if (pending) return true
  if (!error.createdAt) return false
  const at = Date.parse(error.createdAt)
  if (Number.isNaN(at)) return false
  return now.getTime() - at <= RECENT_ERROR_MS
}

export function isAcceptedImage(file: {
  type: string
  name: string
  size: number
}): string | null {
  if (file.size > MAX_FEEDBACK_IMAGE_BYTES) {
    return 'Each screenshot must be 1.5 MB or smaller.'
  }
  const type = file.type.toLowerCase()
  const okType =
    type === 'image/png' ||
    type === 'image/jpeg' ||
    type === 'image/webp' ||
    type === 'image/gif'
  const okName = /\.(png|jpe?g|webp|gif)$/i.test(file.name)
  if (!okType && !okName) {
    return 'Screenshots must be PNG, JPEG, WebP, or GIF.'
  }
  return null
}

export function screenshotFileName(index: number, originalName: string): string {
  const match = /\.(png|jpe?g|webp|gif)$/i.exec(originalName.trim())
  const ext = match ? match[1].toLowerCase().replace('jpeg', 'jpg') : 'png'
  return `screenshot-${index + 1}.${ext}`
}

export function feedbackZipName(at: Date): string {
  const stamp = at.toISOString().replace(/[-:]/g, '').slice(0, 13).replace('T', '-')
  return `study-buddy-feedback-${stamp}.zip`
}

export function feedbackSubject(area: string, happened: string): string {
  const summary = scrubSecrets(happened.replace(/\s+/g, ' ').trim(), 80)
  const prefix = `[Study Buddy] ${scrubSecrets(area.trim(), 40) || 'Feedback'}`
  return summary ? `${prefix}: ${summary}` : prefix
}

function formatWhen(iso: string, timeZone: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  try {
    const local = new Intl.DateTimeFormat('en-US', {
      timeZone,
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(date)
    return `${local} (${timeZone})`
  } catch {
    return `${iso} (${timeZone})`
  }
}

function formatClock(iso: string, timeZone: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso.slice(0, 16)
  try {
    return new Intl.DateTimeFormat('en-US', {
      timeZone,
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).format(date)
  } catch {
    return iso.slice(11, 16)
  }
}

function crumbLine(crumb: FeedbackBreadcrumb, timeZone: string): string {
  const when = formatClock(crumb.at, timeZone)
  const action = scrubSecrets(crumb.action, 80)
  const detail = crumb.detail ? ` ${scrubSecrets(crumb.detail, 180)}` : ''
  return `- ${when} ${action}${detail}`
}

function block(title: string, value: string | undefined, max: number): string[] {
  const text = scrubSecrets((value ?? '').trim(), max)
  if (!text) return []
  return ['', `${title}:`, text]
}

export function buildFeedbackReport(input: FeedbackReportInput): BuiltFeedbackReport {
  const capturedAt = input.capturedAt ?? new Date().toISOString()
  const timeZone = input.timeZone?.trim() || 'UTC'
  const crumbs = input.breadcrumbs.slice(-25)
  const images = (input.imageNames ?? []).map((name) => scrubSecrets(name, 80))
  const error = input.error?.message.trim()
    ? {
        message: scrubSecrets(input.error.message, 500),
        stack: input.error.stack ? scrubSecrets(input.error.stack, 4000) : undefined,
        route: input.error.route ? scrubSecrets(input.error.route, 300) : undefined,
        componentHint: input.error.componentHint
          ? scrubSecrets(input.error.componentHint, 120)
          : undefined,
      }
    : null

  const header = [
    'Paramedic Study Buddy — developer feedback',
    `When: ${formatWhen(capturedAt, timeZone)}`,
  ]
  if (input.email?.trim()) header.push(`From: ${scrubSecrets(input.email, 200)}`)
  if (input.userId?.trim()) header.push(`User id: ${scrubSecrets(input.userId, 80)}`)
  header.push(`Submitted from: ${scrubSecrets(input.page || '/', 300)}`)
  header.push(`Area: ${scrubSecrets(input.area || 'Something else', 80)}`)
  if (input.viewport?.trim()) {
    header.push(`Window: ${scrubSecrets(input.viewport, 40)}`)
  }
  if (input.userAgent?.trim()) {
    header.push(`Browser: ${scrubSecrets(input.userAgent, 180)}`)
  }

  const story = [
    '',
    'What happened:',
    scrubSecrets(input.happened.trim(), 2000) || '(not provided)',
    ...block('What I expected', input.expected, 2000),
    ...block('Steps to repeat', input.steps, 2000),
  ]

  const trail = crumbs.length
    ? ['', 'Recent actions:', ...crumbs.map((crumb) => crumbLine(crumb, timeZone))]
    : ['', 'Recent actions:', '(none recorded this visit)']

  const errorLines = error
    ? [
        '',
        'Latest error:',
        error.message,
        ...(error.route ? [`Error page: ${error.route}`] : []),
        ...(error.componentHint ? [`Component: ${error.componentHint}`] : []),
      ]
    : []

  const imageLines = images.length
    ? ['', `Screenshots: ${images.join(', ')}`]
    : ['', 'Screenshots: none']

  const mailBody = [
    ...header,
    ...story,
    '',
    'Recent actions:',
    ...(crumbs.length
      ? crumbs.slice(-8).map((crumb) => crumbLine(crumb, timeZone))
      : ['(none recorded this visit)']),
    ...errorLines,
    ...imageLines,
  ].join('\n')

  const fullText = [
    ...header,
    ...story,
    ...trail,
    ...errorLines,
    ...(error?.stack ? ['', 'Stack:', error.stack] : []),
    ...imageLines,
    '',
    'Course text and test answers are not included.',
  ].join('\n')

  return {
    fullText,
    mailBody,
    subject: feedbackSubject(input.area, input.happened),
  }
}

function mailtoUrl(to: string, subject: string, body: string): string {
  return `mailto:${to}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
}

export function buildMailtoUrl(
  to: string,
  subject: string,
  body: string,
  footer = '',
): { url: string; truncated: boolean } {
  const address = to.trim()
  const safeSubject = scrubSecrets(subject.replace(/[\r\n]+/g, ' '), 120)
  if (!isDeliverableEmail(address)) return { url: '', truncated: false }
  const intact = `${body.trimEnd()}${footer}`
  if (mailtoUrl(address, safeSubject, intact).length <= MAX_MAILTO_URL) {
    return { url: mailtoUrl(address, safeSubject, intact), truncated: false }
  }
  const note = '\n\n(Email shortened. The zip has the full report.)'
  const tail = `${note}${footer}`
  let lo = 0
  let hi = body.length
  let best = tail.trim()
  while (lo <= hi) {
    const mid = Math.floor((lo + hi) / 2)
    const candidate = `${body.slice(0, mid).trimEnd()}${tail}`
    if (mailtoUrl(address, safeSubject, candidate).length <= MAX_MAILTO_URL) {
      best = candidate
      lo = mid + 1
    } else {
      hi = mid - 1
    }
  }
  let url = mailtoUrl(address, safeSubject, best)
  if (url.length > MAX_MAILTO_URL) {
    url = mailtoUrl(address, safeSubject, tail.trim())
  }
  return { url, truncated: true }
}

export async function buildFeedbackZip(
  reportText: string,
  images: FeedbackImage[],
): Promise<Uint8Array> {
  const zip = new JSZip()
  zip.file('report.txt', reportText)
  images.slice(0, MAX_FEEDBACK_IMAGES).forEach((image, index) => {
    zip.file(screenshotFileName(index, image.name), image.bytes)
  })
  return zip.generateAsync({ type: 'uint8array' })
}
