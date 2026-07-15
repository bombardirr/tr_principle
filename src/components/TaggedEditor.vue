<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type { RunSpan } from '@/types/project'
import { lookForTag } from '@/docx/tagLook'
import { stripMarkers } from '@/docx/tags'
import AppTooltip from '@/components/AppTooltip.vue'
import { useAnchoredTooltip } from '@/composables/useAnchoredTooltip'

const props = withDefaults(
  defineProps<{
    modelValue: string
    spans?: RunSpan[]
    locale?: string
    placeholder?: string
    /** Defaults to true — Vue Boolean props are false when omitted. */
    editable?: boolean
    /** When false (default), hide `{n}` chips and show plain text. */
    showMarkers?: boolean
  }>(),
  { editable: true, showMarkers: false },
)

const emit = defineEmits<{
  'update:modelValue': [value: string]
}>()

/** Empty mount point — Vue must not put siblings here or it will wipe the editor. */
const host = ref<HTMLElement | null>(null)
let editor: HTMLDivElement | null = null
let focused = false
let hideTimer: ReturnType<typeof setTimeout> | null = null

const { tip, tooltipRef, showAtAnchor, hide: hideTip } = useAnchoredTooltip()

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/** What the editor shows / what fromDom returns while typing (markers stripped if hidden). */
function displayText(text: string): string {
  return props.showMarkers ? text : stripMarkers(text)
}

function toHtml(text: string): string {
  const shown = displayText(text)
  if (!shown) return '<br>'
  if (!props.showMarkers) {
    return escapeHtml(shown)
  }
  const locale = props.locale ?? 'ru'
  return shown
    .split(/(\{\d+\})/)
    .map((part) => {
      if (/^\{\d+\}$/.test(part)) {
        const look = lookForTag(part, props.spans, locale)
        return `<span class="tag" data-tag="${escapeHtml(part)}" data-tip="${escapeHtml(look.title)}" contenteditable="false">${escapeHtml(look.symbol)}</span>`
      }
      return escapeHtml(part)
    })
    .join('')
}

function fromDom(el: HTMLElement): string {
  const raw = el.innerText.replace(/\n$/, '')
  // empty editor often keeps a lone newline from <br>
  if (!raw.trim()) return ''

  let out = ''
  el.childNodes.forEach((node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      out += node.textContent ?? ''
      return
    }
    if (node.nodeType === Node.ELEMENT_NODE) {
      const e = node as HTMLElement
      if (e.tagName === 'BR') return
      const tag = e.getAttribute('data-tag')
      if (tag) {
        out += tag
        return
      }
      out += fromDom(e)
    }
  })
  return out
}

function syncPlaceholder() {
  if (!editor) return
  const empty = !props.modelValue
  editor.classList.toggle('empty', empty)
  if (props.placeholder) editor.dataset.placeholder = props.placeholder
}

function placeCaretEnd() {
  if (!editor) return
  const sel = window.getSelection()
  if (!sel) return
  const range = document.createRange()
  range.selectNodeContents(editor)
  range.collapse(false)
  sel.removeAllRanges()
  sel.addRange(range)
}

function paint(force = false) {
  if (!editor) return
  // Skip only when the focused DOM already matches what's displayed (user is typing).
  // External updates (e.g. «Взять оригинал») must repaint even while focused.
  if (focused && !force && fromDom(editor) === displayText(props.modelValue)) return
  const next = toHtml(props.modelValue)
  if (editor.innerHTML !== next) {
    editor.innerHTML = next
    if (focused) placeCaretEnd()
  }
  syncPlaceholder()
}

function onInput() {
  if (!editor) return
  emit('update:modelValue', fromDom(editor))
  syncPlaceholder()
}

function onFocus() {
  focused = true
}

function onBlur() {
  focused = false
  onHideTip()
  paint(true)
}

function focus() {
  if (!editor) return
  editor.focus({ preventScroll: true })
  placeCaretEnd()
}

function blur() {
  editor?.blur()
}

/** Force model → DOM (after programmatic target changes). */
function sync() {
  paint(true)
  if (focused) placeCaretEnd()
}

