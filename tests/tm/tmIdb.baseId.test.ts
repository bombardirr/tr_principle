import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { setStorageAccountId } from '@/storage/scope'
import {
  clearTmUnits,
  getTmBaseStats,
  importTmUnits,
  listTmUnits,
  putTmUnit,
} from '@/storage/tmIdb'
import { PERSONAL_TM_ATTACHMENT_ID } from '@/tm/projectAttachments'
import type { TmUnit } from '@/types/tm'

function unit(partial: Partial<TmUnit> & Pick<TmUnit, 'id' | 'source' | 'target'>): TmUnit {
  const now = '2026-07-21T00:00:00.000Z'
  return {
    baseId: PERSONAL_TM_ATTACHMENT_ID,
    sourceKey: partial.source,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    ...partial,
  }
}

describe('tmIdb baseId', () => {
  beforeEach(async () => {
    setStorageAccountId('00000000-0000-4000-8000-0000000000bb')
    await clearTmUnits()
  })

  afterEach(() => {
    setStorageAccountId(null)
  })

  it('tags missing baseId as personal and filters by base', async () => {
    await putTmUnit(
      unit({
        id: 'legacy',
        source: 'a',
        target: 'а',
        baseId: undefined as unknown as string,
      }),
    )
    await importTmUnits(
      [
        unit({
          id: 'n1',
          source: 'b',
          target: 'б',
          baseId: 'named-1',
        }),
      ],
      { baseId: 'named-1' },
    )

    const personal = await listTmUnits({ baseIds: [PERSONAL_TM_ATTACHMENT_ID] })
    expect(personal.map(u => u.id)).toContain('legacy')
    expect(personal.every(u => u.baseId === PERSONAL_TM_ATTACHMENT_ID)).toBe(true)

    const named = await listTmUnits({ baseIds: ['named-1'] })
    expect(named.map(u => u.id)).toEqual(['n1'])

    const stats = await getTmBaseStats('named-1')
    expect(stats.count).toBe(1)

    await clearTmUnits('named-1')
    expect(await listTmUnits({ baseIds: ['named-1'] })).toEqual([])
    expect((await listTmUnits({ baseIds: [PERSONAL_TM_ATTACHMENT_ID] })).length).toBeGreaterThan(0)
  })
})
