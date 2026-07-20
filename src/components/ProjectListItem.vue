<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import IconButton from '@/components/IconButton.vue'
import EditorGlyph from '@/components/EditorGlyph.vue'
import ProjectTmBasesDialog from '@/components/ProjectTmBasesDialog.vue'
import TmCollectionDialog from '@/components/TmCollectionDialog.vue'
import { ApiError } from '@/auth/api'
import { getProjectBackup } from '@/projects/api'
import { deleteProject, getProject, saveProject } from '@/storage/idb'
import { unpackProjectFile } from '@/storage/projectFile'
import { getPersonalTmStats } from '@/storage/tmIdb'
import { langPairLabel } from '@/tm/langPairs'
import {
  attachProjectTm,
  colorForTmBase,
  normalizeProjectTmAttachments,
  PERSONAL_TM_ATTACHMENT_ID,
  TM_ATTACHMENT_CATALOG,
} from '@/tm/projectAttachments'
import { resegmentProjectRecord } from '@/tm/resegment'
import {
  SEGMENT_SCHEMA_DATE_SAFE,
  type ProjectMeta,
  type ProjectTmAttachmentId,
} from '@/types/project'

const props = defineProps<{
  project: ProjectMeta
  glow?: boolean
  /** Fallback when project meta has no langs yet (e.g. job hub). */
  sourceLang?: string
  targetLang?: string
}>()

const emit = defineEmits<{
  changed: []
  notice: [message: string]
  error: [message: string]
}>()

const { t, locale } = useI18n()
const busy = ref(false)
const pending = ref<'delete' | 'resegment' | null>(null)
/** Inline resegment button feedback: spinner → check → idle. */
const resegmentFlash = ref<'spin' | 'ok' | null>(null)
const basesOpen = ref(false)
const collectionOpen = ref(false)
const collectionMode = ref<'pick' | 'browse'>('pick')
const collectionReturnTo = ref<'project' | null>(null)
const personalTmCount = ref(0)
const personalTmUpdatedAt = ref<string | null>(null)
const tipId = ref<ProjectTmAttachmentId | null>(null)
const tipX = ref(0)
const tipY = ref(0)
const tipPlacement = ref<'top' | 'bottom'>('bottom')

const tipAttachment = computed(() =>
  tipId.value ? tmAttachments.value.find(item => item.id === tipId.value) ?? null : null,
)

const langPairText = computed(() => {
  const source = props.project.sourceLang || props.sourceLang
  const target = props.project.targetLang || props.targetLang
  if (!source && !target) return ''
  return langPairLabel(source, target)
})
const tmAttachments = computed(() => normalizeProjectTmAttachments(props.project))
const attachedIds = computed(() => tmAttachments.value.map(item => item.id))

function tmColor(id: ProjectTmAttachmentId) {
  return colorForTmBase(id)
}

function tmGlyph(id: ProjectTmAttachmentId) {
  return TM_ATTACHMENT_CATALOG.find(entry => entry.id === id)?.glyph || 'tm'
}

function tmLabel(id: ProjectTmAttachmentId) {
  return id === PERSONAL_TM_ATTACHMENT_ID
    ? t('projects.tmPersonalBase')
    : (TM_ATTACHMENT_CATALOG.find(entry => entry.id === id)?.label ?? id)
}

function tmShortName(id: ProjectTmAttachmentId) {
  const label = tmLabel(id)
  return label.length > 8 ? `${label.slice(0, 7)}…` : label
}

