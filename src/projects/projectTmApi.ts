import { apiBlob, apiFetch } from '@/auth/api'
import type { TmUnit } from '@/types/tm'

export type ProjectTmAttachment = {
  id: string
  projectId: string
  kind: 'project' | 'user'
  userId?: string
  canRead: boolean
  canWrite: boolean
  canExport: boolean
  canClone: boolean
  createdAt: string
  updatedAt: string
}

export type ProjectTmPull = {
  until: string
  units: TmUnit[]
  hasMore: boolean
}

export function pullProjectTm(projectId: string, since = '1970-01-01T00:00:00.000Z') {
  return apiFetch<ProjectTmPull>(`/api/projects/${projectId}/tm/sync?since=${encodeURIComponent(since)}`)
}

export function pushProjectTm(projectId: string, units: TmUnit[]) {
  return apiFetch<{ ok: boolean; until: string }>(`/api/projects/${projectId}/tm/sync`, {
    method: 'POST',
    body: JSON.stringify({ units }),
  })
}

export function listProjectTmAttachments(projectId: string) {
  return apiFetch<{ attachments: ProjectTmAttachment[] }>(`/api/projects/${projectId}/tm-attachments`)
}

export function attachPersonalTm(projectId: string) {
  return apiFetch<ProjectTmAttachment>(`/api/projects/${projectId}/tm-attachments`, {
    method: 'POST',
    body: JSON.stringify({}),
  })
}

export function patchProjectTmAttachment(
  projectId: string,
  attachmentId: string,
  patch: Partial<Pick<ProjectTmAttachment, 'canRead' | 'canWrite' | 'canExport' | 'canClone'>>,
) {
  return apiFetch<ProjectTmAttachment>(`/api/projects/${projectId}/tm-attachments/${attachmentId}`, {
    method: 'PATCH',
    body: JSON.stringify(patch),
  })
}

export function cloneProjectTmAttachment(projectId: string, attachmentId: string) {
  return apiFetch<{ units: TmUnit[] }>(
    `/api/projects/${projectId}/tm-attachments/${attachmentId}/clone`,
    { method: 'POST' },
  )
}

export function exportProjectTmAttachment(projectId: string, attachmentId: string) {
  return apiBlob(`/api/projects/${projectId}/tm-attachments/${attachmentId}/export`, {
    method: 'POST',
  })
}
