import { describe, expect, it } from 'vitest'
import { parseJobInviteToken } from '@/jobs/inviteToken'

describe('parseJobInviteToken', () => {
  it('extracts and decodes a token from a full invite URL', () => {
    expect(
      parseJobInviteToken('https://app.example.test/job-invite/token%20with%20spaces?source=chat')
    ).toBe('token with spaces')
  })

  it('extracts a token from an invite path', () => {
    expect(parseJobInviteToken('/job-invite/raw-token#invite')).toBe('raw-token')
  })

  it('accepts a raw token', () => {
    expect(parseJobInviteToken('  raw-token_123  ')).toBe('raw-token_123')
  })

  it('rejects unrelated URLs and empty input', () => {
    expect(parseJobInviteToken('https://app.example.test/projects')).toBeNull()
    expect(parseJobInviteToken('   ')).toBeNull()
  })
})
