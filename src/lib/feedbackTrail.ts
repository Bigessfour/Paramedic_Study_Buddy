import type { FeedbackBreadcrumb, FeedbackError } from './feedbackTypes.ts'
import { scrubSecrets } from './scrub.ts'

const TRAIL_KEY = 'psb.feedback.trail'
const PENDING_KEY = 'psb.feedback.pending'
const MAX_CRUMBS = 25
const DEDUPE_MS = 1000

export type TrailStore = {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
  removeItem(key: string): void
}

export function createMemoryTrailStore(): TrailStore {
  const data = new Map<string, string>()
  return {
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => {
      data.set(key, value)
    },
    removeItem: (key) => {
      data.delete(key)
    },
  }
}

function browserStore(): TrailStore | null {
  if (typeof sessionStorage === 'undefined') return null
  try {
    const probe = '__psb_probe__'
    sessionStorage.setItem(probe, '1')
    sessionStorage.removeItem(probe)
    return sessionStorage
  } catch {
    return null
  }
}

let memoryFallback: TrailStore | null = null

function activeStore(store?: TrailStore): TrailStore {
  if (store) return store
  return browserStore() ?? (memoryFallback ??= createMemoryTrailStore())
}

function readJson<T>(store: TrailStore, key: string): T | null {
  try {
    const raw = store.getItem(key)
    if (!raw) return null
    return JSON.parse(raw) as T
  } catch {
    return null
  }
}

function writeJson(store: TrailStore, key: string, value: unknown): void {
  try {
    store.setItem(key, JSON.stringify(value))
  } catch {
    // Quota or private mode: the report still sends what we already have.
  }
}

/** Session trail of pages and tracked actions. Never throws. */
export function pushBreadcrumb(
  action: string,
  detail?: string,
  store?: TrailStore,
): void {
  const cleaned = scrubSecrets(action.trim(), 80)
  if (!cleaned) return
  const extra = detail ? scrubSecrets(detail.trim(), 180) : undefined
  const target = activeStore(store)
  const list = readJson<FeedbackBreadcrumb[]>(target, TRAIL_KEY) ?? []
  const crumbs = Array.isArray(list) ? list : []
  const now = Date.now()
  const last = crumbs[crumbs.length - 1]
  if (
    last &&
    last.action === cleaned &&
    last.detail === extra &&
    now - Date.parse(last.at) < DEDUPE_MS
  ) {
    return
  }
  crumbs.push({
    at: new Date(now).toISOString(),
    action: cleaned,
    detail: extra || undefined,
  })
  while (crumbs.length > MAX_CRUMBS) crumbs.shift()
  writeJson(target, TRAIL_KEY, crumbs)
}

export function listBreadcrumbs(store?: TrailStore): FeedbackBreadcrumb[] {
  const list = readJson<FeedbackBreadcrumb[]>(activeStore(store), TRAIL_KEY)
  if (!Array.isArray(list)) return []
  return list.filter(
    (crumb) => crumb && typeof crumb.action === 'string' && crumb.action,
  )
}

/** Remember the crash that sent the student to Contact. */
export function stashPendingError(
  error: FeedbackError,
  store?: TrailStore,
): void {
  const message = scrubSecrets(error.message.trim(), 500)
  if (!message) return
  const pending: FeedbackError = {
    message,
    stack: error.stack ? scrubSecrets(error.stack, 4000) : undefined,
    route: error.route ? scrubSecrets(error.route, 300) : undefined,
    componentHint: error.componentHint
      ? scrubSecrets(error.componentHint, 120)
      : undefined,
    createdAt: error.createdAt ?? new Date().toISOString(),
  }
  writeJson(activeStore(store), PENDING_KEY, pending)
}

export function readPendingError(store?: TrailStore): FeedbackError | null {
  const pending = readJson<FeedbackError>(activeStore(store), PENDING_KEY)
  if (!pending || typeof pending.message !== 'string' || !pending.message) {
    return null
  }
  return pending
}

export function clearPendingError(store?: TrailStore): void {
  try {
    activeStore(store).removeItem(PENDING_KEY)
  } catch {
    // Ignore storage failures.
  }
}
