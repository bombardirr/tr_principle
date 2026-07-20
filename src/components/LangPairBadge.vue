<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import {
  LANG_PAIR_PRESETS,
  findLangPairPreset,
  langPairLabel,
  type LangPairPreset,
} from '@/tm/langPairs'
import { loadJobLangPairPresetId, saveJobLangPairPresetId } from '@/jobs/langPairPreference'

const props = withDefaults(
  defineProps<{
    sourceLang?: string
    targetLang?: string
    editable?: boolean
    disabled?: boolean
  }>(),
  {
    sourceLang: '',
    targetLang: '',
    editable: false,
    disabled: false,
  },
)

const emit = defineEmits<{
  change: [payload: { sourceLang: string; targetLang: string }]
}>()

const { t } = useI18n()
const pairId = ref(loadJobLangPairPresetId())
const open = ref(false)
const root = ref<HTMLElement | null>(null)

const label = computed(() => {
  if (props.sourceLang || props.targetLang) {
    return langPairLabel(props.sourceLang, props.targetLang)
  }
  const preset = LANG_PAIR_PRESETS.find(item => item.id === pairId.value)
  return preset?.label ?? langPairLabel()
})

watch(
  () => [props.sourceLang, props.targetLang] as const,
  ([sourceLang, targetLang]) => {
    const found = findLangPairPreset(sourceLang, targetLang)
    pairId.value = found?.id ?? loadJobLangPairPresetId()
  },
  { immediate: true },
)

watch(
  () => props.disabled,
  disabled => {
    if (disabled) open.value = false
  },
)

function toggle() {
  if (!props.editable || props.disabled) return
  open.value = !open.value
}

function pick(preset: LangPairPreset) {
  pairId.value = preset.id
  saveJobLangPairPresetId(preset.id)
  open.value = false
  emit('change', { sourceLang: preset.sourceLang, targetLang: preset.targetLang })
}

function onDocPointerDown(event: PointerEvent) {
  if (!open.value || !root.value) return
  if (root.value.contains(event.target as Node)) return
  open.value = false
}

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape' && open.value) {
    open.value = false
  }
}

onMounted(() => {
  document.addEventListener('pointerdown', onDocPointerDown)
  document.addEventListener('keydown', onKeydown)
})

onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', onDocPointerDown)
  document.removeEventListener('keydown', onKeydown)
})
</script>

<template>
  <span
    ref="root"
    class="lang-pair"
    :class="{ 'lang-pair--open': open, 'lang-pair--editable': editable }"
  >
    <button
      v-if="editable"
      type="button"
      class="lang-pair-chip"
      :disabled="disabled"
      :title="t('jobs.changeLangPairHint')"
      :aria-label="t('jobs.changeLangPairHint')"
      :aria-expanded="open"
      :aria-haspopup="true"
      @click.stop="toggle"
    >
      <span class="lang-pair-label">{{ label }}</span>
      <span class="lang-pair-caret" aria-hidden="true" />
    </button>
    <span v-else class="lang-pair-chip lang-pair-chip--readonly">{{ label }}</span>

    <ul
      v-if="editable && open"
      class="lang-pair-menu"
      role="listbox"
      :aria-label="t('jobs.changeLangPairHint')"
    >
      <li v-for="preset in LANG_PAIR_PRESETS" :key="preset.id">
        <button
          type="button"
          class="lang-pair-option"
          role="option"
          :aria-selected="preset.id === pairId"
          :class="{ 'lang-pair-option--active': preset.id === pairId }"
          @click.stop="pick(preset)"
        >
          {{ preset.label }}
        </button>
      </li>
    </ul>
  </span>
</template>

<style scoped lang="scss">
.lang-pair {
  position: relative;
  display: inline-flex;
  vertical-align: middle;
}

.lang-pair-chip {
  display: inline-flex;
  align-items: center;
  gap: 0.28rem;
  width: auto;
  max-width: 100%;
  margin: 0;
  border: 1px solid var(--border);
  border-radius: 999px;
  padding: 0.1rem 0.42rem 0.1rem 0.5rem;
  background: color-mix(in srgb, var(--surface-2) 88%, transparent);
  color: var(--text-muted);
  font: inherit;
  font-size: 0.68rem;
  font-weight: 600;
  line-height: 1.35;
  white-space: nowrap;
  cursor: pointer;
}

.lang-pair-chip:hover:not(:disabled) {
  border-color: var(--border-strong);
  color: var(--text);
}

.lang-pair-chip:disabled {
  cursor: default;
  opacity: 0.55;
}

.lang-pair-chip--readonly {
  cursor: default;
  padding-inline: 0.5rem;
}

.lang-pair--open .lang-pair-chip {
  border-color: color-mix(in srgb, var(--accent) 45%, var(--border));
  color: var(--text);
}

.lang-pair-label {
  min-width: 0;
}

.lang-pair-caret {
  flex: 0 0 auto;
  width: 0;
  height: 0;
  margin-top: 0.08rem;
  border-left: 0.22rem solid transparent;
  border-right: 0.22rem solid transparent;
  border-top: 0.28rem solid currentColor;
  opacity: 0.75;
}

.lang-pair--open .lang-pair-caret {
  margin-top: -0.08rem;
  border-top: 0;
  border-bottom: 0.28rem solid currentColor;
}

.lang-pair-menu {
  position: absolute;
  top: calc(100% + 0.28rem);
  left: 0;
  z-index: 40;
  list-style: none;
  margin: 0;
  padding: 0.28rem;
  min-width: 100%;
  width: max-content;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--surface);
  color: var(--text);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.16);
}

.lang-pair-option {
  display: block;
  width: 100%;
  margin: 0;
  border: 0;
  border-radius: 6px;
  padding: 0.38rem 0.55rem;
  background: transparent;
  color: var(--text);
  font: inherit;
  font-size: 0.78rem;
  font-weight: 600;
  line-height: 1.3;
  text-align: left;
  white-space: nowrap;
  cursor: pointer;
}

.lang-pair-option:hover {
  background: color-mix(in srgb, var(--accent) 12%, var(--surface-2));
}

.lang-pair-option--active {
  color: var(--accent);
  background: color-mix(in srgb, var(--accent) 14%, transparent);
}
</style>
