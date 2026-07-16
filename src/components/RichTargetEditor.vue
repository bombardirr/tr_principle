<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type { TargetStyleRange } from '@/types/project'
import {
  hasVisualStyle,
  piecesToHtml,
  rangePropsFromStyle,
  shiftTargetStyles,
  styledPiecesFromTarget,
  type RunStyle,
} from '@/docx/runStyle'

const props = withDefaults(
  defineProps<{
    modelValue: string
    styles?: TargetStyleRange[]
    placeholder?: string
    /** Defaults to true — Vue Boolean props are false when omitted without a default. */
    editable?: boolean
  }>(),
  { editable: true },
)

const emit = defineEmits<{
  change: [payload: { target: string; styles: TargetStyleRange[] }]
  'selection-change': [range: { start: number; end: number; collapsed?: boolean } | null]
}>()

const editorRef = ref<HTMLDivElement | null>(null)
let focused = false
let painting = false
let lastPlain = ''
let lastStylesKey = ''

function stylesKey(styles: TargetStyleRange[] | undefined): string {
  return JSON.stringify(styles ?? [])
}

/** Match caret/style walks — innerText can diverge (br / CSS). */
function plainFromDom(el: HTMLElement): string {
  return el.textContent ?? ''
}

function markPainted() {
  lastPlain = props.modelValue
  lastStylesKey = stylesKey(props.styles)
}

function placeCaretEnd() {
  const editor = editorRef.value
  if (!editor) return
  const sel = window.getSelection()
  if (!sel) return
  const range = document.createRange()
  range.selectNodeContents(editor)
  range.collapse(false)
  sel.removeAllRanges()
  sel.addRange(range)
}

function caretPlainOffset(root: HTMLElement, container: Node, offset: number): number {
  const range = document.createRange()
  range.selectNodeContents(root)
  range.setEnd(container, offset)
  return range.toString().length
}

function pointFromPlainOffset(
  root: HTMLElement,
  plainOffset: number,
): { node: Text; offset: number } | null {
  const walker = root.ownerDocument.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  let seen = 0
  let node = walker.nextNode() as Text | null
  while (node) {
    const len = node.data.length
    if (plainOffset <= seen + len) {
      return { node, offset: Math.max(0, plainOffset - seen) }
    }
    seen += len
    node = walker.nextNode() as Text | null
  }
  const last = root.ownerDocument.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  let n = last.nextNode() as Text | null
  let prev: Text | null = null
  while (n) {
    prev = n
    n = last.nextNode() as Text | null
  }
  if (!prev) return null
  return { node: prev, offset: prev.data.length }
}

function saveCaret(): { start: number; end: number } | null {
  const editor = editorRef.value
  if (!editor || !focused) return null
  const sel = window.getSelection()
  if (!sel || sel.rangeCount === 0 || !editor.contains(sel.anchorNode)) return null
  const a = caretPlainOffset(editor, sel.anchorNode!, sel.anchorOffset)
  const b = caretPlainOffset(editor, sel.focusNode!, sel.focusOffset)
  return { start: Math.min(a, b), end: Math.max(a, b) }
}

function restoreCaret(saved: { start: number; end: number } | null) {
  const editor = editorRef.value
  if (!editor || !saved) return
  const start = pointFromPlainOffset(editor, saved.start)
  const end = pointFromPlainOffset(editor, saved.end)
  if (!start || !end) return
  const sel = window.getSelection()
  if (!sel) return
  const range = document.createRange()
  try {
    range.setStart(start.node, start.offset)
    range.setEnd(end.node, end.offset)
    sel.removeAllRanges()
    sel.addRange(range)
  } catch {
    /* ignore invalid offsets after DOM rewrite */
  }
}

function syncPlaceholder() {
  const editor = editorRef.value
  if (!editor) return
  editor.classList.toggle('empty', !props.modelValue)
  if (props.placeholder) editor.dataset.placeholder = props.placeholder
}

function paint(force = false) {
  const editor = editorRef.value
  if (!editor) return

  const nextStylesKey = stylesKey(props.styles)
  if (!force && props.modelValue === lastPlain && nextStylesKey === lastStylesKey) return

  // While typing, the DOM is already the source of truth for plain text.
  // Do NOT skip when styles changed externally (toolbar) — that used to mark
  // styles "painted" without updating HTML, so only preview showed them.
  if (
    focused &&
    !force &&
    plainFromDom(editor) === props.modelValue &&
    nextStylesKey === lastStylesKey
  ) {
    return
  }

  const html = piecesToHtml(styledPiecesFromTarget(props.modelValue, props.styles)) || '<br>'
  const caret = focused ? saveCaret() : null
  painting = true
  try {
    if (editor.innerHTML !== html) {
      editor.innerHTML = html
      if (focused) {
        if (caret) restoreCaret(caret)
        else placeCaretEnd()
      }
    }
  } finally {
    painting = false
  }
  markPainted()
  syncPlaceholder()
}

