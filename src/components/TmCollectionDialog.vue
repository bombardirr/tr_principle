<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import EditorGlyph from '@/components/EditorGlyph.vue'
import { listProjects } from '@/storage/idb'
import { getTmBaseStats, importTmUnits } from '@/storage/tmIdb'
import { PERSONAL_TM_ATTACHMENT_ID, type TmAttachmentCatalogItem } from '@/tm/projectAttachments'
import { createTmBase } from '@/tm/tmBasesCatalog'
import {
  deleteNamedTmBase,
  deleteOwnPersonalTm,
  listTmCatalog,
} from '@/tm/tmCollection'
import { notifyTmCollectionChanged } from '@/tm/tmCollectionEvents'
import { parseTmx } from '@/tm/tmx'
import type { ProjectTmAttachment, ProjectTmAttachmentId } from '@/types/project'

const JOB_TM_ATTACHMENTS_KEY = 'tr_principle.job_tm_attachments.v1'

const props = defineProps<{
  open: boolean
  mode: 'pick' | 'browse'
  returnTo?: 'project' | 'job' | null
  attachedIds: ProjectTmAttachmentId[]
  contextLabel?: string
}>()

const emit = defineEmits<{
  close: []
  attach: [id: ProjectTmAttachmentId]
  deleted: []
  'open-full': []
  error: [message: string]
}>()

const { t, locale } = useI18n()
const busy = ref(false)
const catalog = ref<TmAttachmentCatalogItem[]>([
  {
    id: PERSONAL_TM_ATTACHMENT_ID,
    label: 'Personal TM',
    color: '#5b9fd4',
    glyph: 'tm',
  },
])
const statsById = ref<Record<string, { count: number; lastUpdatedAt: string | null }>>({})
const projectCount = ref(0)
const jobCount = ref(0)
const confirmDeleteId = ref<string | null>(null)
const panel = ref<'list' | 'create' | 'import'>('list')
const createName = ref('')
const importMode = ref<'existing' | 'new'>('new')
const importNewName = ref('')
const importTargetId = ref(PERSONAL_TM_ATTACHMENT_ID)
const importInput = ref<HTMLInputElement | null>(null)
const pendingImportFile = ref<File | null>(null)

const title = computed(() =>
  props.mode === 'pick' ? t('tmCollection.pickTitle') : t('tmCollection.title')
)
const hint = computed(() =>
  props.mode === 'pick' ? t('tmCollection.pickHint') : t('tmCollection.hint')
)

async function refreshCatalog() {
  try {
    catalog.value = await listTmCatalog()
  } catch {
    catalog.value = [
      {
        id: PERSONAL_TM_ATTACHMENT_ID,
        label: 'Personal TM',
        color: '#5b9fd4',
        glyph: 'tm',
      },
    ]
  }
  const next: Record<string, { count: number; lastUpdatedAt: string | null }> = {}
  await Promise.all(
    catalog.value.map(async item => {
      try {
        next[item.id] = await getTmBaseStats(item.id)
      } catch {
        next[item.id] = { count: 0, lastUpdatedAt: null }
      }
    }),
  )
  statsById.value = next
  if (!catalog.value.some(item => item.id === importTargetId.value)) {
    importTargetId.value = PERSONAL_TM_ATTACHMENT_ID
  }
}

watch(
  () => props.open,
  async open => {
    if (!open) {
      confirmDeleteId.value = null
      panel.value = 'list'
      createName.value = ''
      pendingImportFile.value = null
      return
    }
    await refreshCatalog()
  },
  { immediate: true },
)

function itemLabel(item: TmAttachmentCatalogItem) {
  return item.id === PERSONAL_TM_ATTACHMENT_ID ? t('projects.tmPersonalBase') : item.label
}

