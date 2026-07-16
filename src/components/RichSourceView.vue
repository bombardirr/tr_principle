<script setup lang="ts">
import { computed, nextTick, onUnmounted, ref, watch } from 'vue'
import type { RunSpan } from '@/types/project'
import type { GlossaryHit } from '@/types/glossary'
import { piecesToHtml, styledPiecesFromTagged, type HtmlMarkRange } from '@/docx/runStyle'
import GlossaryHitsPopover from '@/components/GlossaryHitsPopover.vue'

const props = defineProps<{
  taggedSource: string
  /** Prefer paragraphSpans; fall back to sentence spans. */
  spans?: RunSpan[]
  glossaryHits?: GlossaryHit[]
}>()

const emit = defineEmits<{
  insertGlossary: [payload: { termId: string; targetTerm: string; status: GlossaryHit['status'] }]
}>()

type TipState = {
  hits: GlossaryHit[]
  x: number
  y: number
}

const tip = ref<TipState | null>(null)
const tipEl = ref<HTMLElement | null>(null)
let hideTimer: ReturnType<typeof setTimeout> | null = null

const html = computed(() => {
  const pieces = styledPiecesFromTagged(props.taggedSource, props.spans ?? [])
  const hits = props.glossaryHits ?? []
  if (!hits.length) return piecesToHtml(pieces)
  // One underline per span; keep all variants in props for popovers.
  const seen = new Set<string>()
  const marks: HtmlMarkRange[] = []
  for (const h of hits) {
    const key = `${h.start}:${h.end}`
    if (seen.has(key)) continue
    seen.add(key)
    const group = hits.filter((x) => x.start === h.start && x.end === h.end)
    const primary = group.find((x) => x.status === 'approved') ?? group[0]!
    const allForbidden = group.every((x) => x.status === 'forbidden')
    marks.push({
      start: primary.start,
      end: primary.end,
      className: allForbidden
        ? 'glossary-hit glossary-hit--forbidden'
        : 'glossary-hit',
      attrs: {
        'data-term-id': primary.termId,
        'data-source': primary.sourceTerm,
        'data-target': primary.targetTerm,
        'data-status': allForbidden ? 'forbidden' : 'approved',
      },
    })
  }
  return piecesToHtml(pieces, marks)
})

function clearHideTimer() {
  if (hideTimer) {
    clearTimeout(hideTimer)
    hideTimer = null
  }
}

function scheduleHide() {
  clearHideTimer()
  hideTimer = setTimeout(() => {
    tip.value = null
  }, 180)
}

function hitFromEl(el: HTMLElement): GlossaryHit | null {
  const termId = el.getAttribute('data-term-id') || ''
  const sourceTerm = el.getAttribute('data-source') || el.textContent || ''
  const targetTerm = el.getAttribute('data-target') || ''
  const status = (el.getAttribute('data-status') || 'approved') as GlossaryHit['status']
  if (!termId || !targetTerm) return null
  return {
    start: 0,
    end: 0,
    termId,
    status,
    sourceTerm,
    targetTerm,
  }
}

function showTipFor(el: HTMLElement) {
  const hit = hitFromEl(el)
  if (!hit) return
  const rect = el.getBoundingClientRect()
  const all = props.glossaryHits ?? []
  // All target variants for this source (live props — reflects OK/Ban immediately).
  const bySource = all.filter(
    (h) =>
      h.termId === hit.termId ||
      (!hit.sourceTerm
        ? false
        : h.sourceTerm.toLowerCase() === hit.sourceTerm.toLowerCase()),
  )
  const hits = bySource.length ? bySource : [hit]
  tip.value = {
    hits,
    x: rect.left + rect.width / 2,
    y: rect.bottom + 6,
  }
  nextTick(() => {
    const node = tipEl.value
    if (!node || !tip.value) return
    const tw = node.offsetWidth
    const th = node.offsetHeight
    let left = tip.value.x - tw / 2
    let top = tip.value.y
    left = Math.max(8, Math.min(left, window.innerWidth - tw - 8))
    if (top + th > window.innerHeight - 8) {
      top = rect.top - th - 6
    }
    tip.value = { ...tip.value, x: left, y: top }
  })
}

