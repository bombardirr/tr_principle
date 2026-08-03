<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { Cat } from '@lucide/vue'
import { ApiError, passwordReset } from '@/auth/api'
import { useAuth } from '@/auth/session'
import { metrikaGoal } from '@/analytics/metrika'

const { t } = useI18n()
const router = useRouter()
const { register, login, isAuthenticated } = useAuth()

const mode = ref<'home' | 'login' | 'register' | 'forgot' | 'recovery'>('home')
const email = ref('')
const password = ref('')
const recoveryCode = ref('')
const shownRecovery = ref('')
const busy = ref(false)
const error = ref('')
const info = ref('')
const showPassword = ref(false)

const landingRoot = ref<HTMLElement | null>(null)

const cubeKeys = [
  'docx',
  'browser',
  'preview',
  'translate',
  'plan',
  'cat',
  'ru',
] as const

const title = computed(() => {
  if (mode.value === 'login') return t('landing.loginTitle')
  if (mode.value === 'register') return t('landing.registerTitle')
  if (mode.value === 'forgot') return t('landing.forgotTitle')
  if (mode.value === 'recovery') return t('landing.recoveryTitle')
  return t('landing.headline')
})

onMounted(() => {
  if (isAuthenticated.value) {
    void router.replace({ name: 'projects' })
  }
})

function openLogin() {
  mode.value = 'login'
  error.value = ''
  info.value = ''
  showPassword.value = false
}

function openRegister() {
  mode.value = 'register'
  error.value = ''
  info.value = ''
  showPassword.value = false
}

function openForgot() {
  mode.value = 'forgot'
  error.value = ''
  info.value = ''
  password.value = ''
  recoveryCode.value = ''
  showPassword.value = false
}

function backHome() {
  mode.value = 'home'
  error.value = ''
  info.value = ''
  showPassword.value = false
  shownRecovery.value = ''
}

function looksLikeEmail(raw: string): boolean {
  const v = raw.trim()
  if (!v || v.length > 254) return false
  const at = v.lastIndexOf('@')
  if (at < 1 || at === v.length - 1) return false
  const domain = v.slice(at + 1)
  return domain.includes('.') && !domain.startsWith('.') && !domain.endsWith('.')
}

function validateCreds(): boolean {
  if (!looksLikeEmail(email.value)) {
    error.value = t('landing.errorEmail')
    return false
  }
  if (password.value.length < 8) {
    error.value = t('landing.errorPasswordShort')
    return false
  }
  return true
}

async function submit() {
  error.value = ''
  info.value = ''
  if (mode.value === 'forgot') {
    if (!looksLikeEmail(email.value)) {
      error.value = t('landing.errorEmail')
      return
    }
    if (password.value.length < 8) {
      error.value = t('landing.errorPasswordShort')
      return
    }
    if (!recoveryCode.value.trim()) {
      error.value = t('landing.errorRecoveryCode')
      return
    }
    busy.value = true
    try {
      await passwordReset(email.value.trim(), recoveryCode.value.trim(), password.value)
      info.value = t('landing.resetDone')
      mode.value = 'login'
      password.value = ''
      recoveryCode.value = ''
    } catch (e) {
      const raw = e instanceof ApiError ? e.message : e instanceof Error ? e.message : String(e)
      if (raw.includes('invalid credentials') || raw.includes('invalid recovery'))
        error.value = t('landing.errorRecoveryCode')
      else if (raw.includes('password must')) error.value = t('landing.errorPasswordShort')
      else error.value = raw
    } finally {
      busy.value = false
    }
    return
  }
  if (mode.value === 'recovery') {
    await router.push({ name: 'projects' })
    return
  }
  if (!validateCreds()) return
  busy.value = true
  try {
    if (mode.value === 'register') {
      const res = await register(email.value.trim(), password.value)
      metrikaGoal('register')
      shownRecovery.value = res.recoveryCode
      mode.value = 'recovery'
      return
    }
    await login(email.value.trim(), password.value)
    metrikaGoal('login')
    await router.push({ name: 'projects' })
  } catch (e) {
    const raw =
      e instanceof ApiError ? e.message : e instanceof Error ? e.message : String(e)
    if (raw.includes('email taken')) error.value = t('landing.errorEmailTaken')
    else if (raw.includes('invalid email') || raw.includes('invalid credentials'))
      error.value =
        mode.value === 'login' ? t('landing.errorCredentials') : t('landing.errorEmail')
    else if (raw.includes('password must')) error.value = t('landing.errorPasswordShort')
    else error.value = raw
  } finally {
    busy.value = false
  }
}

