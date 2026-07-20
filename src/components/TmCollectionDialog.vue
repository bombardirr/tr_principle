<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import EditorGlyph from '@/components/EditorGlyph.vue'
import { listProjects } from '@/storage/idb'
import { listTmUnits } from '@/storage/tmIdb'
import { PERSONAL_TM_ATTACHMENT_ID, type TmAttachmentCatalogItem } from '@/tm/projectAttachments'
import { deleteOwnPersonalTm, ensureDefaultTmInCatalog } from '@/tm/tmCollection'
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

const { t } = useI18n()
const busy = ref(false)
const unitCount = ref(0)
const projectCount = ref(0)
const jobCount = ref(0)
const confirmDelete = ref(false)
const catalog = computed(() => ensureDefaultTmInCatalog())

const title = computed(() =>
  props.mode === 'pick' ? t('tmCollection.pickTitle') : t('tmCollection.title')
)
const hint = computed(() =>
  props.mode === 'pick' ? t('tmCollection.pickHint') : t('tmCollection.hint')
)

watch(
  () => props.open,
  async open => {
    if (!open) {
      confirmDelete.value = false
      return
    }
    try {
      unitCount.value = (await listTmUnits()).length
    } catch {
      unitCount.value = 0
    }
  },
  { immediate: true }
)

function itemLabel(item: TmAttachmentCatalogItem) {
  return item.id === PERSONAL_TM_ATTACHMENT_ID ? t('projects.tmPersonalBase') : item.label
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

async function openDeleteConfirm() {
  if (busy.value) return
  busy.value = true
  emit('error', '')
  try {
    const [units, projects] = await Promise.all([listTmUnits(), listProjects()])
    unitCount.value = units.length
    projectCount.value = projects.filter(project =>
      project.tmAttachments?.some(item => item.id === PERSONAL_TM_ATTACHMENT_ID)
    ).length
    jobCount.value = countAttachedJobs(PERSONAL_TM_ATTACHMENT_ID)
    confirmDelete.value = true
  } catch (err) {
    emit('error', err instanceof Error ? err.message : String(err))
  } finally {
    busy.value = false
  }
}

async function onConfirmDelete() {
  if (busy.value) return
  busy.value = true
  emit('error', '')
  try {
    await deleteOwnPersonalTm()
    unitCount.value = 0
    projectCount.value = 0
    jobCount.value = 0
    confirmDelete.value = false
    emit('deleted')
  } catch (err) {
    emit('error', err instanceof Error ? err.message : String(err))
  } finally {
    busy.value = false
  }
}
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

      <div class="catalog" :class="{ 'catalog-pick': mode === 'pick' }">
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
            <span v-if="mode === 'browse'" class="stat">
              {{ t('projects.tmUnitsStat', { n: unitCount }) }}
            </span>
          </div>
          <span v-if="isAttached(item.id)" class="attached-mark">
            <EditorGlyph name="check" />
            {{ t('tmCollection.attached') }}
          </span>
          <button
            v-if="mode === 'browse' && item.id === PERSONAL_TM_ATTACHMENT_ID"
            type="button"
            class="danger ghost"
            :disabled="busy"
            @click.stop="openDeleteConfirm"
          >
            <EditorGlyph name="trash" />
            {{ t('tmCollection.delete') }}
          </button>
        </article>
      </div>

      <div v-if="mode === 'browse' && confirmDelete" class="confirm" role="alertdialog">
        <h3>{{ t('tmCollection.deleteConfirmTitle') }}</h3>
        <p>
          {{
            t('tmCollection.deleteConfirmBody', {
              name: t('projects.tmPersonalBase'),
              units: unitCount,
              projects: projectCount,
              jobs: jobCount,
            })
          }}
        </p>
        <div class="confirm-actions">
          <button type="button" class="ghost" :disabled="busy" @click="confirmDelete = false">
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
.confirm-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
}

.title,
.confirm h3 {
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
  justify-content: center;
  min-height: 8.5rem;
  text-align: center;
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
