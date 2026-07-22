<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import EditorGlyph from '@/components/EditorGlyph.vue'
import { listGlossaryTerms, putGlossaryTerm } from '@/storage/glossaryIdb'
import {
  PERSONAL_GLOSSARY_BASE_ID,
  createGlossaryBase,
  deleteGlossaryBase,
  listGlossaryBases,
  type GlossaryBaseRecord,
} from '@/storage/glossaryBasesIdb'
import { markGlossaryDirty } from '@/glossary/sync'
import { parseTbx } from '@/glossary/tbx'

const props = defineProps<{ open: boolean; mode: 'pick' | 'browse'; attachedIds: string[] }>()
const emit = defineEmits<{ close: []; attach: [id: string]; changed: []; 'open-full': [] }>()
const { t } = useI18n()
const bases = ref<GlossaryBaseRecord[]>([])
const counts = ref<Record<string, number>>({})
const panel = ref<'list' | 'create' | 'import'>('list')
const name = ref('')
const targetId = ref(PERSONAL_GLOSSARY_BASE_ID)
const fileInput = ref<HTMLInputElement | null>(null)
const file = ref<File | null>(null)
const busy = ref(false)

async function refresh() {
  bases.value = await listGlossaryBases()
  counts.value = Object.fromEntries(
    await Promise.all(bases.value.map(async base => [base.id, (await listGlossaryTerms({ baseIds: [base.id] })).length])),
  )
  if (!bases.value.some(base => base.id === targetId.value)) targetId.value = PERSONAL_GLOSSARY_BASE_ID
}
watch(() => props.open, open => { if (open) void refresh(); else panel.value = 'list' }, { immediate: true })
function attached(id: string) { return props.attachedIds.includes(id) }
async function create() {
  if (!name.value.trim()) return
  busy.value = true
  try { await createGlossaryBase({ label: name.value.trim() }); name.value = ''; panel.value = 'list'; await refresh(); emit('changed') }
  finally { busy.value = false }
}
async function importTbx() {
  if (!file.value) return
  busy.value = true
  try {
    const terms = parseTbx(await file.value.text())
    const ids: string[] = []
    for (const term of terms) { const id = crypto.randomUUID(); await putGlossaryTerm({ ...term, id, baseId: targetId.value }); ids.push(id) }
    markGlossaryDirty(...ids)
    file.value = null; panel.value = 'list'; await refresh(); emit('changed')
  } finally { busy.value = false }
}
async function remove(id: string) {
  if (!window.confirm(t('glossary.collectionDeleteConfirm'))) return
  await deleteGlossaryBase(id); await refresh(); emit('changed')
}
const title = computed(() => props.mode === 'pick' ? t('glossary.collectionPickTitle') : t('glossary.collectionTitle'))
</script>

<template>
  <div v-if="open" class="backdrop" @click.self="emit('close')">
    <section class="dialog" role="dialog" aria-modal="true" :aria-label="title">
      <header><h2>{{ title }}</h2><button type="button" @click="emit('close')"><EditorGlyph name="close" /></button></header>
      <p v-if="mode === 'pick'">{{ t('glossary.collectionPickHint') }}</p>
      <div v-if="mode === 'browse' && panel === 'list'" class="toolbar">
        <button type="button" @click="panel = 'create'">{{ t('glossary.collectionCreate') }}</button>
        <button type="button" @click="panel = 'import'">{{ t('glossary.importTbx') }}</button>
      </div>
      <form v-if="panel === 'create'" class="form" @submit.prevent="create">
        <input v-model="name" :placeholder="t('glossary.collectionName')" />
        <button type="submit" :disabled="busy || !name.trim()">{{ t('glossary.collectionCreate') }}</button>
      </form>
      <form v-else-if="panel === 'import'" class="form" @submit.prevent="importTbx">
        <select v-model="targetId"><option v-for="base in bases" :key="base.id" :value="base.id">{{ base.label }}</option></select>
        <input ref="fileInput" type="file" accept=".tbx,.xml,application/xml,text/xml" @change="file = ($event.target as HTMLInputElement).files?.[0] ?? null" />
        <button type="submit" :disabled="busy || !file">{{ t('glossary.importTbx') }}</button>
      </form>
      <div v-else class="bases">
        <article v-for="base in bases" :key="base.id" :class="{ attached: attached(base.id) }" @click="mode === 'pick' && !attached(base.id) && emit('attach', base.id)">
          <span class="color" :style="{ background: base.color }" /><strong>{{ base.label }}</strong><small>{{ t('glossary.collectionCount', { count: counts[base.id] ?? 0 }) }}</small>
          <span v-if="attached(base.id)">{{ t('glossary.collectionAttached') }}</span>
          <button v-if="mode === 'browse'" type="button" @click.stop="remove(base.id)">{{ t('glossary.delete') }}</button>
        </article>
      </div>
      <footer><button v-if="mode === 'pick'" type="button" @click="emit('open-full')">{{ t('glossary.collectionManage') }}</button><button type="button" @click="emit('close')">{{ t('glossary.close') }}</button></footer>
    </section>
  </div>
</template>

<style scoped lang="scss">
.backdrop{position:fixed;inset:0;z-index:86;display:grid;place-items:center;padding:1rem;background:color-mix(in srgb,#000 45%,transparent)}.dialog{width:min(38rem,100%);max-height:calc(100vh - 2rem);overflow:auto;padding:1rem;border-radius:12px;background:var(--surface);color:var(--text)}header,footer,.toolbar,article{display:flex;align-items:center;gap:.6rem}header{justify-content:space-between}h2{margin:0;font-size:1.1rem}.toolbar,footer{margin-top:1rem;justify-content:flex-end}.bases{display:grid;gap:.5rem;margin-top:.75rem}article{padding:.7rem;border:1px solid var(--border);border-radius:8px;background:var(--surface-2);cursor:pointer}article.attached{opacity:.7}.color{width:.8rem;height:.8rem;border-radius:50%}small{color:var(--text-muted)}article small{margin-left:auto}.form{display:grid;gap:.6rem;margin-top:1rem}button,input,select{font:inherit}
</style>
