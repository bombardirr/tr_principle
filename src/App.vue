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
import { useShortcutBindings } from '@/composables/useShortcutBindings'
import { useOnlineStatus } from '@/composables/useOnlineStatus'
import {
  bindingFromEvent,
  formatBinding,
  isModifierOnly,
  SHORTCUT_DEFAULTS,
} from '@/shortcuts/bindings'
import JoinToast from '@/components/JoinToast.vue'

const { t, locale } = useI18n()
const route = useRoute()
const router = useRouter()
const { user, isAuthenticated, isPro, logout, ready, updateDisplayName } = useAuth()
const theme = ref<Theme>('dark')
const isEditorRoute = computed(() => route.name === 'editor')
const isLanding = computed(() => route.name === 'landing')
const brandTo = computed(() => (isAuthenticated.value ? '/projects' : '/'))
const headerName = computed(() => displayLabel(user.value))
const showNameNudge = computed(() => needsDisplayName(user.value))
const { online } = useOnlineStatus()
const showOfflineBanner = computed(
  () => ready.value && isAuthenticated.value && !isLanding.value && !online.value,
)

const settingsOpen = ref(false)
const settingsRoot = ref<HTMLElement | null>(null)
const settingsTab = ref<'account' | 'keys'>('account')
const nameDraft = ref('')
const settingsBusy = ref(false)
const settingsError = ref('')
const settingsSaved = ref(false)

const { bindings, setBinding, resetBinding, reload: reloadShortcuts } = useShortcutBindings()
const capturingShortcut = ref<'clearFocus' | null>(null)

onMounted(() => {
  theme.value = getTheme()
  document.addEventListener('pointerdown', onDocPointer, true)
  document.addEventListener('keydown', onDocKey, true)
})

onUnmounted(() => {
  document.removeEventListener('pointerdown', onDocPointer, true)
  document.removeEventListener('keydown', onDocKey, true)
})

watch(
  () => user.value?.display_name,
  (v) => {
    if (!settingsOpen.value) nameDraft.value = v ?? ''
  },
)

watch(settingsTab, (tab) => {
  if (tab !== 'keys') capturingShortcut.value = null
})

function onToggleTheme() {
  theme.value = toggleTheme()
}

function onToggleLocale() {
  setLocale(locale.value === 'ru' ? 'en' : 'ru')
}

function openSettings() {
  nameDraft.value = user.value?.display_name ?? ''
  settingsTab.value = 'account'
  settingsError.value = ''
  settingsSaved.value = false
  capturingShortcut.value = null
  reloadShortcuts()
  settingsOpen.value = true
}

function closeSettings() {
  settingsOpen.value = false
  settingsError.value = ''
  settingsSaved.value = false
  capturingShortcut.value = null
}

function onDocPointer(e: PointerEvent) {
  if (!settingsOpen.value) return
  const el = settingsRoot.value
  if (el && e.target instanceof Node && !el.contains(e.target)) closeSettings()
}

function onDocKey(e: KeyboardEvent) {
  if (capturingShortcut.value) {
    if (isModifierOnly(e)) return
    e.preventDefault()
    e.stopPropagation()
    const id = capturingShortcut.value
    setBinding(id, bindingFromEvent(e))
    capturingShortcut.value = null
    return
  }
  if (e.key === 'Escape' && settingsOpen.value) closeSettings()
}

function startCapture(id: 'clearFocus') {
  capturingShortcut.value = capturingShortcut.value === id ? null : id
}