function formatTmDate(iso: string, short = false) {
  try {
    const d = new Date(iso)
    if (short) {
      return d.toLocaleDateString(locale.value, { day: 'numeric', month: 'short' })
    }
    return d.toLocaleString(locale.value, {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return iso
  }
}

function lastUpdatedLabel(id: string, short = false) {
  const last = statsById.value[id]?.lastUpdatedAt
  if (!last) return t('projects.tmLastUpdatedNever')
  const date = formatTmDate(last, short)
  return short ? t('projects.tmLastUpdatedShort', { date }) : t('projects.tmLastUpdated', { date })
}

function unitCount(id: string) {
  return statsById.value[id]?.count ?? 0
}

function isAttached(id: ProjectTmAttachmentId) {
  return props.attachedIds.includes(id)
}

function onCardClick(item: TmAttachmentCatalogItem) {
  if (props.mode !== 'pick' || isAttached(item.id)) return
  emit('attach', item.id)
}

function countAttachedJobs(id: ProjectTmAttachmentId): number {
  try {
    const raw = localStorage.getItem(JOB_TM_ATTACHMENTS_KEY)
    if (!raw) return 0
    const store = JSON.parse(raw) as Record<string, ProjectTmAttachment[]>
    if (!store || typeof store !== 'object') return 0
    return Object.values(store).filter(
      attachments => Array.isArray(attachments) && attachments.some(item => item.id === id)
    ).length
  } catch {
    return 0
  }
}

async function openDeleteConfirm(id: string) {
  if (busy.value) return
  busy.value = true
  emit('error', '')
  try {
    await refreshCatalog()
    const projects = await listProjects()
    projectCount.value = projects.filter(project =>
      project.tmAttachments?.some(item => item.id === id)
    ).length
    jobCount.value = countAttachedJobs(id)
    confirmDeleteId.value = id
  } catch (err) {
    emit('error', err instanceof Error ? err.message : String(err))
  } finally {
    busy.value = false
  }
}

async function onConfirmDelete() {
  const id = confirmDeleteId.value
  if (!id || busy.value) return
  busy.value = true
  emit('error', '')
  try {
    if (id === PERSONAL_TM_ATTACHMENT_ID) {
      await deleteOwnPersonalTm()
    } else {
      await deleteNamedTmBase(id)
    }
    confirmDeleteId.value = null
    await refreshCatalog()
    emit('deleted')
  } catch (err) {
    emit('error', err instanceof Error ? err.message : String(err))
  } finally {
    busy.value = false
  }
}

function openCreate() {
  panel.value = 'create'
  createName.value = ''
  confirmDeleteId.value = null
}

function openImport() {
  panel.value = 'import'
  importMode.value = 'new'
  importNewName.value = ''
  importTargetId.value = PERSONAL_TM_ATTACHMENT_ID
  pendingImportFile.value = null
  confirmDeleteId.value = null
}

function onImportFileChange(e: Event) {
  const input = e.target as HTMLInputElement
  pendingImportFile.value = input.files?.[0] ?? null
  input.value = ''
}

async function submitCreate() {
  if (busy.value) return
  const label = createName.value.trim()
  if (!label) return
  busy.value = true
  emit('error', '')
  try {
    await createTmBase({ label })
    notifyTmCollectionChanged()
    panel.value = 'list'
    createName.value = ''
    await refreshCatalog()
  } catch (err) {
    emit('error', err instanceof Error ? err.message : String(err))
  } finally {
    busy.value = false
  }
}

async function submitImport() {
  if (busy.value || !pendingImportFile.value) return
  busy.value = true
  emit('error', '')
  try {
    const xml = await pendingImportFile.value.text()
    const units = parseTmx(xml)
    let baseId = importTargetId.value
    if (importMode.value === 'new') {
      const label = importNewName.value.trim() || pendingImportFile.value.name.replace(/\.tmx$/i, '')
      const base = await createTmBase({ label: label || 'Imported TM' })
      baseId = base.id
    }
    const stamped = units.map(u => ({ ...u, id: crypto.randomUUID(), baseId }))
    await importTmUnits(stamped, { baseId })
    notifyTmCollectionChanged()
    panel.value = 'list'
    pendingImportFile.value = null
    await refreshCatalog()
  } catch (err) {
    emit('error', err instanceof Error ? err.message : String(err))
  } finally {
    busy.value = false
  }
}

const deleteConfirmItem = computed(() =>
  confirmDeleteId.value ? catalog.value.find(item => item.id === confirmDeleteId.value) : null
)
</script>

<template>
  <div v-if="open" class="backdrop" role="presentation" @click.self="emit('close')">
    <section
      class="dialog"
      :class="{ compact: mode === 'pick' }"
      role="dialog"
      aria-modal="true"
      :aria-label="title"
    >
      <header class="header">
        <div>
          <h2 class="title">{{ title }}</h2>
          <p v-if="contextLabel" class="context">{{ contextLabel }}</p>
        </div>
        <button
          type="button"
          class="icon-button"
          :aria-label="t('tmCollection.close')"
          :disabled="busy"
          @click="emit('close')"
        >
          <EditorGlyph name="close" />
        </button>
      </header>

      <p class="hint">{{ hint }}</p>

      <div v-if="mode === 'browse' && panel === 'list'" class="toolbar">
        <button type="button" class="secondary" :disabled="busy" @click="openCreate">
          {{ t('tmCollection.create') }}
        </button>
        <button type="button" class="secondary" :disabled="busy" @click="openImport">
          {{ t('tmCollection.importTmx') }}
        </button>
      </div>

      <div v-if="panel === 'create'" class="form-panel">
        <h3>{{ t('tmCollection.createTitle') }}</h3>
        <label class="field">
          <span>{{ t('tmCollection.createNameLabel') }}</span>
          <input v-model="createName" type="text" :placeholder="t('tmCollection.createNamePlaceholder')" />
        </label>
        <div class="form-actions">
          <button type="button" class="ghost" :disabled="busy" @click="panel = 'list'">
            {{ t('tmCollection.createCancel') }}
          </button>
          <button
            type="button"
            class="primary"
            :disabled="busy || !createName.trim()"
            @click="submitCreate"
          >
            {{ t('tmCollection.createSubmit') }}
          </button>
        </div>
      </div>

      <div v-else-if="panel === 'import'" class="form-panel">
        <h3>{{ t('tmCollection.importTitle') }}</h3>
        <div class="import-modes">
          <label>
            <input v-model="importMode" type="radio" value="new" />
            {{ t('tmCollection.importAsNew') }}
          </label>
          <label>
            <input v-model="importMode" type="radio" value="existing" />
            {{ t('tmCollection.importIntoExisting') }}
          </label>
        </div>
        <label v-if="importMode === 'new'" class="field">
          <span>{{ t('tmCollection.importNewNameLabel') }}</span>
          <input v-model="importNewName" type="text" :placeholder="t('tmCollection.createNamePlaceholder')" />
        </label>
        <label v-else class="field">
          <span>{{ t('tmCollection.importTargetLabel') }}</span>
          <select v-model="importTargetId">
            <option v-for="item in catalog" :key="item.id" :value="item.id">
              {{ itemLabel(item) }}
            </option>
          </select>
        </label>
        <input ref="importInput" type="file" accept=".tmx,application/xml,text/xml" hidden @change="onImportFileChange" />
        <button type="button" class="secondary" :disabled="busy" @click="importInput?.click()">
          {{ pendingImportFile ? pendingImportFile.name : t('tmCollection.importTmx') }}
        </button>
        <div class="form-actions">
          <button type="button" class="ghost" :disabled="busy" @click="panel = 'list'">
            {{ t('tmCollection.importCancel') }}
          </button>
          <button
            type="button"
            class="primary"
            :disabled="busy || !pendingImportFile"
            @click="submitImport"
          >
            {{ t('tmCollection.importSubmit') }}
          </button>
        </div>
      </div>

      <div v-else class="catalog" :class="{ 'catalog-pick': mode === 'pick' }">
        <article
          v-for="item in catalog"
          :key="item.id"
          class="tm-card"
          :class="{
            attached: isAttached(item.id),
            selectable: mode === 'pick' && !isAttached(item.id),
          }"
          :role="mode === 'pick' && !isAttached(item.id) ? 'button' : undefined"
          :tabindex="mode === 'pick' && !isAttached(item.id) ? 0 : undefined"
          @click="onCardClick(item)"
          @keydown.enter.prevent="onCardClick(item)"
          @keydown.space.prevent="onCardClick(item)"
        >
          <span class="glyph" :style="{ '--tm-color': item.color }">
            <EditorGlyph :name="item.glyph" />
          </span>
          <div class="card-copy">
            <strong>{{ itemLabel(item) }}</strong>
            <span
              v-if="mode === 'browse'"
              class="stat"
              :title="t('projects.tmUnitsStatHint')"
            >
              {{ t('projects.tmUnitsStat', { n: unitCount(item.id) }) }}
            </span>
            <span
              v-if="mode === 'browse'"
              class="stat"
              :title="
                statsById[item.id]?.lastUpdatedAt
                  ? t('projects.tmLastUpdatedHint')
                  : t('projects.tmLastUpdatedNeverHint')
              "
            >
              {{ lastUpdatedLabel(item.id, true) }}
            </span>
          </div>
          <span v-if="isAttached(item.id)" class="attached-mark">
            <EditorGlyph name="check" />
            {{ t('tmCollection.attached') }}
          </span>
          <button
            v-if="mode === 'browse'"
            type="button"
            class="danger ghost"
            :disabled="busy"
            @click.stop="openDeleteConfirm(item.id)"
          >
            <EditorGlyph name="trash" />
            {{ t('tmCollection.delete') }}
          </button>
        </article>
      </div>

      <div v-if="mode === 'browse' && deleteConfirmItem" class="confirm" role="alertdialog">
        <h3>{{ t('tmCollection.deleteConfirmTitle') }}</h3>
        <p>
          {{
            deleteConfirmItem.id === PERSONAL_TM_ATTACHMENT_ID
              ? t('tmCollection.deleteConfirmBody', {
                  name: itemLabel(deleteConfirmItem),
                  units: unitCount(deleteConfirmItem.id),
                  projects: projectCount,
                  jobs: jobCount,
                })
              : t('tmCollection.deleteConfirmNamedBody', {
                  name: itemLabel(deleteConfirmItem),
                  units: unitCount(deleteConfirmItem.id),
                  projects: projectCount,
                  jobs: jobCount,
                })
          }}
        </p>
        <div class="confirm-actions">
          <button type="button" class="ghost" :disabled="busy" @click="confirmDeleteId = null">
            {{ t('tmCollection.deleteConfirmCancel') }}
          </button>
          <button type="button" class="danger" :disabled="busy" @click="onConfirmDelete">
            {{ t('tmCollection.deleteConfirmOk') }}
          </button>
        </div>
      </div>

      <footer class="actions">
        <button
          v-if="mode === 'pick'"
          type="button"
          class="secondary"
          :disabled="busy"
          @click="emit('open-full')"
        >
          {{ t('tmCollection.openFull') }}
        </button>
        <button type="button" class="primary" :disabled="busy" @click="emit('close')">
          {{ t('tmCollection.close') }}
        </button>
      </footer>
    </section>
  </div>
</template>

<style scoped lang="scss">
.backdrop {
  position: fixed;
  inset: 0;
  z-index: 86;
  display: grid;
  place-items: center;
  padding: 1rem;
  background: color-mix(in srgb, #000 45%, transparent);
}

.dialog {
  width: min(42rem, 100%);
  max-height: calc(100vh - 2rem);
  overflow: auto;
  padding: 1.25rem 1.35rem 1.1rem;
  border-radius: 12px;
  background: var(--surface);
  color: var(--text);
  box-shadow: 0 16px 48px rgba(0, 0, 0, 0.28);

  &.compact {
    width: min(32rem, 100%);
  }
}

.header,
.actions,
.confirm-actions,
.form-actions,
.toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
}

.toolbar {
  justify-content: flex-start;
  margin-bottom: 0.85rem;
}

.title,
.confirm h3,
.form-panel h3 {
  margin: 0;
  font-size: 1.15rem;
}

.context {
  margin: 0.2rem 0 0;
  color: var(--text-muted);
  font-size: 0.78rem;
}

.hint {
  margin: 0.45rem 0 1rem;
  color: var(--text-muted);
  font-size: 0.85rem;
  line-height: 1.45;
}

.form-panel {
  display: grid;
  gap: 0.75rem;
  margin-bottom: 1rem;
  padding: 1rem;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--surface-2);
}

