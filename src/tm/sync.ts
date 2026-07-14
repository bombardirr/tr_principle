import { getStorageAccountId } from '@/storage/scope'
import { getTmUnit, putTmUnit, removeTmUnit } from '@/storage/tmIdb'
import type { TmUnit } from '@/types/tm'
import { pullTmSync, pushTmSync } from '@/tm/api'

const SINCE_BASE = 'appzac-tm-sync-since'
const DIRTY_BASE = 'appzac-tm-sync-dirty'
const EPOCH = '1970-01-01T00:00:00.000Z'

let pushTimer: ReturnType<typeof setTimeout> | null = null
let syncing = false

function accountKey(base: string): string | null {
  const id = getStorageAccountId()
  if (!id) return null
  return `${base}:${id}`
}

function readSince(): string {
  const key = accountKey(SINCE_BASE)
  if (!key || typeof localStorage === 'undefined') return EPOCH
  return localStorage.getItem(key) || EPOCH
}

function writeSince(until: string) {
  const key = accountKey(SINCE_BASE)
  if (!key || typeof localStorage === 'undefined') return
  localStorage.setItem(key, until)
}

function readDirty(): Set<string> {
  const key = accountKey(DIRTY_BASE)
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

function writeDirty(ids: Set<string>) {
  const key = accountKey(DIRTY_BASE)
  if (!key || typeof localStorage === 'undefined') return
  localStorage.setItem(key, JSON.stringify([...ids]))
}

function addDirty(...ids: string[]) {
  if (!ids.length) return
  const dirty = readDirty()
  for (const id of ids) dirty.add(id)
  writeDirty(dirty)
}

export function markTmDirty(...ids: string[]) {
  addDirty(...ids)
  scheduleTmPush()
}

export function scheduleTmPush(delayMs = 1500) {
  if (pushTimer) clearTimeout(pushTimer)
  pushTimer = setTimeout(() => {
    pushTimer = null
    void syncTm({ pushOnly: true })
  }, delayMs)
}

function newer(a: string, b: string): boolean {
  return a > b
}

async function mergeRemote(unit: TmUnit) {
  const local = await getTmUnit(unit.id)
  if (local && newer(local.updatedAt, unit.updatedAt)) {
    addDirty(local.id)
    return
  }
  if (unit.deletedAt) {
    await removeTmUnit(unit.id)
    return
  }
  await putTmUnit({ ...unit, deletedAt: unit.deletedAt ?? null })
}

async function pullAll(): Promise<void> {
  let since = readSince()
  for (let i = 0; i < 50; i++) {
    const res = await pullTmSync(since)
    for (const unit of res.units) {
      await mergeRemote(unit)
    }
    if (res.hasMore && res.units.length) {
      const last = res.units[res.units.length - 1]!
      since = last.updatedAt
      writeSince(since)
      continue
    }
    writeSince(res.until)
    break
  }
}

async function pushDirty(): Promise<void> {
  const dirty = readDirty()
  if (!dirty.size) return
  const units: TmUnit[] = []
  const missing: string[] = []
  for (const id of dirty) {
    const unit = await getTmUnit(id)
    if (!unit) {
      missing.push(id)
      continue
    }
    units.push(unit)
  }
  if (missing.length) {
    for (const id of missing) dirty.delete(id)
  }
  if (!units.length) {
    writeDirty(dirty)
    return
  }
  await pushTmSync(units)
  for (const u of units) dirty.delete(u.id)
  writeDirty(dirty)
}

/** Pull then push (or push-only). Safe to call frequently; overlaps coalesce. */
export async function syncTm(opts?: { pushOnly?: boolean }): Promise<void> {
  if (!getStorageAccountId()) return
  if (syncing) {
    if (!opts?.pushOnly) scheduleTmPush(500)
    return
  }
  syncing = true
  try {
    if (!opts?.pushOnly) {
      await pullAll()
    }
    await pushDirty()
  } catch {
    // Silent retry on next login / dirty write / schedule.
  } finally {
    syncing = false
  }
}