function parseFontSizePt(raw: string): number | undefined {
  const m = raw.trim().match(/^([\d.]+)pt$/i)
  if (!m) return undefined
  const n = Number(m[1])
  return Number.isFinite(n) && n > 0 ? n : undefined
}

function stylesFromDom(root: HTMLElement): TargetStyleRange[] {
  const plain = plainFromDom(root)
  if (!plain) return []
  const marks: RunStyle[] = Array.from({ length: plain.length }, () => ({}))

  let offset = 0
  const walk = (node: Node, cur: RunStyle) => {
    if (node.nodeType === Node.TEXT_NODE) {
      const t = node.textContent ?? ''
      for (let k = 0; k < t.length; k++) {
        if (offset + k < plain.length) marks[offset + k] = { ...cur }
      }
      offset += t.length
      return
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return
    const el = node as HTMLElement
    if (el.tagName === 'BR') return
    const cls = el.classList
    const next: RunStyle = { ...cur }
    if (cls.contains('rs-b') || el.tagName === 'B' || el.tagName === 'STRONG') next.bold = true
    if (cls.contains('rs-i') || el.tagName === 'I' || el.tagName === 'EM') next.italic = true
    if (
      cls.contains('rs-u') ||
      el.tagName === 'U' ||
      /underline/i.test(el.style.textDecoration) ||
      /underline/i.test(el.style.textDecorationLine)
    ) {
      next.underline = true
    }
    const uVal = el.getAttribute('data-u')
    if (uVal) {
      next.underline = true
      next.underlineVal = uVal
    }
    const ff = el.style.fontFamily?.replace(/^["']|["']$/g, '').trim()
    if (ff) next.font = ff
    const fsp = parseFontSizePt(el.style.fontSize || '')
    if (fsp) next.fontSizePt = fsp
    const dataColor = el.getAttribute('data-color')
    if (dataColor) next.color = dataColor
    else if (el.style.color) {
      const hex = el.style.color.match(/^#([0-9a-fA-F]{6})$/)
      if (hex) next.color = hex[1]!
      else {
        const rgb = el.style.color.match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i)
        if (rgb) {
          const toHex = (n: string) => Number(n).toString(16).padStart(2, '0')
          next.color = `${toHex(rgb[1]!)}${toHex(rgb[2]!)}${toHex(rgb[3]!)}`.toUpperCase()
        }
      }
    }
    const hl = el.getAttribute('data-highlight')
    if (hl) next.highlight = hl
    const va = el.getAttribute('data-valign')
    if (va === 'superscript' || va === 'subscript') next.vertAlign = va
    else if (cls.contains('rs-sup')) next.vertAlign = 'superscript'
    else if (cls.contains('rs-sub')) next.vertAlign = 'subscript'
    if (el.getAttribute('data-dstrike') === '1') next.doubleStrike = true
    else if (el.getAttribute('data-strike') === '1' || cls.contains('rs-strike')) next.strike = true
    for (const c of el.childNodes) walk(c, next)
  }
  for (const c of root.childNodes) walk(c, {})

  const out: TargetStyleRange[] = []
  let i = 0
  const keyOf = (m: RunStyle) => JSON.stringify(rangePropsFromStyle(m))
  while (i < plain.length) {
    const style = marks[i]!
    if (!hasVisualStyle(style)) {
      i++
      continue
    }
    const key = keyOf(style)
    let j = i + 1
    while (j < plain.length && keyOf(marks[j]!) === key) j++
    out.push({ start: i, end: j, ...rangePropsFromStyle(style) })
    i = j
  }
  return out
}

function emitSelection() {
  const editor = editorRef.value
  if (!editor || !focused) {
    emit('selection-change', null)
    return
  }
  const sel = window.getSelection()
  if (!sel || sel.rangeCount === 0 || !editor.contains(sel.anchorNode)) {
    emit('selection-change', null)
    return
  }
  const a = caretPlainOffset(editor, sel.anchorNode!, sel.anchorOffset)
  const b = caretPlainOffset(editor, sel.focusNode!, sel.focusOffset)
  emit('selection-change', {
    start: Math.min(a, b),
    end: Math.max(a, b),
    collapsed: sel.isCollapsed,
  })
}

function onInput() {
  if (painting) return
  const editor = editorRef.value
  if (!editor) return
  const next = plainFromDom(editor)
  const prev = props.modelValue
  let styles = stylesFromDom(editor)
  if (next !== prev) {
    styles = stylesFromDom(editor)
    if (!styles.length && props.styles?.length) {
      let i = 0
      while (i < next.length && i < prev.length && next[i] === prev[i]) i++
      let j = 0
      while (
        j < next.length - i &&
        j < prev.length - i &&
        next[next.length - 1 - j] === prev[prev.length - 1 - j]
      ) {
        j++
      }
      const removed = prev.length - i - j
      const inserted = next.length - i - j
      styles = shiftTargetStyles(props.styles, i, removed, inserted) ?? []
    }
  }
  emit('change', { target: next, styles })
  emitSelection()
  syncPlaceholder()
}

function onFocus() {
  focused = true
  emitSelection()
}

function onBlur(e: FocusEvent) {
  focused = false
  const related = e.relatedTarget
  if (related instanceof Element && related.closest('.style-toolbar')) {
    // Native <select>/picker took focus — keep selection so the toolbar stays enabled.
    return
  }
  // relatedTarget is often null when focus moves to <select>; confirm on next frame.
  requestAnimationFrame(() => {
    const ae = document.activeElement
    if (ae instanceof Element && ae.closest('.style-toolbar')) return
    emit('selection-change', null)
    // Reconcile model → DOM after leaving the field (not when using the toolbar).
    void nextTick(() => paint(true))
  })
}

function onKeyUp() {
  emitSelection()
}

function onMouseUp() {
  emitSelection()
}

function onMouseDown(e: MouseEvent) {
  if (props.editable === false) return
  const editor = editorRef.value
  if (!editor) return
  // Click on empty padding inside the min-height area: ensure caret.
  if (e.target === editor) {
    // Let the browser place caret when clicking existing text nodes;
    // only force end-caret when the field is empty.
    if (!props.modelValue) {
      void nextTick(() => {
        editor.focus({ preventScroll: true })
        placeCaretEnd()
      })
    }
  }
}

onMounted(() => {
  const editor = editorRef.value
  if (editor) {
    const can = props.editable !== false
    editor.contentEditable = can ? 'true' : 'false'
    editor.classList.toggle('readonly', !can)
  }
  lastPlain = ''
  lastStylesKey = ''
  paint(true)
})

watch(
  () => [props.modelValue, stylesKey(props.styles)] as const,
  (curr, prev) => {
    const stylesChanged = Boolean(prev && curr[1] !== prev[1])
    void nextTick(() => paint(stylesChanged))
  },
)

watch(
  () => props.placeholder,
  () => syncPlaceholder(),
)

watch(
  () => props.editable,
  (can) => {
    const editor = editorRef.value
    if (!editor) return
    editor.contentEditable = can === false ? 'false' : 'true'
    editor.classList.toggle('readonly', can === false)
  },
)

onBeforeUnmount(() => {
  focused = false
})

function focus() {
  const editor = editorRef.value
  if (!editor) return
  editor.focus({ preventScroll: true })
  placeCaretEnd()
}

function sync() {
  paint(true)
}

function blur() {
  editorRef.value?.blur()
}

function getSelectionOffsets(): { start: number; end: number } | null {
  const editor = editorRef.value
  if (!editor || !focused) return null
  const sel = window.getSelection()
  if (!sel || sel.rangeCount === 0 || !editor.contains(sel.anchorNode)) return null
  const a = caretPlainOffset(editor, sel.anchorNode!, sel.anchorOffset)
  const b = caretPlainOffset(editor, sel.focusNode!, sel.focusOffset)
  return { start: Math.min(a, b), end: Math.max(a, b) }
}

defineExpose({ focus, sync, blur, getSelectionOffsets })
</script>

<template>
  <!-- v-once: Vue must not re-patch this node or it wipes contenteditable / caret. -->
  <div
    v-once
    ref="editorRef"
    class="rich-target-inner"
    contenteditable="true"
    spellcheck="false"
    autocomplete="off"
    autocorrect="off"
    autocapitalize="off"
    translate="no"
    data-gramm="false"
    data-gramm_editor="false"
    data-enable-grammarly="false"
    tabindex="0"
    @input="onInput"
    @focus="onFocus"
    @blur="onBlur"
    @keyup="onKeyUp"
    @mouseup="onMouseUp"
    @mousedown="onMouseDown"
  />
</template>

<style scoped lang="scss">
.rich-target-inner {
  outline: none;
  white-space: pre-wrap;
  word-break: break-word;
  min-height: 4.5rem;
  line-height: inherit;
  font: inherit;
  color: inherit;
  cursor: text;
  -webkit-user-modify: read-write;
  user-select: text;
}

.rich-target-inner.readonly {
  -webkit-user-modify: read-only;
  cursor: default;
}

.rich-target-inner.empty:before {
  content: attr(data-placeholder);
  color: var(--text-faint);
  pointer-events: none;
}

.rich-target-inner :deep(.rs-b) {
  font-weight: 700;
}
.rich-target-inner :deep(.rs-i) {
  font-style: italic;
}
.rich-target-inner :deep(.rs-u) {
  text-decoration: underline;
  text-underline-offset: 0.12em;
}
.rich-target-inner :deep(.rs-strike) {
  text-decoration: line-through;
}
.rich-target-inner :deep(.rs-u.rs-strike) {
  text-decoration: underline line-through;
}
.rich-target-inner :deep(.rs-sup) {
  vertical-align: super;
  font-size: 0.75em;
}
.rich-target-inner :deep(.rs-sub) {
  vertical-align: sub;
  font-size: 0.75em;
}
</style>
