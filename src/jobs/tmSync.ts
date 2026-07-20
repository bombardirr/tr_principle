import { getStorageAccountId } from '@/storage/scope'
import { getJobTmUnit, putJobTmUnit, removeJobTmUnit } from '@/storage/jobTmIdb'
import type { TmUnit } from '@/types/tm'
import { pullJobTmSync, pushJobTmSync } from '@/jobs/tmApi'

const SINCE_BASE = 'appzac-job-tm-sync-since'
const DIRTY_BASE = 'appzac-job-tm-sync-dirty'
const EPOCH = '1970-01-01T00:00:00.000Z'

const pushTimers = new Map<string, ReturnType<typeof setTimeout>>()
const syncingJobs = new Set<string>()

function accountKey(base: string, jobId: string): string | null {
  const accountId = getStorageAccountId()
  return accountId ? `${base}:${accountId}:${jobId}` : null
}

function readSince(jobId: string): string {
  const key = accountKey(SINCE_BASE, jobId)
  if (!key || typeof localStorage === 'undefined') return EPOCH
  return localStorage.getItem(key) || EPOCH
}

function writeSince(jobId: string, until: string): void {
  const key = accountKey(SINCE_BASE, jobId)
  if (!key || typeof localStorage === 'undefined') return
  localStorage.setItem(key, until)
}

function readDirty(jobId: string): Set<string> {
  const key = accountKey(DIRTY_BASE, jobId)
  if (!key || typeof localStorage === 'undefined') return new Set()
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return new Set()
    const ids = JSON.parse(raw) as unknown
    return Array.isArray(ids)
      ? new Set(ids.filter((id): id is string => typeof id === 'string'))
      : new Set()
  } catch {
    return new Set()
  }
}

function writeDirty(jobId: string, ids: Set<string>): void {
  const key = accountKey(DIRTY_BASE, jobId)
  if (!key || typeof localStorage === 'undefined') return
  localStorage.setItem(key, JSON.stringify([...ids]))
}

function addDirty(jobId: string, ...ids: string[]): void {
  if (!ids.length) return
  const dirty = readDirty(jobId)
  for (const id of ids) dirty.add(id)
  writeDirty(jobId, dirty)
}

export function markJobTmDirty(jobId: string, ...ids: string[]): void {
  addDirty(jobId, ...ids)
  scheduleJobTmPush(jobId)
}

export function scheduleJobTmPush(jobId: string, delayMs = 1500): void {
  const timer = pushTimers.get(jobId)
  if (timer) clearTimeout(timer)
  pushTimers.set(
    jobId,
    setTimeout(() => {
      pushTimers.delete(jobId)
      void syncJobTm(jobId, { pushOnly: true })
    }, delayMs)
  )
}

async function mergeRemote(jobId: string, unit: TmUnit): Promise<void> {
  const local = await getJobTmUnit(jobId, unit.id)
  if (local && local.updatedAt > unit.updatedAt) {
    addDirty(jobId, local.id)
    return
  }
  if (unit.deletedAt) {
    await removeJobTmUnit(jobId, unit.id)
    return
  }
  await putJobTmUnit(jobId, { ...unit, deletedAt: unit.deletedAt ?? null })
}

async function pullAll(jobId: string): Promise<void> {
  let since = readSince(jobId)
  for (let page = 0; page < 50; page++) {
    const result = await pullJobTmSync(jobId, since)
    for (const unit of result.units) await mergeRemote(jobId, unit)
    if (result.hasMore && result.units.length) {
      since = result.units[result.units.length - 1]!.updatedAt
      writeSince(jobId, since)
      continue
    }
    writeSince(jobId, result.until)
    break
  }
}

async function pushDirty(jobId: string): Promise<void> {
  const dirty = readDirty(jobId)
  if (!dirty.size) return
  const units: TmUnit[] = []
  for (const id of dirty) {
    const unit = await getJobTmUnit(jobId, id)
    if (unit) units.push(unit)
    else dirty.delete(id)
  }
  if (!units.length) {
    writeDirty(jobId, dirty)
    return
  }
  await pushJobTmSync(jobId, units)
  for (const unit of units) dirty.delete(unit.id)
  writeDirty(jobId, dirty)
}

/** Pull then push (or push-only). Safe to call frequently; overlaps coalesce. */
export async function syncJobTm(jobId: string, opts?: { pushOnly?: boolean }): Promise<void> {
  if (!getStorageAccountId()) return
  if (syncingJobs.has(jobId)) {
    if (!opts?.pushOnly) scheduleJobTmPush(jobId, 500)
    return
  }
  syncingJobs.add(jobId)
  try {
    if (!opts?.pushOnly) await pullAll(jobId)
    await pushDirty(jobId)
  } catch {
    // Dirty rows remain queued for a later retry.
  } finally {
    syncingJobs.delete(jobId)
  }
}
