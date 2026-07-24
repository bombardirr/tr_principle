<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'
import { ApiError } from '@/auth/api'
import { useAuth } from '@/auth/session'
import { metrikaGoal } from '@/analytics/metrika'

const { t } = useI18n()
const router = useRouter()
const { register, login, isAuthenticated } = useAuth()

const mode = ref<'home' | 'login' | 'register'>('home')
const email = ref('')
const password = ref('')
const busy = ref(false)
const error = ref('')
const showPassword = ref(false)

const landingRoot = ref<HTMLElement | null>(null)
/** Continuous panel progress 0 … panels-1 */
const panelProgress = ref(0)
const reduceMotion = ref(false)

const featureKeys = ['docx', 'tm', 'local', 'preview'] as const
const flowKeys = ['open', 'translate', 'export'] as const
const privacyKeys = ['browser', 'account', 'sync'] as const

const panels = [
  { id: 'features', kind: 'features' as const },
  { id: 'flow', kind: 'flow' as const },
  { id: 'privacy', kind: 'privacy' as const },
]

const title = computed(() =>
  mode.value === 'login'
    ? t('landing.loginTitle')
    : mode.value === 'register'
      ? t('landing.registerTitle')
      : t('landing.headline'),
)

const activePanel = computed(() => Math.round(panelProgress.value))

function panelStyle(index: number): Record<string, string> {
  const d = panelProgress.value - index
  const abs = Math.abs(d)
  const opacity = Math.max(0, 1 - abs * 1.15)
  const y = reduceMotion.value ? 0 : d * 18
  const visible = abs < 1.05
  return {
    opacity: String(opacity),
    transform: `translateY(${y}px)`,
    visibility: visible ? 'visible' : 'hidden',
    // kebab-case avoids CSSProperties PointerEvents union vs plain string
    'pointer-events': abs < 0.45 ? 'auto' : 'none',
  }
}

function onScroll() {
  const root = landingRoot.value
  if (!root) return
  const rail = root.querySelector('.landing-rail') as HTMLElement | null
  const stage = root.querySelector('.landing-stage') as HTMLElement | null
  if (!rail || !stage) return

  const start = root.offsetTop
  const scrollRange = Math.max(1, rail.offsetHeight - stage.offsetHeight)
  const y = window.scrollY - start
  const t = Math.min(1, Math.max(0, y / scrollRange))
  panelProgress.value = t * (panels.length - 1)
}

let raf = 0
function onScrollRaf() {
  if (raf) return
  raf = requestAnimationFrame(() => {
    raf = 0
    onScroll()
  })
}

onMounted(() => {
  if (isAuthenticated.value) {
    void router.replace({ name: 'projects' })
    return
  }
  reduceMotion.value = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  onScroll()
  window.addEventListener('scroll', onScrollRaf, { passive: true })
  window.addEventListener('resize', onScrollRaf)
})

onUnmounted(() => {
  window.removeEventListener('scroll', onScrollRaf)
  window.removeEventListener('resize', onScrollRaf)
  if (raf) cancelAnimationFrame(raf)
})

function openLogin() {
  mode.value = 'login'
  error.value = ''
  showPassword.value = false
}

function openRegister() {
  mode.value = 'register'
  error.value = ''
  showPassword.value = false
}

function backHome() {
  mode.value = 'home'
  error.value = ''
  showPassword.value = false
}

