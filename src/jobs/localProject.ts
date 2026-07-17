import { fingerprintDocx } from '@/jobs/fingerprint'
import type { Job } from '@/types/job'
import type { ProjectRecord } from '@/types/project'

export function projectFingerprint(record: ProjectRecord) {
  const filename =
    record.meta.sourceFilename?.trim() ||
    `${record.meta.name.replace(/\.docx$/i, '') || 'Untitled'}.docx`
  return fingerprintDocx(filename, record.docx)
}

export function bindProjectToJob(record: ProjectRecord, job: Job): ProjectRecord {
  return {
    ...record,
    meta: {
      ...record.meta,
      jobId: job.id,
      sourceFilename: job.sourceFilename || record.meta.sourceFilename,
      sourceHash: job.sourceHash || record.meta.sourceHash,
    },
  }
}

export function inviteLink(token: string, origin = window.location.origin): string {
  return `${origin.replace(/\/$/, '')}/job-invite/${encodeURIComponent(token)}`
}
