import { openDB, type DBSchema, type IDBPDatabase } from 'idb'
import type { Segment } from '@/types/project'
import type { TmUnit } from '@/types/tm'
import { isSegmentDone } from '@/utils/segmentStatus'
import { tmLookupKey } from '@/tm/normalize'
import {
  buildTmUnitFromSegment,
  type TmUnitFromSegmentOptions,
} from '@/tm/unitFromSegment'
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

function isActive(unit: TmUnit): boolean {
  return !unit.deletedAt
}

/** Active units only (for matching / UI). */
export async function listTmUnits(): Promise<TmUnit[]> {
  const db = await getDb()
  const all = await db.getAllFromIndex('units', 'by-updated')
  return all.filter(isActive)
}

export async function getTmUnit(id: string): Promise<TmUnit | undefined> {
  const db = await getDb()
  return db.get('units', id)
}

export async function putTmUnit(unit: TmUnit): Promise<void> {
  const db = await getDb()
  await db.put('units', unit)
}

export async function removeTmUnit(id: string): Promise<void> {
  const db = await getDb()
  await db.delete('units', id)
}

export async function deleteTmForSegmentSource(
  source: string,
  options?: { sourceLang?: string; targetLang?: string },
): Promise<string[]> {
  const sourceKey = tmLookupKey(source, options?.sourceLang, options?.targetLang)
  const normalized = sourceKey.split('::')[0]
  if (!normalized) return []

  const db = await getDb()
  const existing = await db.getAllFromIndex('units', 'by-source-key', sourceKey)
  const now = new Date().toISOString()
  const dirty: string[] = []
  for (const unit of existing) {
    if (unit.deletedAt) continue
    const row: TmUnit = { ...unit, deletedAt: now, updatedAt: now }
    await db.put('units', row)
    dirty.push(unit.id)
  }
  return dirty
}

export async function upsertTmFromSegment(
  segment: Segment,
  options?: TmUnitFromSegmentOptions,
): Promise<string | null> {
  const sourceKey = tmLookupKey(
    segment.source,
    options?.sourceLang,
    options?.targetLang,
  )
  const db = await getDb()
  const existing = await db.getAllFromIndex(
    'units',
    'by-source-key',
    sourceKey,
  )
  const row = await buildTmUnitFromSegment(segment, options, existing)
  if (!row) return null
  await db.put('units', row)
  return row.id
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
): Promise<string[]> {
  const only = options?.onlyIds ? new Set(options.onlyIds) : null
  const ordered = [...segments]
  const dirty: string[] = []
  for (let i = 0; i < ordered.length; i++) {
    const segment = ordered[i]!
    if (only && !only.has(segment.id)) continue
    if (!isSegmentDone(segment)) continue
    const id = await upsertTmFromSegment(segment, {
      sourceLang: options?.sourceLang,
      targetLang: options?.targetLang,
      projectId: options?.projectId,
      actor: options?.actor,
      contextBefore: ordered[i - 1]?.source,
      contextAfter: ordered[i + 1]?.source,
    })
    if (id) dirty.push(id)
  }
  return dirty
}

export async function importTmUnits(units: TmUnit[]): Promise<{ count: number; ids: string[] }> {
  const db = await getDb()
  const ids: string[] = []
  for (const unit of units) {
    const row: TmUnit = { ...unit, deletedAt: unit.deletedAt ?? null }
    await db.put('units', row)
    ids.push(unit.id)
  }
  return { count: ids.length, ids }
}

export async function clearTmUnits(): Promise<void> {
  const db = await getDb()
  await db.clear('units')
}