function resetClearFocus() {
  capturingShortcut.value = null
  resetBinding('clearFocus')
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
          <span class="account" :title="user?.email">
            {{ headerName }}
            <span v-if="isPro" class="plan-badge" :title="t('auth.planPro')">{{ t('auth.planPro') }}</span>
          </span>
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
            <div v-if="settingsOpen" class="settings-pop" role="dialog" :aria-label="t('auth.settings')">
              <p class="settings-title">{{ t('auth.settings') }}</p>
              <div class="settings-tabs" role="tablist">
                <button
                  type="button"
                  role="tab"
                  class="settings-tab"
                  :class="{ active: settingsTab === 'account' }"
                  :aria-selected="settingsTab === 'account'"
                  @click="settingsTab = 'account'"
                >
                  {{ t('auth.settingsTabAccount') }}
                </button>
                <button
                  type="button"
                  role="tab"
                  class="settings-tab"
                  :class="{ active: settingsTab === 'keys' }"
                  :aria-selected="settingsTab === 'keys'"
                  @click="settingsTab = 'keys'"
                >
                  {{ t('auth.settingsTabKeys') }}
                </button>
              </div>

              <div v-if="settingsTab === 'account'" role="tabpanel" class="settings-panel">
                <label class="settings-field">
                  <span class="settings-label">{{ t('auth.displayName') }}</span>
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
                <div class="settings-block">
                  <span class="settings-label">{{ t('auth.email') }}</span>
                  <span class="settings-block-value">{{ user?.email }}</span>
                </div>
                <div v-if="isPro" class="settings-block">
                  <span class="settings-label">{{ t('auth.planLabel') }}</span>
                  <span class="settings-block-value">
                    <span class="plan-badge plan-badge--block">{{ t('auth.planPro') }}</span>
                  </span>
                </div>
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

              <div v-else role="tabpanel" class="settings-panel">
                <p class="settings-hint settings-keys-intro">{{ t('auth.settingsKeysHint') }}</p>
                <div class="shortcut-row">
                  <div class="shortcut-meta">
                    <span class="shortcut-label">{{ t('auth.shortcutClearFocus') }}</span>
                    <span class="settings-hint">{{ t('auth.shortcutClearFocusHint') }}</span>
                  </div>
                  <div class="shortcut-controls">
                    <button
                      type="button"
                      class="shortcut-bind"
                      :class="{ capturing: capturingShortcut === 'clearFocus' }"
                      :aria-label="t('auth.shortcutClearFocus')"
                      @click="startCapture('clearFocus')"
                    >
                      {{
                        capturingShortcut === 'clearFocus'
                          ? t('auth.shortcutPressKey')
                          : formatBinding(bindings.clearFocus)
                      }}
                    </button>
                    <button
                      type="button"
                      class="ghost shortcut-reset"
                      :title="t('auth.shortcutReset')"
                      :disabled="
                        formatBinding(bindings.clearFocus) ===
                        formatBinding(SHORTCUT_DEFAULTS.clearFocus)
                      "
                      @click="resetClearFocus"
                    >
                      {{ t('auth.shortcutReset') }}
                    </button>
                  </div>
                </div>
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
    <p v-if="showOfflineBanner" class="offline-banner" role="status">
      {{ t('app.offlineBanner') }}
    </p>
    <main class="main" :class="{ 'main--wide': isEditorRoute, 'main--landing': isLanding }">
      <router-view />
    </main>
    <JoinToast />
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

.offline-banner {
  position: sticky;
  top: 0;
  z-index: 19;
  margin: 0;
  padding: 0.35rem 1.5rem;
  border-bottom: 1px solid color-mix(in srgb, var(--warn) 45%, var(--border));
  background: color-mix(in srgb, var(--warn) 16%, var(--surface));
  color: var(--text);
  font-size: 0.78rem;
  line-height: 1.35;
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
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  max-width: 14rem;
  margin-right: 0.15rem;
  min-width: 0;
  font-size: 0.85rem;
  color: var(--text-muted);
}

.plan-badge {
  flex: 0 0 auto;
  padding: 0.05rem 0.35rem;
  border-radius: 4px;
  border: 1px solid color-mix(in srgb, var(--accent) 45%, var(--border));
  background: color-mix(in srgb, var(--accent) 16%, var(--surface));
  color: var(--accent);
  font-size: 0.65rem;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  line-height: 1.2;
}

.plan-badge--block {
  font-size: 0.72rem;
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
  top: calc(100% + 0.35rem);
  right: 0;
  z-index: 40;
  width: min(18.5rem, calc(100vw - 1.5rem));
  padding: 0.55rem 0.65rem 0.65rem;
  border-radius: 8px;
  border: 1px solid var(--border-strong);
  background: var(--surface);
  box-shadow: 0 10px 28px rgba(0, 0, 0, 0.32);
}

.settings-title {
  margin: 0 0 0.35rem;
  font-size: 0.82rem;
  font-weight: 650;
  letter-spacing: 0.01em;
}

.settings-tabs {
  display: flex;
  gap: 0.1rem;
  margin-bottom: 0.45rem;
  padding: 0.1rem;
  border-radius: 6px;
  background: var(--bg);
  border: 1px solid var(--border);
}

.settings-tab {
  flex: 1;
  border: 0;
  border-radius: 4px;
  padding: 0.22rem 0.35rem;
  font-size: 0.72rem;
  font-weight: 600;
  color: var(--text-muted);
  background: transparent;
  cursor: pointer;
}

.settings-tab.active {
  color: var(--text);
  background: var(--surface);
  box-shadow: 0 0 0 1px var(--border-strong);
}

.settings-panel {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
}

.settings-label {
  font-size: 0.7rem;
  font-weight: 650;
  color: var(--text-muted);
  letter-spacing: 0.01em;
}

.settings-block {
  display: flex;
  flex-direction: column;
  gap: 0.12rem;
  padding: 0.35rem 0.45rem;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--surface-2);
}

