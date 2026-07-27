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
  current_period_end?: string | null
  storage_used_bytes: number
  storage_limit_bytes: number
  has_recovery_code?: boolean
}

export function apiBase(): string {
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
  return apiFetch<{ token: string; user: AuthUser; recovery_code?: string }>('/api/auth/register', {
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

export async function passwordReset(email: string, recoveryCode: string, password: string) {
  return apiFetch<{ ok: boolean }>('/api/auth/password-reset', {
    method: 'POST',
    body: JSON.stringify({ email, recovery_code: recoveryCode, password }),
    token: null,
  })
}

export async function rotateRecoveryCode() {
  return apiFetch<{ recovery_code: string }>('/api/auth/recovery-code', {
    method: 'POST',
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

export async function redeemLicense(key: string) {
  return apiFetch<AuthUser>('/api/auth/license/redeem', {
    method: 'POST',
    body: JSON.stringify({ key }),
  })
}

export type StorageBackupItem = {
  project_id: string
  project_name?: string
  size_bytes: number
  updated_at: string
}

export async function fetchStorage() {
  return apiFetch<{
    storage_used_bytes: number
    storage_limit_bytes: number
    plan: PlanId
    backups: StorageBackupItem[]
  }>('/api/auth/storage')
}

export type LicenseKeyRow = {
  key_hash: string
  key_hint: string
  sku: string
  duration_days: number
  status: 'unused' | 'redeemed' | 'revoked' | string
  note: string
  created_at: string
  created_email?: string
  redeemed_at?: string
  redeemed_email?: string
  key?: string
}

export type LicenseKeyStats = {
  total: number
  unused: number
  redeemed: number
  revoked: number
}

export async function adminListLicenses() {
  return apiFetch<{ keys: LicenseKeyRow[]; stats: LicenseKeyStats }>('/api/auth/license/keys')
}

export async function adminCreateLicense(sku: string, note = '') {
  return apiFetch<LicenseKeyRow>('/api/auth/license/keys', {
    method: 'POST',
    body: JSON.stringify({ sku, note }),
  })
}

export async function adminRevokeLicense(keyHash: string) {
  return apiFetch<{ ok: boolean }>('/api/auth/license/keys/revoke', {
    method: 'POST',
    body: JSON.stringify({ key_hash: keyHash }),
  })
}

export async function adminPatchLicenseNote(keyHash: string, note: string) {
  return apiFetch<{ ok: boolean }>('/api/auth/license/keys/note', {
    method: 'PATCH',
    body: JSON.stringify({ key_hash: keyHash, note }),
  })
}
