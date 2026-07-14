/** Account-scoped local storage (opaque UUID from JWT). */
let accountId: string | null = null
const listeners = new Set<() => void>()

export function getStorageAccountId(): string | null {
  return accountId
}

export function requireStorageAccountId(): string {
  if (!accountId) throw new Error('Not authenticated')
  return accountId
}

export function setStorageAccountId(id: string | null) {
  if (accountId === id) return
  accountId = id
  for (const fn of listeners) fn()
}

/** Called when account changes so DB connections reopen under a new name. */
export function onStorageAccountChange(fn: () => void): () => void {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

export function scopedDbName(base: string): string {
  const id = requireStorageAccountId()
  return `${base}:${id}`
}

export function scopedKey(base: string): string {
  const id = requireStorageAccountId()
  return `${base}:${id}`
}
