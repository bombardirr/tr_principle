import { openDB, type DBSchema, type IDBPDatabase } from 'idb'
import { clearGlossaryTerms } from '@/storage/glossaryIdb'
import { onStorageAccountChange, scopedDbName } from '@/storage/scope'

export const PERSONAL_GLOSSARY_BASE_ID = 'personal-glossary'
export const GLOSSARY_BASE_COLORS = [
  '#5b9fd4',
  '#3dd68c',
  '#e8a838',
  '#c77dff',
  '#ff7a59',
  '#4db8ff',
  '#2dd4bf',
  '#f472b6',
] as const

export type GlossaryBaseRecord = {
  id: string
  label: string
  color: string
  createdAt: string
  updatedAt: string
  sharedOnly?: boolean
}

interface GlossaryBasesDb extends DBSchema {
  bases: {
    key: string
    value: GlossaryBaseRecord
  }
}

const DB_BASE = 'appzac-glossary-bases'
const DB_VERSION = 1
const SHARED_GLOSSARY_LOCAL_PREFIX = 'share:'

let dbPromise: Promise<IDBPDatabase<GlossaryBasesDb>> | null = null

onStorageAccountChange(() => {
  dbPromise = null
})

function getDb() {
  if (!dbPromise) {
    dbPromise = openDB<GlossaryBasesDb>(scopedDbName(DB_BASE), DB_VERSION, {
      upgrade(db) {
        db.createObjectStore('bases', { keyPath: 'id' })
      },
    })
  }
  return dbPromise
}

function personalDefault(): GlossaryBaseRecord {
  const now = new Date().toISOString()
  return {
    id: PERSONAL_GLOSSARY_BASE_ID,
    label: 'Personal glossary',
    color: GLOSSARY_BASE_COLORS[0],
    createdAt: now,
    updatedAt: now,
    sharedOnly: false,
  }
}

export async function ensurePersonalGlossaryBase(): Promise<GlossaryBaseRecord> {
  const db = await getDb()
  const existing = await db.get('bases', PERSONAL_GLOSSARY_BASE_ID)
  if (existing) return existing
  const row = personalDefault()
  await db.put('bases', row)
  return row
}

export async function listGlossaryBases(): Promise<GlossaryBaseRecord[]> {
  await ensurePersonalGlossaryBase()
  const db = await getDb()
  const all = await db.getAll('bases')
  return all.sort((a, b) => {
    if (a.id === PERSONAL_GLOSSARY_BASE_ID) return -1
    if (b.id === PERSONAL_GLOSSARY_BASE_ID) return 1
    return a.createdAt.localeCompare(b.createdAt)
  })
}

export function sharedGlossaryLocalId(ownerId: string, baseId: string): string {
  return `${SHARED_GLOSSARY_LOCAL_PREFIX}${ownerId}:${baseId}`
}

export async function createGlossaryBase(input: {
  label: string
  color?: string
}): Promise<GlossaryBaseRecord> {
  await ensurePersonalGlossaryBase()
  const label = input.label.trim()
  if (!label) throw new Error('empty label')
  const db = await getDb()
  const bases = await db.getAll('bases')
  const now = new Date().toISOString()
  const row: GlossaryBaseRecord = {
    id: crypto.randomUUID(),
    label,
    color: input.color ?? GLOSSARY_BASE_COLORS[bases.length % GLOSSARY_BASE_COLORS.length]!,
    createdAt: now,
    updatedAt: now,
    sharedOnly: false,
  }
  await db.put('bases', row)
  return row
}

/** Remove a named catalog row; the personal base is cleared but retained. */
export async function deleteGlossaryBase(id: string): Promise<void> {
  await clearGlossaryTerms(id)
  if (id === PERSONAL_GLOSSARY_BASE_ID) return
  const db = await getDb()
  await db.delete('bases', id)
}
