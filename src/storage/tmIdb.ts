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
import { PERSONAL_TM_ATTACHMENT_ID } from '@/tm/projectAttachments'

interface TmDb extends DBSchema {
  units: {
    key: string
    value: TmUnit
    indexes: { 'by-source-key': string; 'by-updated': string; 'by-base-id': string }
  }
}

const DB_BASE = 'appzac-tm'
const DB_VERSION = 2

let dbPromise: Promise<IDBPDatabase<TmDb>> | null = null

onStorageAccountChange(() => {
  dbPromise = null
})

function withBaseId(unit: TmUnit): TmUnit {
  return unit.baseId ? unit : { ...unit, baseId: PERSONAL_TM_ATTACHMENT_ID }
}

function getDb() {
  if (!dbPromise) {
    const name = scopedDbName(DB_BASE)
    dbPromise = openDB<TmDb>(name, DB_VERSION, {
      upgrade(db, oldVersion, _newVersion, transaction) {
        if (oldVersion < 1) {
          const store = db.createObjectStore('units', { keyPath: 'id' })
          store.createIndex('by-source-key', 'sourceKey')
          store.createIndex('by-updated', 'updatedAt')
          store.createIndex('by-base-id', 'baseId')
        }
        if (oldVersion >= 1 && oldVersion < 2) {
          const store = transaction.objectStore('units')
          if (!store.indexNames.contains('by-base-id')) {
            store.createIndex('by-base-id', 'baseId')
          }
        }
      },
    }).then(async db => {
      const all = await db.getAll('units')
      for (const unit of all) {
        if (!unit.baseId) {
          await db.put('units', { ...unit, baseId: PERSONAL_TM_ATTACHMENT_ID })
        }
      }
      return db
    })
  }
  return dbPromise
}

function isActive(unit: TmUnit): boolean {
  return !unit.deletedAt
}

export type ListTmUnitsOptions = {
  /** When set, only units whose baseId is in the list. Empty → []. Omit → all active. */
  baseIds?: string[]
}

/** Active units only (for matching / UI). */
export async function listTmUnits(options?: ListTmUnitsOptions): Promise<TmUnit[]> {
  const db = await getDb()
  if (options?.baseIds) {
    if (!options.baseIds.length) return []
    const wanted = new Set(options.baseIds)
    const out: TmUnit[] = []
    for (const baseId of wanted) {
      const rows = await db.getAllFromIndex('units', 'by-base-id', baseId)
      for (const unit of rows) {
        if (isActive(unit)) out.push(withBaseId(unit))
      }
    }
    // Legacy rows may lack baseId / index entry — include when personal is requested
    if (wanted.has(PERSONAL_TM_ATTACHMENT_ID)) {
      const all = await db.getAllFromIndex('units', 'by-updated')
      const seen = new Set(out.map(u => u.id))
      for (const unit of all) {
        if (!isActive(unit) || seen.has(unit.id)) continue
        const tagged = withBaseId(unit)
        if (tagged.baseId === PERSONAL_TM_ATTACHMENT_ID) out.push(tagged)
      }
    }
    return out
  }
  const all = await db.getAllFromIndex('units', 'by-updated')
  return all.filter(isActive).map(withBaseId)
}

export async function listTmUnitsForBase(baseId: string): Promise<TmUnit[]> {
  return listTmUnits({ baseIds: [baseId] })
}

export async function getTmUnit(id: string): Promise<TmUnit | undefined> {
  const db = await getDb()
  const unit = await db.get('units', id)
  return unit ? withBaseId(unit) : undefined
}

export async function putTmUnit(unit: TmUnit): Promise<void> {
  const db = await getDb()
  await db.put('units', withBaseId(unit))
}

export async function removeTmUnit(id: string): Promise<void> {
  const db = await getDb()
  await db.delete('units', id)
}

