import { describe, expect, it } from 'vitest'
import {
  PERSONAL_TM_ATTACHMENT_ID,
  attachProjectTm,
  detachProjectTm,
  normalizeProjectTmAttachments,
  canReadPersonalTm,
  canWritePersonalTm,
} from '../../src/tm/projectAttachments'
import type { ProjectMeta } from '../../src/types/project'

function meta(partial: Partial<ProjectMeta> = {}): ProjectMeta {
  return {
    id: 'p1',
    name: 'P',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    segmentCount: 0,
    doneCount: 0,
    ...partial,
  }
}

describe('normalizeProjectTmAttachments', () => {
  it('returns empty when missing', () => {
    expect(normalizeProjectTmAttachments(meta())).toEqual([])
  })

  it('migrates connected:true to presence and drops connected:false', () => {
    const out = normalizeProjectTmAttachments(
      meta({
        tmAttachments: [
          { id: PERSONAL_TM_ATTACHMENT_ID, connected: true, canRead: true, canWrite: false } as never,
        ],
      }),
    )
    expect(out).toEqual([
      { id: PERSONAL_TM_ATTACHMENT_ID, canRead: true, canWrite: false },
    ])
  })

  it('drops connected:false entries', () => {
    const out = normalizeProjectTmAttachments(
      meta({
        tmAttachments: [
          { id: PERSONAL_TM_ATTACHMENT_ID, connected: false, canRead: true, canWrite: true } as never,
        ],
      }),
    )
    expect(out).toEqual([])
  })

  it('keeps arbitrary string base ids', () => {
    const out = normalizeProjectTmAttachments(
      meta({
        tmAttachments: [{ id: 'named-uuid', canRead: true, canWrite: false }],
      }),
    )
    expect(out).toEqual([{ id: 'named-uuid', canRead: true, canWrite: false }])
  })
})

describe('attach / detach', () => {
  it('attach is idempotent with default R+W', () => {
    const once = attachProjectTm(meta(), PERSONAL_TM_ATTACHMENT_ID)
    const twice = attachProjectTm({ ...meta(), tmAttachments: once }, PERSONAL_TM_ATTACHMENT_ID)
    expect(once).toEqual([{ id: PERSONAL_TM_ATTACHMENT_ID, canRead: true, canWrite: true }])
    expect(twice).toEqual(once)
  })

  it('detach removes entry', () => {
    const attached = attachProjectTm(meta(), PERSONAL_TM_ATTACHMENT_ID)
    expect(detachProjectTm({ ...meta(), tmAttachments: attached }, PERSONAL_TM_ATTACHMENT_ID)).toEqual([])
  })
})

describe('canRead / canWrite personal', () => {
  it('false when not attached', () => {
    expect(canReadPersonalTm(meta())).toBe(false)
    expect(canWritePersonalTm(meta())).toBe(false)
  })

  it('respects flags when attached', () => {
    const m = meta({
      tmAttachments: [{ id: PERSONAL_TM_ATTACHMENT_ID, canRead: true, canWrite: false }],
    })
    expect(canReadPersonalTm(m)).toBe(true)
    expect(canWritePersonalTm(m)).toBe(false)
  })
})
