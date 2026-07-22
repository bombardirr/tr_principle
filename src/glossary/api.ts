import { apiFetch } from '@/auth/api'
import type { GlossaryTerm } from '@/types/glossary'

export type GlossaryPullResponse = {
  until: string
  terms: GlossaryTerm[]
  hasMore: boolean
}

export type GlossaryPushResponse = {
  ok: boolean
  until: string
}

export type GlossaryBaseApiRecord = {
  id: string
  label: string
  color: string
  createdAt: string
  updatedAt: string
}

export async function pullGlossarySync(since: string) {
  const q = encodeURIComponent(since)
  return apiFetch<GlossaryPullResponse>(`/api/glossary/sync?since=${q}`)
}

export async function pushGlossarySync(terms: GlossaryTerm[]) {
  return apiFetch<GlossaryPushResponse>('/api/glossary/sync', {
    method: 'POST',
    body: JSON.stringify({ terms }),
  })
}

function baseSyncPath(baseId: string): string {
  return `/api/glossary/bases/${encodeURIComponent(baseId)}/sync`
}

export async function pullGlossaryBaseSync(baseId: string, since: string, jobId?: string) {
  const jobQuery = jobId ? `&jobId=${encodeURIComponent(jobId)}` : ''
  return apiFetch<GlossaryPullResponse>(
    `${baseSyncPath(baseId)}?since=${encodeURIComponent(since)}${jobQuery}`,
  )
}

export async function pushGlossaryBaseSync(baseId: string, terms: GlossaryTerm[], jobId?: string) {
  const jobQuery = jobId ? `?jobId=${encodeURIComponent(jobId)}` : ''
  return apiFetch<GlossaryPushResponse>(`${baseSyncPath(baseId)}${jobQuery}`, {
    method: 'POST',
    body: JSON.stringify({ terms }),
  })
}

export async function listGlossaryBasesApi() {
  const response = await apiFetch<{ bases: GlossaryBaseApiRecord[] }>('/api/glossary/bases')
  return response.bases
}

export async function upsertGlossaryBaseApi(input: {
  id?: string
  label: string
  color?: string
}) {
  return apiFetch<Pick<GlossaryBaseApiRecord, 'id' | 'label' | 'color'>>('/api/glossary/bases', {
    method: 'POST',
    body: JSON.stringify(input),
  })
}
