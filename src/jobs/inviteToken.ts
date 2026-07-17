const INVITE_PATH = /(?:^|\/)job-invite\/([^/?#]+)/i

export function parseJobInviteToken(input: string): string | null {
  const value = input.trim()
  if (!value) return null

  const pathMatch = value.match(INVITE_PATH)
  if (pathMatch?.[1]) {
    try {
      return decodeURIComponent(pathMatch[1])
    } catch {
      return null
    }
  }

  try {
    const url = new URL(value)
    if (url.protocol === 'http:' || url.protocol === 'https:') return null
  } catch {
    // A value that is not a URL is treated as a raw invite token.
  }

  return /^[^\s/?#]+$/.test(value) ? value : null
}
