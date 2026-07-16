import { getStorageAccountId } from '@/storage/scope'
import {
  getGlossaryTerm,
  putGlossaryTerm,
  removeGlossaryTerm,
} from '@/storage/glossaryIdb'
import type { GlossaryTerm } from '@/types/glossary'
import { pullGlossarySync, pushGlossarySync } from '@/glossary/api'

const SINCE_BASE = 'appzac-glossary-sync-since'
const DIRTY_BASE = 'appzac-glossary-sync-dirty'
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

export function markGlossaryDirty(...ids: string[]) {
  addDirty(...ids)
  scheduleGlossaryPush()
}

export function scheduleGlossaryPush(delayMs = 1500) {
  if (pushTimer) clearTimeout(pushTimer)
  pushTimer = setTimeout(() => {
    pushTimer = null
    void syncGlossary({ pushOnly: true })
  }, delayMs)
}

function newer(a: string, b: string): boolean {
  return a > b
}

async function mergeRemote(term: GlossaryTerm) {
  const local = await getGlossaryTerm(term.id)
  if (local && newer(local.updatedAt, term.updatedAt)) {
    addDirty(local.id)
    return
  }
  if (term.deletedAt) {
    await removeGlossaryTerm(term.id)
    return
  }
  await putGlossaryTerm({ ...term, deletedAt: term.deletedAt ?? null })
}

async function pullAll(): Promise<void> {
  let since = readSince()
  for (let i = 0; i < 50; i++) {
    const res = await pullGlossarySync(since)
    for (const term of res.terms) {
      await mergeRemote(term)
    }
    if (res.hasMore && res.terms.length) {
      const last = res.terms[res.terms.length - 1]!
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
  const terms: GlossaryTerm[] = []
  const missing: string[] = []
  for (const id of dirty) {
    const term = await getGlossaryTerm(id)
    if (!term) {
      missing.push(id)
      continue
    }
    terms.push(term)
  }
  if (missing.length) {
    for (const id of missing) dirty.delete(id)
  }
  if (!terms.length) {
    writeDirty(dirty)
    return
  }
  await pushGlossarySync(terms)
  for (const t of terms) dirty.delete(t.id)
  writeDirty(dirty)
}

export async function syncGlossary(opts?: { pushOnly?: boolean }): Promise<void> {
  if (!getStorageAccountId()) return
  if (syncing) {
    if (!opts?.pushOnly) scheduleGlossaryPush(500)
    return
  }
  syncing = true
  try {
    if (!opts?.pushOnly) {
      await pullAll()
    }
    await pushDirty()
  } catch {
    // Silent retry later.
  } finally {
    syncing = false
  }
}
