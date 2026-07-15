<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { setLocale } from '@/i18n'
import IconButton from '@/components/IconButton.vue'
import EditorGlyph from '@/components/EditorGlyph.vue'
import LocaleToggleLabel from '@/components/LocaleToggleLabel.vue'
import ThemeToggleGlyph from '@/components/ThemeToggleGlyph.vue'
import { getTheme, toggleTheme, type Theme } from '@/theme'
import { displayLabel, needsDisplayName, useAuth } from '@/auth/session'
import { ApiError } from '@/auth/api'

const { t, locale } = useI18n()
const route = useRoute()
const router = useRouter()
const { user, isAuthenticated, logout, ready, updateDisplayName } = useAuth()
const theme = ref<Theme>('dark')
const isEditorRoute = computed(() => route.name === 'editor')
const isLanding = computed(() => route.name === 'landing')
const brandTo = computed(() => (isAuthenticated.value ? '/projects' : '/'))
const headerName = computed(() => displayLabel(user.value))
const showNameNudge = computed(() => needsDisplayName(user.value))

const settingsOpen = ref(false)
const settingsRoot = ref<HTMLElement | null>(null)
const nameDraft = ref('')
const settingsBusy = ref(false)
const settingsError = ref('')
const settingsSaved = ref(false)

onMounted(() => {
  theme.value = getTheme()
  document.addEventListener('pointerdown', onDocPointer, true)
  document.addEventListener('keydown', onDocKey)
})

onUnmounted(() => {
  document.removeEventListener('pointerdown', onDocPointer, true)
  document.removeEventListener('keydown', onDocKey)
})

watch(
  () => user.value?.display_name,
  (v) => {
    if (!settingsOpen.value) nameDraft.value = v ?? ''
  },
)

function onToggleTheme() {
  theme.value = toggleTheme()
}

function onToggleLocale() {
  setLocale(locale.value === 'ru' ? 'en' : 'ru')
}

function openSettings() {
  nameDraft.value = user.value?.display_name ?? ''
  settingsError.value = ''
  settingsSaved.value = false
  settingsOpen.value = true
}

function closeSettings() {
  settingsOpen.value = false
  settingsError.value = ''
  settingsSaved.value = false
}

function onDocPointer(e: PointerEvent) {
  if (!settingsOpen.value) return
  const el = settingsRoot.value
  if (el && e.target instanceof Node && !el.contains(e.target)) closeSettings()
}

function onDocKey(e: KeyboardEvent) {
  if (e.key === 'Escape' && settingsOpen.value) closeSettings()
}

async function saveDisplayName() {
  settingsBusy.value = true
  settingsError.value = ''
  settingsSaved.value = false
  try {
    await updateDisplayName(nameDraft.value)
    settingsSaved.value = true
    await nextTick()
  } catch (e) {
    settingsError.value =
      e instanceof ApiError ? e.message : e instanceof Error ? e.message : String(e)
  } finally {
    settingsBusy.value = false
  }
}

async function onLogout() {
  closeSettings()
  await logout()
  await router.push({ name: 'landing' })
}
</script>

<template>
  <div class="app-shell" :class="{ 'app-shell--landing': isLanding }">
    <header class="topbar">
      <router-link :to="brandTo" class="brand">{{ t('app.name') }}</router-link>
      <div id="app-header-center" class="header-center" />
      <div class="top-actions">
        <template v-if="ready && isAuthenticated && !isLanding">
          <span class="account" :title="user?.email">{{ headerName }}</span>
          <div ref="settingsRoot" class="settings-wrap">
            <IconButton
              :title="showNameNudge ? t('auth.settingsNudge') : t('auth.settings')"
              ghost
              class="settings-btn"
              :class="{ 'has-nudge': showNameNudge }"
              @click="settingsOpen ? closeSettings() : openSettings()"
            >
              <EditorGlyph name="settings" />
              <span v-if="showNameNudge" class="settings-dot" aria-hidden="true" />
            </IconButton>
            <div v-if="settingsOpen" class="settings-pop" role="dialog" :aria-label="t('auth.settingsTitle')">
              <p class="settings-title">{{ t('auth.settingsTitle') }}</p>
              <label class="settings-field">
                <span>{{ t('auth.displayName') }}</span>
                <input
                  v-model="nameDraft"
                  type="text"
                  maxlength="80"
                  :placeholder="t('auth.displayNamePlaceholder')"
                  @keydown.enter.prevent="saveDisplayName"
                />
                <span v-if="showNameNudge" class="settings-hint settings-hint--nudge">{{
                  t('auth.displayNameNudge')
                }}</span>
                <span v-else class="settings-hint">{{ t('auth.displayNameHint') }}</span>
              </label>
              <p class="settings-email">
                <span>{{ t('auth.email') }}</span>
                {{ user?.email }}
              </p>
              <p v-if="settingsError" class="settings-error">{{ settingsError }}</p>
              <p v-else-if="settingsSaved" class="settings-ok">{{ t('auth.save') }} ✓</p>
              <div class="settings-actions">
                <button type="button" class="primary" :disabled="settingsBusy" @click="saveDisplayName">
                  {{ t('auth.save') }}
                </button>
                <button type="button" class="ghost danger" :disabled="settingsBusy" @click="onLogout">
                  {{ t('auth.logout') }}
                </button>
              </div>
            </div>
          </div>
        </template>
        <IconButton :title="t('app.themeHint')" ghost @click="onToggleTheme">
          <ThemeToggleGlyph :light="theme === 'light'" />
        </IconButton>
        <IconButton :title="t('app.langHint')" ghost wide @click="onToggleLocale">
          <LocaleToggleLabel :locale="locale" />
        </IconButton>
      </div>
    </header>
    <main class="main" :class="{ 'main--wide': isEditorRoute, 'main--landing': isLanding }">
      <router-view />
    </main>
  </div>
