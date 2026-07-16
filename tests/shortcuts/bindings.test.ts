import { describe, expect, it } from 'vitest'
import {
  bindingFromEvent,
  formatBinding,
  isModifierOnly,
  matchesBinding,
  SHORTCUT_DEFAULTS,
} from '../../src/shortcuts/bindings'

function fakeKey(partial: Partial<KeyboardEvent> & Pick<KeyboardEvent, 'key' | 'code'>): KeyboardEvent {
  return {
    key: partial.key,
    code: partial.code,
    ctrlKey: partial.ctrlKey ?? false,
    altKey: partial.altKey ?? false,
    shiftKey: partial.shiftKey ?? false,
    metaKey: partial.metaKey ?? false,
  } as KeyboardEvent
}

describe('shortcut bindings', () => {
  it('defaults clearFocus to Escape', () => {
    expect(SHORTCUT_DEFAULTS.clearFocus.code).toBe('Escape')
  })

  it('matches Escape by code + modifiers', () => {
    const esc = SHORTCUT_DEFAULTS.clearFocus
    expect(matchesBinding(fakeKey({ key: 'Escape', code: 'Escape' }), esc)).toBe(true)
    expect(matchesBinding(fakeKey({ key: 'Escape', code: 'Escape', ctrlKey: true }), esc)).toBe(
      false,
    )
  })

  it('formats chords', () => {
    expect(formatBinding(SHORTCUT_DEFAULTS.clearFocus)).toBe('Esc')
    expect(
      formatBinding({
        key: 'k',
        code: 'KeyK',
        ctrl: true,
        alt: false,
        shift: true,
        meta: false,
      }),
    ).toBe('Ctrl+Shift+K')
  })

  it('rejects modifier-only keys', () => {
    expect(isModifierOnly(fakeKey({ key: 'Control', code: 'ControlLeft' }))).toBe(true)
    expect(isModifierOnly(fakeKey({ key: 'Escape', code: 'Escape' }))).toBe(false)
  })

  it('builds binding from event', () => {
    expect(bindingFromEvent(fakeKey({ key: 'F2', code: 'F2', altKey: true }))).toEqual({
      key: 'F2',
      code: 'F2',
      ctrl: false,
      alt: true,
      shift: false,
      meta: false,
    })
  })
})