.field {
  display: grid;
  gap: 0.35rem;
  font-size: 0.85rem;
  color: var(--text-muted);

  input,
  select {
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 0.45rem 0.6rem;
    background: var(--surface);
    color: var(--text);
    font: inherit;
  }
}

.import-modes {
  display: flex;
  flex-wrap: wrap;
  gap: 0.85rem;
  font-size: 0.85rem;
}

.form-actions {
  justify-content: flex-end;
}

.catalog {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(15rem, 1fr));
  gap: 0.75rem;
}

.catalog-pick {
  grid-template-columns: repeat(auto-fill, minmax(9rem, 1fr));
}

.tm-card {
  position: relative;
  display: flex;
  align-items: center;
  gap: 0.75rem;
  min-height: 5.5rem;
  padding: 0.85rem;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--surface-2);

  &.selectable {
    cursor: pointer;

    &:hover,
    &:focus-visible {
      border-color: var(--accent);
      outline: none;
      box-shadow: 0 0 0 2px color-mix(in srgb, var(--accent) 18%, transparent);
    }
  }

  &.attached {
    border-color: color-mix(in srgb, var(--accent) 45%, var(--border));
  }
}

.catalog-pick .tm-card {
  flex-direction: column;
  justify-content: space-between;
  aspect-ratio: 1;
  min-height: 0;
  text-align: center;
  padding: 0.65rem 0.55rem;
}

