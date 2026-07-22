import { getStorageAccountId } from '@/storage/scope'
import {
  getGlossaryTerm,
  listGlossaryTerms,
  putGlossaryTerm,
  removeGlossaryTerm,
} from '@/storage/glossaryIdb'
import type { GlossaryTerm } from '@/types/glossary'
import {
  listGlossaryBasesApi,
  pullGlossaryBaseSync,
  pushGlossaryBaseSync,
  upsertGlossaryBaseApi,
} from '@/glossary/api'
import {
  getGlossaryBase,
  listGlossaryBases,
  listOwnedGlossaryBaseIds,
  parseSharedGlossaryLocalId,
  upsertGlossaryBasesFromCloud,
  wireGlossaryBaseId,
} from '@/storage/glossaryBasesIdb'

const SINCE_BASE = 'appzac-glossary-sync-since'
const DIRTY_BASE = 'appzac-glossary-sync-dirty'
const EPOCH = '1970-01-01T00:00:00.000Z'
const PUSH_PAGE_SIZE = 500

let pushTimer: ReturnType<typeof setTimeout> | null = null
let syncTail: Promise<void> = Promise.resolve()

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

export function markGlossaryDirty(...ids: string[]) {
  for (const id of ids) {
    void getGlossaryTerm(id).then(term => {
      if (term) addDirty(term.baseId, [id])
    })
  }
  scheduleGlossaryPush()
}

/** Mark writes to a job-shared base against that job ACL context. */
export function markJobGlossaryDirty(jobId: string, ...ids: string[]) {
  for (const id of ids) {
    void getGlossaryTerm(id).then(term => {
      if (term) addDirty(term.baseId, [id], jobId)
    })
  }
  scheduleGlossaryPush(1500, jobId)
}

/** Mark all active local terms dirty before a base is promoted to a job attachment. */
export async function markGlossaryBaseDirty(baseId: string): Promise<void> {
  const terms = await listGlossaryTerms({ baseIds: [baseId] })
  addDirty(baseId, terms.map(term => term.id))
}

export function scheduleGlossaryPush(delayMs = 1500, jobId?: string) {
  if (pushTimer) clearTimeout(pushTimer)
  pushTimer = setTimeout(() => {
    pushTimer = null
    void syncGlossary({ pushOnly: true, jobId })
  }, delayMs)
}

function newer(a: string, b: string): boolean {
  return a > b
}

async function mergeRemote(term: GlossaryTerm, localBaseId: string, jobId?: string) {
  const local = await getGlossaryTerm(term.id)
  if (local && newer(local.updatedAt, term.updatedAt)) {
    addDirty(local.baseId, [local.id], jobId)
    return
  }
  if (term.deletedAt) {
    await removeGlossaryTerm(term.id)
    return
  }
  await putGlossaryTerm({ ...term, baseId: localBaseId, deletedAt: term.deletedAt ?? null })
}

async function pullAll(localBaseId: string, jobId?: string): Promise<void> {
  let since = readSince(localBaseId, jobId)
  for (let i = 0; i < 50; i++) {
    const res = await pullGlossaryBaseSync(wireGlossaryBaseId(localBaseId), since, jobId)
    for (const term of res.terms) {
      await mergeRemote(term, localBaseId, jobId)
    }
    if (res.hasMore && res.terms.length) {
      const last = res.terms[res.terms.length - 1]!
      since = last.updatedAt
      writeSince(localBaseId, since, jobId)
      continue
    }
    writeSince(localBaseId, res.until, jobId)
    break
  }
}

async function pushDirty(baseId: string, jobId?: string): Promise<void> {
  while (true) {
    const dirty = readDirty(baseId, jobId)
    if (!dirty.size) return
    const terms: GlossaryTerm[] = []
    const missing: string[] = []
    for (const id of [...dirty].slice(0, PUSH_PAGE_SIZE)) {
      const term = await getGlossaryTerm(id)
      if (!term) {
        missing.push(id)
        continue
      }
      terms.push(term)
    }
    if (missing.length) {
      const current = readDirty(baseId, jobId)
      for (const id of missing) current.delete(id)
      writeDirty(baseId, current, jobId)
    }
    if (!terms.length) continue
    await pushGlossaryBaseSync(
      wireGlossaryBaseId(baseId),
      terms.map(term => ({ ...term, baseId: wireGlossaryBaseId(term.baseId || baseId) })),
      jobId,
    )
    const current = readDirty(baseId, jobId)
    for (const term of terms) current.delete(term.id)
    writeDirty(baseId, current, jobId)
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

async function reconcileOwnedCatalog(serverBaseIds: Set<string>): Promise<void> {
  const localBases = await listGlossaryBases()
  await Promise.all(
    localBases
      .filter(base => base.sharedOnly !== true && !serverBaseIds.has(base.id))
      .map(async base => {
        try {
          await upsertGlossaryBaseApi({ id: base.id, label: base.label, color: base.color })
        } catch {
          // Preserve offline local bases for the next sync.
        }
      }),
  )
}

export async function syncGlossaryBase(
  baseId: string,
  opts?: { jobId?: string; pushOnly?: boolean },
): Promise<void> {
  if (!getStorageAccountId()) return
  return runExclusive(async () => {
    if (!parseSharedGlossaryLocalId(baseId)) {
      const base = await getGlossaryBase(baseId)
      if (base) {
        try {
          await upsertGlossaryBaseApi({ id: base.id, label: base.label, color: base.color })
        } catch {
          // Pull/push may still succeed when catalog reconciliation is temporarily unavailable.
        }
      }
    }
    if (!opts?.pushOnly) await pullAll(baseId, opts?.jobId)
    await pushDirty(baseId, opts?.jobId)
  })
}

/** Pull then push each owned catalog base. */
export async function syncGlossary(opts?: { pushOnly?: boolean; jobId?: string }): Promise<void> {
  if (!getStorageAccountId()) return
  return runExclusive(async () => {
    const ownedBaseIds = await listOwnedGlossaryBaseIds()
    if (!opts?.pushOnly) {
      try {
        const bases = await listGlossaryBasesApi()
        await upsertGlossaryBasesFromCloud(bases)
        await reconcileOwnedCatalog(new Set(bases.map(base => base.id)))
        for (const base of bases) {
          try {
            await pullAll(base.id)
          } catch {
            // A failed base must not prevent the remaining bases from syncing.
          }
        }
      } catch {
        // Catalog failure must not prevent locally dirty bases from pushing.
      }
    }
    const attempted = new Set<string>()
    while (true) {
      const ownedBaseId = dirtyBaseIds().find(
        id => !attempted.has(`owned:${id}`) && ownedBaseIds.has(id),
      )
      const sharedBaseId = opts?.jobId
        ? dirtyBaseIds(opts.jobId).find(id => !attempted.has(`shared:${id}`))
        : undefined
      const baseId = ownedBaseId ?? sharedBaseId
      if (!baseId) break
      const jobId = ownedBaseId ? undefined : opts?.jobId
      attempted.add(`${jobId ? 'shared' : 'owned'}:${baseId}`)
      try {
        await pushDirty(baseId, jobId)
      } catch {
        // Leave this base dirty for a later retry.
      }
    }
  })
}
