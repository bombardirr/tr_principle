import { computed, readonly, ref } from 'vue'
import {
  ApiError,
  fetchMe,
  getStoredToken,
  login as apiLogin,
  logoutRequest,
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

export async function register(loginName: string, password: string) {
  const res = await apiRegister(loginName, password)
  await applySession(res.token, res.user)
  return res.user
}

export async function login(loginName: string, password: string) {
  const res = await apiLogin(loginName, password)
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

export function useAuth() {
  return {
    user: readonly(user),
    ready: readonly(ready),
    isAuthenticated: computed(() => !!user.value),
    register,
    login,
    logout,
  }
}
