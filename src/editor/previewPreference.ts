export const PREVIEW_STORAGE_KEY = 'appzac-preview-enabled'

type StorageLike = {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}

function defaultStorage(): StorageLike | null {
  return typeof localStorage !== 'undefined' ? localStorage : null
}

/** Preview is on by default; only an explicit `'0'` turns it off. */
export function readPreviewEnabled(storage: StorageLike | null = defaultStorage()): boolean {
  if (!storage) return true
  return storage.getItem(PREVIEW_STORAGE_KEY) !== '0'
}

export function writePreviewEnabled(
  enabled: boolean,
  storage: StorageLike | null = defaultStorage(),
): void {
  storage?.setItem(PREVIEW_STORAGE_KEY, enabled ? '1' : '0')
}