async function refreshPersonalTmStats() {
  if (!tmAttachments.value.some(item => item.id === PERSONAL_TM_ATTACHMENT_ID)) {
    personalTmCount.value = 0
    personalTmUpdatedAt.value = null
    return
  }
  try {
    const stats = await getPersonalTmStats()
    personalTmCount.value = stats.count
    personalTmUpdatedAt.value = stats.lastUpdatedAt
  } catch {
    personalTmCount.value = 0
    personalTmUpdatedAt.value = null
  }
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

function personalLastUpdatedText(short = false) {
  if (!personalTmUpdatedAt.value) return t('projects.tmLastUpdatedNever')
  const date = formatTmDate(personalTmUpdatedAt.value, short)
  return short ? t('projects.tmLastUpdatedShort', { date }) : t('projects.tmLastUpdated', { date })
}

function showChipTip(event: MouseEvent, id: ProjectTmAttachmentId) {
  const el = event.currentTarget as HTMLElement
  const rect = el.getBoundingClientRect()
  const spaceBelow = window.innerHeight - rect.bottom
  const preferBottom = spaceBelow >= 160 || rect.top < 96
  tipPlacement.value = preferBottom ? 'bottom' : 'top'
  tipX.value = rect.left + rect.width / 2
  tipY.value = preferBottom ? rect.bottom : rect.top
  tipId.value = id
}

function hideChipTip() {
  tipId.value = null
}

watch(
  tmAttachments,
  () => {
    void refreshPersonalTmStats()
  },
  { immediate: true },
)

onMounted(() => {
  void refreshPersonalTmStats()
})

function openBases() {
  // Empty list → straight to add menu; otherwise manage attached bases.
  if (tmAttachments.value.length === 0) {
    openPick()
    return
  }
  basesOpen.value = true
}

function openPick() {
  basesOpen.value = false
  collectionMode.value = 'pick'
  collectionReturnTo.value = 'project'
  collectionOpen.value = true
}

function openFullFromPick() {
  collectionMode.value = 'browse'
  collectionReturnTo.value = 'project'
}

function onCollectionClose() {
  collectionOpen.value = false
  if (collectionReturnTo.value === 'project') {
    basesOpen.value = true
  }
  collectionReturnTo.value = null
}

async function updateTmAttachments(change: (meta: ProjectMeta) => ProjectMeta['tmAttachments']) {
  emit('error', '')
  try {
    const record = await getProject(props.project.id)
    if (!record) throw new Error(t('editor.projectNotFound'))
    record.meta.tmAttachments = change(record.meta)
    await saveProject(record)
    emit('changed')
    return true
  } catch (err) {
    emit('error', err instanceof Error ? err.message : String(err))
    return false
  }
}

async function onAttach(id: ProjectTmAttachmentId) {
  if (!(await updateTmAttachments(meta => attachProjectTm(meta, id)))) return
  collectionOpen.value = false
  collectionReturnTo.value = null
  basesOpen.value = true
  void refreshPersonalTmStats()
}

function onTmListChanged() {
  emit('changed')
  void refreshPersonalTmStats()
}

function onTmDeleted() {
  emit('changed')
  void refreshPersonalTmStats()
}

function formatDate(iso: string) {
  try {
    return new Date(iso).toLocaleString()
  } catch {
    return iso
  }
}

function cancelPending() {
  pending.value = null
}

async function copyProjectName() {
  const name = props.project.name.trim()
  if (!name) return
  try {
    await navigator.clipboard.writeText(name)
  } catch {
    emit('error', t('projects.copyNameFailed'))
  }
}

async function confirmRemove() {
  await deleteProject(props.project.id)
  pending.value = null
  emit('changed')
}

function sleep(ms: number) {
  return new Promise<void>(resolve => {
    setTimeout(resolve, ms)
  })
}

async function confirmResegment() {
  busy.value = true
  pending.value = null
  resegmentFlash.value = 'spin'
  emit('error', '')
  emit('notice', '')
  const started = Date.now()
  try {
    const record = await getProject(props.project.id)
    if (!record) throw new Error('Project not found')
    const { segments, ambiguousCount } = await resegmentProjectRecord(record)
    record.segments = segments
    record.meta.segmentSchemaVersion = SEGMENT_SCHEMA_DATE_SAFE
    record.meta.segmentCount = segments.length
    await saveProject(record)
    emit('changed')
    if (ambiguousCount > 0) {
      emit(
        'notice',
        t('projects.resegmentAmbiguous', { name: props.project.name, n: ambiguousCount })
      )
    }
    const elapsed = Date.now() - started
    if (elapsed < 1000) await sleep(1000 - elapsed)
    resegmentFlash.value = 'ok'
    await sleep(500)
  } catch (err) {
    emit('error', err instanceof Error ? err.message : String(err))
  } finally {
    resegmentFlash.value = null
    busy.value = false
  }
}

async function restoreFromCloud() {
  const local = await getProject(props.project.id)
  if (local && !window.confirm(t('projects.restoreCloudOverwrite', { name: props.project.name }))) {
    return
  }
  busy.value = true
  emit('error', '')
  emit('notice', '')
  try {
    const bytes = await getProjectBackup(props.project.id)
    const record = await unpackProjectFile(bytes)
    await saveProject(record)
    emit('changed')
    emit('notice', t('projects.restoreCloudOk', { name: record.meta.name || props.project.name }))
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) {
      emit('error', t('projects.restoreCloudMissing'))
    } else {
      emit('error', err instanceof Error ? err.message : String(err))
    }
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <li class="item" :class="{ 'job-related-glow': glow }">
    <div class="item-main">
      <div class="tm-head" @click.stop>
        <div class="tm-strip">
          <div
            v-for="attachment in tmAttachments"
            :key="attachment.id"
            class="tm-chip-wrap"
            :style="{ '--tm-color': tmColor(attachment.id) }"
            @mouseenter="showChipTip($event, attachment.id)"
            @mouseleave="hideChipTip"
            @focusin="showChipTip($event as MouseEvent, attachment.id)"
            @focusout="hideChipTip"
          >
            <button
              type="button"
              class="tm-chip"
              :aria-label="tmLabel(attachment.id)"
            >
              <EditorGlyph class="tm-icon" :name="tmGlyph(attachment.id)" />
              <span
                class="tm-rw"
                :class="{ on: attachment.canRead }"
                :title="t('projects.tmPermRead')"
              >{{ t('projects.tmPermReadShort') }}</span>
              <span
                class="tm-rw"
                :class="{ on: attachment.canWrite }"
                :title="t('projects.tmPermWrite')"
              >{{ t('projects.tmPermWriteShort') }}</span>
              <span class="tm-name">{{ tmShortName(attachment.id) }}</span>
            </button>
          </div>
          <button
            type="button"
            class="tm-chip-add"
            :title="t('projects.tmOpenPicker')"
            :aria-label="t('projects.tmOpenPicker')"
            :disabled="busy"
            @click="openBases"
          >
            <EditorGlyph class="tm-icon" name="plus" />
          </button>
        </div>
      </div>
      <router-link class="item-link" :to="{ name: 'editor', params: { id: project.id } }">
        <span class="name">{{ project.name }}</span>
        <span class="sub">
          <template v-if="langPairText">{{ langPairText }} · </template>
          {{ t('projects.segments', { done: project.doneCount, total: project.segmentCount }) }}
          ·
          {{ t('projects.updated', { date: formatDate(project.updatedAt) }) }}
        </span>
      </router-link>
    </div>
    <div class="item-actions" @click.stop>
      <template v-if="pending === 'resegment'">
        <div class="action-confirm">
          <IconButton
            :title="t('projects.confirmResegment', { name: project.name })"
            :disabled="busy"
            @click="confirmResegment"
          >
            <EditorGlyph name="check" />
          </IconButton>
          <IconButton :title="t('projects.deleteCancel')" @click="cancelPending">
            <EditorGlyph name="close" />
          </IconButton>
        </div>
      </template>
      <template v-else-if="pending === 'delete'">
        <div class="action-confirm">
          <IconButton
            danger
            :title="t('projects.confirmDelete', { name: project.name })"
            @click="confirmRemove"
          >
            <EditorGlyph name="check" />
          </IconButton>
          <IconButton :title="t('projects.deleteCancel')" @click="cancelPending">
            <EditorGlyph name="close" />
          </IconButton>
        </div>
      </template>
      <template v-else>
        <IconButton :title="t('projects.copyNameHint')" :disabled="busy" @click="copyProjectName">
          <EditorGlyph name="clipboard" />
        </IconButton>
        <IconButton
          :title="t('projects.restoreCloudHint')"
          :disabled="busy"
          @click="restoreFromCloud"
        >
          <EditorGlyph name="cloud-download" />
        </IconButton>
        <IconButton
          class="resegment-btn"
          :class="{
            'resegment-btn--spin': resegmentFlash === 'spin',
            'resegment-btn--ok': resegmentFlash === 'ok',
          }"
          :title="t('projects.resegment')"
          :disabled="busy"
          @click="pending = 'resegment'"
        >
          <EditorGlyph v-if="resegmentFlash === 'spin'" class="glyph-spin" name="spinner" />
          <EditorGlyph v-else-if="resegmentFlash === 'ok'" name="check" />
          <EditorGlyph v-else name="resegment" />
        </IconButton>
        <IconButton
          danger
          :title="t('projects.delete')"
          :disabled="busy"
          @click="pending = 'delete'"
        >
          <EditorGlyph name="trash" />
        </IconButton>
      </template>
    </div>
    <ProjectTmBasesDialog
      :open="basesOpen"
      :project="project"
      @close="basesOpen = false"
      @changed="onTmListChanged"
      @error="emit('error', $event)"
      @open-pick="openPick"
    />
    <TmCollectionDialog
      :open="collectionOpen"
      :mode="collectionMode"
      :return-to="collectionReturnTo"
      :attached-ids="attachedIds"
      :context-label="project.name"
      @close="onCollectionClose"
      @attach="onAttach"
      @deleted="onTmDeleted"
      @open-full="openFullFromPick"
      @error="emit('error', $event)"
    />
    <Teleport to="body">
      <div
        v-if="tipAttachment"
        class="tm-tip"
        :class="`tm-tip--${tipPlacement}`"
        role="tooltip"
        :style="{
          '--tm-color': tmColor(tipAttachment.id),
          left: `${tipX}px`,
          top: `${tipY}px`,
        }"
      >
        <div class="tm-tip-head">
          <EditorGlyph class="tm-tip-icon" :name="tmGlyph(tipAttachment.id)" />
          <strong>{{ tmLabel(tipAttachment.id) }}</strong>
        </div>
        <div class="tm-tip-row">
          <span class="tm-tip-key" :class="{ on: tipAttachment.canRead }">{{
            t('projects.tmPermReadShort')
          }}</span>
          <span class="tm-tip-label">{{ t('projects.tmPermRead') }}</span>
          <span class="tm-tip-state" :class="{ on: tipAttachment.canRead }">
            {{ tipAttachment.canRead ? t('projects.tmPermOn') : t('projects.tmPermOff') }}
          </span>
        </div>
        <div class="tm-tip-row">
          <span class="tm-tip-key" :class="{ on: tipAttachment.canWrite }">{{
            t('projects.tmPermWriteShort')
          }}</span>
          <span class="tm-tip-label">{{ t('projects.tmPermWrite') }}</span>
          <span class="tm-tip-state" :class="{ on: tipAttachment.canWrite }">
            {{ tipAttachment.canWrite ? t('projects.tmPermOn') : t('projects.tmPermOff') }}
          </span>
        </div>
        <template v-if="tipAttachment.id === PERSONAL_TM_ATTACHMENT_ID">
          <div class="tm-tip-meta">{{ t('projects.tmUnitsStat', { n: personalTmCount }) }}</div>
          <div class="tm-tip-meta">{{ personalLastUpdatedText(false) }}</div>
        </template>
        <p class="tm-tip-hint">{{ t('projects.tmChipTipHint') }}</p>
      </div>
    </Teleport>
  </li>
