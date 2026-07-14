<script setup lang="ts">
import { ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import {
  LANG_PAIR_PRESETS,
  findLangPairPreset,
  type LangPairPreset,
} from '@/tm/langPairs'

const props = defineProps<{
  open: boolean
  sourceLang?: string
  targetLang?: string
  fuzzyMinScore?: number
  mode?: 'first' | 'edit'
}>()

const emit = defineEmits<{
  close: []
  save: [payload: { sourceLang: string; targetLang: string; fuzzyMinScore: number }]
}>()

const { t } = useI18n()

const pairId = ref(LANG_PAIR_PRESETS[0]!.id)
const thresholdPct = ref(75)

watch(
  () => [props.open, props.sourceLang, props.targetLang, props.fuzzyMinScore] as const,
  ([open]) => {
    if (!open) return
    const found = findLangPairPreset(props.sourceLang, props.targetLang)
    pairId.value = found?.id ?? LANG_PAIR_PRESETS[0]!.id
    const score = props.fuzzyMinScore ?? 0.75
    thresholdPct.value = Math.round(score * 100)
  },
  { immediate: true },
)

function onSave() {
  const preset = LANG_PAIR_PRESETS.find((p) => p.id === pairId.value) as LangPairPreset
  const pct = Math.min(100, Math.max(50, thresholdPct.value || 75))
  emit('save', {
    sourceLang: preset.sourceLang,
    targetLang: preset.targetLang,
    fuzzyMinScore: pct / 100,
  })
}
</script>

<template>
  <div v-if="open" class="backdrop" role="presentation" @click.self="mode === 'edit' ? emit('close') : undefined">
    <div
      class="dialog"
      role="dialog"
      aria-modal="true"
      :aria-label="mode === 'first' ? t('editor.settingsFirstTitle') : t('editor.settingsEditTitle')"
    >
      <h2 class="title">
        {{ mode === 'first' ? t('editor.settingsFirstTitle') : t('editor.settingsEditTitle') }}
      </h2>
      <p class="hint">{{ t('editor.settingsHint') }}</p>

      <label class="field">
        <span class="label">{{ t('editor.langPairLabel') }}</span>
        <select v-model="pairId" class="select">
          <option v-for="p in LANG_PAIR_PRESETS" :key="p.id" :value="p.id">
            {{ p.label }}
          </option>
        </select>
      </label>

      <label class="field">
        <span class="label">{{ t('editor.thresholdLabel') }}</span>
        <p class="field-hint">{{ t('editor.thresholdExplain') }}</p>
        <div class="threshold-row">
          <input
            v-model.number="thresholdPct"
            class="range"
            type="range"
            min="50"
            max="100"
            step="1"
          />
          <span class="pct">{{ thresholdPct }}%</span>
        </div>
      </label>

      <div class="actions">
        <button v-if="mode === 'edit'" type="button" class="ghost" @click="emit('close')">
          {{ t('editor.settingsCancel') }}
        </button>
        <button type="button" class="primary" @click="onSave">
          {{ t('editor.settingsSave') }}
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
.backdrop {
  position: fixed;
  inset: 0;
  z-index: 80;
  display: grid;
  place-items: center;
  padding: 1rem;
  background: color-mix(in srgb, #000 45%, transparent);
}

.dialog {
  width: min(24rem, 100%);
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
  color: var(--text-muted);
  line-height: 1.4;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  margin-bottom: 0.9rem;
}

.label {
  font-size: 0.78rem;
  font-weight: 600;
  letter-spacing: 0.02em;
  color: var(--text-muted);
}

.field-hint {
  margin: 0;
  font-size: 0.78rem;
  line-height: 1.35;
  color: var(--text-muted);
  opacity: 0.9;
}

.select {
  appearance: none;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--surface-2);
  color: var(--text);
  padding: 0.55rem 0.7rem;
  font: inherit;
  font-size: 0.95rem;
}

.threshold-row {
  display: flex;
  align-items: center;
  gap: 0.65rem;
}

.range {
  flex: 1 1 auto;
  accent-color: var(--accent);
}

.pct {
  flex: 0 0 2.75rem;
  font-variant-numeric: tabular-nums;
  font-size: 0.9rem;
  font-weight: 600;
  text-align: right;
}

.actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.5rem;
  margin-top: 0.35rem;
}

.primary,
.ghost {
  border: 0;
  border-radius: 8px;
  padding: 0.5rem 0.9rem;
  font: inherit;
  font-size: 0.9rem;
  font-weight: 600;
  cursor: pointer;
}

.primary {
  background: var(--accent);
  color: #fff;
}

.ghost {
  background: transparent;
  color: var(--text-muted);
}

.ghost:hover {
  color: var(--text);
}
</style>
