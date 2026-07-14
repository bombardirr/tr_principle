<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { setLocale } from '@/i18n'
import IconButton from '@/components/IconButton.vue'
import LocaleToggleLabel from '@/components/LocaleToggleLabel.vue'
import ThemeToggleGlyph from '@/components/ThemeToggleGlyph.vue'
import { getTheme, toggleTheme, type Theme } from '@/theme'
import { useAuth } from '@/auth/session'

const { t, locale } = useI18n()
const route = useRoute()
const router = useRouter()
const { user, isAuthenticated, logout, ready } = useAuth()
const theme = ref<Theme>('dark')
const isEditorRoute = computed(() => route.name === 'editor')
const isLanding = computed(() => route.name === 'landing')
const brandTo = computed(() => (isAuthenticated.value ? '/projects' : '/'))

onMounted(() => {
  theme.value = getTheme()
})

function onToggleTheme() {
  theme.value = toggleTheme()
}

function onToggleLocale() {
  setLocale(locale.value === 'ru' ? 'en' : 'ru')
}

async function onLogout() {
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
          <span class="account" :title="user?.login">{{ user?.login }}</span>
          <button type="button" class="text-btn" @click="onLogout">{{ t('auth.logout') }}</button>
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
  max-width: 8rem;
  margin-right: 0.35rem;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 0.85rem;
  color: var(--text-muted);
}

.text-btn {
  margin-right: 0.25rem;
  padding: 0.25rem 0.45rem;
  border: none;
  background: transparent;
  color: var(--text-muted);
  cursor: pointer;
  font-size: 0.85rem;
}

.text-btn:hover {
  color: var(--text);
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
