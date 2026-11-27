/** Strip tokens and keys from text a student might send to the developer. */
export function scrubSecrets(value: string, max = 4000): string {
  return value
    .replace(/sk-[a-zA-Z0-9]{10,}/g, '[redacted]')
    .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, 'Bearer [redacted]')
    .replace(/api[_-]?key[=:]\s*\S+/gi, 'api_key=[redacted]')
    .replace(
      /eyJ[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}/g,
      '[redacted]',
    )
    .slice(0, max)
}