function goPanel(i: number) {
  const root = landingRoot.value
  if (!root) return
  const rail = root.querySelector('.landing-rail') as HTMLElement | null
  const stage = root.querySelector('.landing-stage') as HTMLElement | null
  if (!rail || !stage) return
  const scrollRange = Math.max(1, rail.offsetHeight - stage.offsetHeight)
  const target = root.offsetTop + (i / (panels.length - 1)) * scrollRange
  window.scrollTo({ top: target, behavior: reduceMotion.value ? 'auto' : 'smooth' })
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
  if (!validateCreds()) return
  busy.value = true
  try {
    if (mode.value === 'register') {
      await register(email.value.trim(), password.value)
      metrikaGoal('register')
    } else {
      await login(email.value.trim(), password.value)
      metrikaGoal('login')
    }
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
</script>

<template>
  <div ref="landingRoot" class="landing">
    <div class="landing-bg" aria-hidden="true" />

    <div class="landing-stage">
      <section class="hero">
        <p class="brand-mark">{{ t('app.name') }}</p>
        <h1 class="headline">{{ title }}</h1>
        <p v-if="mode === 'home'" class="support">{{ t('landing.support') }}</p>

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
          </div>
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
          <label>
            <span>{{ t('landing.passwordField') }}</span>
            <div class="password-row">
              <input
                v-model="password"
                :type="showPassword ? 'text' : 'password'"
                name="appzac-password"
                :autocomplete="mode === 'register' ? 'new-password' : 'current-password'"
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
          <div class="cta">
            <button type="submit" class="primary" :disabled="busy">
              {{ mode === 'register' ? t('landing.register') : t('landing.login') }}
            </button>
            <button type="button" class="ghost" :disabled="busy" @click="backHome">
              {{ t('landing.back') }}
            </button>
          </div>
        </form>

        <p v-if="mode === 'home'" class="scroll-hint">{{ t('landing.scrollHint') }}</p>
      </section>

      <aside class="panels" aria-live="polite">
        <div
          v-for="(panel, i) in panels"
          :key="panel.id"
          class="panel"
          :class="{ 'panel--active': activePanel === i }"
          :style="panelStyle(i)"
        >
          <template v-if="panel.kind === 'features'">
            <ul class="item-list">
              <li v-for="(key, fi) in featureKeys" :key="key" class="item">
                <span class="item-index" aria-hidden="true">{{ String(fi + 1).padStart(2, '0') }}</span>
                <div>
                  <p class="item-title">{{ t(`landing.features.${key}.title`) }}</p>
                  <p class="item-text">{{ t(`landing.features.${key}.text`) }}</p>
                </div>
              </li>
            </ul>
          </template>

          <template v-else-if="panel.kind === 'flow'">
            <p class="panel-kicker">{{ t('landing.flow.title') }}</p>
            <ul class="item-list">
              <li v-for="(key, fi) in flowKeys" :key="key" class="item">
                <span class="item-index" aria-hidden="true">{{ String(fi + 1).padStart(2, '0') }}</span>
                <div>
                  <p class="item-title">{{ t(`landing.flow.${key}.title`) }}</p>
                  <p class="item-text">{{ t(`landing.flow.${key}.text`) }}</p>
                </div>
              </li>
            </ul>
          </template>

          <template v-else>
            <p class="panel-kicker">{{ t('landing.privacy.title') }}</p>
            <ul class="item-list">
              <li v-for="(key, fi) in privacyKeys" :key="key" class="item">
                <span class="item-index" aria-hidden="true">{{ String(fi + 1).padStart(2, '0') }}</span>
                <div>
                  <p class="item-title">{{ t(`landing.privacy.${key}.title`) }}</p>
                  <p class="item-text">{{ t(`landing.privacy.${key}.text`) }}</p>
                </div>
              </li>
            </ul>
          </template>
        </div>

        <div class="panel-dots" role="tablist" :aria-label="t('landing.scrollHint')">
          <button
            v-for="(panel, i) in panels"
            :key="panel.id"
            type="button"
            class="dot"
            :class="{ 'dot--on': activePanel === i }"
            :aria-label="panel.id"
            :aria-current="activePanel === i ? 'true' : undefined"
            @click="goPanel(i)"
          />
        </div>
      </aside>
    </div>

    <!-- Intentional scroll distance — only this creates page scroll beyond the stage. -->
    <div
      class="landing-rail"
      aria-hidden="true"
      :style="{ height: `calc(${panels.length - 1} * 85vh)` }"
    />
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
  position: sticky;
  top: 3.25rem;
  z-index: 1;
  height: var(--stage-h);
  display: grid;
  grid-template-columns: minmax(0, 1.05fr) minmax(0, 0.95fr);
  gap: clamp(1.5rem, 4vw, 4rem);
  align-items: center;
  box-sizing: border-box;
  padding: 0.5rem 0 1rem;
}

.landing-rail {
  pointer-events: none;
}

.hero {
  max-width: 34rem;
  animation: rise 0.7s ease-out both;
}

.brand-mark {
  margin: 0 0 0.75rem;
  font-size: clamp(2.4rem, 6vw, 3.6rem);
  font-weight: 600;
  letter-spacing: -0.03em;
  line-height: 1.05;
  color: var(--text);
  animation: rise 0.85s ease-out 0.05s both;
}

.headline {
  margin: 0;
  font-size: clamp(1.25rem, 2.4vw, 1.65rem);
  font-weight: 500;
  line-height: 1.35;
  color: var(--text);
}

.support {
  margin: 0.85rem 0 0;
  max-width: 28rem;
  color: var(--text-muted);
  font-size: 1.02rem;
}

.cta {
  display: flex;
  flex-wrap: wrap;
  gap: 0.65rem;
  margin-top: 1.6rem;
  animation: rise 0.9s ease-out 0.12s both;
}

.scroll-hint {
  margin: 1.75rem 0 0;
  font-size: 0.78rem;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--text-faint);
  animation: pulse-hint 2.8s ease-in-out infinite;
}

