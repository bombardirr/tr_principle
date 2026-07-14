import { computed, readonly, ref } from 'vue'
import {
  ApiError,
  fetchMe,
  getStoredToken,
  login as apiLogin,
  logoutRequest,
  patchMe,
  register as apiRegister,
  setStoredToken,
  type AuthUser,
} from '@/auth/api'
import { setStorageAccountId } from '@/storage/scope'

const user = ref<AuthUser | null>(null)
const ready = ref(false)
const bootstrapping = ref(false)

async function applySession(token: string | null, next: AuthUser | null) {
  setStoredToken(token)
  user.value = next
  setStorageAccountId(next?.id ?? null)
}

export async function bootstrapAuth() {
  if (bootstrapping.value) return
  bootstrapping.value = true
  try {
    const token = getStoredToken()
    if (!token) {
      await applySession(null, null)
      return
    }
    try {
      const me = await fetchMe(token)
      await applySession(token, me)
    } catch {
      await applySession(null, null)
    }
  } finally {
    ready.value = true
    bootstrapping.value = false
  }
}

export async function register(email: string, password: string) {
  const res = await apiRegister(email, password)
  await applySession(res.token, res.user)
  return res.user
}

export async function login(email: string, password: string) {
  const res = await apiLogin(email, password)
  await applySession(res.token, res.user)
  return res.user
}

export async function logout() {
  try {
    await logoutRequest()
  } catch (e) {
    if (!(e instanceof ApiError && e.status === 401)) {
      // still clear local session
    }
  }
  await applySession(null, null)
}

export async function updateDisplayName(displayName: string) {
  const next = await patchMe(displayName)
  user.value = next
  return next
}

export function displayLabel(u: AuthUser | null | undefined): string {
  if (!u) return ''
  const name = u.display_name?.trim()
  if (name) return name
  return u.email
}

export function useAuth() {
  return {
    user: readonly(user),
    ready: readonly(ready),
    isAuthenticated: computed(() => !!user.value),
    register,
    login,
    logout,
    updateDisplayName,
    displayLabel,
  }
}
