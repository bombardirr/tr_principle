import type { AuthUser } from '@/auth/api'

/** Product entitlement from API effective plan — never derive from is_admin. */
export function isPro(user: AuthUser | null | undefined): boolean {
  return user?.plan === 'pro'
}
