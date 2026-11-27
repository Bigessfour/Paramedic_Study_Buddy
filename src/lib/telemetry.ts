import { dataClient } from '@/lib/amplifyData'
import { pushBreadcrumb } from './feedbackTrail'

const SENSITIVE_KEY =
  /^(api[_-]?key|password|passwd|secret|token|authorization|auth|xai|license|credential)/i

const MAX_METADATA_BYTES = 1800

function sanitizeMetadata(
  metadata?: Record<string, unknown>,
): string | undefined {
  if (!metadata) return undefined
  const clean: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(metadata)) {
    if (SENSITIVE_KEY.test(key)) continue
    if (value == null) continue
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      clean[key] = typeof value === 'string' ? value.slice(0, 200) : value
    }
  }
  let json = JSON.stringify(clean)
  if (json.length > MAX_METADATA_BYTES) {
    json = json.slice(0, MAX_METADATA_BYTES)
  }
  return json === '{}' ? undefined : json
}

/** Fire-and-forget usage event. Never throws into the UI. */
export function track(
  eventName: string,
  metadata?: Record<string, unknown>,
): void {
  const name = eventName.trim().slice(0, 80)
  if (!name) return
  pushBreadcrumb(name, sanitizeMetadata(metadata))
  const route =
    typeof window !== 'undefined'
      ? `${window.location.pathname}${window.location.search}`.slice(0, 300)
      : undefined
  void (async () => {
    try {
      await dataClient.models.UsageEvent.create({
        eventName: name,
        metadataJson: sanitizeMetadata(metadata),
        route,
        createdAt: new Date().toISOString(),
      })
    } catch {
      // Swallow — telemetry must not break product flows
    }
  })()
}