</template>

<style scoped lang="scss">
.item {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  background: var(--surface-soft);
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 0.5rem 0.35rem 0.5rem 0.65rem;
  margin-bottom: 0.45rem;
  overflow: visible;
  transition:
    background 0.15s ease,
    border-color 0.15s ease,
    box-shadow 0.2s ease;
}

.item:hover {
  background: var(--surface);
  border-color: var(--border-strong);
}

.item.job-related-glow {
  border-color: color-mix(in srgb, var(--accent) 70%, var(--border-strong));
  background: color-mix(in srgb, var(--accent) 10%, var(--surface));
  box-shadow:
    0 0 0 1px color-mix(in srgb, var(--accent) 35%, transparent),
    0 0 14px color-mix(in srgb, var(--accent) 28%, transparent),
    0 0 28px color-mix(in srgb, var(--accent) 14%, transparent);
}

.item-main {
  flex: 1 1 auto;
  min-width: 0;
  overflow: visible;
}

.tm-head {
  margin-bottom: 0.2rem;
  overflow: visible;
}

.tm-strip {
  flex: 0 1 50%;
  max-width: 50%;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 0.15rem;
  overflow: visible;
}

.tm-chip-wrap {
  position: relative;
  flex: 0 0 auto;
}

.tm-chip {
  display: inline-flex;
  align-items: center;
  gap: 0.22rem;
  border: 0;
  background: transparent;
  color: var(--text);
  border-radius: 6px;
  padding: 0.1rem 0.2rem;
  font: inherit;
  font-size: 0.66rem;
  line-height: 1;
  cursor: default;
}

