import { apiFetch } from '@/auth/api'
import { markGlossaryBaseDirty, syncGlossaryBase } from '@/glossary/sync'
import { ensureGlossaryBase } from '@/storage/glossaryBasesIdb'
import type {
  CreateJobGlossaryAttachmentInput,
  JobGlossaryAttachment,
  PatchJobGlossaryAttachmentInput,
} from '@/types/job'

export async function listJobGlossaryAttachments(jobId: string) {
  const res = await apiFetch<{ attachments: JobGlossaryAttachment[] }>(
    `/api/jobs/${jobId}/glossary-attachments`,
  )
  return res.attachments ?? []
}

/** Promote a local glossary base before attaching it to a job. */
export async function createJobGlossaryAttachment(
  jobId: string,
  input: CreateJobGlossaryAttachmentInput,
) {
  const base = await ensureGlossaryBase(input.glossaryBaseId)
  await markGlossaryBaseDirty(base.id)
  await syncGlossaryBase(base.id, { pushOnly: true })
  return apiFetch<JobGlossaryAttachment>(`/api/jobs/${jobId}/glossary-attachments`, {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

export async function patchJobGlossaryAttachment(
  jobId: string,
  attachmentId: string,
  input: PatchJobGlossaryAttachmentInput,
) {
  return apiFetch<JobGlossaryAttachment>(
    `/api/jobs/${jobId}/glossary-attachments/${attachmentId}`,
    {
      method: 'PATCH',
      body: JSON.stringify(input),
    },
  )
}

export async function deleteJobGlossaryAttachment(jobId: string, attachmentId: string) {
  await apiFetch<void>(`/api/jobs/${jobId}/glossary-attachments/${attachmentId}`, {
    method: 'DELETE',
  })
}
