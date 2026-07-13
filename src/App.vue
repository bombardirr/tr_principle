<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { setLocale } from '@/i18n'
import { getTheme, toggleTheme, type Theme } from '@/theme'

const { t, locale } = useI18n()
const theme = ref<Theme>('dark')

onMounted(() => {
  theme.value = getTheme()
})

function onToggleLocale() {
  setLocale(locale.value === 'ru' ? 'en' : 'ru')
}

function onToggleTheme() {
  theme.value = toggleTheme()
}
</script>

<template>
  <div class="app-shell">
    <header class="topbar">
      <router-link to="/" class="brand">{{ t('app.name') }}</router-link>
      <div class="top-actions">
        <button type="button" class="chip" @click="onToggleTheme">
          {{ t('app.theme') }}:
          {{ theme === 'dark' ? t('app.themeDark') : t('app.themeLight') }}
        </button>
        <button type="button" class="chip" @click="onToggleLocale">
          {{ t('app.lang') }}: {{ locale.toUpperCase() }}
        </button>
      </div>
    </header>
    <main class="main">
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
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  padding: 0.85rem 1.5rem;
  border-bottom: 1px solid var(--border);
  background: var(--topbar);
  backdrop-filter: blur(8px);
}

.brand {
  font-family: 'Segoe UI', 'PT Sans', sans-serif;
  font-weight: 700;
  font-size: 1.05rem;
  letter-spacing: 0.02em;
  color: var(--text);
  text-decoration: none;
}

.top-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.45rem;
}

.chip {
  border: 1px solid var(--border-strong);
  background: var(--surface);
  color: var(--text);
  border-radius: 8px;
  padding: 0.35rem 0.7rem;
  font-size: 0.85rem;
  cursor: pointer;
}

.main {
  flex: 1;
  padding: 1.25rem 1.5rem 2rem;
  max-width: 1200px;
  width: 100%;
  margin: 0 auto;
}
</style>
