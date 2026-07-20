import { fingerprintDocx } from '@/jobs/fingerprint'
import type { Job } from '@/types/job'
import type { ProjectMeta, ProjectRecord } from '@/types/project'
import { getProject, saveProject } from '@/storage/idb'

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

/** Clear meta.jobId on local projects that pointed at this job. Projects stay intact. */
export async function unlinkLocalProjectsFromJob(
  jobId: string,
  projects: ProjectMeta[],
): Promise<void> {
  for (const meta of projects) {
    if (meta.jobId !== jobId) continue
    const record = await getProject(meta.id)
    if (!record?.meta.jobId) continue
    record.meta.jobId = undefined
    await saveProject(record)
  }
}

export function inviteLink(token: string, origin = window.location.origin): string {
  return `${origin.replace(/\/$/, '')}/job-invite/${encodeURIComponent(token)}`
}
