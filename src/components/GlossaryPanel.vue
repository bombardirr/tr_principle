<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import type { GlossaryTerm, GlossaryTermStatus } from '@/types/glossary'
import {
  listGlossaryTerms,
  putGlossaryTerm,
  softDeleteGlossaryTerm,
} from '@/storage/glossaryIdb'
import { markGlossaryDirty, syncGlossary } from '@/glossary/sync'
import { exportTbx, parseTbx } from '@/glossary/tbx'
import { publicActorLabel, useAuth } from '@/auth/session'
import { downloadBlob } from '@/docx/exportDocx'
import EditorGlyph from '@/components/EditorGlyph.vue'
import IconButton from '@/components/IconButton.vue'
import TooltipWrap from '@/components/TooltipWrap.vue'
import AppCheck from '@/components/AppCheck.vue'
import GlossaryStatusToggle from '@/components/GlossaryStatusToggle.vue'
import { langPairLabel } from '@/tm/langPairs'

const props = defineProps<{
  open: boolean
  sourceLang?: string
  targetLang?: string
}>()

const emit = defineEmits<{
  close: []
  changed: []
}>()

const { t } = useI18n()
const { user } = useAuth()

const terms = ref<GlossaryTerm[]>([])
const loading = ref(false)
const error = ref('')
const filterPairOnly = ref(true)
const query = ref('')
const composing = ref(false)

const draftTarget = ref('')
const draftStatus = ref<GlossaryTermStatus>('approved')
const draftNote = ref('')
const draftCase = ref(false)
const editingId = ref<string | null>(null)

const importInput = ref<HTMLInputElement | null>(null)
const listEl = ref<HTMLElement | null>(null)
const searchInput = ref<HTMLInputElement | null>(null)
const targetInput = ref<HTMLInputElement | null>(null)

const filtered = computed(() => {
  let list = terms.value
  if (filterPairOnly.value && props.sourceLang && props.targetLang) {
    list = list.filter(
      (x) => x.sourceLang === props.sourceLang && x.targetLang === props.targetLang,
    )
  }
  const q = query.value.trim().toLowerCase()
  if (q) {
    list = list.filter(
      (x) =>
        x.sourceTerm.toLowerCase().includes(q) ||
        x.targetTerm.toLowerCase().includes(q) ||
        (x.note ?? '').toLowerCase().includes(q),
    )
  }
  return list
    .slice()
    .sort(
      (a, b) =>
        a.sourceTerm.localeCompare(b.sourceTerm) ||
        a.targetTerm.localeCompare(b.targetTerm) ||
        a.id.localeCompare(b.id),
    )
})

const draftSource = computed(() => query.value.trim())

const draftReady = computed(
  () => Boolean(draftSource.value && draftTarget.value.trim()),
)

const pairLabel = computed(() => {
  if (!props.sourceLang || !props.targetLang) return ''
  return langPairLabel(props.sourceLang, props.targetLang)
})

const totalCount = computed(() => {
  if (filterPairOnly.value && props.sourceLang && props.targetLang) {
    return terms.value.filter(
      (x) => x.sourceLang === props.sourceLang && x.targetLang === props.targetLang,
    ).length
  }
  return terms.value.length
})

watch(draftReady, (ready) => {
  if (!ready && !editingId.value) draftStatus.value = 'approved'
})

async function reload() {
  loading.value = true
  error.value = ''
  try {
    await syncGlossary()
    terms.value = await listGlossaryTerms()
  } catch {
    error.value = t('glossary.loadFail')
    terms.value = await listGlossaryTerms()
  } finally {
    loading.value = false
  }
}

watch(
  () => props.open,
  (open) => {
    if (open) {
      void reload()
      nextTick(() => searchInput.value?.focus())
    } else {
      closeCompose()
      query.value = ''
    }
  },
)

onMounted(() => {
  if (props.open) void reload()
})

function closeCompose() {
  composing.value = false
  editingId.value = null
  draftTarget.value = ''
  draftStatus.value = 'approved'
  draftNote.value = ''
  draftCase.value = false
  error.value = ''
}

