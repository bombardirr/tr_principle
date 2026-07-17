const INVITE_PATH = /(?:^|\/)job-invite\/([^/?#]+)/i

/** Extract invite token from a full or path-only `/job-invite/…` link. Raw tokens are rejected. */
export function parseJobInviteToken(input: string): string | null {
  const value = input.trim()
  if (!value) return null

  const pathMatch = value.match(INVITE_PATH)
  if (!pathMatch?.[1]) return null

  try {
    return decodeURIComponent(pathMatch[1])
  } catch {
    return null
  }
}
