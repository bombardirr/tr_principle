import { apiFetch } from '@/auth/api'
import { syncTmBase } from '@/tm/sync'
import type {
  CloudProjectTmAttachment,
  CreateCloudProjectTmAttachmentInput,
  PatchCloudProjectTmAttachmentInput,
} from '@/types/cloudProject'

export async function listJobTmAttachmentsApi(projectId: string) {
  const res = await apiFetch<{ attachments: CloudProjectTmAttachment[] }>(
    `/api/projects/${projectId}/tm-attachments`,
  )
  return res.attachments ?? []
}

export async function createJobTmAttachment(
  projectId: string,
  input: CreateCloudProjectTmAttachmentInput,
) {
  const row = await apiFetch<CloudProjectTmAttachment>(`/api/projects/${projectId}/tm-attachments`, {
    method: 'POST',
    body: JSON.stringify(input),
  })
  await syncTmBase(input.tmBaseId, { pushOnly: true })
  return row
}

export async function patchJobTmAttachment(
  projectId: string,
  attachmentId: string,
  input: PatchCloudProjectTmAttachmentInput,
) {
  return apiFetch<CloudProjectTmAttachment>(`/api/projects/${projectId}/tm-attachments/${attachmentId}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  })
}

export async function deleteJobTmAttachment(projectId: string, attachmentId: string) {
  await apiFetch<void>(`/api/projects/${projectId}/tm-attachments/${attachmentId}`, {
    method: 'DELETE',
  })
}
