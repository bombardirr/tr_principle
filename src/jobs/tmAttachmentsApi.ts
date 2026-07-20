import { apiFetch } from '@/auth/api'
import type {
  CreateJobTmAttachmentInput,
  JobTmAttachment,
  PatchJobTmAttachmentInput,
} from '@/types/job'

export async function listJobTmAttachmentsApi(jobId: string) {
  const res = await apiFetch<{ attachments: JobTmAttachment[] }>(
    `/api/jobs/${jobId}/tm-attachments`,
  )
  return res.attachments ?? []
}

export async function createJobTmAttachment(jobId: string, input: CreateJobTmAttachmentInput) {
  return apiFetch<JobTmAttachment>(`/api/jobs/${jobId}/tm-attachments`, {
    method: 'POST',
    body: JSON.stringify(input),
  })
}

export async function patchJobTmAttachment(
  jobId: string,
  attachmentId: string,
  input: PatchJobTmAttachmentInput,
) {
  return apiFetch<JobTmAttachment>(`/api/jobs/${jobId}/tm-attachments/${attachmentId}`, {
    method: 'PATCH',
    body: JSON.stringify(input),
  })
}

export async function deleteJobTmAttachment(jobId: string, attachmentId: string) {
  await apiFetch<void>(`/api/jobs/${jobId}/tm-attachments/${attachmentId}`, {
    method: 'DELETE',
  })
}
