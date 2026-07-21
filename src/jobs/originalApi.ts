import { apiFetch, getStoredToken, ApiError, apiBlob } from '@/auth/api'

function apiBase() {
  return (import.meta.env.VITE_API_BASE as string | undefined)?.replace(/\/$/, '') ?? ''
}

export async function putJobOriginal(jobId: string, blob: Blob, filename: string) {
  const headers = new Headers()
  const token = getStoredToken()
  if (token) headers.set('Authorization', `Bearer ${token}`)
  headers.set('Content-Type', 'application/octet-stream')
  headers.set('X-Filename', filename)
  const res = await fetch(`${apiBase()}/api/jobs/${jobId}/original`, {
    method: 'PUT',
    headers,
    body: blob,
  })
  if (!res.ok) {
    const text = await res.text()
    let msg = res.statusText
    try {
      const data = JSON.parse(text) as { error?: string }
      if (data.error) msg = data.error
    } catch {
      /* ignore */
    }
    throw new ApiError(res.status, msg)
  }
  return (await res.json()) as { ok: boolean; sizeBytes: number; filename: string }
}

export async function getJobOriginal(jobId: string): Promise<Blob> {
  return apiBlob(`/api/jobs/${jobId}/original`)
}

export async function deleteJobOriginal(jobId: string): Promise<void> {
  await apiFetch<void>(`/api/jobs/${jobId}/original`, { method: 'DELETE' })
}
