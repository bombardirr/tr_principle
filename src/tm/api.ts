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
