import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { useSegmentHistory } from '@/composables/useSegmentHistory'
import type { Segment } from '@/types/project'

function seg(partial: Partial<Segment> & Pick<Segment, 'id' | 'target'>): Segment {
  return {
    status: partial.status ?? (partial.target.trim() ? 'draft' : 'empty'),
    source: partial.source ?? 'src',
    paragraphId: 'p1',
    sentenceIndex: 0,
    spans: [],
    ...partial,
  } as Segment
}

describe('useSegmentHistory', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('undo/redo after discrete commits', () => {
    const h = useSegmentHistory()
    const a = seg({ id: '1', target: '', status: 'empty' })
    h.seed(a)
    h.commit(seg({ id: '1', target: 'one', status: 'draft' }))
    h.commit(seg({ id: '1', target: 'two', status: 'draft' }))

    expect(h.canUndo('1')).toBe(true)
    expect(h.redoCount('1')).toBe(0)

    const u1 = h.undo('1')
    expect(u1?.target).toBe('one')
    expect(h.redoCount('1')).toBe(1)

    const u2 = h.undo('1')
    expect(u2?.target).toBe('')
    expect(h.redoCount('1')).toBe(2)

    const r1 = h.redo('1')
    expect(r1?.target).toBe('one')
    expect(h.redoCount('1')).toBe(1)
  })

  it('coalesces typing into one tip step', () => {
    const h = useSegmentHistory()
    h.seed(seg({ id: '1', target: '', status: 'empty' }))
    h.commit(seg({ id: '1', target: 'h', status: 'draft' }), { coalesce: true })
    vi.advanceTimersByTime(200)
    h.commit(seg({ id: '1', target: 'hi', status: 'draft' }), { coalesce: true })
    vi.advanceTimersByTime(200)
    h.commit(seg({ id: '1', target: 'hi!', status: 'draft' }), { coalesce: true })

    expect(h.undo('1')?.target).toBe('')
    expect(h.canUndo('1')).toBe(false)
    expect(h.redo('1')?.target).toBe('hi!')
  })

  it('does not coalesce over a discrete tip', () => {
    const h = useSegmentHistory()
    h.seed(seg({ id: '1', target: '', status: 'empty' }))
    h.commit(seg({ id: '1', target: 'from-tm', status: 'draft' }))
    h.commit(seg({ id: '1', target: 'typed', status: 'draft' }), { coalesce: true })

    expect(h.undo('1')?.target).toBe('from-tm')
    expect(h.undo('1')?.target).toBe('')
  })

  it('truncates redo on new edit after undo', () => {
    const h = useSegmentHistory()
    h.seed(seg({ id: '1', target: 'a', status: 'draft' }))
    h.commit(seg({ id: '1', target: 'b', status: 'draft' }))
    h.commit(seg({ id: '1', target: 'c', status: 'draft' }))
    h.undo('1')
    h.undo('1')
    expect(h.redoCount('1')).toBe(2)
    h.commit(seg({ id: '1', target: 'x', status: 'draft' }))
    expect(h.canRedo('1')).toBe(false)
    expect(h.redoCount('1')).toBe(0)
    expect(h.undo('1')?.target).toBe('a')
  })
})
