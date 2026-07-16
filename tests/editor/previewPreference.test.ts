import { describe, expect, it } from 'vitest'
import {
  PREVIEW_STORAGE_KEY,
  readPreviewEnabled,
  writePreviewEnabled,
} from '@/editor/previewPreference'

function memoryStorage(initial?: Record<string, string>) {
  const data = new Map(Object.entries(initial ?? {}))
  return {
    getItem: (key: string) => (data.has(key) ? data.get(key)! : null),
    setItem: (key: string, value: string) => {
      data.set(key, value)
    },
  }
}

describe('previewPreference', () => {
  it('defaults to enabled when nothing is stored', () => {
    expect(readPreviewEnabled(memoryStorage())).toBe(true)
    expect(readPreviewEnabled(null)).toBe(true)
  })

  it('respects an explicit off preference', () => {
    expect(readPreviewEnabled(memoryStorage({ [PREVIEW_STORAGE_KEY]: '0' }))).toBe(false)
  })

  it('respects an explicit on preference', () => {
    expect(readPreviewEnabled(memoryStorage({ [PREVIEW_STORAGE_KEY]: '1' }))).toBe(true)
  })

  it('treats unknown stored values as enabled (only explicit 0 disables)', () => {
    expect(readPreviewEnabled(memoryStorage({ [PREVIEW_STORAGE_KEY]: 'yes' }))).toBe(true)
    expect(readPreviewEnabled(memoryStorage({ [PREVIEW_STORAGE_KEY]: '' }))).toBe(true)
  })

  it('persists toggle as 1 or 0', () => {
    const storage = memoryStorage()
    writePreviewEnabled(false, storage)
    expect(storage.getItem(PREVIEW_STORAGE_KEY)).toBe('0')
    expect(readPreviewEnabled(storage)).toBe(false)
    writePreviewEnabled(true, storage)
    expect(storage.getItem(PREVIEW_STORAGE_KEY)).toBe('1')
    expect(readPreviewEnabled(storage)).toBe(true)
  })
})
