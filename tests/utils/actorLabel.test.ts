import { describe, expect, it } from 'vitest'
import type { AuthUser } from '@/auth/api'
import { presentActor, publicActorRef } from '@/utils/actorLabel'

const t = (key: string) => key

function user(partial: Partial<AuthUser>): AuthUser {
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

describe('publicActorRef', () => {
  it('prefers nickname over anon id', () => {
    expect(publicActorRef(user({ display_name: 'Kenobi' }))).toBe('Kenobi')
  })

  it('uses opaque anon id without nickname', () => {
    expect(publicActorRef(user({ id: 'abc', display_name: '' }))).toBe('anon:abc')
  })

  it('falls back to local when logged out', () => {
    expect(publicActorRef(null)).toBe('local')
  })
})

describe('presentActor', () => {
  it('shows You for own nickname and own anon id', () => {
    const me = user({ id: 'u9', display_name: 'Ada' })
    expect(presentActor('Ada', me, t).text).toBe('editor.actorYou')
    expect(presentActor('anon:u9', me, t).text).toBe('editor.actorYou')
  })

  it('shows Incognito with distinct colors for different anons', () => {
    const me = user({ id: 'me' })
    const a = presentActor('anon:other1', me, t)
    const b = presentActor('anon:other2', me, t)
    expect(a.text).toBe('editor.actorIncognito')
    expect(b.text).toBe('editor.actorIncognito')
    expect(a.color).toBeTruthy()
    expect(b.color).toBeTruthy()
    expect(a.color).not.toBe(b.color)
  })

  it('shows nickname for others', () => {
    const me = user({ id: 'me', display_name: 'Me' })
    expect(presentActor('River', me, t).text).toBe('River')
  })
})
