<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, shallowRef, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useI18n } from 'vue-i18n'
import SegmentRow from '@/components/SegmentRow.vue'
import { buildTranslatedDocx, downloadBlob } from '@/docx/exportDocx'
import { getProject, saveProject } from '@/storage/idb'
import { packProjectFile } from '@/storage/projectFile'
import type { ProjectRecord, Segment } from '@/types/project'

const props = defineProps<{ id: string }>()
const { t } = useI18n()
const router = useRouter()

/** shallowRef: deep ref() proxies break IndexedDB structured clone */
const record = shallowRef<ProjectRecord | null>(null)
const error = ref('')
const notice = ref('')
const saving = ref(false)
const allSaved = ref(true)
let saveTimer: ReturnType<typeof setTimeout> | null = null

const SAVE_IDLE_MS = 3000

const done = computed(
  () => record.value?.segments.filter((s) => s.target.trim() !== '').length ?? 0,
)
const total = computed(() => record.value?.segments.length ?? 0)

function syncStatusesFromDisk(segments: Segment[]) {
  for (const s of segments) {
    s.status = s.target.trim() ? 'done' : 'empty'
  }
}

async function load() {
  error.value = ''
  allSaved.value = true
  const found = await getProject(props.id)
  if (!found) {
    error.value = 'Project not found'
    return
  }
  syncStatusesFromDisk(found.segments)
  record.value = found
}

onMounted(load)
watch(() => props.id, load)

onUnmounted(() => {
  if (saveTimer) clearTimeout(saveTimer)
})

/** Replace a segment immutably so shallowRef children re-render. */
function patchSegment(segId: string, patch: Partial<Segment>) {
  if (!record.value) return
  const segments = record.value.segments.map((s) =>
    s.id === segId ? { ...s, ...patch } : s,
  )
  record.value = {
    meta: record.value.meta,
    segments,
    docx: record.value.docx,
  }
}

function scheduleSave() {
  if (!record.value) return
  allSaved.value = false
  if (saveTimer) clearTimeout(saveTimer)
  saveTimer = setTimeout(async () => {
    if (!record.value) return
    saving.value = true
    try {
      await saveProject(record.value)
      record.value = {
        meta: record.value.meta,
        docx: record.value.docx,
        segments: record.value.segments.map((s) => ({
          ...s,
          status: s.target.trim() ? 'done' : 'empty',
        })),
      }
      allSaved.value = true
      error.value = ''
    } catch (e) {
      if (e instanceof Error && e.message === 'QUOTA') {
        error.value = t('projects.quota')
      } else {
        error.value = e instanceof Error ? e.message : String(e)
      }
    } finally {
      saving.value = false
    }
  }, SAVE_IDLE_MS)
}

function updateTarget(seg: Segment, value: string) {
  if (!record.value) return
  patchSegment(seg.id, { target: value, status: 'draft' })
  scheduleSave()
}

function copySource(seg: Segment) {
  if (!record.value) return
  patchSegment(seg.id, { target: seg.source, status: 'draft' })
  scheduleSave()
}

async function downloadProject() {
  if (!record.value) return
  try {
    if (saveTimer) {
      clearTimeout(saveTimer)
      saveTimer = null
    }
    saving.value = true
    await saveProject(record.value)
    record.value = {
      meta: record.value.meta,
      docx: record.value.docx,
      segments: record.value.segments.map((s) => ({
        ...s,
        status: s.target.trim() ? 'done' : 'empty',
      })),
    }
    allSaved.value = true
    const blob = await packProjectFile(record.value)
    downloadBlob(blob, `${record.value.meta.name}.tcat.zip`)
    notice.value = t('editor.projectSaved')
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e)
  } finally {
    saving.value = false
  }
}

async function exportDocx() {
  if (!record.value) return
  try {
    if (saveTimer) {
      clearTimeout(saveTimer)
      saveTimer = null
      saving.value = true
      await saveProject(record.value)
      record.value = {
        meta: record.value.meta,
        docx: record.value.docx,
        segments: record.value.segments.map((s) => ({
          ...s,
          status: s.target.trim() ? 'done' : 'empty',
        })),
      }
      allSaved.value = true
      saving.value = false
    }
    const blob = await buildTranslatedDocx(record.value.docx, record.value.segments)
    downloadBlob(blob, `${record.value.meta.name}.translated.docx`)
    notice.value = t('editor.exported')
    error.value = ''
  } catch (e) {
    error.value = e instanceof Error ? e.message : String(e)
    saving.value = false
  }
}
</script>

<template>
  <section v-if="record">
    <div class="toolbar">
      <button type="button" class="ghost" @click="router.push('/')">{{ t('editor.back') }}</button>
      <h1>{{ record.meta.name }}</h1>
      <span class="progress">{{ t('editor.progress', { done, total }) }}</span>
      <span v-if="saving" class="save-status saving" aria-live="polite">
        <span class="spinner" aria-hidden="true" />
        {{ t('editor.saving') }}
      </span>
      <span v-else-if="allSaved" class="save-status saved" aria-live="polite">
        {{ t('editor.autosaved') }}
      </span>
      <div class="spacer" />
      <button type="button" @click="downloadProject">{{ t('editor.saveProject') }}</button>
      <button type="button" class="primary" @click="exportDocx">
        {{ t('editor.exportDocx') }}
      </button>
    </div>

    <p v-if="error" class="error">{{ error }}</p>
    <p v-else-if="notice" class="notice">{{ notice }}</p>
    <p v-if="total === 0" class="notice">{{ t('projects.emptyDoc') }}</p>

    <SegmentRow
      v-for="seg in record.segments"
      :key="seg.id"
      :segment="seg"
      @update-target="updateTarget(seg, $event)"
      @copy-source="copySource(seg)"
    />
  </section>
  <p v-else-if="error" class="error">{{ error }}</p>
  <p v-else>…</p>
</template>

<style scoped lang="scss">
.toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.65rem;
  margin-bottom: 1rem;
  position: sticky;
  top: 0;
  z-index: 2;
  padding: 0.65rem 0;
  background: var(--bg-grad);
}

h1 {
  margin: 0;
  font-size: 1.15rem;
  color: var(--text);
}

.progress {
  font-size: 0.85rem;
  color: var(--text-muted);
}

.save-status {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  font-size: 0.85rem;
}

.save-status.saving {
  color: var(--text-muted);
}

.save-status.saved {
  color: var(--ok);
  font-weight: 600;
}

.spinner {
  width: 0.9rem;
  height: 0.9rem;
  border: 2px solid var(--spinner-track);
  border-top-color: var(--accent);
  border-radius: 50%;
  animation: spin 0.7s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.spacer {
  flex: 1;
}

button {
  border: 1px solid var(--border-strong);
  background: var(--surface);
  color: var(--text);
  border-radius: 8px;
  padding: 0.4rem 0.75rem;
  cursor: pointer;
  font-size: 0.9rem;
}

button.primary {
  background: var(--accent-strong);
  border-color: var(--accent-strong);
  color: var(--accent-text);
}

button.ghost {
  background: transparent;
}

.error {
  color: var(--danger);
  background: var(--danger-bg);
  padding: 0.65rem 0.85rem;
  border-radius: 8px;
}

.notice {
  color: var(--ok);
  font-size: 0.9rem;
}
</style>
