import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { setStorageAccountId } from '@/storage/scope'
import {
  createTmBase,
  deleteTmBase,
  ensurePersonalTmBase,
  listTmBases,
} from '@/storage/tmBasesIdb'
import { PERSONAL_TM_ATTACHMENT_ID } from '@/tm/projectAttachments'

describe('tmBasesIdb catalog', () => {
  beforeEach(() => {
    setStorageAccountId('00000000-0000-4000-8000-0000000000aa')
  })

  afterEach(() => {
    setStorageAccountId(null)
  })

  it('ensures personal and creates named bases', async () => {
    await ensurePersonalTmBase()
    const named = await createTmBase({ label: 'Client TM' })
    const all = await listTmBases()
    expect(all.some(b => b.id === PERSONAL_TM_ATTACHMENT_ID)).toBe(true)
    expect(all.some(b => b.id === named.id && b.label === 'Client TM')).toBe(true)
    await deleteTmBase(named.id)
    const after = await listTmBases()
    expect(after.some(b => b.id === named.id)).toBe(false)
  })

  it('rejects deleting personal', async () => {
    await ensurePersonalTmBase()
    await expect(deleteTmBase(PERSONAL_TM_ATTACHMENT_ID)).rejects.toThrow()
  })
})
