import { apiFetch } from '@/auth/api'
import type {
  CloudProjectResource,
  PatchCloudProjectResourceInput,
} from '@/types/cloudProject'
import type { TmPullResponse, TmPushResponse } from '@/tm/api'
import type { TmUnit } from '@/types/tm'

export async function listJobResources(projectId: string) {
  const res = await apiFetch<{ resources: CloudProjectResource[] }>(
    `/api/projects/${projectId}/resources`,
  )
  return res.resources ?? []
}

export async function patchJobResourcePreset(
  projectId: string,
  input: PatchCloudProjectResourceInput,
) {
  return apiFetch<CloudProjectResource>(`/api/projects/${projectId}/resources/preset`, {
    method: 'PATCH',
    body: JSON.stringify({ kind: 'job_tm', ...input }),
  })
}

export async function patchJobResourceMe(projectId: string, input: PatchCloudProjectResourceInput) {
  return apiFetch<CloudProjectResource>(`/api/projects/${projectId}/resources/me`, {
    method: 'PATCH',
    body: JSON.stringify({ kind: 'job_tm', ...input }),
  })
}

export async function pullJobTmSync(projectId: string, since: string) {
  const q = encodeURIComponent(since)
  return apiFetch<TmPullResponse>(`/api/projects/${projectId}/tm/sync?since=${q}`)
}

export async function pushJobTmSync(projectId: string, units: TmUnit[]) {
  return apiFetch<TmPushResponse>(`/api/projects/${projectId}/tm/sync`, {
    method: 'POST',
    body: JSON.stringify({ units }),
  })
}