.auth-form {
  display: flex;
  flex-direction: column;
  gap: 0.85rem;
  margin-top: 1.25rem;
  max-width: 22rem;
}

.auth-form label {
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
  font-size: 0.85rem;
  color: var(--text-muted);
}

.auth-form input {
  width: 100%;
  box-sizing: border-box;
  padding: 0.55rem 0.7rem;
  border-radius: 8px;
  border: 1px solid var(--border-strong);
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
  border-radius: 6px;
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
  border-radius: 8px;
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

.field-hint {
  font-size: 0.78rem;
  line-height: 1.35;
  color: var(--text-faint);
}

.primary,
.ghost {
  border-radius: 8px;
  padding: 0.55rem 1rem;
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

.panels {
  position: relative;
  justify-self: end;
  width: min(100%, 22rem);
  height: min(28rem, calc(var(--stage-h) - 3rem));
}

.panel {
  position: absolute;
  inset: 0 0 2rem;
  display: flex;
  flex-direction: column;
  justify-content: center;
  transition:
    opacity 0.05s linear,
    transform 0.05s linear;
  will-change: opacity, transform;
}

.panel-kicker {
  margin: 0 0 0.35rem;
  font-size: 0.72rem;
  font-weight: 500;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--text-faint);
}

.item-list {
  list-style: none;
  margin: 0;
  padding: 0;
}

.item {
  display: grid;
  grid-template-columns: 2.25rem minmax(0, 1fr);
  gap: 0.85rem;
  padding: 0.95rem 0;
  border-top: 1px solid var(--border);
}

.item:last-child {
  border-bottom: 1px solid var(--border);
}

.item-index {
  font-size: 0.72rem;
  font-weight: 500;
  letter-spacing: 0.06em;
  color: var(--text-faint);
  padding-top: 0.2rem;
}

.item-title {
  margin: 0;
  font-size: 0.98rem;
  font-weight: 500;
  color: var(--text);
}

.item-text {
  margin: 0.28rem 0 0;
  font-size: 0.88rem;
  line-height: 1.45;
  color: var(--text-muted);
}

.panel-dots {
  position: absolute;
  right: 0;
  bottom: 0;
  display: flex;
  gap: 0.45rem;
}

.dot {
  width: 0.4rem;
  height: 0.4rem;
  padding: 0;
  border: none;
  border-radius: 999px;
  background: var(--border-strong);
  cursor: pointer;
  transition:
    background 0.35s ease,
    transform 0.35s ease,
    width 0.35s ease;
}

.dot--on {
  width: 1.1rem;
  background: var(--accent);
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

@keyframes pulse-hint {
  0%,
  100% {
    opacity: 0.45;
  }
  50% {
    opacity: 0.9;
  }
}

@media (max-width: 900px) {
  .landing-stage {
    grid-template-columns: 1fr;
    align-content: start;
    gap: 1.25rem;
    height: auto;
    min-height: var(--stage-h);
    position: relative;
    top: auto;
  }

  .landing-rail {
    display: none;
  }

  .landing-bg {
    position: absolute;
  }

  .panels {
    justify-self: stretch;
    width: min(100%, 28rem);
    height: auto;
  }

  .panel {
    position: relative;
    inset: auto;
    opacity: 1 !important;
    transform: none !important;
    visibility: visible !important;
    pointer-events: auto !important;
    margin-bottom: 1.75rem;
  }

  .panel-dots,
  .scroll-hint {
    display: none;
  }
}

@media (prefers-reduced-motion: reduce) {
  .landing-bg,
  .hero,
  .brand-mark,
  .cta,
  .scroll-hint {
    animation: none;
  }

  .panel {
    transition: none;
  }
}
</style>
