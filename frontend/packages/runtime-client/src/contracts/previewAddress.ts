/** An explicit local preview address, never inferred from the console origin. No network probe. */
export function isLocalPreviewUrl(value: unknown): value is string {
  if (
    typeof value !== 'string' ||
    value.length > 2048 ||
    value.trim() !== value ||
    /[\s\\]/.test(value) ||
    Array.from(value).some((char) => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127)
  )
    return false
  try {
    const url = new URL(value)
    return (
      ['http:', 'https:'].includes(url.protocol) &&
      ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) &&
      !url.username &&
      !url.password &&
      (!url.port || Number(url.port) > 0)
    )
  } catch {
    return false
  }
}
