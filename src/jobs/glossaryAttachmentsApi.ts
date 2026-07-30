import { apiFetch } from '@/auth/api'
import { markGlossaryBaseDirty, syncGlossaryBase } from '@/glossary/sync'
import { ensureGlossaryBase } from '@/storage/glossaryBasesIdb'
import type {
  CloudProjectGlossaryAttachment,
  CreateCloudProjectGlossaryAttachmentInput,
  PatchCloudProjectGlossaryAttachmentInput,
} from '@/types/cloudProject'

export async function listJobGlossaryAttachments(projectId: string) {
  const res = await apiFetch<{ attachments: CloudProjectGlossaryAttachment[] }>(
    `/api/projects/${projectId}/glossary-attachments`,
  )
  return res.attachments ?? []
}

/** Promote a local glossary base before attaching it to a job. */
export async function createJobGlossaryAttachment(
  projectId: string,
  input: CreateCloudProjectGlossaryAttachmentInput,
) {
  const base = await ensureGlossaryBase(input.glossaryBaseId)
  await markGlossaryBaseDirty(base.id)
  await syncGlossaryBase(base.id, { pushOnly: true })
  return apiFetch<CloudProjectGlossaryAttachment>(`/api/projects/${projectId}/glossary-attachments`, {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

export async function patchJobGlossaryAttachment(
  projectId: string,
  attachmentId: string,
  input: PatchCloudProjectGlossaryAttachmentInput,
) {
  return apiFetch<CloudProjectGlossaryAttachment>(
    `/api/projects/${projectId}/glossary-attachments/${attachmentId}`,
    {
      method: 'PATCH',
      body: JSON.stringify(input),
    },
  )
}

export async function deleteJobGlossaryAttachment(projectId: string, attachmentId: string) {
  await apiFetch<void>(`/api/projects/${projectId}/glossary-attachments/${attachmentId}`, {
    method: 'DELETE',
  })
}