function openCompose() {
  const q = query.value.trim()
  if (!q && !editingId.value) return
  composing.value = true
  nextTick(() => targetInput.value?.focus())
}

function toggleCompose() {
  if (composing.value && !editingId.value) {
    closeCompose()
    return
  }
  if (composing.value && editingId.value) {
    closeCompose()
    return
  }
  openCompose()
}

function startEdit(term: GlossaryTerm) {
  editingId.value = term.id
  query.value = term.sourceTerm
  draftTarget.value = term.targetTerm
  draftStatus.value = term.status
  draftNote.value = term.note ?? ''
  draftCase.value = term.caseSensitive
  composing.value = true
  nextTick(() => targetInput.value?.focus())
}

async function saveDraft() {
  const sourceTerm = draftSource.value
  const targetTerm = draftTarget.value.trim()
  if (!sourceTerm || !targetTerm) {
    error.value = t('glossary.needTerms')
    return
  }
  const sourceLang = props.sourceLang || 'und'
  const targetLang = props.targetLang || 'und'
  const now = new Date().toISOString()
  const existing = editingId.value
    ? terms.value.find((x) => x.id === editingId.value)
    : undefined
  const row: GlossaryTerm = {
    id: existing?.id ?? crypto.randomUUID(),
    sourceLang: existing?.sourceLang ?? sourceLang,
    targetLang: existing?.targetLang ?? targetLang,
    sourceTerm,
    targetTerm,
    status: draftStatus.value,
    note: draftNote.value.trim() || undefined,
    caseSensitive: draftCase.value,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
    deletedAt: null,
    createdBy: existing?.createdBy ?? (publicActorLabel(user.value) || 'local'),
  }
  await putGlossaryTerm(row)
  markGlossaryDirty(row.id)
  closeCompose()
  terms.value = await listGlossaryTerms()
  emit('changed')
  error.value = ''
  nextTick(() => {
    searchInput.value?.focus()
    listEl.value?.scrollTo({ top: 0 })
  })
}

async function setTermStatus(termId: string, status: GlossaryTermStatus) {
  const term = terms.value.find((x) => x.id === termId)
  if (!term || term.status === status) return
  const now = new Date().toISOString()
  const row: GlossaryTerm = { ...term, status, updatedAt: now, deletedAt: null }
  terms.value = terms.value.map((x) => (x.id === termId ? row : x))
  if (editingId.value === termId) draftStatus.value = status
  // Persist before notifying the editor — otherwise reloadGlossary races and reads stale IDB.
  await putGlossaryTerm(row)
  markGlossaryDirty(row.id)
  emit('changed')
}

async function removeTerm(id: string) {
  const row = await softDeleteGlossaryTerm(id)
  if (row) {
    markGlossaryDirty(row.id)
    terms.value = await listGlossaryTerms()
    if (editingId.value === id) closeCompose()
    emit('changed')
  }
}

function exportFile() {
  const xml = exportTbx(terms.value)
  const blob = new Blob([xml], { type: 'application/xml' })
  downloadBlob(blob, 'glossary.tbx')
}

function openImport() {
  importInput.value?.click()
}

async function onImportChange(e: Event) {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return
  try {
    const text = await file.text()
    const parsed = parseTbx(text)
    if (!parsed.length) {
      error.value = t('glossary.importEmpty')
      return
    }
    const actor = publicActorLabel(user.value) || 'local'
    const now = new Date().toISOString()
    const dirty: string[] = []
    for (const term of parsed) {
      const row: GlossaryTerm = {
        ...term,
        createdBy: actor,
        createdAt: term.createdAt || now,
        updatedAt: now,
      }
      await putGlossaryTerm(row)
      dirty.push(row.id)
    }
    markGlossaryDirty(...dirty)
    terms.value = await listGlossaryTerms()
    emit('changed')
    error.value = ''
  } catch {
    error.value = t('glossary.importFail')
  }
}
</script>

