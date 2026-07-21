import { getStorageAccountId } from '@/storage/scope'
import { getTmUnit, putTmUnit, removeTmUnit } from '@/storage/tmIdb'
import { listOwnedTmBaseIds, upsertTmBasesFromCloud } from '@/storage/tmBasesIdb'
import type { TmUnit } from '@/types/tm'
import { listTmBasesApi, pullTmBaseSync, pushTmBaseSync } from '@/tm/api'
import { PERSONAL_TM_ATTACHMENT_ID } from '@/tm/projectAttachments'

const SINCE_BASE = 'appzac-tm-sync-since'
const DIRTY_BASE = 'appzac-tm-sync-dirty'
const DIRTY_UNITS_BASE = 'appzac-tm-sync-dirty-units'
const EPOCH = '1970-01-01T00:00:00.000Z'
const PUSH_PAGE_SIZE = 500

let pushTimer: ReturnType<typeof setTimeout> | null = null
let syncTail: Promise<void> = Promise.resolve()

/** Serialize syncTm / syncTmBase so pushDirty never overlaps. */
function runExclusive<T>(fn: () => Promise<T>): Promise<T> {
  const run = syncTail.then(fn, fn)
  syncTail = run.then(
    () => undefined,
    () => undefined,
  )
  return run
}

function syncKey(base: string, baseId: string, jobId?: string): string | null {
  const id = getStorageAccountId()
  if (!id) return null
  return `${base}:${id}:${baseId}${jobId ? `:${jobId}` : ''}`
}

function readSince(baseId: string, jobId?: string): string {
  const key = syncKey(SINCE_BASE, baseId, jobId)
  if (!key || typeof localStorage === 'undefined') return EPOCH
  return localStorage.getItem(key) || EPOCH
}

function writeSince(baseId: string, until: string, jobId?: string) {
  const key = syncKey(SINCE_BASE, baseId, jobId)
  if (!key || typeof localStorage === 'undefined') return
  localStorage.setItem(key, until)
}

function readDirty(baseId: string, jobId?: string): Set<string> {
  const key = syncKey(DIRTY_BASE, baseId, jobId)
  if (!key || typeof localStorage === 'undefined') return new Set()
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return new Set()
    const arr = JSON.parse(raw) as unknown
    if (!Array.isArray(arr)) return new Set()
    return new Set(arr.filter((x): x is string => typeof x === 'string'))
  } catch {
    return new Set()
  }
}

function writeDirty(baseId: string, ids: Set<string>, jobId?: string) {
  const key = syncKey(DIRTY_BASE, baseId, jobId)
  if (!key || typeof localStorage === 'undefined') return
  localStorage.setItem(key, JSON.stringify([...ids]))
}

function addDirty(baseId: string, ids: string[], jobId?: string) {
  if (!ids.length) return
  const dirty = readDirty(baseId, jobId)
  for (const id of ids) dirty.add(id)
  writeDirty(baseId, dirty, jobId)
}

function readDirtyUnits(): Set<string> {
  const key = syncKey(DIRTY_UNITS_BASE, 'all')
  if (!key || typeof localStorage === 'undefined') return new Set()
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return new Set()
    const arr = JSON.parse(raw) as unknown
    if (!Array.isArray(arr)) return new Set()
    return new Set(arr.filter((x): x is string => typeof x === 'string'))
  } catch {
    return new Set()
  }
}

function writeDirtyUnits(ids: Set<string>) {
  const key = syncKey(DIRTY_UNITS_BASE, 'all')
  if (!key || typeof localStorage === 'undefined') return
  localStorage.setItem(key, JSON.stringify([...ids]))
}

async function bucketDirtyUnits(jobId?: string, ownedBaseIds?: Set<string>): Promise<void> {
  const pending = readDirtyUnits()
  if (!pending.size) return
  const buckets = new Map<string, string[]>()
  for (const id of pending) {
    const unit = await getTmUnit(id)
    if (!unit) continue
    const baseId = unit.baseId || PERSONAL_TM_ATTACHMENT_ID
    const bucket = buckets.get(baseId) ?? []
    bucket.push(id)
    buckets.set(baseId, bucket)
  }
  for (const [baseId, bucket] of buckets) {
    const bucketJobId = jobId && !ownedBaseIds?.has(baseId) ? jobId : undefined
    addDirty(baseId, bucket, bucketJobId)
  }
  const current = readDirtyUnits()
  for (const id of pending) current.delete(id)
  writeDirtyUnits(current)
}

export function markTmDirty(...ids: string[]) {
  if (!ids.length) return
  const dirty = readDirtyUnits()
  for (const id of ids) dirty.add(id)
  writeDirtyUnits(dirty)
  scheduleTmPush()
}

export function scheduleTmPush(delayMs = 1500, jobId?: string) {
  if (pushTimer) clearTimeout(pushTimer)
  pushTimer = setTimeout(() => {
    pushTimer = null
    void syncTm({ pushOnly: true, jobId })
  }, delayMs)
}

function newer(a: string, b: string): boolean {
  return a > b
}

async function mergeRemote(unit: TmUnit, jobId?: string) {
  const local = await getTmUnit(unit.id)
  if (local && newer(local.updatedAt, unit.updatedAt)) {
    addDirty(local.baseId || PERSONAL_TM_ATTACHMENT_ID, [local.id], jobId)
    return
  }
  if (unit.deletedAt) {
    await removeTmUnit(unit.id)
    return
  }
  await putTmUnit({ ...unit, deletedAt: unit.deletedAt ?? null })
}