</template>

<style scoped lang="scss">
.app-shell {
  min-height: 100%;
  display: flex;
  flex-direction: column;
  background: var(--bg-grad);
  color: var(--text);
}

.topbar {
  position: sticky;
  top: 0;
  z-index: 20;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem 1rem;
  padding: 0.65rem 1.5rem;
  background: var(--topbar);
  backdrop-filter: blur(8px);
}

.brand {
  position: relative;
  z-index: 1;
  flex: 0 0 auto;
  font-weight: 600;
  font-size: 1.05rem;
  letter-spacing: 0.01em;
  color: var(--text);
  text-decoration: none;
}

.header-center {
  position: absolute;
  left: 50%;
  z-index: 0;
  transform: translateX(-50%);
  display: flex;
  align-items: center;
  justify-content: center;
  min-width: 0;
  max-width: calc(100% - 11rem);
  pointer-events: none;
}

.header-center > :deep(*) {
  pointer-events: auto;
}

.top-actions {
  position: relative;
  z-index: 1;
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  gap: 0.2rem;
}

.account {
  max-width: 12rem;
  margin-right: 0.15rem;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 0.85rem;
  color: var(--text-muted);
}

.settings-wrap {
  position: relative;
}

.settings-wrap :deep(.settings-btn) {
  position: relative;
}

.settings-dot {
  position: absolute;
  top: 0.2rem;
  right: 0.2rem;
  width: 0.42rem;
  height: 0.42rem;
  border-radius: 50%;
  background: #e05555;
  box-shadow: 0 0 0 2px var(--topbar);
  pointer-events: none;
}

.settings-hint--nudge {
  color: #d89a5a;
}

.settings-pop {
  position: absolute;
  top: calc(100% + 0.4rem);
  right: 0;
  z-index: 40;
  width: min(20rem, calc(100vw - 2rem));
  padding: 0.9rem 1rem 1rem;
  border-radius: 10px;
  border: 1px solid var(--border-strong);
  background: var(--surface);
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.35);
}

.settings-title {
  margin: 0 0 0.75rem;
  font-size: 0.95rem;
  font-weight: 600;
}

.settings-field {
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
  font-size: 0.82rem;
  color: var(--text-muted);
}

.settings-field input {
  padding: 0.5rem 0.65rem;
  border-radius: 8px;
  border: 1px solid var(--border-strong);
  background: var(--bg);
  color: var(--text);
}

.settings-hint {
  font-size: 0.75rem;
  color: var(--text-faint);
}

.settings-email {
  margin: 0.75rem 0 0;
  font-size: 0.78rem;
  color: var(--text-faint);
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
  word-break: break-all;
}

.settings-email span {
  color: var(--text-muted);
}

.settings-error {
  margin: 0.55rem 0 0;
  font-size: 0.82rem;
  color: var(--danger);
}

.settings-ok {
  margin: 0.55rem 0 0;
  font-size: 0.82rem;
  color: var(--ok);
}

.settings-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  margin-top: 0.85rem;
}

.settings-actions .primary,
.settings-actions .ghost {
  border-radius: 8px;
  padding: 0.45rem 0.85rem;
  cursor: pointer;
  border: 1px solid transparent;
  font-size: 0.88rem;
}

.settings-actions .primary {
  background: var(--accent);
  color: var(--accent-text);
  border-color: var(--accent-strong);
}

.settings-actions .ghost {
  background: transparent;
  color: var(--text);
  border-color: var(--border-strong);
}

.settings-actions .ghost.danger {
  color: var(--danger);
  border-color: color-mix(in srgb, var(--danger) 40%, var(--border-strong));
}

.settings-actions .primary:disabled,
.settings-actions .ghost:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.main {
  flex: 1;
  padding: 0 1.5rem 2rem;
  max-width: 1200px;
  width: 100%;
  margin: 0 auto;
}

.main--wide {
  --page-pad-x: clamp(1rem, 2.5vw, 2rem);
  max-width: none;
  padding-inline: var(--page-pad-x);
}

.main--landing {
  max-width: 1180px;
  padding-bottom: 0;
  width: 100%;
}

.app-shell--landing {
  min-height: 100%;
}

@media (max-width: 900px) {
  .topbar {
    flex-wrap: wrap;
  }

  .header-center {
    position: static;
    order: 3;
    flex: 1 1 100%;
    transform: none;
    max-width: 100%;
    padding-top: 0.15rem;
  }
}
</style>
