import type { AuthUser } from '@/auth/api'

/** Product entitlement from API effective plan — never derive from is_admin. */
export function isPro(user: AuthUser | null | undefined): boolean {
  return user?.plan === 'pro'
}

/** Whole days left until current_period_end; null if unknown / not Pro. */
export function proDaysLeft(user: AuthUser | null | undefined): number | null {
  if (!user || user.plan !== 'pro' || !user.current_period_end) return null
  const end = Date.parse(user.current_period_end)
  if (!Number.isFinite(end)) return null
  const ms = end - Date.now()
  if (ms <= 0) return 0
  return Math.ceil(ms / (24 * 60 * 60 * 1000))
}

export function formatBytes(n: number): string {
  if (!Number.isFinite(n) || n < 0) return '0 B'
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`
  return `${(n / (1024 * 1024 * 1024)).toFixed(1)} GB`
}

export function storageNearFull(user: AuthUser | null | undefined): boolean {
  if (!user?.storage_limit_bytes) return false
  return user.storage_used_bytes / user.storage_limit_bytes >= 0.8
}

export function storageOverLimit(user: AuthUser | null | undefined): boolean {
  if (!user?.storage_limit_bytes) return false
  return user.storage_used_bytes > user.storage_limit_bytes
}