<template>
  <div
    v-if="open"
    class="backdrop"
    role="presentation"
    @click.self="emit('close')"
  >
    <div
      class="dialog"
      role="dialog"
      aria-modal="true"
      :aria-label="t('glossary.title')"
    >
      <header class="chrome">
        <div class="grid">
          <div class="title-cell">
            <h2 class="title">{{ t('glossary.title') }}</h2>
            <TooltipWrap
              class="count"
              :text="t('glossary.countHint', { shown: filtered.length, total: totalCount })"
            >
              {{ filtered.length }}{{ filtered.length !== totalCount ? ` / ${totalCount}` : '' }}
            </TooltipWrap>
          </div>
          <div class="icons-top">
            <IconButton :title="t('glossary.importTbx')" @click="openImport">
              <EditorGlyph name="import" />
            </IconButton>
            <IconButton :title="t('glossary.exportTbx')" @click="exportFile">
              <EditorGlyph name="export" />
            </IconButton>
            <IconButton :title="t('glossary.close')" @click="emit('close')">
              <EditorGlyph name="close" />
            </IconButton>
            <input
              ref="importInput"
              type="file"
              accept=".tbx,.xml,application/xml,text/xml"
              hidden
              @change="onImportChange"
            />
          </div>

          <div class="search-line">
            <div class="filters">
              <TooltipWrap v-if="pairLabel" :text="t('glossary.filterPair')">
                <AppCheck v-model="filterPairOnly" :label="pairLabel" />
              </TooltipWrap>
              <AppCheck v-model="draftCase" :label="t('glossary.caseSensitive')" />
            </div>
            <div class="search-field">
              <input
                ref="searchInput"
                v-model="query"
                type="search"
                class="input"
                :placeholder="t('glossary.searchOrAddPlaceholder')"
                autocomplete="off"
                @keydown.enter.prevent="composing ? saveDraft() : openCompose()"
              />
              <div v-if="composing" class="add-flyout">
                <div class="flyout-row">
                  <input
                    ref="targetInput"
                    v-model="draftTarget"
                    type="text"
                    class="input"
                    :placeholder="t('glossary.targetTerm')"
                    autocomplete="off"
                    @keydown.enter.prevent="saveDraft"
                    @keydown.escape="closeCompose"
                  />
                  <GlossaryStatusToggle v-model="draftStatus" compact />
                </div>
                <div class="flyout-row">
                  <input
                    v-model="draftNote"
                    type="text"
                    class="input"
                    :placeholder="t('glossary.note')"
                    autocomplete="off"
                    @keydown.enter.prevent="saveDraft"
                    @keydown.escape="closeCompose"
                  />
                  <IconButton
                    :title="editingId ? t('glossary.saveEdit') : t('glossary.add')"
                    :disabled="!draftReady"
                    primary
                    @click="saveDraft"
                  >
                    <EditorGlyph name="send" />
                  </IconButton>
                </div>
              </div>
            </div>
            <IconButton
              :title="composing ? t('glossary.cancelEdit') : t('glossary.add')"
              :active="composing"
              :disabled="!composing && !query.trim()"
              @click="toggleCompose"
            >
              <EditorGlyph :name="composing ? 'close' : 'plus'" />
            </IconButton>
          </div>
        </div>
        <p v-if="error" class="error">{{ error }}</p>
        <p v-else-if="loading" class="muted">{{ t('glossary.loading') }}</p>
      </header>

      <div ref="listEl" class="list-scroll" tabindex="0">
        <table v-if="filtered.length" class="table">
          <thead>
            <tr>
              <th>{{ t('glossary.sourceTerm') }}</th>
              <th>{{ t('glossary.targetTerm') }}</th>
              <th class="col-status">{{ t('glossary.status') }}</th>
              <th class="col-actions" />
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="term in filtered"
              :key="term.id"
              :class="{ editing: term.id === editingId, forbidden: term.status === 'forbidden' }"
            >
              <td class="cell-term">
                <TooltipWrap :text="term.sourceTerm">{{ term.sourceTerm }}</TooltipWrap>
              </td>
              <td class="cell-term">
                <TooltipWrap :text="term.targetTerm">{{ term.targetTerm }}</TooltipWrap>
              </td>
              <td class="col-status">
                <GlossaryStatusToggle
                  :key="term.id"
                  compact
                  :model-value="term.status"
                  @update:model-value="setTermStatus(term.id, $event)"
                />
              </td>
              <td class="col-actions">
                <IconButton :title="t('glossary.edit')" @click="startEdit(term)">
                  <EditorGlyph name="edit" />
                </IconButton>
                <IconButton :title="t('glossary.delete')" danger @click="removeTerm(term.id)">
                  <EditorGlyph name="trash" />
                </IconButton>
              </td>
            </tr>
          </tbody>
        </table>
        <p v-else-if="!loading" class="muted empty">{{ t('glossary.empty') }}</p>
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
  width: min(720px, 100%);
  height: min(78vh, 640px);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: var(--surface);
  color: var(--text);
  border-radius: 12px;
  box-shadow: 0 16px 48px rgba(0, 0, 0, 0.28);
}
.chrome {
  flex: 0 0 auto;
  padding: 1rem 1.15rem 0.7rem;
  border-bottom: 1px solid var(--border);
  position: relative;
  z-index: 2;
}
.grid {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  column-gap: 0.35rem;
  row-gap: 0.35rem;
  align-items: start;
}
.title-cell {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  min-width: 0;
}
.title {
  margin: 0;
  font-size: 1.1rem;
  font-weight: 700;
}
.count {
  font-size: 0.78rem;
  font-variant-numeric: tabular-nums;
  color: var(--text-muted);
}
.icons-top {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 0.1rem;
}
.search-line {
  grid-column: 1 / -1;
  display: flex;
  align-items: center;
  gap: 0.35rem;
  min-width: 0;
}
.filters {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.55rem 0.85rem;
  flex: 0 0 auto;
}
.search-field {
  position: relative;
  flex: 1 1 auto;
  min-width: 0;
}
.add-flyout {
  position: absolute;
  left: 0;
  right: 0;
  top: calc(100% + 0.35rem);
  z-index: 8;
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}
.flyout-row {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  min-width: 0;
}
.flyout-row .input {
  flex: 1 1 auto;
}
.input {
  width: 100%;
  box-sizing: border-box;
  font: inherit;
  font-size: 0.84rem;
  line-height: 1.25;
  padding: 0.28rem 0.45rem;
  border: 0;
  border-radius: 6px;
  background: var(--surface-2);
  color: var(--text);
  min-width: 0;
  outline: none;
}
.input:focus {
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--accent) 45%, transparent);
}
.input::placeholder {
  color: var(--text-faint);
}
.list-scroll {
  flex: 1 1 auto;
  min-height: 0;
  overflow: auto;
  padding: 0 0.4rem 0.55rem;
  position: relative;
  z-index: 1;
}
.table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.84rem;
}
.table th {
  position: sticky;
  top: 0;
  z-index: 1;
  text-align: left;
  font-weight: 600;
  font-size: 0.72rem;
  letter-spacing: 0.02em;
  color: var(--text-muted);
  padding: 0.5rem 0.5rem 0.35rem;
  background: var(--surface);
  border-bottom: 1px solid var(--border);
}
.table td {
  padding: 0.35rem 0.5rem;
  border-bottom: 1px solid var(--border);
  vertical-align: middle;
}
.table tr.editing {
  background: color-mix(in srgb, var(--accent) 10%, transparent);
}
.cell-term {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 0;
  width: 36%;
}
.cell-term :deep(span) {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.col-status {
  width: 7.5rem;
  white-space: nowrap;
}
.col-actions {
  width: 4.5rem;
  white-space: nowrap;
  text-align: right;
}
.col-actions :deep(.icon-btn) {
  width: 1.6rem;
  height: 1.6rem;
}
.error {
  color: var(--danger);
  margin: 0.4rem 0 0;
  font-size: 0.85rem;
}
.muted {
  color: var(--text-muted);
  font-size: 0.85rem;
}
.empty {
  margin: 1.25rem 0.75rem;
}
</style>
