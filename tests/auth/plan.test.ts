import { describe, expect, it } from 'vitest'
import type { AuthUser } from '@/auth/api'
import { formatBytes, isPro, proDaysLeft, storageNearFull } from '@/auth/plan'

function user(partial: Partial<AuthUser> = {}): AuthUser {
  return {
    id: 'u1',
    email: 'a@b.c',
    display_name: '',
    is_admin: false,
    plan: 'free',
    plan_status: 'active',
    storage_used_bytes: 0,
    storage_limit_bytes: 50 * 1024 * 1024,
    ...partial,
  }
}

describe('isPro', () => {
  it('is true only for effective plan pro', () => {
    expect(isPro(user({ plan: 'pro' }))).toBe(true)
    expect(isPro(user({ plan: 'free' }))).toBe(false)
    expect(isPro(user({ plan: 'free', is_admin: true }))).toBe(false)
    expect(isPro(null)).toBe(false)
    expect(isPro(undefined)).toBe(false)
  })
})

describe('proDaysLeft', () => {
  it('returns null without period end', () => {
    expect(proDaysLeft(user({ plan: 'pro' }))).toBeNull()
  })

  it('counts whole days ahead', () => {
    const end = new Date(Date.now() + 3.2 * 24 * 60 * 60 * 1000).toISOString()
    expect(proDaysLeft(user({ plan: 'pro', current_period_end: end }))).toBe(4)
  })
})

describe('formatBytes / storageNearFull', () => {
  it('formats', () => {
    expect(formatBytes(512)).toBe('512 B')
    expect(formatBytes(2048)).toBe('2.0 KB')
  })

  it('near full at 80%', () => {
    expect(
      storageNearFull(
        user({ storage_used_bytes: 40 * 1024 * 1024, storage_limit_bytes: 50 * 1024 * 1024 }),
      ),
    ).toBe(true)
    expect(
      storageNearFull(
        user({ storage_used_bytes: 10 * 1024 * 1024, storage_limit_bytes: 50 * 1024 * 1024 }),
      ),
    ).toBe(false)
  })
})