export async function deleteTmForSegmentSource(
  source: string,
  options?: { sourceLang?: string; targetLang?: string; baseIds?: string[] },
): Promise<string[]> {
  const sourceKey = tmLookupKey(source, options?.sourceLang, options?.targetLang)
  const normalized = sourceKey.split('::')[0]
  if (!normalized) return []

  const db = await getDb()
  const existing = await db.getAllFromIndex('units', 'by-source-key', sourceKey)
  const wanted = options?.baseIds ? new Set(options.baseIds) : null
  const now = new Date().toISOString()
  const dirty: string[] = []
  for (const unit of existing) {
    if (unit.deletedAt) continue
    const tagged = withBaseId(unit)
    if (wanted && !wanted.has(tagged.baseId)) continue
    const row: TmUnit = { ...tagged, deletedAt: now, updatedAt: now }
    await db.put('units', row)
    dirty.push(unit.id)
  }
  return dirty
}

export async function upsertTmFromSegment(
  segment: Segment,
  options?: TmUnitFromSegmentOptions,
): Promise<string | null> {
  const baseId = options?.baseId ?? PERSONAL_TM_ATTACHMENT_ID
  const sourceKey = tmLookupKey(
    segment.source,
    options?.sourceLang,
    options?.targetLang,
  )
  const db = await getDb()
  const existing = (await db.getAllFromIndex('units', 'by-source-key', sourceKey))
    .map(withBaseId)
    .filter(u => u.baseId === baseId)
  const row = await buildTmUnitFromSegment(segment, { ...options, baseId }, existing)
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
    baseId?: string
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
      baseId: options?.baseId,
      contextBefore: ordered[i - 1]?.source,
      contextAfter: ordered[i + 1]?.source,
    })
    if (id) dirty.push(id)
  }
  return dirty
}

/** Write completed segments into each writable base (unique unit ids per base). */
export async function recordDoneSegmentsInTmBases(
  segments: Segment[],
  baseIds: string[],
  options?: {
    sourceLang?: string
    targetLang?: string
    projectId?: string
    actor?: string
    onlyIds?: Iterable<string>
  },
): Promise<string[]> {
  const dirty: string[] = []
  for (const baseId of baseIds) {
    dirty.push(
      ...(await recordDoneSegmentsInTm(segments, {
        ...options,
        baseId,
      })),
    )
  }
  return dirty
}

export async function importTmUnits(
  units: TmUnit[],
  options?: { baseId?: string },
): Promise<{ count: number; ids: string[] }> {
  const db = await getDb()
  const baseId = options?.baseId
  const ids: string[] = []
  for (const unit of units) {
    const row: TmUnit = withBaseId({
      ...unit,
      ...(baseId ? { baseId } : {}),
      deletedAt: unit.deletedAt ?? null,
    })
    await db.put('units', row)
    ids.push(row.id)
  }
  return { count: ids.length, ids }
}

/** Clear all units, or only those for `baseId`. */
export async function clearTmUnits(baseId?: string): Promise<void> {
  const db = await getDb()
  if (!baseId) {
    await db.clear('units')
    return
  }
  const rows = await db.getAllFromIndex('units', 'by-base-id', baseId)
  for (const unit of rows) {
    await db.delete('units', unit.id)
  }
  if (baseId === PERSONAL_TM_ATTACHMENT_ID) {
    // Legacy rows without baseId index entry
    const all = await db.getAll('units')
    for (const unit of all) {
      if (!unit.baseId || unit.baseId === PERSONAL_TM_ATTACHMENT_ID) {
        await db.delete('units', unit.id)
      }
    }
  }
}

export type TmBaseStats = {
  count: number
  lastUpdatedAt: string | null
}

/** Active unit count + newest updatedAt (ISO), for TM base chips/cards. */
export async function getTmBaseStats(baseId: string): Promise<TmBaseStats> {
  const units = await listTmUnitsForBase(baseId)
  let lastUpdatedAt: string | null = null
  for (const unit of units) {
    if (!lastUpdatedAt || unit.updatedAt > lastUpdatedAt) {
      lastUpdatedAt = unit.updatedAt
    }
  }
  return { count: units.length, lastUpdatedAt }
}

/** @deprecated Prefer getTmBaseStats(PERSONAL_TM_ATTACHMENT_ID) */
export async function getPersonalTmStats(): Promise<TmBaseStats> {
  return getTmBaseStats(PERSONAL_TM_ATTACHMENT_ID)
}
