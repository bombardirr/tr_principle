import { patchJobMemberMe } from '@/jobs/api'
import { computeProgress, computeTmCoverage } from '@/jobs/progress'
import { listTmUnits } from '@/storage/tmIdb'
import type { JobMember } from '@/types/job'
import type { ProjectRecord } from '@/types/project'

export async function computeLocalJobProgress(record: ProjectRecord) {
  const progress = computeProgress(record.segments)
  let progressTm = 0
  try {
    const units = await listTmUnits()
    progressTm = computeTmCoverage(
      record.segments,
      units,
      record.meta.sourceLang,
      record.meta.targetLang,
    ).tmHits
  } catch {
    // TM coverage is best-effort.
  }
  return {
    progressDone: progress.done,
    progressTotal: progress.total,
    progressTm,
  }
}

/** Push local project progress to the job roster. Returns updated member or null. */
export async function reportJobMemberProgress(
  jobId: string,
  record: ProjectRecord,
): Promise<JobMember | null> {
  const progress = await computeLocalJobProgress(record)
  try {
    return await patchJobMemberMe(jobId, {
      ...progress,
      localProjectId: record.meta.id,
    })
  } catch {
    // Progress reporting must not turn a successful local save into a failure.
    return null
  }
}