function onMouseOver(e: MouseEvent) {
  const el = (e.target as HTMLElement | null)?.closest?.('.glossary-hit') as HTMLElement | null
  if (!el) return
  clearHideTimer()
  showTipFor(el)
}

function onMouseOut(e: MouseEvent) {
  const related = e.relatedTarget as Node | null
  const fromHit = (e.target as HTMLElement | null)?.closest?.('.glossary-hit')
  if (!fromHit) return
  if (related && (fromHit.contains(related) || tipEl.value?.contains(related))) return
  scheduleHide()
}

function onClick(e: MouseEvent) {
  const el = (e.target as HTMLElement | null)?.closest?.('.glossary-hit') as HTMLElement | null
  if (!el) return
  const hit = hitFromEl(el)
  if (!hit) return
  const variants = (props.glossaryHits ?? []).filter(
    (h) =>
      h.termId === hit.termId ||
      h.sourceTerm.toLowerCase() === hit.sourceTerm.toLowerCase(),
  )
  // Multiple variants → open tip to pick; single forbidden → tip only.
  if (variants.length > 1 || hit.status === 'forbidden') {
    showTipFor(el)
    return
  }
  const live = variants[0] ?? hit
  if (live.status === 'forbidden') {
    showTipFor(el)
    return
  }
  emit('insertGlossary', {
    termId: live.termId,
    targetTerm: live.targetTerm,
    status: live.status,
  })
}

function onPick(hit: GlossaryHit) {
  if (hit.status === 'forbidden') return
  emit('insertGlossary', {
    termId: hit.termId,
    targetTerm: hit.targetTerm,
    status: hit.status,
  })
  tip.value = null
}

/** Keep open hover tip in sync when glossary status changes (e.g. OK/Ban toggle). */
watch(
  () => props.glossaryHits,
  (hits) => {
    if (!tip.value) return
    const sources = new Set(
      tip.value.hits.map((h) => h.sourceTerm.toLowerCase()),
    )
    const next = (hits ?? []).filter((h) => sources.has(h.sourceTerm.toLowerCase()))
    tip.value = next.length ? { ...tip.value, hits: next } : null
  },
)

onUnmounted(() => {
  clearHideTimer()
})
</script>

<template>
  <div
    class="rich-source"
    v-html="html || '&nbsp;'"
    @click="onClick"
    @mouseover="onMouseOver"
    @mouseout="onMouseOut"
  />
  <Teleport to="body">
    <div v-if="tip" ref="tipEl">
      <GlossaryHitsPopover
        fixed
        :hits="tip.hits"
        :x="tip.x"
        :y="tip.y"
        @pick="onPick"
        @panel-enter="clearHideTimer"
        @panel-leave="scheduleHide"
      />
    </div>
  </Teleport>
</template>

<style scoped lang="scss">
.rich-source {
  font: inherit;
  color: inherit;
  white-space: pre-wrap;
  word-break: break-word;
  min-height: 1.2em;
  line-height: inherit;
  user-select: text;
  cursor: text;
}

.rich-source :deep(.rs-b) {
  font-weight: 700;
}
.rich-source :deep(.rs-i) {
  font-style: italic;
}
.rich-source :deep(.rs-u) {
  text-underline-offset: 0.12em;
}
.rich-source :deep(.rs-strike) {
  /* line-through via inline style */
}
.rich-source :deep(.rs-sup) {
  vertical-align: super;
  font-size: 0.75em;
}
.rich-source :deep(.rs-sub) {
  vertical-align: sub;
  font-size: 0.75em;
}

.rich-source :deep(.glossary-hit) {
  background: none;
  color: inherit;
  border-radius: 0;
  padding: 0;
  cursor: pointer;
  text-decoration-line: underline;
  text-decoration-style: solid;
  text-decoration-thickness: 2px;
  text-decoration-color: color-mix(in srgb, var(--accent) 85%, transparent);
  text-underline-offset: 0.18em;
  text-decoration-skip-ink: none;
}

.rich-source :deep(.glossary-hit--forbidden) {
  text-decoration-style: wavy;
  text-decoration-color: var(--danger);
  cursor: help;
}
</style>
