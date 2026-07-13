<script setup lang="ts">
import { nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { renderAsync } from 'docx-preview'
import { buildTranslatedDocx } from '@/docx/exportDocx'
import type { ProjectRecord } from '@/types/project'

const props = defineProps<{
  record: ProjectRecord
  refreshToken: number
}>()

const { t } = useI18n()
const host = ref<HTMLElement | null>(null)
const loading = ref(false)
const error = ref('')
let gen = 0

async function renderPreview() {
  if (!host.value) return
  const run = ++gen
  loading.value = true
  error.value = ''
  try {
    const blob = await buildTranslatedDocx(props.record.docx, props.record.segments)
    if (run !== gen) return
    host.value.innerHTML = ''
    await renderAsync(blob, host.value, undefined, {
      className: 'docx',
      inWrapper: true,
      breakPages: true,
      ignoreLastRenderedPageBreak: true,
    })
  } catch (e) {
    if (run === gen) {
      error.value = e instanceof Error ? e.message : String(e)
    }
  } finally {
    if (run === gen) loading.value = false
  }
}

watch(
  () => props.refreshToken,
  () => nextTick(() => renderPreview()),
  { immediate: true },
)

onBeforeUnmount(() => {
  gen++
})
</script>

<template>
  <aside class="preview-panel" aria-label="preview">
    <div class="preview-head">
      <h2 class="preview-title">{{ t('editor.previewTitle') }}</h2>
      <p class="preview-hint">{{ t('editor.previewHint') }}</p>
    </div>
    <p v-if="loading" class="preview-status">{{ t('editor.previewLoading') }}</p>
    <p v-else-if="error" class="preview-error">{{ error }}</p>
    <div ref="host" class="preview-host docx-host" />
  </aside>
</template>

<style scoped lang="scss">
.preview-panel {
  position: sticky;
  top: 4.5rem;
  align-self: start;
  max-height: calc(100vh - 5.5rem);
  display: flex;
  flex-direction: column;
  min-width: 0;
  background: var(--surface-soft);
  border: 1px solid var(--border-strong);
  border-radius: 12px;
  overflow: hidden;
}

.preview-head {
  flex: 0 0 auto;
  padding: 0.75rem 0.9rem 0.55rem;
  border-bottom: 1px solid var(--border);
}

.preview-title {
  margin: 0;
  font-size: 0.85rem;
  font-weight: 600;
  color: var(--text);
}

.preview-hint {
  margin: 0.35rem 0 0;
  font-size: 0.75rem;
  color: var(--text-faint);
  line-height: 1.35;
}

.preview-status {
  padding: 0.65rem 0.9rem;
  margin: 0;
  font-size: 0.8rem;
  color: var(--text-muted);
}

.preview-error {
  padding: 0.65rem 0.9rem;
  margin: 0;
  font-size: 0.8rem;
  color: var(--danger);
}

.preview-host {
  flex: 1 1 auto;
  overflow: auto;
  padding: 0.5rem;
  background: #e8eaed;
}

.docx-host :deep(.docx-wrapper) {
  margin: 0 auto;
  padding-bottom: 0.5rem;
}
</style>