async function copyRecovery() {
  if (!shownRecovery.value) return
  try {
    await navigator.clipboard.writeText(shownRecovery.value)
    info.value = t('landing.recoveryCopied')
  } catch {
    error.value = t('landing.recoveryCopyFail')
  }
}
</script>

<template>
  <div ref="landingRoot" class="landing">
    <div class="landing-bg" aria-hidden="true" />

    <div class="landing-stage" :class="{ 'landing-stage--auth': mode !== 'home' }">
      <div class="stage-pair">
      <section class="hero">
        <h1 class="headline">{{ title }}</h1>
        <p v-if="mode === 'home' && t('landing.support')" class="support">{{ t('landing.support') }}</p>
        <p v-if="mode === 'home'" class="solo">{{ t('landing.solo') }}</p>

        <div v-if="mode === 'home'" class="cta">
          <button type="button" class="primary" @click="openRegister">
            {{ t('landing.register') }}
          </button>
          <button type="button" class="ghost" @click="openLogin">
            {{ t('landing.login') }}
          </button>
        </div>

        <form
          v-else
          class="auth-form"
          autocomplete="off"
          novalidate
          @submit.prevent="submit"
        >
          <div class="error-slot" aria-live="polite">
            <p v-if="error" class="error" role="alert" :title="error">{{ error }}</p>
            <p v-else-if="info" class="info" role="status">{{ info }}</p>
          </div>

          <template v-if="mode === 'recovery'">
            <p class="support">{{ t('landing.recoveryHint') }}</p>
            <p class="recovery-code"><code>{{ shownRecovery }}</code></p>
            <p class="support warn">{{ t('landing.recoveryLose') }}</p>
            <div class="cta">
              <button type="button" class="ghost" @click="copyRecovery">
                {{ t('landing.recoveryCopy') }}
              </button>
              <button type="submit" class="primary">{{ t('landing.recoveryContinue') }}</button>
            </div>
          </template>

          <template v-else>
            <label>
              <span>{{ t('landing.emailField') }}</span>
              <input
                v-model="email"
                name="email"
                type="email"
                inputmode="email"
                autocomplete="email"
                autocapitalize="off"
                spellcheck="false"
                maxlength="254"
                @input="error = ''"
              />
            </label>
            <label v-if="mode === 'forgot'">
              <span>{{ t('landing.recoveryCodeField') }}</span>
              <input
                v-model="recoveryCode"
                name="recovery-code"
                type="text"
                autocomplete="one-time-code"
                maxlength="32"
                spellcheck="false"
                @input="error = ''"
              />
            </label>
            <label>
              <span>{{
                mode === 'forgot' ? t('landing.newPasswordField') : t('landing.passwordField')
              }}</span>
              <div class="password-row">
                <input
                  v-model="password"
                  :type="showPassword ? 'text' : 'password'"
                  name="appzac-password"
                  :autocomplete="
                    mode === 'register' || mode === 'forgot' ? 'new-password' : 'current-password'
                  "
                  maxlength="128"
                  @input="error = ''"
                />
                <button
                  type="button"
                  class="password-toggle"
                  :title="showPassword ? t('landing.hidePassword') : t('landing.showPassword')"
                  :aria-label="showPassword ? t('landing.hidePassword') : t('landing.showPassword')"
                  @click="showPassword = !showPassword"
                >
                  <svg
                    v-if="!showPassword"
                    viewBox="0 0 16 16"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="1.5"
                    aria-hidden="true"
                  >
                    <path
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      d="M1.75 8s2.25-3.75 6.25-3.75S14.25 8 14.25 8s-2.25 3.75-6.25 3.75S1.75 8 1.75 8Z"
                    />
                    <circle cx="8" cy="8" r="1.75" />
                  </svg>
                  <svg
                    v-else
                    viewBox="0 0 16 16"
                    fill="none"
                    stroke="currentColor"
                    stroke-width="1.5"
                    aria-hidden="true"
                  >
                    <path
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      d="M1.75 8s2.25-3.75 6.25-3.75S14.25 8 14.25 8s-2.25 3.75-6.25 3.75S1.75 8 1.75 8Z"
                    />
                    <circle cx="8" cy="8" r="1.75" />
                    <path stroke-linecap="round" d="m3.25 12.75 9.5-9.5" />
                  </svg>
                </button>
              </div>
            </label>
            <p v-if="mode === 'forgot'" class="support">{{ t('landing.forgotHint') }}</p>
            <div class="cta">
              <button type="submit" class="primary" :disabled="busy">
                {{
                  mode === 'register'
                    ? t('landing.register')
                    : mode === 'forgot'
                      ? t('landing.resetSubmit')
                      : t('landing.login')
                }}
              </button>
              <button
                v-if="mode === 'login'"
                type="button"
                class="ghost"
                :disabled="busy"
                @click="openForgot"
              >
                {{ t('landing.forgotLink') }}
              </button>
              <button type="button" class="ghost" :disabled="busy" @click="backHome">
                {{ t('landing.back') }}
              </button>
            </div>
          </template>
        </form>
      </section>

      <aside v-if="mode === 'home'" class="cubes" :aria-label="t('landing.cubesLabel')">
        <article
          v-for="key in cubeKeys"
          :key="key"
          class="cube"
        >
          <div class="cube-title-row">
            <h2 class="cube-title">{{ t(`landing.cubes.${key}.title`) }}</h2>
            <Cat v-if="key === 'cat'" class="cube-icon" :size="18" :stroke-width="1.75" aria-hidden="true" />
            <svg
              v-else-if="key === 'ru'"
              class="cube-flag"
              viewBox="0 0 9 6"
              width="18"
              height="12"
              aria-hidden="true"
            >
              <rect width="9" height="2" y="0" fill="#fff" />
              <rect width="9" height="2" y="2" fill="#0039a6" />
              <rect width="9" height="2" y="4" fill="#d52b1e" />
            </svg>
          </div>
          <p v-if="t(`landing.cubes.${key}.text`)" class="cube-text">
            {{ t(`landing.cubes.${key}.text`) }}
          </p>
        </article>
      </aside>
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
.landing {
  --stage-h: calc(100dvh - 3.25rem);
  position: relative;
}

