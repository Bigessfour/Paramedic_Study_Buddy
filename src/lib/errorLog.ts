import { dataClient } from '@/lib/amplifyData'
import { scrubSecrets } from './scrub'

const MAX_STACK = 4000
const MAX_MESSAGE = 500

export type ReportErrorInput = {
  message: string
  stack?: string
  route?: string
  componentHint?: string
}

function scrubMessage(message: string): string {
  return scrubSecrets(message, MAX_MESSAGE)
}

/** Persist a runtime error. Fire-and-forget; never throws into the UI. */
export function reportError(input: ReportErrorInput): void {
  const message = scrubMessage(String(input.message || 'Unknown error'))
  if (!message) return
  const route =
    input.route ??
    (typeof window !== 'undefined'
      ? `${window.location.pathname}${window.location.search}`.slice(0, 300)
      : undefined)
  const stack = input.stack ? scrubSecrets(input.stack, MAX_STACK) : undefined
  const userAgent =
    typeof navigator !== 'undefined'
      ? navigator.userAgent.slice(0, 200)
      : undefined

  void (async () => {
    try {
      await dataClient.models.ErrorLog.create({
        message,
        stack,
        route,
        componentHint: input.componentHint?.slice(0, 120),
        userAgent,
        createdAt: new Date().toISOString(),
      })
    } catch {
      // Swallow
    }
  })()
}

let globalHandlersInstalled = false

/** Install once: window.onerror + unhandledrejection. */
export function installGlobalErrorHandlers(): void {
  if (globalHandlersInstalled || typeof window === 'undefined') return
  globalHandlersInstalled = true

  window.addEventListener('error', (event) => {
    reportError({
      message: event.message || String(event.error ?? 'window.error'),
      stack: event.error instanceof Error ? event.error.stack : undefined,
      componentHint: 'window.onerror',
    })
  })

  window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason
    const message =
      reason instanceof Error
        ? reason.message
        : typeof reason === 'string'
          ? reason
          : 'Unhandled promise rejection'
    reportError({
      message,
      stack: reason instanceof Error ? reason.stack : undefined,
      componentHint: 'unhandledrejection',
    })
  })
}
