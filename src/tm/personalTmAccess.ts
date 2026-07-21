import {
  canReadPersonalTm,
  canWritePersonalTm,
  PERSONAL_TM_ATTACHMENT_ID,
} from '@/tm/projectAttachments'
import type { ProjectMeta, ProjectTmAttachment } from '@/types/project'

export type JobTmAccessRow = {
  tmBaseId: string
  canRead: boolean
  canWrite: boolean
}

export type PersonalTmAccessInput = {
  projectMeta: ProjectMeta
  /** From route query `job`. */
  jobQueryId?: string | null
  /** Server job attachments (shared). */
  jobShared?: JobTmAccessRow[]
  /** Local job overlay attachments. */
  jobLocal?: ProjectTmAttachment[]
}

export type PersonalTmAccess = {
  jobContext: boolean
  canRead: boolean
  canWrite: boolean
}

function sharedFlag(
  rows: JobTmAccessRow[] | undefined,
  flag: 'canRead' | 'canWrite',
): boolean {
  const row = rows?.find(item => item.tmBaseId === PERSONAL_TM_ATTACHMENT_ID)
  return Boolean(row?.[flag])
}

function localFlag(
  rows: ProjectTmAttachment[] | undefined,
  flag: 'canRead' | 'canWrite',
): boolean {
  const row = rows?.find(item => item.id === PERSONAL_TM_ATTACHMENT_ID)
  return Boolean(row?.[flag])
}

/** True when editor was opened with matching `?job=` for this project. */
export function isJobEditorContext(
  jobQueryId: string | null | undefined,
  projectJobId: string | null | undefined,
): boolean {
  return Boolean(jobQueryId && projectJobId && jobQueryId === projectJobId)
}

/**
 * Personal TM pool access: project flags OR (in job context) job shared / local overlay.
 */
export function resolvePersonalTmAccess(input: PersonalTmAccessInput): PersonalTmAccess {
  const jobContext = isJobEditorContext(input.jobQueryId, input.projectMeta.jobId)
  const projectRead = canReadPersonalTm(input.projectMeta)
  const projectWrite = canWritePersonalTm(input.projectMeta)
  if (!jobContext) {
    return { jobContext: false, canRead: projectRead, canWrite: projectWrite }
  }
  return {
    jobContext: true,
    canRead:
      projectRead ||
      sharedFlag(input.jobShared, 'canRead') ||
      localFlag(input.jobLocal, 'canRead'),
    canWrite:
      projectWrite ||
      sharedFlag(input.jobShared, 'canWrite') ||
      localFlag(input.jobLocal, 'canWrite'),
  }
}
