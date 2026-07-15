import { describe, expect, it } from 'vitest'
import { appendSegmentAudit } from '@/utils/segmentAudit'

describe('appendSegmentAudit', () => {
  it('appends a new entry', () => {
    const next = appendSegmentAudit([], {
      action: 'tm',
      by: 'tm:u1',
      detail: '101%',
      at: '2026-07-15T10:00:00.000Z',
    })
    expect(next).toHaveLength(1)
    expect(next[0]).toMatchObject({
      action: 'tm',
      by: 'tm:u1',
      detail: '101%',
    })
  })

  it('coalesces rapid manual edits and keeps before/after', () => {
    const first = appendSegmentAudit([], {
      action: 'manual',
      by: 'local',
      at: '2026-07-15T10:00:00.000Z',
      before: '',
      after: 'a',
    })
    const second = appendSegmentAudit(first, {
      action: 'manual',
      by: 'local',
      at: '2026-07-15T10:00:01.000Z',
      before: 'a',
      after: 'ab',
    })
    expect(second).toHaveLength(1)
    expect(second[0]?.at).toBe('2026-07-15T10:00:01.000Z')
    expect(second[0]?.before).toBe('')
    expect(second[0]?.after).toBe('ab')
  })

  it('does not coalesce non-manual or distant manual', () => {
    const afterTm = appendSegmentAudit(
      [
        {
          at: '2026-07-15T10:00:00.000Z',
          action: 'tm',
        },
      ],
      {
        action: 'manual',
        at: '2026-07-15T10:00:01.000Z',
      },
    )
    expect(afterTm).toHaveLength(2)

    const distant = appendSegmentAudit(
      [
        {
          at: '2026-07-15T10:00:00.000Z',
          action: 'manual',
        },
      ],
      {
        action: 'manual',
        at: '2026-07-15T10:00:10.000Z',
      },
      { coalesceMs: 3000 },
    )
    expect(distant).toHaveLength(2)
  })

  it('trims to max length', () => {
    let list = appendSegmentAudit(undefined, {
      action: 'reset',
      at: '2026-07-15T10:00:00.000Z',
    })
    for (let i = 1; i <= 45; i++) {
      list = appendSegmentAudit(list, {
        action: 'copy-source',
        at: `2026-07-15T10:${String(i).padStart(2, '0')}:00.000Z`,
      }, { max: 40 })
    }
    expect(list).toHaveLength(40)
    expect(list[0]?.action).toBe('copy-source')
  })
})
