import { apiBase, apiFetch, getStoredToken, ApiError } from '@/auth/api'

export type CloudLockResponse = {
  holderId: string
  token: string
  expiresAt: string
}

export async function claimProjectLock(
  projectId: string,
  holderId: string,
  token?: string,
) {
  return apiFetch<CloudLockResponse>(`/api/projects/${projectId}/lock`, {
    method: 'POST',
    body: JSON.stringify({ holderId, token: token || undefined }),
  })
}

export async function releaseProjectLock(
  projectId: string,
  holderId: string,
  token: string,
) {
  return apiFetch<{ ok: boolean }>(`/api/projects/${projectId}/lock`, {
    method: 'DELETE',
    body: JSON.stringify({ holderId, token }),
  })
}

export async function putProjectBackup(projectId: string, blob: Blob) {
  const headers = new Headers()
  const token = getStoredToken()
  if (token) headers.set('Authorization', `Bearer ${token}`)
  headers.set('Content-Type', 'application/zip')
  const res = await fetch(`${apiBase()}/api/projects/${projectId}/backup`, {
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
  return (await res.json()) as { ok: boolean; updatedAt: string; sizeBytes: number }
}

export async function getProjectBackup(projectId: string): Promise<ArrayBuffer> {
  const headers = new Headers()
  const token = getStoredToken()
  if (token) headers.set('Authorization', `Bearer ${token}`)
  const res = await fetch(`${apiBase()}/api/projects/${projectId}/backup`, { headers })
  if (!res.ok) {
    throw new ApiError(res.status, res.status === 404 ? 'no backup' : res.statusText)
  }
  return res.arrayBuffer()
}

export async function hasProjectBackup(projectId: string): Promise<boolean> {
  const headers = new Headers()
  const token = getStoredToken()
  if (token) headers.set('Authorization', `Bearer ${token}`)
  const res = await fetch(`${apiBase()}/api/projects/${projectId}/backup`, {
    method: 'HEAD',
    headers,
  })
  return res.ok
}