async function pullAll(baseId: string, jobId?: string): Promise<void> {
  let since = readSince(baseId, jobId)
  for (let i = 0; i < 50; i++) {
    const res = await pullTmBaseSync(baseId, since, jobId)
    for (const unit of res.units) {
      await mergeRemote(unit, jobId)
    }
    if (res.hasMore && res.units.length) {
      const last = res.units[res.units.length - 1]!
      since = last.updatedAt
      writeSince(baseId, since, jobId)
      continue
    }
    writeSince(baseId, res.until, jobId)
    break
  }
}

async function pushDirty(
  baseId: string,
  jobId?: string,
  ownedBaseIds?: Set<string>,
): Promise<void> {
  while (true) {
    const dirty = readDirty(baseId, jobId)
    if (!dirty.size) return
    const units: TmUnit[] = []
    const missing: string[] = []
    for (const id of [...dirty].slice(0, PUSH_PAGE_SIZE)) {
      const unit = await getTmUnit(id)
      if (!unit) {
        missing.push(id)
        continue
      }
      units.push(unit)
    }
    if (missing.length) {
      const current = readDirty(baseId, jobId)
      for (const id of missing) current.delete(id)
      writeDirty(baseId, current, jobId)
    }
    if (units.length) {
      await pushTmBaseSync(baseId, units, jobId)
      const current = readDirty(baseId, jobId)
      for (const unit of units) current.delete(unit.id)
      writeDirty(baseId, current, jobId)
    }
    await bucketDirtyUnits(jobId, ownedBaseIds)
  }
}

function dirtyBaseIds(jobId?: string): string[] {
  const accountId = getStorageAccountId()
  if (!accountId || typeof localStorage === 'undefined') return []
  const prefix = `${DIRTY_BASE}:${accountId}:`
  const ids = new Set<string>()
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i)
    if (!key?.startsWith(prefix)) continue
    const suffix = key.slice(prefix.length)
    if (jobId) {
      const jobSuffix = `:${jobId}`
      if (!suffix.endsWith(jobSuffix)) continue
      const baseId = suffix.slice(0, -jobSuffix.length)
      if (baseId && readDirty(baseId, jobId).size) ids.add(baseId)
    } else if (suffix && !suffix.includes(':') && readDirty(suffix).size) {
      ids.add(suffix)
    }
  }
  return [...ids]
}

export async function syncTmBase(
  baseId: string,
  opts?: { jobId?: string; pushOnly?: boolean },
): Promise<void> {
  if (!getStorageAccountId()) return
  return runExclusive(async () => {
    const ownedBaseIds = await listOwnedTmBaseIds()
    const baseJobId = opts?.jobId && !ownedBaseIds.has(baseId) ? opts.jobId : undefined
    if (!opts?.pushOnly) await pullAll(baseId, baseJobId)
    await bucketDirtyUnits(opts?.jobId, ownedBaseIds)
    await pushDirty(baseId, baseJobId, ownedBaseIds)

    const attempted = new Set<string>()
    while (true) {
      const ownedBaseId = dirtyBaseIds().find(id => !attempted.has(id))
      if (!ownedBaseId) break
      attempted.add(ownedBaseId)
      await pushDirty(ownedBaseId, undefined, ownedBaseIds)
    }
  })
}

/** Pull then push (or push-only). Safe to call frequently; overlaps queue. */
export async function syncTm(opts?: { pushOnly?: boolean; jobId?: string }): Promise<void> {
  if (!getStorageAccountId()) return
  return runExclusive(async () => {
    let ownedBaseIds: Set<string> | undefined
    if (opts?.jobId) {
      ownedBaseIds = await listOwnedTmBaseIds()
      try {
        const bases = await listTmBasesApi()
        for (const base of bases) ownedBaseIds.add(base.id)
        await upsertTmBasesFromCloud(bases)
      } catch {
        // Catalog failure must not clear local owned ids.
      }
    }
    if (!opts?.pushOnly) {
      try {
        const bases = await listTmBasesApi()
        await upsertTmBasesFromCloud(bases)
        for (const base of bases) {
          try {
            await pullAll(base.id)
          } catch {
            // A failed base must not prevent other bases from syncing.
          }
        }
      } catch {
        // Catalog failure must not prevent locally dirty bases from pushing.
      }
    }
    await bucketDirtyUnits(opts?.jobId, ownedBaseIds)
    const attempted = new Set<string>()
    while (true) {
      const ownedBaseId = dirtyBaseIds().find((id) => !attempted.has(`owned:${id}`))
      const sharedBaseId = opts?.jobId
        ? dirtyBaseIds(opts.jobId).find((id) => !attempted.has(`shared:${id}`))
        : undefined
      const baseId = ownedBaseId ?? sharedBaseId
      if (!baseId) break
      const jobId = ownedBaseId ? undefined : opts?.jobId
      attempted.add(`${jobId ? 'shared' : 'owned'}:${baseId}`)
      try {
        await pushDirty(baseId, jobId, ownedBaseIds)
      } catch {
        // Leave this base dirty and continue with the remaining bases.
      }
      await bucketDirtyUnits(opts?.jobId, ownedBaseIds)
    }
  })
}
