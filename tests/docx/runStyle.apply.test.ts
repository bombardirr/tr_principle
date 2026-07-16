import { describe, expect, it } from 'vitest'
import {
  applyStyleRange,
  selectionHasProp,
  selectionUniformValue,
  toggleStyleRange,
} from '../../src/docx/runStyle'

describe('applyStyleRange', () => {
  it('toggles strike on like bold', () => {
    const next = applyStyleRange([], 5, 1, 4, { op: 'toggle', prop: 'strike' })
    expect(selectionHasProp(next, 5, 1, 4, 'strike')).toBe(true)
    const off = applyStyleRange(next, 5, 1, 4, { op: 'toggle', prop: 'strike' })
    expect(selectionHasProp(off, 5, 1, 4, 'strike')).toBe(false)
  })

  it('sets and clears font', () => {
    const set = applyStyleRange([], 4, 0, 4, { op: 'set', prop: 'font', value: 'Arial' })
    expect(selectionUniformValue(set, 4, 0, 4, 'font')).toBe('Arial')
    const cleared = applyStyleRange(set, 4, 0, 4, { op: 'set', prop: 'font', value: null })
    expect(selectionUniformValue(cleared, 4, 0, 4, 'font')).toBeNull()
  })

  it('vertAlign is exclusive; clear via null, switch via other value', () => {
    const sup = applyStyleRange([], 3, 0, 3, {
      op: 'set',
      prop: 'vertAlign',
      value: 'superscript',
    })
    expect(selectionUniformValue(sup, 3, 0, 3, 'vertAlign')).toBe('superscript')
    const sub = applyStyleRange(sup, 3, 0, 3, {
      op: 'set',
      prop: 'vertAlign',
      value: 'subscript',
    })
    expect(selectionUniformValue(sub, 3, 0, 3, 'vertAlign')).toBe('subscript')
    const none = applyStyleRange(sub, 3, 0, 3, { op: 'set', prop: 'vertAlign', value: null })
    expect(selectionUniformValue(none, 3, 0, 3, 'vertAlign')).toBeNull()
  })

  it('reports mixed font as undefined', () => {
    let styles = applyStyleRange([], 4, 0, 2, { op: 'set', prop: 'font', value: 'Arial' })
    styles = applyStyleRange(styles, 4, 2, 4, { op: 'set', prop: 'font', value: 'Georgia' })
    expect(selectionUniformValue(styles, 4, 0, 4, 'font')).toBeUndefined()
  })

  it('toggleStyleRange still works for bold', () => {
    const next = toggleStyleRange([], 3, 0, 3, 'bold')
    expect(selectionHasProp(next, 3, 0, 3, 'bold')).toBe(true)
  })
})
