const INVITE_PATH = /(?:^|\/)(?:project|job)-invite\/([^/?#]+)/i

/** Extract an invite token from current or legacy invite links. Raw tokens are rejected. */
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
