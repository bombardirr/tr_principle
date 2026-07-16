import { describe, expect, it } from 'vitest'
import type { AuthUser } from '@/auth/api'
import { isPro } from '@/auth/plan'

function user(partial: Partial<AuthUser> = {}): AuthUser {
  return {
    id: 'u1',
    email: 'a@b.c',
    display_name: '',
    is_admin: false,
    plan: 'free',
    plan_status: 'active',
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
