/** Address baked in at build time. Visible to signed-in students on purpose. */
export function developerEmail(): string {
  const value = import.meta.env.VITE_DEVELOPER_EMAIL
  return typeof value === 'string' ? value.trim() : ''
}