defineExpose({ focus, sync, blur })

async function showTipFor(tag: HTMLElement) {
  if (hideTimer) {
    clearTimeout(hideTimer)
    hideTimer = null
  }
  const text = tag.getAttribute('data-tip') ?? ''
  await showAtAnchor(tag, text)
}

function onHideTip() {
  hideTip()
}

function onOver(e: MouseEvent) {
  const t = e.target
  if (!(t instanceof Element)) return
  const tag = t.closest('.tag')
  if (tag instanceof HTMLElement) showTipFor(tag)
}

function onOut(e: MouseEvent) {
  const t = e.target
  if (!(t instanceof Element)) return
  const tag = t.closest('.tag')
  if (!tag) return
  const related = e.relatedTarget
  if (related instanceof Node && tag.contains(related)) return
  hideTimer = setTimeout(onHideTip, 80)
}

function onScroll() {
  if (tip.value.visible) onHideTip()
}

onMounted(() => {
  if (!host.value) return
  editor = document.createElement('div')
  editor.className = 'tagged-editor'
  editor.spellcheck = true
  editor.tabIndex = 0
  const canEdit = props.editable !== false
  editor.contentEditable = canEdit ? 'true' : 'false'
  editor.classList.toggle('readonly', !canEdit)
  editor.addEventListener('input', onInput)
  editor.addEventListener('focus', onFocus)
  editor.addEventListener('blur', onBlur)
  editor.addEventListener('mouseover', onOver)
  editor.addEventListener('mouseout', onOut)
  host.value.appendChild(editor)
  paint(true)
  window.addEventListener('scroll', onScroll, true)
})

onBeforeUnmount(() => {
  window.removeEventListener('scroll', onScroll, true)
  if (hideTimer) clearTimeout(hideTimer)
  if (editor) {
    editor.removeEventListener('input', onInput)
    editor.removeEventListener('focus', onFocus)
    editor.removeEventListener('blur', onBlur)
    editor.removeEventListener('mouseover', onOver)
    editor.removeEventListener('mouseout', onOut)
    editor.remove()
    editor = null
  }
})

watch(
  () => [props.modelValue, props.spans, props.locale, props.placeholder] as const,
  () => nextTick(() => paint()),
)

watch(
  () => props.showMarkers,
  () => nextTick(() => paint(true)),
)
</script>

<template>
  <div class="tagged-wrap">
    <!-- Keep this node childless in the Vue tree -->
    <div ref="host" class="tagged-host" />
    <AppTooltip
      ref="tooltipRef"
      :text="tip.text"
      :visible="tip.visible"
      :ready="tip.ready"
      :x="tip.x"
      :y="tip.y"
      :placement="tip.placement"
    />
  </div>
</template>

<style scoped>
.tagged-wrap {
  position: relative;
  width: 100%;
  min-height: 4.5rem;
  flex: 1 1 auto;
  display: flex;
  flex-direction: column;
}

.tagged-host {
  flex: 1 1 auto;
  width: 100%;
  min-height: 4.5rem;
}
</style>

<style>
.tagged-editor {
  position: relative;
  white-space: pre-wrap;
  word-break: break-word;
  outline: none;
  min-height: 4.5rem;
  width: 100%;
  height: auto;
  cursor: text;
  color: var(--text);
  font-size: inherit;
  line-height: inherit;
  box-sizing: border-box;
}

.tagged-editor.readonly {
  cursor: default;
}

.tagged-editor.empty:not(:focus)::before {
  content: attr(data-placeholder);
  position: absolute;
  inset: 0;
  color: var(--text-faint);
  pointer-events: none;
  white-space: pre-wrap;
}

.tagged-editor .tag {
  display: inline-block;
  background: var(--tag-bg);
  color: var(--tag-text);
  border-radius: 4px;
  padding: 0 0.28rem;
  margin: 0 0.08rem;
  font-family: ui-monospace, monospace;
  font-size: 0.78em;
  font-weight: 700;
  line-height: 1.35;
  vertical-align: baseline;
  user-select: none;
  cursor: help;
}
</style>
