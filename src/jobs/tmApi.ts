import { apiFetch } from '@/auth/api'
import type { JobResource, PatchJobResourceInput } from '@/types/job'
import type { TmPullResponse, TmPushResponse } from '@/tm/api'
import type { TmUnit } from '@/types/tm'

export async function listJobResources(jobId: string) {
  const res = await apiFetch<{ resources: JobResource[] }>(`/api/jobs/${jobId}/resources`)
  return res.resources ?? []
}

export async function patchJobResourcePreset(jobId: string, input: PatchJobResourceInput) {
  return apiFetch<JobResource>(`/api/jobs/${jobId}/resources/preset`, {
    method: 'PATCH',
    body: JSON.stringify({ kind: 'job_tm', ...input }),
  })
}

export async function patchJobResourceMe(jobId: string, input: PatchJobResourceInput) {
  return apiFetch<JobResource>(`/api/jobs/${jobId}/resources/me`, {
    method: 'PATCH',
    body: JSON.stringify({ kind: 'job_tm', ...input }),
  })
}

export async function pullJobTmSync(jobId: string, since: string) {
  const q = encodeURIComponent(since)
  return apiFetch<TmPullResponse>(`/api/jobs/${jobId}/tm/sync?since=${q}`)
}

export async function pushJobTmSync(jobId: string, units: TmUnit[]) {
  return apiFetch<TmPushResponse>(`/api/jobs/${jobId}/tm/sync`, {
    method: 'POST',
    body: JSON.stringify({ units }),
  })
}
