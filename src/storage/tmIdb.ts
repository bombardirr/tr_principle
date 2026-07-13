import { openDB, type DBSchema, type IDBPDatabase } from 'idb'
import type { Segment } from '@/types/project'
import type { TmUnit } from '@/types/tm'
import { isSegmentDone } from '@/utils/segmentStatus'
import { tmLookupKey } from '@/tm/normalize'

interface TmDb extends DBSchema {
  units: {
    key: string
    value: TmUnit
    indexes: { 'by-source-key': string; 'by-updated': string }
  }
}

const DB_NAME = 'appzac-tm'
const DB_VERSION = 1

let dbPromise: Promise<IDBPDatabase<TmDb>> | null = null

function getDb() {
  if (!dbPromise) {
    dbPromise = openDB<TmDb>(DB_NAME, DB_VERSION, {
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
  options?: { sourceLang?: string; targetLang?: string; projectId?: string },
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
  const now = new Date().toISOString()
  const row: TmUnit = {
    id: existing[0]?.id ?? crypto.randomUUID(),
    source: segment.source,
    target: segment.target,
    sourceKey,
    sourceLang: options?.sourceLang,
    targetLang: options?.targetLang,
    createdAt: existing[0]?.createdAt ?? now,
    updatedAt: now,
    projectId: options?.projectId,
  }
  await db.put('units', row)
}

export async function recordDoneSegmentsInTm(
  segments: Segment[],
  options?: { sourceLang?: string; targetLang?: string; projectId?: string },
): Promise<void> {
  for (const segment of segments) {
    if (!isSegmentDone(segment)) continue
    await upsertTmFromSegment(segment, options)
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
