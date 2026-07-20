/**
 * Local-only job TM overlay (per browser).
 * Shared job attachments live on the server — see src/jobs/tmAttachmentsApi.ts.
 */
import type { ProjectTmAttachment, ProjectTmAttachmentId } from '@/types/project'
import {
  attachProjectTm,
  detachProjectTm,
  normalizeProjectTmAttachments,
  updateProjectTmAttachment,
} from '@/tm/projectAttachments'

const KEY = 'tr_principle.job_tm_attachments.v1'

type Store = Record<string, ProjectTmAttachment[]>

function readStore(): Store {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as Store
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

function writeStore(store: Store) {
  localStorage.setItem(KEY, JSON.stringify(store))
}

export function listJobTmAttachments(jobId: string): ProjectTmAttachment[] {
  return normalizeProjectTmAttachments({
    id: jobId,
    name: '',
    createdAt: '',
    updatedAt: '',
    segmentCount: 0,
    doneCount: 0,
    tmAttachments: readStore()[jobId],
  })
}

export function setJobTmAttachments(jobId: string, items: ProjectTmAttachment[]) {
  const store = readStore()
  store[jobId] = normalizeProjectTmAttachments({
    id: jobId,
    name: '',
    createdAt: '',
    updatedAt: '',
    segmentCount: 0,
    doneCount: 0,
    tmAttachments: items,
  })
  writeStore(store)
}

export function attachJobTm(
  jobId: string,
  id: ProjectTmAttachmentId,
  perms?: { canRead?: boolean; canWrite?: boolean },
) {
  const next = attachProjectTm(
    {
      id: jobId,
      name: '',
      createdAt: '',
      updatedAt: '',
      segmentCount: 0,
      doneCount: 0,
      tmAttachments: listJobTmAttachments(jobId),
    },
    id,
    perms,
  )
  setJobTmAttachments(jobId, next)
  return next
}

export function detachJobTm(jobId: string, id: ProjectTmAttachmentId) {
  const next = detachProjectTm(
    {
      id: jobId,
      name: '',
      createdAt: '',
      updatedAt: '',
      segmentCount: 0,
      doneCount: 0,
      tmAttachments: listJobTmAttachments(jobId),
    },
    id,
  )
  setJobTmAttachments(jobId, next)
  return next
}

export function updateJobTmAttachment(
  jobId: string,
  id: ProjectTmAttachmentId,
  patch: Partial<Pick<ProjectTmAttachment, 'canRead' | 'canWrite'>>,
) {
  const next = updateProjectTmAttachment(
    {
      id: jobId,
      name: '',
      createdAt: '',
      updatedAt: '',
      segmentCount: 0,
      doneCount: 0,
      tmAttachments: listJobTmAttachments(jobId),
    },
    id,
    patch,
  )
  setJobTmAttachments(jobId, next)
  return next
}

export function detachJobTmEverywhere(id: ProjectTmAttachmentId): number {
  const store = readStore()
  let touched = 0
  for (const jobId of Object.keys(store)) {
    const before = listJobTmAttachments(jobId)
    if (!before.some(x => x.id === id)) continue
    detachJobTm(jobId, id)
    touched += 1
  }
  return touched
}

export { PERSONAL_TM_ATTACHMENT_ID } from '@/tm/projectAttachments'
