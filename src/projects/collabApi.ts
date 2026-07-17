import { apiFetch } from '@/auth/api'
import type { ProjectMeta, Segment } from '@/types/project'

export type CloudProject = {
  id: string
  ownerUserId: string
  name: string
  sourceLang: string
  targetLang: string
  meta: Record<string, unknown>
  createdAt: string
  updatedAt: string
}

export type ProjectSyncPull = {
  until: string
  meta: ProjectMeta
  segments: Segment[]
  docxHash?: string | null
}

export type ProjectPresence = {
  userId: string
  displayName: string
  holderId: string
  updatedAt: string
}

export async function createCloudProject(meta: ProjectMeta): Promise<CloudProject> {
  return apiFetch<CloudProject>('/api/projects', {
    method: 'POST',
    body: JSON.stringify({
      id: meta.id,
      name: meta.name,
      sourceLang: meta.sourceLang ?? '',
      targetLang: meta.targetLang ?? '',
      meta,
    }),
  })
}

export function listCloudProjects() {
  return apiFetch<{ projects: CloudProject[] }>('/api/projects')
}

export function getCloudProject(projectId: string) {
  return apiFetch<CloudProject>(`/api/projects/${projectId}`)
}

export function pullProjectSync(projectId: string, since?: string) {
  const query = since ? `?since=${encodeURIComponent(since)}` : ''
  return apiFetch<ProjectSyncPull>(`/api/projects/${projectId}/sync${query}`)
}

export function pushProjectSync(
  projectId: string,
  payload: {
    meta: ProjectMeta
    segments: Segment[]
    docxHash?: string | null
    holderId: string
    token: string
  }
) {
  return apiFetch<ProjectSyncPull>(`/api/projects/${projectId}/sync`, {
    method: 'POST',
    body: JSON.stringify(payload),
  })
}

export function postProjectPresence(projectId: string, holderId: string) {
  return apiFetch<ProjectPresence>(`/api/projects/${projectId}/presence`, {
    method: 'POST',
    body: JSON.stringify({ holderId }),
  })
}

export function getProjectPresence(projectId: string) {
  return apiFetch<{ presence: ProjectPresence[] }>(`/api/projects/${projectId}/presence`)
}
