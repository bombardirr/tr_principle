import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  isLeaseActive,
  isLeaseHeldByOther,
  readLease,
  releaseLease,
  renewLease,
  tryClaimLease,
} from '@/storage/projectLease'
import { setStorageAccountId } from '@/storage/scope'

const PROJECT = 'proj-1'
const TAB_A = 'tab-a'
const TAB_B = 'tab-b'

describe('projectLease', () => {
  beforeEach(() => {
    localStorage.clear()
    setStorageAccountId('00000000-0000-4000-8000-000000000001')
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-07-13T12:00:00Z'))
  })

  afterEach(() => {
    setStorageAccountId(null)
    vi.useRealTimers()
  })

  it('claims an empty lease', () => {
    const lease = tryClaimLease(PROJECT, TAB_A)
    expect(lease?.tabId).toBe(TAB_A)
    expect(readLease(PROJECT)?.tabId).toBe(TAB_A)
  })

  it('blocks a second tab while lease is active', () => {
    expect(tryClaimLease(PROJECT, TAB_A)).not.toBeNull()
    expect(tryClaimLease(PROJECT, TAB_B)).toBeNull()
    expect(isLeaseHeldByOther(PROJECT, TAB_B)).toBe(true)
  })

  it('allows takeover after lease expiry', () => {
    tryClaimLease(PROJECT, TAB_A)
    vi.advanceTimersByTime(16_000)
    expect(isLeaseActive(readLease(PROJECT))).toBe(false)
    expect(tryClaimLease(PROJECT, TAB_B)?.tabId).toBe(TAB_B)
  })

  it('renews only for the current leader token', () => {
    const lease = tryClaimLease(PROJECT, TAB_A)!
    expect(renewLease(PROJECT, TAB_A, lease.token)).toBe(true)
    expect(renewLease(PROJECT, TAB_B, lease.token)).toBe(false)
    vi.advanceTimersByTime(10_000)
    expect(isLeaseActive(readLease(PROJECT))).toBe(true)
  })

  it('releases lease only for owner', () => {
    const lease = tryClaimLease(PROJECT, TAB_A)!
    releaseLease(PROJECT, TAB_B, lease.token)
    expect(readLease(PROJECT)?.tabId).toBe(TAB_A)
    releaseLease(PROJECT, TAB_A, lease.token)
    expect(readLease(PROJECT)).toBeNull()
  })
})