.tm-chip:hover {
  background: color-mix(in srgb, var(--tm-color) 10%, transparent);
}

.tm-chip-add {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 auto;
  width: 1.35rem;
  height: 1.35rem;
  border: 0;
  border-radius: 6px;
  padding: 0;
  background: transparent;
  color: var(--text-muted);
  cursor: pointer;
}

.tm-chip-add:hover:not(:disabled) {
  color: var(--accent);
}

.tm-chip-add:disabled {
  opacity: 0.45;
  cursor: default;
}

.tm-name {
  max-width: 4.5rem;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--text-muted);
  font-weight: 600;
  line-height: 1;
}

.tm-rw {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  height: 0.9rem;
  font-weight: 700;
  line-height: 1;
  color: var(--text-muted);
  opacity: 0.38;
  filter: grayscale(0.35);
}

.tm-rw.on {
  color: var(--accent);
  opacity: 1;
  filter: none;
  text-shadow:
    0 0 6px color-mix(in srgb, var(--accent) 70%, transparent),
    0 0 12px color-mix(in srgb, var(--accent) 35%, transparent);
}

.tm-icon {
  display: block;
  width: 0.8rem;
  height: 0.8rem;
  color: var(--tm-color, var(--accent));
  flex: 0 0 auto;
}

.tm-chip-add .tm-icon {
  color: inherit;
}

