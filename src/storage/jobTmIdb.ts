import { openDB, type DBSchema, type IDBPDatabase } from 'idb'
import type { Segment } from '@/types/project'
import type { TmUnit } from '@/types/tm'
import {
  buildTmUnitFromSegment,
  type TmUnitFromSegmentOptions,
} from '@/tm/unitFromSegment'
import { isSegmentDone } from '@/utils/segmentStatus'
import { onStorageAccountChange, requireStorageAccountId } from '@/storage/scope'
import { tmLookupKey } from '@/tm/normalize'

interface JobTmDb extends DBSchema {
  units: {
    key: string
    value: TmUnit
    indexes: { 'by-source-key': string; 'by-updated': string }
  }
}

const DB_BASE = 'appzac-job-tm'
const DB_VERSION = 1

const dbPromises = new Map<string, Promise<IDBPDatabase<JobTmDb>>>()

onStorageAccountChange(() => {
  dbPromises.clear()
})

function jobTmDbName(jobId: string): string {
  return `${DB_BASE}:${requireStorageAccountId()}:${jobId}`
}

function getDb(jobId: string) {
  let dbPromise = dbPromises.get(jobId)
  if (!dbPromise) {
    dbPromise = openDB<JobTmDb>(jobTmDbName(jobId), DB_VERSION, {
      upgrade(db) {
        const store = db.createObjectStore('units', { keyPath: 'id' })
        store.createIndex('by-source-key', 'sourceKey')
        store.createIndex('by-updated', 'updatedAt')
      },
    })
    dbPromises.set(jobId, dbPromise)
  }
  return dbPromise
}

function isActive(unit: TmUnit): boolean {
  return !unit.deletedAt
}

/** Active units only (for matching / UI). */
export async function listJobTmUnits(jobId: string): Promise<TmUnit[]> {
  const db = await getDb(jobId)
  const all = await db.getAllFromIndex('units', 'by-updated')
  return all.filter(isActive)
}

export async function getJobTmUnit(
  jobId: string,
  id: string,
): Promise<TmUnit | undefined> {
  const db = await getDb(jobId)
  return db.get('units', id)
}

export async function putJobTmUnit(jobId: string, unit: TmUnit): Promise<void> {
  const db = await getDb(jobId)
  await db.put('units', unit)
}

export async function removeJobTmUnit(jobId: string, id: string): Promise<void> {
  const db = await getDb(jobId)
  await db.delete('units', id)
}

export async function upsertJobTmFromSegment(
  jobId: string,
  segment: Segment,
  options?: TmUnitFromSegmentOptions,
): Promise<string | null> {
  if (!isSegmentDone(segment) || !segment.target.trim()) return null

  const sourceKey = tmLookupKey(
    segment.source,
    options?.sourceLang,
    options?.targetLang,
  )
  const db = await getDb(jobId)
  const existing = await db.getAllFromIndex('units', 'by-source-key', sourceKey)
  const row = await buildTmUnitFromSegment(segment, options, existing)
  if (!row) return null

  await db.put('units', row)
  return row.id
}

export async function recordDoneSegmentsInJobTm(
  jobId: string,
  segments: Segment[],
  options?: TmUnitFromSegmentOptions & { onlyIds?: Iterable<string> },
): Promise<string[]> {
  const only = options?.onlyIds ? new Set(options.onlyIds) : null
  const ordered = [...segments]
  const dirty: string[] = []
  for (let i = 0; i < ordered.length; i++) {
    const segment = ordered[i]!
    if (only && !only.has(segment.id)) continue
    if (!isSegmentDone(segment) || !segment.target.trim()) continue

    const id = await upsertJobTmFromSegment(jobId, segment, {
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
