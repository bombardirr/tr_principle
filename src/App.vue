<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { useI18n } from 'vue-i18n'
import { setLocale } from '@/i18n'
import IconButton from '@/components/IconButton.vue'
import LocaleToggleLabel from '@/components/LocaleToggleLabel.vue'
import ThemeToggleGlyph from '@/components/ThemeToggleGlyph.vue'
import { getTheme, toggleTheme, type Theme } from '@/theme'

const { t, locale } = useI18n()
const route = useRoute()
const theme = ref<Theme>('dark')
const isEditorRoute = computed(() => route.name === 'editor')

onMounted(() => {
  theme.value = getTheme()
})

function onToggleTheme() {
  theme.value = toggleTheme()
}

function onToggleLocale() {
  setLocale(locale.value === 'ru' ? 'en' : 'ru')
}
</script>

<template>
  <div class="app-shell">
    <header class="topbar">
      <router-link to="/" class="brand">{{ t('app.name') }}</router-link>
      <div id="app-header-center" class="header-center" />
      <div class="top-actions">
        <IconButton :title="t('app.themeHint')" ghost @click="onToggleTheme">
          <ThemeToggleGlyph :light="theme === 'light'" />
        </IconButton>
        <IconButton :title="t('app.langHint')" ghost wide @click="onToggleLocale">
          <LocaleToggleLabel :locale="locale" />
        </IconButton>
      </div>
    </header>
    <main class="main" :class="{ 'main--wide': isEditorRoute }">
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
