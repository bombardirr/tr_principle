import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { openDB } from 'idb'
import { setStorageAccountId } from '@/storage/scope'

let accountId = ''
let dbName = ''

beforeEach(async () => {
  setStorageAccountId(null)
  accountId = `glossary-idb-test-${crypto.randomUUID()}`
  dbName = `appzac-glossary:${accountId}`
  setStorageAccountId(accountId)
})

describe('glossary IndexedDB', () => {
  it('migrates legacy terms to the personal glossary base', async () => {
    const legacy = await openDB(dbName, 1, {
      upgrade(db) {
        const store = db.createObjectStore('terms', { keyPath: 'id' })
        store.createIndex('by-updated', 'updatedAt')
      },
    })
    await legacy.put('terms', {
      id: 'legacy-term',
      sourceLang: 'en',
      targetLang: 'ru',
      sourceTerm: 'invoice',
      targetTerm: 'счёт',
      status: 'approved',
      caseSensitive: false,
      createdAt: '2026-07-22T00:00:00.000Z',
      updatedAt: '2026-07-22T00:00:00.000Z',
    })
    legacy.close()

    const { listGlossaryTerms } = await import('@/storage/glossaryIdb')
    const { PERSONAL_GLOSSARY_BASE_ID } = await import('@/storage/glossaryBasesIdb')

    await expect(listGlossaryTerms()).resolves.toMatchObject([
      { id: 'legacy-term', baseId: PERSONAL_GLOSSARY_BASE_ID },
    ])
  })

  it('lists active terms only from requested bases', async () => {
    const { listGlossaryTerms, putGlossaryTerm } = await import('@/storage/glossaryIdb')
    const { PERSONAL_GLOSSARY_BASE_ID } = await import('@/storage/glossaryBasesIdb')
    const timestamp = '2026-07-22T00:00:00.000Z'

    await putGlossaryTerm({
      id: 'personal',
      baseId: PERSONAL_GLOSSARY_BASE_ID,
      sourceLang: 'en',
      targetLang: 'ru',
      sourceTerm: 'invoice',
      targetTerm: 'счёт',
      status: 'approved',
      caseSensitive: false,
      createdAt: timestamp,
      updatedAt: timestamp,
    })
    await putGlossaryTerm({
      id: 'shared',
      baseId: 'base-a',
      sourceLang: 'en',
      targetLang: 'ru',
      sourceTerm: 'contract',
      targetTerm: 'договор',
      status: 'approved',
      caseSensitive: false,
      createdAt: timestamp,
      updatedAt: timestamp,
    })

    await expect(listGlossaryTerms({ baseIds: ['base-a'] })).resolves.toMatchObject([
      { id: 'shared', baseId: 'base-a' },
    ])
  })
})
