import { describe, expect, it } from 'vitest'
import { jobTmReadable, jobTmWritable } from '@/jobs/resources'
import type { JobResource } from '@/types/job'

const base: JobResource = {
  kind: 'job_tm',
  enabled: true,
  canRead: true,
  canWrite: true,
  canExport: false,
  canClone: false,
  preset: { canRead: true, canWrite: true, canExport: false, canClone: false },
}

describe('jobTmReadable/jobTmWritable', () => {
  it('requires an enabled resource', () => {
    expect(jobTmReadable({ ...base, enabled: false })).toBe(false)
    expect(jobTmWritable({ ...base, enabled: false })).toBe(false)
  })

  it('respects read and write permissions independently', () => {
    expect(jobTmReadable({ ...base, canRead: false })).toBe(false)
    expect(jobTmWritable({ ...base, canWrite: false })).toBe(false)
  })
})
