import type { AuthUser } from '@/auth/api'

const ANON_PREFIX = 'anon:'

/** Distinct muted colors for different anonymous actors. */
const ANON_COLORS = [
  '#7eb8da',
  '#c9a0dc',
  '#8fbc8f',
  '#e0a878',
  '#d4a0a0',
  '#9ec5ab',
  '#b0a8e0',
  '#c4b59a',
] as const

export type ActorView = {
  /** Ready-to-show text (already localized where needed). */
  text: string
  /** Optional tint for anonymous actors. */
  color?: string
}

/** Value stored on audit / TM — never email. */
export function publicActorRef(u: AuthUser | null | undefined): string {
  const name = u?.display_name?.trim()
  if (name) return name
  if (u?.id) return `${ANON_PREFIX}${u.id}`
  return 'local'
}

function hashHue(key: string): string {
  let h = 0
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0
  return ANON_COLORS[h % ANON_COLORS.length]!
}

/**
 * How to show an actor id for the current viewer.
 * - own edits → "Вы"
 * - nickname → as stored
 * - anon:<id> / legacy local → "Инкогнито" (+ color when id known)
 */
export function presentActor(
  by: string | undefined,
  me: AuthUser | null | undefined,
  t: (key: string) => string,
): ActorView {
  const raw = (by || '').trim()
  if (raw.startsWith('tm:')) return { text: t('editor.auditFromTm') }

  const myName = me?.display_name?.trim()
  const myAnon = me?.id ? `${ANON_PREFIX}${me.id}` : ''
  if ((myName && raw === myName) || (myAnon && raw === myAnon)) {
    return { text: t('editor.actorYou') }
  }

  if (!raw || raw === 'local') {
    return { text: t('editor.actorIncognito') }
  }

  if (raw.startsWith(ANON_PREFIX)) {
    return { text: t('editor.actorIncognito'), color: hashHue(raw) }
  }

  return { text: raw }
}
