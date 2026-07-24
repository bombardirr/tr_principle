<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'

defineProps<{
  open: boolean
}>()

const emit = defineEmits<{
  close: []
}>()

const { t } = useI18n()
const copiedId = ref<string | null>(null)
let copyTimer: ReturnType<typeof setTimeout> | null = null

const methods = [
  {
    id: 'transfer',
    titleKey: 'donate.transferTitle',
    hintKey: 'donate.transferHint',
    valueKey: 'donate.transferValue',
    copyable: true,
  },
  {
    id: 'sbp',
    titleKey: 'donate.sbpTitle',
    hintKey: 'donate.sbpHint',
    valueKey: 'donate.sbpValue',
    copyable: true,
  },
  {
    id: 'yoomoney',
    titleKey: 'donate.yoomoneyTitle',
    hintKey: 'donate.yoomoneyHint',
    valueKey: 'donate.yoomoneyValue',
    hrefKey: 'donate.yoomoneyHref',
    copyable: false,
  },
  {
    id: 'boosty',
    titleKey: 'donate.boostyTitle',
    hintKey: 'donate.boostyHint',
    valueKey: 'donate.boostyValue',
    hrefKey: 'donate.boostyHref',
    copyable: false,
  },
] as const

function onKey(e: KeyboardEvent) {
  if (e.key === 'Escape') emit('close')
}

onMounted(() => document.addEventListener('keydown', onKey, true))
onUnmounted(() => {
  document.removeEventListener('keydown', onKey, true)
  if (copyTimer) clearTimeout(copyTimer)
})

async function copyValue(id: string, value: string) {
  try {
    await navigator.clipboard.writeText(value)
    copiedId.value = id
    if (copyTimer) clearTimeout(copyTimer)
    copyTimer = setTimeout(() => {
      copiedId.value = null
    }, 1600)
  } catch {
    /* ignore */
  }
}
</script>

<template>
  <div v-if="open" class="backdrop" role="presentation" @click.self="emit('close')">
    <div
      class="dialog"
      role="dialog"
      aria-modal="true"
      :aria-label="t('donate.title')"
    >
      <h2 class="title">{{ t('donate.title') }}</h2>
      <p class="hint">{{ t('donate.intro') }}</p>

      <ul class="methods">
        <li v-for="m in methods" :key="m.id" class="method">
          <div class="method-head">
            <span class="method-title">{{ t(m.titleKey) }}</span>
            <span class="method-hint">{{ t(m.hintKey) }}</span>
          </div>
          <div class="method-body">
            <code class="method-value">{{ t(m.valueKey) }}</code>
            <div class="method-actions">
              <button
                v-if="m.copyable"
                type="button"
                class="ghost"
                @click="copyValue(m.id, t(m.valueKey))"
              >
                {{ copiedId === m.id ? t('donate.copied') : t('donate.copy') }}
              </button>
              <a
                v-if="'hrefKey' in m && m.hrefKey"
                class="primary link"
                :href="t(m.hrefKey)"
                target="_blank"
                rel="noopener noreferrer"
              >
                {{ t('donate.open') }}
              </a>
            </div>
          </div>
        </li>
      </ul>

      <div class="actions">
        <button type="button" class="ghost" @click="emit('close')">
          {{ t('donate.close') }}
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
.backdrop {
  position: fixed;
  inset: 0;
  z-index: 90;
  display: grid;
  place-items: center;
  padding: 1rem;
  background: color-mix(in srgb, #000 45%, transparent);
}

.dialog {
  width: min(28rem, 100%);
  max-height: min(90vh, 40rem);
  overflow: auto;
  padding: 1.25rem 1.35rem 1.1rem;
  border-radius: 12px;
  background: var(--surface);
  color: var(--text);
  box-shadow: 0 16px 48px rgba(0, 0, 0, 0.28);
}

.title {
  margin: 0 0 0.35rem;
  font-size: 1.15rem;
  font-weight: 700;
}

.hint {
  margin: 0 0 1rem;
  font-size: 0.85rem;
  line-height: 1.45;
  color: var(--text-muted);
}

.methods {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.method {
  padding: 0.7rem 0.75rem;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: color-mix(in srgb, var(--surface) 88%, var(--bg));
}

.method-head {
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
  margin-bottom: 0.45rem;
}

.method-title {
  font-size: 0.88rem;
  font-weight: 650;
}

.method-hint {
  font-size: 0.75rem;
  color: var(--text-muted);
  line-height: 1.35;
}

.method-body {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.45rem 0.6rem;
}

.method-value {
  flex: 1 1 10rem;
  min-width: 0;
  padding: 0.3rem 0.45rem;
  border-radius: 5px;
  background: color-mix(in srgb, var(--bg) 70%, transparent);
  border: 1px solid var(--border);
  font-size: 0.78rem;
  word-break: break-all;
}

.method-actions {
  display: flex;
  gap: 0.35rem;
  flex: 0 0 auto;
}

.actions {
  display: flex;
  justify-content: flex-end;
  margin-top: 1rem;
}

.ghost,
.primary {
  border-radius: 6px;
  padding: 0.35rem 0.7rem;
  cursor: pointer;
  border: 1px solid transparent;
  font-size: 0.8rem;
  font-weight: 600;
  text-decoration: none;
}

.ghost {
  background: transparent;
  color: var(--text);
  border-color: var(--border-strong);
}

.primary,
.link {
  background: var(--accent);
  color: var(--accent-text);
  border-color: var(--accent-strong);
}

.link {
  display: inline-flex;
  align-items: center;
}
</style>