.landing-bg {
  position: fixed;
  top: 10%;
  right: -5%;
  width: min(58vw, 560px);
  height: min(58vw, 560px);
  border-radius: 40% 60% 55% 45%;
  background:
    radial-gradient(circle at 30% 30%, rgba(91, 159, 212, 0.28), transparent 55%),
    radial-gradient(circle at 70% 60%, rgba(125, 190, 138, 0.14), transparent 50%);
  filter: blur(8px);
  animation: drift 18s ease-in-out infinite alternate;
  pointer-events: none;
  z-index: 0;
}

.landing-stage {
  position: relative;
  z-index: 1;
  height: var(--stage-h);
  display: flex;
  align-items: center;
  justify-content: center;
  box-sizing: border-box;
  padding: 0.5rem 0 1rem;
}

.stage-pair {
  display: grid;
  grid-template-columns: minmax(0, 26rem) minmax(0, 26rem);
  gap: clamp(1.25rem, 3.5vw, 3rem);
  align-items: center;
  width: min(100%, calc(52rem + clamp(1.25rem, 3.5vw, 3rem)));
}

.landing-stage--auth .stage-pair {
  grid-template-columns: minmax(0, 26rem);
  width: min(100%, 26rem);
  justify-items: center;
}

.hero {
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
  width: 100%;
  padding: 0.85rem 0.9rem;
  border: 1px solid var(--border);
  border-radius: 12px;
  background: color-mix(in srgb, var(--surface) 88%, transparent);
  box-shadow: 0 1px 0 color-mix(in srgb, var(--text) 4%, transparent);
  animation: rise 0.7s ease-out both;
}

.headline {
  margin: 0;
  font-size: clamp(1.05rem, 2vw, 1.28rem);
  font-weight: 600;
  line-height: 1.3;
  color: var(--text);
}

.support {
  margin: 0.55rem 0 0;
  color: var(--text-muted);
  font-size: 0.88rem;
  line-height: 1.4;
}
.solo {
  margin: 0.45rem 0 0;
  color: var(--text-faint);
  font-size: 0.82rem;
  line-height: 1.4;
}
.support.warn {
  color: #d89a5a;
}
.recovery-code {
  margin: 0.75rem 0;
}
.recovery-code code {
  font-size: 1.05rem;
  letter-spacing: 0.04em;
  word-break: break-all;
}

.cta {
  display: flex;
  flex-wrap: wrap;
  gap: 0.65rem;
  margin-top: 0.85rem;
  animation: rise 0.9s ease-out 0.12s both;
}

.auth-form {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  margin-top: 0.85rem;
}

.auth-form label {
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
  font-size: 0.82rem;
  color: var(--text-muted);
}

