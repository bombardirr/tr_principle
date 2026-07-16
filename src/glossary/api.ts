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
