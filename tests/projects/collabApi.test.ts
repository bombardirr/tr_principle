import { beforeEach, describe, expect, it, vi } from 'vitest'

const apiFetch = vi.fn()

vi.mock('@/auth/api', () => ({ apiFetch }))

describe('collaboration invite API', () => {
  beforeEach(() => {
    apiFetch.mockReset()
  })

  it('creates a burning invite with its requested role', async () => {
    apiFetch.mockResolvedValueOnce({ token: 'raw-token' })
    const { createProjectInvite } = await import('@/projects/collabApi')

    await createProjectInvite('project-1', {
      role: 'editor',
      maxUses: 1,
    })

    expect(apiFetch).toHaveBeenCalledWith('/api/projects/project-1/invites', {
      method: 'POST',
      body: JSON.stringify({ role: 'editor', maxUses: 1 }),
    })
  })

  it('accepts a link invite by token', async () => {
    apiFetch.mockResolvedValueOnce({ projectId: 'project-1', role: 'viewer' })
    const { acceptProjectInvite } = await import('@/projects/collabApi')

    await acceptProjectInvite('raw-token')

    expect(apiFetch).toHaveBeenCalledWith('/api/invites/accept', {
      method: 'POST',
      body: JSON.stringify({ token: 'raw-token' }),
    })
  })
})