.auth-form input {
  width: 100%;
  box-sizing: border-box;
  padding: 0.55rem 0.75rem;
  border-radius: 12px;
  border: 1px solid var(--border);
  background: var(--surface);
}

.password-row {
  position: relative;
  display: flex;
  align-items: center;
}

.password-row input {
  padding-right: 2.4rem;
}

.password-toggle {
  position: absolute;
  right: 0.25rem;
  width: 2rem;
  height: 2rem;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: none;
  border-radius: 8px;
  background: transparent;
  color: var(--text-muted);
  cursor: pointer;
}

.password-toggle:hover {
  color: var(--text);
}

.password-toggle svg {
  width: 1rem;
  height: 1rem;
}

.error-slot {
  height: 2.85rem;
  flex-shrink: 0;
  display: flex;
  align-items: stretch;
}

.error {
  margin: 0;
  width: 100%;
  box-sizing: border-box;
  padding: 0.45rem 0.7rem;
  border-radius: 12px;
  border: 1px solid color-mix(in srgb, var(--danger) 45%, transparent);
  background: var(--danger-bg);
  color: var(--danger);
  font-size: 0.86rem;
  line-height: 1.3;
  overflow: hidden;
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}

.info {
  margin: 0;
  width: 100%;
  box-sizing: border-box;
  padding: 0.45rem 0.7rem;
  border-radius: 12px;
  border: 1px solid color-mix(in srgb, var(--ok) 40%, transparent);
  background: color-mix(in srgb, var(--ok) 12%, transparent);
  color: var(--text);
  font-size: 0.86rem;
  line-height: 1.35;
}

.field-hint {
  font-size: 0.78rem;
  line-height: 1.35;
  color: var(--text-faint);
}

.primary,
.ghost {
  border-radius: 12px;
  padding: 0.55rem 1rem;
  font-size: 0.92rem;
  cursor: pointer;
  border: 1px solid transparent;
}

.primary {
  background: var(--accent);
  color: var(--accent-text);
  border-color: var(--accent-strong);
}

.primary:disabled,
.ghost:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.ghost {
  background: transparent;
  color: var(--text);
  border-color: var(--border-strong);
}

.cubes {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.65rem;
  width: 100%;
  align-content: center;
  max-height: calc(var(--stage-h) - 2rem);
  overflow: auto;
  padding: 0;
  scrollbar-width: thin;
}

.cube {
  position: relative;
  margin: 0;
  padding: 0.85rem 0.9rem;
  border: 1px solid var(--border);
  border-radius: 12px;
  background: color-mix(in srgb, var(--surface) 88%, transparent);
  box-shadow: 0 1px 0 color-mix(in srgb, var(--text) 4%, transparent);
}

.cube-title-row {
  display: flex;
  align-items: center;
  gap: 0.55rem;
}

.cube-title {
  flex: 1;
  min-width: 0;
  margin: 0;
  font-size: 0.92rem;
  font-weight: 600;
  line-height: 1.3;
  color: var(--text);
}

.cube-icon {
  flex-shrink: 0;
  color: var(--accent);
  opacity: 0.85;
}

.cube-flag {
  flex-shrink: 0;
  width: 1.15rem;
  height: 0.78rem;
  border-radius: 2px;
  box-shadow: 0 0 0 1px color-mix(in srgb, var(--border) 80%, transparent);
}

.cube:nth-child(odd):last-child {
  grid-column: 1 / -1;
}

.cube-text {
  margin: 0.35rem 0 0;
  font-size: 0.82rem;
  line-height: 1.4;
  color: var(--text-muted);
}

@keyframes rise {
  from {
    opacity: 0;
    transform: translateY(12px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@keyframes drift {
  from {
    transform: translate(0, 0) rotate(0deg);
  }
  to {
    transform: translate(-4%, 6%) rotate(8deg);
  }
}

@media (max-width: 900px) {
  .landing-stage {
    height: auto;
    min-height: var(--stage-h);
  }

  .landing-bg {
    position: absolute;
  }

  .stage-pair {
    grid-template-columns: minmax(0, 26rem);
    width: min(100%, 26rem);
    justify-items: stretch;
  }

  .hero {
    min-height: 0;
  }

  .cubes {
    max-height: none;
    overflow: visible;
  }
}

@media (max-width: 520px) {
  .cubes {
    grid-template-columns: 1fr;
  }

  .cube:nth-child(odd):last-child {
    grid-column: auto;
  }
}

@media (prefers-reduced-motion: reduce) {
  .landing-bg,
  .hero,
  .cta {
    animation: none;
  }
}
</style>
