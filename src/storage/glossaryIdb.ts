import { openDB, type DBSchema, type IDBPDatabase } from 'idb'
import type { GlossaryTerm } from '@/types/glossary'
import { PERSONAL_GLOSSARY_BASE_ID } from '@/storage/glossaryBasesIdb'
import { onStorageAccountChange, scopedDbName } from '@/storage/scope'

interface GlossaryDb extends DBSchema {
  terms: {
    key: string
    value: GlossaryTerm
    indexes: { 'by-updated': string; 'by-base': string }
  }
}

const DB_BASE = 'appzac-glossary'
const DB_VERSION = 2

let dbPromise: Promise<IDBPDatabase<GlossaryDb>> | null = null

onStorageAccountChange(() => {
  dbPromise = null
})

function getDb() {
  if (!dbPromise) {
    const name = scopedDbName(DB_BASE)
    dbPromise = openDB<GlossaryDb>(name, DB_VERSION, {
      async upgrade(db, oldVersion, _newVersion, transaction) {
        const store =
          oldVersion === 0 ? db.createObjectStore('terms', { keyPath: 'id' }) : transaction.objectStore('terms')
        if (!store.indexNames.contains('by-updated')) {
          store.createIndex('by-updated', 'updatedAt')
        }
        if (!store.indexNames.contains('by-base')) {
          store.createIndex('by-base', 'baseId')
        }
        if (oldVersion < 2) {
          let cursor = await store.openCursor()
          while (cursor) {
            const term = cursor.value as GlossaryTerm
            if (!term.baseId) {
              await cursor.update({ ...term, baseId: PERSONAL_GLOSSARY_BASE_ID })
            }
            cursor = await cursor.continue()
          }
        }
      },
    })
  }
  return dbPromise
}

function isActive(term: GlossaryTerm): boolean {
  return !term.deletedAt
}

export async function listGlossaryTerms(options: { baseIds?: string[] } = {}): Promise<GlossaryTerm[]> {
  const db = await getDb()
  const requestedBaseIds = options.baseIds
  if (requestedBaseIds?.length === 0) return []
  const all = requestedBaseIds
    ? (
        await Promise.all(
          [...new Set(requestedBaseIds)].map((baseId) => db.getAllFromIndex('terms', 'by-base', baseId)),
        )
      ).flat()
    : await db.getAllFromIndex('terms', 'by-updated')
  return all.filter(isActive)
}

/** Including tombstones — for sync push. */
export async function getGlossaryTerm(id: string): Promise<GlossaryTerm | undefined> {
  const db = await getDb()
  return db.get('terms', id)
}

export async function putGlossaryTerm(term: GlossaryTerm): Promise<void> {
  const db = await getDb()
  await db.put('terms', term)
}

export async function removeGlossaryTerm(id: string): Promise<void> {
  const db = await getDb()
  await db.delete('terms', id)
}

export async function softDeleteGlossaryTerm(id: string): Promise<GlossaryTerm | null> {
  const existing = await getGlossaryTerm(id)
  if (!existing || existing.deletedAt) return null
  const now = new Date().toISOString()
  const row: GlossaryTerm = { ...existing, deletedAt: now, updatedAt: now }
  await putGlossaryTerm(row)
  return row
}

export async function clearGlossaryTerms(baseId?: string): Promise<void> {
  const db = await getDb()
  if (baseId) {
    const ids = await db.getAllKeysFromIndex('terms', 'by-base', baseId)
    const tx = db.transaction('terms', 'readwrite')
    await Promise.all(ids.map((id) => tx.store.delete(id)))
    await tx.done
    return
  }
  await db.clear('terms')
}
