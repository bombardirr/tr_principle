import { apiFetch } from '@/auth/api'
import type { TmUnit } from '@/types/tm'

export type TmPullResponse = {
  until: string
  units: TmUnit[]
  hasMore: boolean
}

export type TmPushResponse = {
  ok: boolean
  until: string
}

export type TmBaseApiRecord = {
  id: string
  label: string
  color: string
  createdAt: string
  updatedAt: string
}

export async function pullTmSync(since: string) {
  const q = encodeURIComponent(since)
  return apiFetch<TmPullResponse>(`/api/tm/sync?since=${q}`)
}

export async function pushTmSync(units: TmUnit[]) {
  return apiFetch<TmPushResponse>('/api/tm/sync', {
    method: 'POST',
    body: JSON.stringify({ units }),
  })
}

function baseSyncPath(baseId: string): string {
  return `/api/tm/bases/${encodeURIComponent(baseId)}/sync`
}

export async function pullTmBaseSync(baseId: string, since: string, jobId?: string) {
  const jobQuery = jobId ? `&jobId=${encodeURIComponent(jobId)}` : ''
  return apiFetch<TmPullResponse>(
    `${baseSyncPath(baseId)}?since=${encodeURIComponent(since)}${jobQuery}`,
  )
}

export async function pushTmBaseSync(baseId: string, units: TmUnit[], jobId?: string) {
  const jobQuery = jobId ? `?jobId=${encodeURIComponent(jobId)}` : ''
  return apiFetch<TmPushResponse>(`${baseSyncPath(baseId)}${jobQuery}`, {
    method: 'POST',
    body: JSON.stringify({ units }),
  })
}

export async function listTmBasesApi() {
  const response = await apiFetch<{ bases: TmBaseApiRecord[] }>('/api/tm/bases')
  return response.bases
}

export async function upsertTmBaseApi(input: { id?: string; label: string; color?: string }) {
  return apiFetch<Pick<TmBaseApiRecord, 'id' | 'label' | 'color'>>('/api/tm/bases', {
    method: 'POST',
    body: JSON.stringify(input),
  })
}
