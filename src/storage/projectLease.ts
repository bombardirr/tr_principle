import { scopedKey } from '@/storage/scope'

export interface ProjectLease {
  tabId: string
  token: string
  expiresAt: number
}

export const LEASE_TTL_MS = 15_000
export const LEASE_HEARTBEAT_MS = 5_000
export const LEASE_CHANNEL = 'appzac-project-lease'
export const TAB_ID_KEY = 'appzac-tab-id'

export type LeaseBroadcast =
  | { type: 'lease-changed'; projectId: string; tabId: string; action: 'acquired' | 'released' }

function leaseKey(projectId: string): string {
  return scopedKey(`appzac-project-lease:${projectId}`)
}

export function getTabId(): string {
  if (typeof sessionStorage === 'undefined') return 'ssr-tab'
  let id = sessionStorage.getItem(TAB_ID_KEY)
  if (!id) {
    id = crypto.randomUUID()
    sessionStorage.setItem(TAB_ID_KEY, id)
  }
  return id
}

export function readLease(projectId: string): ProjectLease | null {
  if (typeof localStorage === 'undefined') return null
  const raw = localStorage.getItem(leaseKey(projectId))
  if (!raw) return null
  try {
    const data = JSON.parse(raw) as ProjectLease
    if (
      typeof data.tabId !== 'string'
      || typeof data.token !== 'string'
      || typeof data.expiresAt !== 'number'
    ) {
      return null
    }
    return data
  } catch {
    return null
  }
}

export function isLeaseActive(lease: ProjectLease | null, now = Date.now()): lease is ProjectLease {
  return lease !== null && lease.expiresAt > now
}

export function isLeaseHeldByOther(
  projectId: string,
  tabId: string,
  now = Date.now(),
): boolean {
  const lease = readLease(projectId)
  if (!isLeaseActive(lease, now)) return false
  return lease.tabId !== tabId
}

export function tryClaimLease(
  projectId: string,
  tabId: string,
  now = Date.now(),
): ProjectLease | null {
  const existing = readLease(projectId)
  if (isLeaseActive(existing, now) && existing.tabId !== tabId) {
    return null
  }

  const lease: ProjectLease = {
    tabId,
    token: existing?.tabId === tabId ? existing.token : crypto.randomUUID(),
    expiresAt: now + LEASE_TTL_MS,
  }
  localStorage.setItem(leaseKey(projectId), JSON.stringify(lease))
  return lease
}

export function renewLease(
  projectId: string,
  tabId: string,
  token: string,
  now = Date.now(),
): boolean {
  const existing = readLease(projectId)
  if (!existing || existing.tabId !== tabId || existing.token !== token) return false
  existing.expiresAt = now + LEASE_TTL_MS
  localStorage.setItem(leaseKey(projectId), JSON.stringify(existing))
  return true
}

export function releaseLease(projectId: string, tabId: string, token: string): void {
  const existing = readLease(projectId)
  if (existing?.tabId === tabId && existing.token === token) {
    localStorage.removeItem(leaseKey(projectId))
  }
}
