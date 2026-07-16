import { openDB, type DBSchema, type IDBPDatabase } from 'idb'
import type { GlossaryTerm } from '@/types/glossary'
import { onStorageAccountChange, scopedDbName } from '@/storage/scope'

interface GlossaryDb extends DBSchema {
  terms: {
    key: string
    value: GlossaryTerm
    indexes: { 'by-updated': string }
  }
}

const DB_BASE = 'appzac-glossary'
const DB_VERSION = 1

let dbPromise: Promise<IDBPDatabase<GlossaryDb>> | null = null

onStorageAccountChange(() => {
  dbPromise = null
})

function getDb() {
  if (!dbPromise) {
    const name = scopedDbName(DB_BASE)
    dbPromise = openDB<GlossaryDb>(name, DB_VERSION, {
      upgrade(db) {
        const store = db.createObjectStore('terms', { keyPath: 'id' })
        store.createIndex('by-updated', 'updatedAt')
      },
    })
  }
  return dbPromise
}

function isActive(term: GlossaryTerm): boolean {
  return !term.deletedAt
}

export async function listGlossaryTerms(): Promise<GlossaryTerm[]> {
  const db = await getDb()
  const all = await db.getAllFromIndex('terms', 'by-updated')
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

export async function clearGlossaryTerms(): Promise<void> {
  const db = await getDb()
  await db.clear('terms')
}
