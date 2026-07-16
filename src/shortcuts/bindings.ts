import { getStorageAccountId, scopedKey } from '@/storage/scope'

/** One chord: key + modifiers. `code` is the stable KeyboardEvent.code. */
export type KeyBinding = {
  key: string
  code: string
  ctrl: boolean
  alt: boolean
  shift: boolean
  meta: boolean
}

export type ShortcutBindings = {
  /** Clear editor focus / active segment (default Escape). */
  clearFocus: KeyBinding
}

const STORAGE_BASE = 'appzac-shortcuts'

export const SHORTCUT_DEFAULTS: ShortcutBindings = {
  clearFocus: {
    key: 'Escape',
    code: 'Escape',
    ctrl: false,
    alt: false,
    shift: false,
    meta: false,
  },
}

function storageKey(): string {
  if (!getStorageAccountId()) return STORAGE_BASE
  return scopedKey(STORAGE_BASE)
}

function isBinding(v: unknown): v is KeyBinding {
  if (!v || typeof v !== 'object') return false
  const b = v as Record<string, unknown>
  return (
    typeof b.key === 'string' &&
    typeof b.code === 'string' &&
    typeof b.ctrl === 'boolean' &&
    typeof b.alt === 'boolean' &&
    typeof b.shift === 'boolean' &&
    typeof b.meta === 'boolean'
  )
}

export function readShortcutBindings(): ShortcutBindings {
  if (typeof localStorage === 'undefined') return { ...SHORTCUT_DEFAULTS, clearFocus: { ...SHORTCUT_DEFAULTS.clearFocus } }
  try {
    const raw = localStorage.getItem(storageKey())
    if (!raw) return { clearFocus: { ...SHORTCUT_DEFAULTS.clearFocus } }
    const parsed = JSON.parse(raw) as Partial<ShortcutBindings>
    return {
      clearFocus: isBinding(parsed.clearFocus)
        ? { ...parsed.clearFocus }
        : { ...SHORTCUT_DEFAULTS.clearFocus },
    }
  } catch {
    return { clearFocus: { ...SHORTCUT_DEFAULTS.clearFocus } }
  }
}

export function writeShortcutBindings(bindings: ShortcutBindings): void {
  if (typeof localStorage === 'undefined') return
  localStorage.setItem(storageKey(), JSON.stringify(bindings))
}

export function bindingFromEvent(e: KeyboardEvent): KeyBinding {
  return {
    key: e.key,
    code: e.code,
    ctrl: e.ctrlKey,
    alt: e.altKey,
    shift: e.shiftKey,
    meta: e.metaKey,
  }
}

/** Modifier-only presses are not valid shortcuts. */
export function isModifierOnly(e: KeyboardEvent): boolean {
  return (
    e.key === 'Control' ||
    e.key === 'Shift' ||
    e.key === 'Alt' ||
    e.key === 'Meta' ||
    e.code === 'ControlLeft' ||
    e.code === 'ControlRight' ||
    e.code === 'ShiftLeft' ||
    e.code === 'ShiftRight' ||
    e.code === 'AltLeft' ||
    e.code === 'AltRight' ||
    e.code === 'MetaLeft' ||
    e.code === 'MetaRight'
  )
}

export function matchesBinding(e: KeyboardEvent, b: KeyBinding): boolean {
  return (
    e.code === b.code &&
    e.ctrlKey === b.ctrl &&
    e.altKey === b.alt &&
    e.shiftKey === b.shift &&
    e.metaKey === b.meta
  )
}

const CODE_LABELS: Record<string, string> = {
  Escape: 'Esc',
  Space: 'Space',
  Enter: 'Enter',
  Tab: 'Tab',
  Backspace: 'Backspace',
  Delete: 'Delete',
  ArrowUp: '↑',
  ArrowDown: '↓',
  ArrowLeft: '←',
  ArrowRight: '→',
}

function keyLabel(b: KeyBinding): string {
  if (CODE_LABELS[b.code]) return CODE_LABELS[b.code]
  if (b.code.startsWith('Key') && b.code.length === 4) return b.code.slice(3)
  if (b.code.startsWith('Digit') && b.code.length === 6) return b.code.slice(5)
  if (b.code.startsWith('Numpad') && b.code.length > 6) return `Num${b.code.slice(6)}`
  if (b.key.length === 1) return b.key.toUpperCase()
  return b.key
}

/** Human-readable chord, e.g. `Ctrl+Shift+K` or `Esc`. */
export function formatBinding(b: KeyBinding): string {
  const parts: string[] = []
  if (b.ctrl) parts.push('Ctrl')
  if (b.alt) parts.push('Alt')
  if (b.shift) parts.push('Shift')
  if (b.meta) parts.push('Meta')
  parts.push(keyLabel(b))
  return parts.join('+')
}