.glyph {
  display: grid;
  flex: 0 0 auto;
  place-items: center;
  width: 2.6rem;
  height: 2.6rem;
  border-radius: 10px;
  background: color-mix(in srgb, var(--tm-color) 18%, transparent);
  color: var(--tm-color);
}

.card-copy {
  display: grid;
  min-width: 0;
  gap: 0.25rem;
}

.stat,
.attached-mark {
  color: var(--text-muted);
  font-size: 0.78rem;
}

.attached-mark {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  margin-left: auto;
  color: var(--accent);
}

.catalog-pick .attached-mark {
  margin-left: 0;
}

.confirm {
  margin-top: 1rem;
  padding: 1rem;
  border: 1px solid color-mix(in srgb, var(--danger) 45%, var(--border));
  border-radius: 10px;
  background: color-mix(in srgb, var(--danger) 8%, var(--surface-2));

  p {
    margin: 0.45rem 0 1rem;
    color: var(--text-muted);
    font-size: 0.85rem;
    line-height: 1.5;
  }
}

.confirm-actions {
  justify-content: flex-end;
}

.actions {
  justify-content: flex-end;
  margin-top: 1rem;
}

button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.35rem;
  border: 0;
  border-radius: 8px;
  padding: 0.5rem 0.9rem;
  font: inherit;
  font-size: 0.9rem;
  font-weight: 600;
  cursor: pointer;

  &:disabled {
    cursor: default;
    opacity: 0.55;
  }
}

.icon-button {
  width: 2rem;
  height: 2rem;
  padding: 0;
  background: transparent;
  color: var(--text-muted);
}

.primary {
  background: var(--accent);
  color: #fff;
}

.secondary {
  background: var(--surface-2);
  color: var(--text);
}

.ghost {
  background: transparent;
  color: var(--text-muted);
}

.danger {
  margin-left: auto;
  background: var(--danger);
  color: #fff;

  &.ghost {
    background: transparent;
    color: var(--danger);
  }
}

@media (max-width: 34rem) {
  .tm-card:not(.selectable) {
    align-items: flex-start;
    flex-wrap: wrap;
  }

  .danger {
    margin-left: 0;
  }
}
</style>
