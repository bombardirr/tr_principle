import { openDB, type DBSchema, type IDBPDatabase } from 'idb'
import { onStorageAccountChange, scopedDbName } from '@/storage/scope'
import { PERSONAL_TM_ATTACHMENT_ID, TM_BASE_COLORS } from '@/tm/projectAttachments'
import { upsertTmBaseApi, type TmBaseApiRecord } from '@/tm/api'

export type TmBaseRecord = {
  id: string
  label: string
  color: string
  createdAt: string
  updatedAt: string
  sharedOnly?: boolean
}

interface TmBasesDb extends DBSchema {
  bases: {
    key: string
    value: TmBaseRecord
  }
}

const DB_BASE = 'appzac-tm-bases'
const DB_VERSION = 1

let dbPromise: Promise<IDBPDatabase<TmBasesDb>> | null = null

onStorageAccountChange(() => {
  dbPromise = null
})

function getDb() {
  if (!dbPromise) {
    dbPromise = openDB<TmBasesDb>(scopedDbName(DB_BASE), DB_VERSION, {
      upgrade(db) {
        db.createObjectStore('bases', { keyPath: 'id' })
      },
    })
  }
  return dbPromise
}

function personalDefault(): TmBaseRecord {
  const now = new Date().toISOString()
  return {
    id: PERSONAL_TM_ATTACHMENT_ID,
    label: 'Personal TM',
    color: TM_BASE_COLORS[0]!,
    createdAt: now,
    updatedAt: now,
    sharedOnly: false,
  }
}

export async function ensurePersonalTmBase(): Promise<TmBaseRecord> {
  const db = await getDb()
  const existing = await db.get('bases', PERSONAL_TM_ATTACHMENT_ID)
  if (existing) return existing
  const row = personalDefault()
  await db.put('bases', row)
  return row
}

export async function listTmBases(): Promise<TmBaseRecord[]> {
  await ensurePersonalTmBase()
  const db = await getDb()
  const all = await db.getAll('bases')
  return all.sort((a, b) => {
    if (a.id === PERSONAL_TM_ATTACHMENT_ID) return -1
    if (b.id === PERSONAL_TM_ATTACHMENT_ID) return 1
    return a.createdAt.localeCompare(b.createdAt)
  })
}

export async function listOwnedTmBaseIds(): Promise<Set<string>> {
  const bases = await listTmBases()
  return new Set(bases.filter(base => base.sharedOnly !== true).map(base => base.id))
}

export async function getTmBase(id: string): Promise<TmBaseRecord | undefined> {
  const db = await getDb()
  return db.get('bases', id)
}

export async function upsertTmBasesFromCloud(bases: TmBaseApiRecord[]): Promise<void> {
  const db = await getDb()
  const tx = db.transaction('bases', 'readwrite')
  for (const base of bases) {
    await tx.store.put({ ...base, sharedOnly: false })
  }
  await tx.done
}

/** Cache catalog metadata for a readable job-shared base. Detach does not remove it. */
export async function upsertSharedTmBase(input: {
  id: string
  label: string
  color: string
}): Promise<TmBaseRecord> {
  const db = await getDb()
  const existing = await db.get('bases', input.id)
  const now = new Date().toISOString()
  const row: TmBaseRecord = {
    id: input.id,
    label: input.label,
    color: input.color,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
    sharedOnly: existing?.sharedOnly ?? !existing,
  }
  await db.put('bases', row)
  return row
}

export async function createTmBase(input: { label: string; id?: string }): Promise<TmBaseRecord> {
  await ensurePersonalTmBase()
  const label = input.label.trim()
  if (!label) throw new Error('empty label')
  const id = input.id?.trim() || crypto.randomUUID()
  if (id === PERSONAL_TM_ATTACHMENT_ID) throw new Error('reserved id')
  const db = await getDb()
  if (await db.get('bases', id)) throw new Error('base exists')
  const now = new Date().toISOString()
  const bases = await db.getAll('bases')
  const color = TM_BASE_COLORS[bases.length % TM_BASE_COLORS.length]!
  const row: TmBaseRecord = {
    id,
    label,
    color,
    createdAt: now,
    updatedAt: now,
    sharedOnly: false,
  }
  await db.put('bases', row)
  try {
    await upsertTmBaseApi({ id, label, color })
  } catch {
    // Keep local creation usable offline.
  }
  return row
}

export async function renameTmBase(id: string, label: string): Promise<TmBaseRecord> {
  const db = await getDb()
  const existing = await db.get('bases', id)
  if (!existing) throw new Error('base not found')
  const next = { ...existing, label: label.trim() || existing.label, updatedAt: new Date().toISOString() }
  await db.put('bases', next)
  return next
}

/** Remove catalog row (caller clears units). Personal cannot be removed. */
export async function deleteTmBase(id: string): Promise<void> {
  if (id === PERSONAL_TM_ATTACHMENT_ID) throw new Error('cannot delete personal')
  const db = await getDb()
  await db.delete('bases', id)
}

/** Ensure catalog has entries for attachment ids found on projects (soft repair). */
export async function ensureTmBasesForIds(ids: string[]): Promise<void> {
  await ensurePersonalTmBase()
  const db = await getDb()
  const now = new Date().toISOString()
  let i = 0
  for (const id of ids) {
    if (!id || (await db.get('bases', id))) continue
    const color = TM_BASE_COLORS[(i += 1) % TM_BASE_COLORS.length]!
    await db.put('bases', {
      id,
      label: id === PERSONAL_TM_ATTACHMENT_ID ? 'Personal TM' : id.slice(0, 8),
      color,
      createdAt: now,
      updatedAt: now,
      sharedOnly: false,
    })
  }
}