.settings-block-value {
  font-size: 0.78rem;
  color: var(--text);
  word-break: break-all;
  line-height: 1.3;
}

.shortcut-row {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  padding: 0.4rem 0.45rem;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--surface-2);
}

.shortcut-meta {
  display: flex;
  flex-direction: column;
  gap: 0.08rem;
}

.shortcut-label {
  font-size: 0.78rem;
  font-weight: 650;
  color: var(--text);
}

.shortcut-controls {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.3rem;
}

.shortcut-bind {
  min-width: 4.75rem;
  padding: 0.22rem 0.45rem;
  border: 1px solid var(--border-strong);
  border-radius: 4px;
  background: var(--surface);
  color: var(--text);
  font: inherit;
  font-size: 0.72rem;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
  cursor: pointer;
}

.shortcut-bind.capturing {
  border-color: var(--accent);
  color: var(--accent);
  outline: 1px solid color-mix(in srgb, var(--accent) 45%, transparent);
}

.shortcut-reset {
  padding: 0.22rem 0.4rem;
  font-size: 0.68rem;
  border-radius: 4px;
  border: 1px solid var(--border);
  background: transparent;
  color: var(--text-muted);
  cursor: pointer;
}

.shortcut-reset:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}

.settings-field {
  display: flex;
  flex-direction: column;
  gap: 0.18rem;
}

.settings-field input {
  padding: 0.35rem 0.45rem;
  border-radius: 6px;
  border: 1px solid var(--border-strong);
  background: var(--bg);
  color: var(--text);
  font-size: 0.82rem;
}

.settings-hint {
  margin: 0;
  font-size: 0.68rem;
  line-height: 1.35;
  color: var(--text-faint);
}

.settings-keys-intro {
  margin: 0;
}

.settings-error,
.settings-ok {
  margin: 0;
  font-size: 0.72rem;
}

.settings-error {
  color: var(--danger);
}

.settings-ok {
  color: var(--ok);
}

.settings-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem;
  margin-top: 0.1rem;
}

.settings-actions .primary,
.settings-actions .ghost {
  border-radius: 6px;
  padding: 0.3rem 0.55rem;
  cursor: pointer;
  border: 1px solid transparent;
  font-size: 0.75rem;
  font-weight: 600;
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
  min-width: 0;
  padding: 0 1.5rem 2rem;
  max-width: 1280px;
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
