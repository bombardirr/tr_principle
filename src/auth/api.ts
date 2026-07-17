const TOKEN_KEY = 'appzac-auth-token'

export type PlanId = 'free' | 'pro'
export type PlanStatus = 'active' | 'trialing' | 'past_due' | 'canceled' | 'inactive'

export type AuthUser = {
  id: string
  email: string
  display_name: string
  is_admin: boolean
  plan: PlanId
  plan_status: PlanStatus
}

function apiBase(): string {
  const raw = import.meta.env.VITE_API_BASE as string | undefined
  return raw?.replace(/\/$/, '') ?? ''
}

export function getStoredToken(): string | null {
  if (typeof localStorage === 'undefined') return null
  return localStorage.getItem(TOKEN_KEY)
}

export function setStoredToken(token: string | null) {
  if (typeof localStorage === 'undefined') return
  if (token) localStorage.setItem(TOKEN_KEY, token)
  else localStorage.removeItem(TOKEN_KEY)
}

export class ApiError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

export async function apiFetch<T>(
  path: string,
  options: RequestInit & { token?: string | null } = {},
): Promise<T> {
  const headers = new Headers(options.headers)
  if (options.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }
  const token = options.token === undefined ? getStoredToken() : options.token
  if (token) headers.set('Authorization', `Bearer ${token}`)

  const res = await fetch(`${apiBase()}${path}`, { ...options, headers })
  const text = await res.text()
  let data: unknown = null
  if (text) {
    try {
      data = JSON.parse(text)
    } catch {
      data = { error: text }
    }
  }
  if (!res.ok) {
    const msg =
      data && typeof data === 'object' && 'error' in data
        ? String((data as { error: unknown }).error)
        : res.statusText
    throw new ApiError(res.status, msg)
  }
  return data as T
}

export async function apiBlob(path: string, options: RequestInit = {}): Promise<Blob> {
  const headers = new Headers(options.headers)
  const token = getStoredToken()
  if (token) headers.set('Authorization', `Bearer ${token}`)
  const res = await fetch(`${apiBase()}${path}`, { ...options, headers })
  if (!res.ok) {
    const data = await res.json().catch(() => null)
    throw new ApiError(res.status, data?.error ? String(data.error) : res.statusText)
  }
  return res.blob()
}

export async function register(email: string, password: string) {
  return apiFetch<{ token: string; user: AuthUser }>('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
    token: null,
  })
}

export async function login(email: string, password: string) {
  return apiFetch<{ token: string; user: AuthUser }>('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
    token: null,
  })
}

export async function fetchMe(token?: string) {
  return apiFetch<AuthUser>('/api/auth/me', { token })
}

export async function logoutRequest() {
  return apiFetch<{ ok: boolean }>('/api/auth/logout', { method: 'POST' })
}

export async function patchMe(displayName: string) {
  return apiFetch<AuthUser>('/api/auth/me', {
    method: 'PATCH',
    body: JSON.stringify({ display_name: displayName }),
  })
}
