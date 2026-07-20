import { afterEach, describe, expect, it } from 'vitest'
import {
  PERSONAL_TM_ATTACHMENT_ID,
  attachJobTm,
  detachJobTm,
  listJobTmAttachments,
  detachJobTmEverywhere,
} from '../../src/tm/jobAttachments'

const KEY = 'tr_principle.job_tm_attachments.v1'

afterEach(() => {
  localStorage.removeItem(KEY)
})

describe('jobAttachments stub', () => {
  it('starts empty', () => {
    expect(listJobTmAttachments('job-1')).toEqual([])
  })

  it('attach and detach', () => {
    expect(attachJobTm('job-1', PERSONAL_TM_ATTACHMENT_ID)).toEqual([
      { id: PERSONAL_TM_ATTACHMENT_ID, canRead: true, canWrite: true },
    ])
    expect(listJobTmAttachments('job-1')).toHaveLength(1)
    expect(detachJobTm('job-1', PERSONAL_TM_ATTACHMENT_ID)).toEqual([])
  })

  it('detachJobTmEverywhere removes from all jobs', () => {
    attachJobTm('a', PERSONAL_TM_ATTACHMENT_ID)
    attachJobTm('b', PERSONAL_TM_ATTACHMENT_ID)
    expect(detachJobTmEverywhere(PERSONAL_TM_ATTACHMENT_ID)).toBe(2)
    expect(listJobTmAttachments('a')).toEqual([])
    expect(listJobTmAttachments('b')).toEqual([])
  })
})
