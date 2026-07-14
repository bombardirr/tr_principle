import { openDB, type DBSchema, type IDBPDatabase } from 'idb'
import type { Segment } from '@/types/project'
import type { TmUnit } from '@/types/tm'
import { isSegmentDone } from '@/utils/segmentStatus'
import { tmLookupKey } from '@/tm/normalize'
import { onStorageAccountChange, scopedDbName } from '@/storage/scope'

interface TmDb extends DBSchema {
  units: {
    key: string
    value: TmUnit
    indexes: { 'by-source-key': string; 'by-updated': string }
  }
}

const DB_BASE = 'appzac-tm'
const DB_VERSION = 1

let dbPromise: Promise<IDBPDatabase<TmDb>> | null = null

onStorageAccountChange(() => {
  dbPromise = null
})

function getDb() {
  if (!dbPromise) {
    const name = scopedDbName(DB_BASE)
    dbPromise = openDB<TmDb>(name, DB_VERSION, {
      upgrade(db) {
        const store = db.createObjectStore('units', { keyPath: 'id' })
        store.createIndex('by-source-key', 'sourceKey')
        store.createIndex('by-updated', 'updatedAt')
      },
    })
  }
  return dbPromise
}

export async function listTmUnits(): Promise<TmUnit[]> {
  const db = await getDb()
  return db.getAllFromIndex('units', 'by-updated')
}

export async function deleteTmForSegmentSource(
  source: string,
  options?: { sourceLang?: string; targetLang?: string },
): Promise<number> {
  const sourceKey = tmLookupKey(source, options?.sourceLang, options?.targetLang)
  const normalized = sourceKey.split('::')[0]
  if (!normalized) return 0

  const db = await getDb()
  const existing = await db.getAllFromIndex('units', 'by-source-key', sourceKey)
  for (const unit of existing) {
    await db.delete('units', unit.id)
  }
  return existing.length
}

export async function upsertTmFromSegment(
  segment: Segment,
  options?: {
    sourceLang?: string
    targetLang?: string
    projectId?: string
    actor?: string
    contextBefore?: string
    contextAfter?: string
  },
): Promise<void> {
  if (!isSegmentDone(segment)) return
  // Empty confirmed segments are local-only; never write or erase TM for them.
  if (!segment.target.trim()) return
  const sourceKey = tmLookupKey(
    segment.source,
    options?.sourceLang,
    options?.targetLang,
  )
  const normalized = sourceKey.split('::')[0]
  if (!normalized) return

  const db = await getDb()
  const existing = await db.getAllFromIndex('units', 'by-source-key', sourceKey)
  const sameTarget = existing.find((u) => u.target === segment.target)
  const now = new Date().toISOString()
  const actor = options?.actor ?? 'local'
  const prev = sameTarget
  const row: TmUnit = {
    id: prev?.id ?? crypto.randomUUID(),
    source: segment.source,
    target: segment.target,
    sourceKey,
    sourceLang: options?.sourceLang,
    targetLang: options?.targetLang,
    createdAt: prev?.createdAt ?? now,
    updatedAt: now,
    projectId: options?.projectId,
    createdBy: prev?.createdBy ?? actor,
    updatedBy: actor,
    contextBefore: options?.contextBefore ?? prev?.contextBefore,
    contextAfter: options?.contextAfter ?? prev?.contextAfter,
  }
  await db.put('units', row)
}

export async function recordDoneSegmentsInTm(
  segments: Segment[],
  options?: {
    sourceLang?: string
    targetLang?: string
    projectId?: string
    actor?: string
    /** If set, only these segment ids are written (still uses full list for context). */
    onlyIds?: Iterable<string>
  },
): Promise<void> {
  const only = options?.onlyIds ? new Set(options.onlyIds) : null
  const ordered = [...segments]
  for (let i = 0; i < ordered.length; i++) {
    const segment = ordered[i]!
    if (only && !only.has(segment.id)) continue
    if (!isSegmentDone(segment)) continue
    await upsertTmFromSegment(segment, {
      sourceLang: options?.sourceLang,
      targetLang: options?.targetLang,
      projectId: options?.projectId,
      actor: options?.actor,
      contextBefore: ordered[i - 1]?.source,
      contextAfter: ordered[i + 1]?.source,
    })
  }
}

export async function importTmUnits(units: TmUnit[]): Promise<number> {
  const db = await getDb()
  let count = 0
  for (const unit of units) {
    await db.put('units', unit)
    count++
  }
  return count
}

export async function clearTmUnits(): Promise<void> {
  const db = await getDb()
  await db.clear('units')
}