.tm-tip {
  position: fixed;
  z-index: 10050;
  min-width: 11.5rem;
  padding: 0.55rem 0.65rem 0.5rem;
  border-radius: 10px;
  border: 1px solid color-mix(in srgb, var(--tm-color) 35%, var(--border));
  background: color-mix(in srgb, var(--surface) 94%, var(--tm-color));
  box-shadow:
    0 10px 28px rgba(0, 0, 0, 0.28),
    0 0 0 1px color-mix(in srgb, var(--accent) 12%, transparent),
    0 0 18px color-mix(in srgb, var(--accent) 18%, transparent);
  color: var(--text);
  pointer-events: none;
  transform: translate(-50%, 0.4rem);
}

.tm-tip--top {
  transform: translate(-50%, calc(-100% - 0.4rem));
}

.tm-tip--bottom {
  transform: translate(-50%, 0.4rem);
}

.tm-tip-head {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  margin-bottom: 0.45rem;

  strong {
    font-size: 0.78rem;
    font-weight: 700;
    line-height: 1.25;
  }
}

.tm-tip-icon {
  width: 0.95rem;
  height: 0.95rem;
  color: var(--tm-color);
  flex: 0 0 auto;
}

.tm-tip-row {
  display: grid;
  grid-template-columns: 1.1rem minmax(0, 1fr) auto;
  align-items: center;
  gap: 0.35rem;
  margin-top: 0.22rem;
  font-size: 0.72rem;
}

.tm-tip-key {
  font-weight: 800;
  color: var(--text-muted);
  opacity: 0.4;
}

.tm-tip-key.on {
  color: var(--accent);
  opacity: 1;
  text-shadow:
    0 0 6px color-mix(in srgb, var(--accent) 65%, transparent),
    0 0 12px color-mix(in srgb, var(--accent) 30%, transparent);
}

.tm-tip-label {
  color: var(--text-muted);
}

.tm-tip-state {
  color: var(--text-muted);
  opacity: 0.55;
  font-variant-numeric: tabular-nums;
}

.tm-tip-state.on {
  color: var(--accent);
  opacity: 1;
}

.tm-tip-meta {
  margin-top: 0.28rem;
  font-size: 0.7rem;
  color: var(--text-muted);
  line-height: 1.3;
}

.tm-tip-hint {
  margin: 0.45rem 0 0;
  font-size: 0.66rem;
  color: var(--text-muted);
  line-height: 1.3;
}

.item-link {
  flex: 1 1 auto;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
  text-decoration: none;
  color: inherit;
}

.name {
  font-weight: 600;
  color: var(--text);
  min-width: 0;
}

.sub {
  font-size: 0.85rem;
  color: var(--text-muted);
}

.item-actions {
  flex: 0 0 auto;
  display: inline-flex;
  align-items: center;
  gap: 0.05rem;
}

.action-confirm {
  display: inline-flex;
  align-items: center;
  gap: 0.05rem;
}

:deep(.glyph-spin) {
  animation: resegment-spin 0.7s linear infinite;
}

:deep(.resegment-btn.resegment-btn--spin),
:deep(.resegment-btn.resegment-btn--spin:disabled) {
  color: #4db8ff !important;
  opacity: 1;
}

:deep(.resegment-btn.resegment-btn--ok),
:deep(.resegment-btn.resegment-btn--ok:disabled) {
  color: #3dd68c !important;
  opacity: 1;
}

@keyframes resegment-spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
