<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { STYLE_SIZE_PRESETS_PT, type StyleToggleProp } from '@/docx/runStyle'
import IconButton from './IconButton.vue'

type VertAlign = 'superscript' | 'subscript'
type Picker = 'color' | 'highlight'

const COLOR_PALETTE = [
  '000000',
  'FF0000',
  'C00000',
  'FFC000',
  'FFFF00',
  '00B050',
  '00B0F0',
  '0070C0',
  '7030A0',
  'FFFFFF',
] as const
const HIGHLIGHT_PALETTE = ['yellow', 'green', 'cyan', 'magenta', 'blue', 'red'] as const
const HIGHLIGHT_CSS: Record<(typeof HIGHLIGHT_PALETTE)[number], string> = {
  yellow: '#ffff00',
  green: '#00ff00',
  cyan: '#00ffff',
  magenta: '#ff00ff',
  blue: '#0000ff',
  red: '#ff0000',
}

const props = defineProps<{
  disabled?: boolean
  hasSelection?: boolean
  boldActive?: boolean
  italicActive?: boolean
  underlineActive?: boolean
  strikeActive?: boolean
  vertAlign?: VertAlign | null
  font?: string | null
  fontMixed?: boolean
  fontSizePt?: number | null
  fontSizeMixed?: boolean
  color?: string | null
  colorMixed?: boolean
  highlight?: string | null
  highlightMixed?: boolean
  fonts: string[]
}>()

const emit = defineEmits<{
  (event: 'toggle', prop: StyleToggleProp): void
  (event: 'setFont', value: string | null): void
  (event: 'setFontSizePt', value: number | null): void
  (event: 'setColor', value: string | null): void
  (event: 'setHighlight', value: string | null): void
  (event: 'setVertAlign', value: VertAlign | null): void
}>()

const { t } = useI18n()
const root = ref<HTMLElement | null>(null)
const openPicker = ref<Picker | null>(null)
const can = computed(() => !props.disabled && props.hasSelection)
const fontOptions = computed(() => {
  const values = new Set(props.fonts)
  if (props.font) values.add(props.font)
  return [...values]
})
const sizeOptions = computed(() => {
  const values = new Set<number>(STYLE_SIZE_PRESETS_PT)
  if (props.fontSizePt != null) values.add(props.fontSizePt)
  return [...values].sort((a, b) => a - b)
})

function setVertAlign(value: VertAlign) {
  emit('setVertAlign', props.vertAlign === value ? null : value)
}

function setFont(event: Event) {
  emit('setFont', (event.target as HTMLSelectElement).value || null)
}

function setFontSize(event: Event) {
  const value = (event.target as HTMLSelectElement).value
  emit('setFontSizePt', value ? Number(value) : null)
}

function togglePicker(picker: Picker) {
  if (!can.value) return
  openPicker.value = openPicker.value === picker ? null : picker
}

function setColor(value: string | null) {
  emit('setColor', value)
  openPicker.value = null
}

function setHighlight(value: string | null) {
  emit('setHighlight', value)
  openPicker.value = null
}

function onToolbarMousedown(event: MouseEvent) {
  const target = event.target
  if (target instanceof Element && target.closest('button')) event.preventDefault()
}

function onDocumentPointerDown(event: PointerEvent) {
  if (openPicker.value && event.target instanceof Node && !root.value?.contains(event.target)) {
    openPicker.value = null
  }
}

function onDocumentKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') openPicker.value = null
}

watch(can, (enabled) => {
  if (!enabled) openPicker.value = null
})

onMounted(() => {
  document.addEventListener('pointerdown', onDocumentPointerDown, true)
  document.addEventListener('keydown', onDocumentKeydown)
})
onUnmounted(() => {
  document.removeEventListener('pointerdown', onDocumentPointerDown, true)
  document.removeEventListener('keydown', onDocumentKeydown)
})
</script>

<template>
  <div
    ref="root"
    class="style-toolbar"
    role="toolbar"
    :aria-label="t('editor.styleToolbarLabel')"
    @mousedown="onToolbarMousedown"
  >
    <span class="control-group">
      <IconButton
        ghost
        :title="t('editor.styleBold')"
        :active="boldActive"
        :disabled="!can"
        @click="emit('toggle', 'bold')"
      >
        <span class="glyph">B</span>
      </IconButton>
      <IconButton
        ghost
        :title="t('editor.styleItalic')"
        :active="italicActive"
        :disabled="!can"
        @click="emit('toggle', 'italic')"
      >
        <span class="glyph glyph-i">I</span>
      </IconButton>
      <IconButton
        ghost
        :title="t('editor.styleUnderline')"
        :active="underlineActive"
        :disabled="!can"
        @click="emit('toggle', 'underline')"
      >
        <span class="glyph glyph-u">U</span>
      </IconButton>
    </span>

    <span class="control-group separated">
      <IconButton
        ghost
        :title="t('editor.styleStrike')"
        :active="strikeActive"
        :disabled="!can"
        @click="emit('toggle', 'strike')"
      >
        <span class="glyph glyph-s">S</span>
      </IconButton>
    </span>

    <span class="control-group separated">
      <IconButton
        ghost
        :title="t('editor.styleSuperscript')"
        :active="vertAlign === 'superscript'"
        :disabled="!can"
        @click="setVertAlign('superscript')"
      >
        <span class="glyph vert-glyph">x²</span>
      </IconButton>
      <IconButton
        ghost
        :title="t('editor.styleSubscript')"
        :active="vertAlign === 'subscript'"
        :disabled="!can"
        @click="setVertAlign('subscript')"
      >
        <span class="glyph vert-glyph">x₂</span>
      </IconButton>
    </span>

    <span class="control-group separated select-group">
      <select
        class="style-select font-select"
        :title="t('editor.styleFont')"
        :aria-label="t('editor.styleFont')"
        :disabled="!can"
        :value="fontMixed ? '' : (font ?? '')"
        @change="setFont"
      >
        <option v-if="fontMixed || !font" value="">—</option>
        <option v-for="name in fontOptions" :key="name" :value="name">
          {{ name }}
        </option>
      </select>
    </span>

    <span class="control-group separated select-group">
      <select
        class="style-select size-select"
        :title="t('editor.styleSize')"
        :aria-label="t('editor.styleSize')"
        :disabled="!can"
        :value="fontSizeMixed ? '' : (fontSizePt ?? '')"
        @change="setFontSize"
      >
        <option v-if="fontSizeMixed || fontSizePt == null" value="">—</option>
        <option v-for="size in sizeOptions" :key="size" :value="size">
          {{ size }}
        </option>
      </select>
    </span>

    <span class="control-group separated picker">
      <button
        type="button"
        class="picker-trigger color-trigger"
        :class="{ active: openPicker === 'color', mixed: colorMixed }"
        :title="t('editor.styleColor')"
        :aria-label="t('editor.styleColor')"
        :aria-expanded="openPicker === 'color'"
        :disabled="!can"
        @click.stop="togglePicker('color')"
      >
        <span>A</span>
        <span
          class="trigger-line"
          :class="{ 'is-auto': !colorMixed && !color }"
          :style="{ backgroundColor: colorMixed ? undefined : `#${color ?? '000000'}` }"
        />
      </button>
      <div v-if="openPicker === 'color'" class="palette-panel" role="group">
        <button
          type="button"
          class="palette-clear"
          :title="t('editor.styleColorAuto')"
          @click="setColor(null)"
        >
          {{ t('editor.styleColorAuto') }}
        </button>
        <button
          v-for="value in COLOR_PALETTE"
          :key="value"
          type="button"
          class="swatch"
          :class="{ selected: !colorMixed && color === value }"
          :style="{ backgroundColor: `#${value}` }"
          :aria-label="`${t('editor.styleColor')} ${value}`"
          :title="value"
          @click="setColor(value)"
        />
      </div>
    </span>

    <span class="control-group separated picker">
      <button
        type="button"
        class="picker-trigger highlight-trigger"
        :class="{ active: openPicker === 'highlight', mixed: highlightMixed }"
        :title="t('editor.styleHighlight')"
        :aria-label="t('editor.styleHighlight')"
        :aria-expanded="openPicker === 'highlight'"
        :disabled="!can"
        @click.stop="togglePicker('highlight')"
      >
        <span
          class="highlight-mark"
          :style="{
            backgroundColor:
              !highlightMixed && highlight
                ? HIGHLIGHT_CSS[highlight as keyof typeof HIGHLIGHT_CSS]
                : undefined,
          }"
        />
      </button>
      <div v-if="openPicker === 'highlight'" class="palette-panel" role="group">
        <button
          type="button"
          class="palette-clear"
          :title="t('editor.styleHighlightNone')"
          @click="setHighlight(null)"
        >
          {{ t('editor.styleHighlightNone') }}
        </button>
        <button
          v-for="value in HIGHLIGHT_PALETTE"
          :key="value"
          type="button"
          class="swatch"
          :class="{ selected: !highlightMixed && highlight === value }"
          :style="{ backgroundColor: HIGHLIGHT_CSS[value] }"
          :aria-label="`${t('editor.styleHighlight')} ${value}`"
          :title="value"
          @click="setHighlight(value)"
        />
      </div>
    </span>
  </div>
</template>

<style scoped lang="scss">
.style-toolbar {
  display: inline-flex;
  min-width: 0;
  max-width: 100%;
  flex-wrap: nowrap;
  align-items: center;
  justify-content: center;
  gap: 0;
  padding: 0;
  border: none;
  background: transparent;
  white-space: nowrap;
  overflow: hidden;
}

.control-group {
  display: inline-flex;
  flex: 0 1 auto;
  align-items: center;
  gap: 0.05rem;
  min-width: 0;
}

.separated {
  margin-inline-start: 0.16rem;
  padding-inline-start: 0.16rem;
  border-inline-start: 1px solid var(--border);
}

.select-group {
  min-width: 0;
  flex: 1 1 auto;
}

.style-toolbar :deep(.icon-btn) {
  width: 1.55rem;
  height: 1.55rem;
  border-radius: 5px;
}

.glyph {
  font-family: Georgia, 'Times New Roman', serif;
  font-size: 0.75rem;
  font-weight: 800;
  line-height: 1;
}

.glyph-i {
  font-style: italic;
}

.glyph-u {
  text-decoration: underline;
  text-underline-offset: 0.12em;
}

.glyph-s {
  text-decoration: line-through;
}

.vert-glyph {
  font-size: 0.72rem;
  letter-spacing: -0.04em;
}

.style-select {
  height: 1.45rem;
  min-width: 0;
  padding: 0 1rem 0 0.25rem;
  border: 1px solid var(--border);
  border-radius: 4px;
  background: var(--surface);
  color: var(--text);
  font: inherit;
  font-size: 0.68rem;
  cursor: pointer;
  text-overflow: ellipsis;
}

.style-select:disabled,
.picker-trigger:disabled {
  cursor: not-allowed;
  opacity: 0.45;
}

.font-select {
  width: 7.5rem;
  max-width: min(7.5rem, 100%);
  flex: 1 1 auto;
}

.size-select {
  width: 3.5rem;
  max-width: min(3.5rem, 100%);
  flex: 0 1 auto;
}

.picker {
  position: relative;
}

.picker-trigger {
  display: inline-flex;
  width: 1.55rem;
  height: 1.55rem;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.05rem;
  padding: 0.16rem;
  border: 0;
  border-radius: 5px;
  background: transparent;
  color: var(--text-muted);
  font: inherit;
  font-size: 0.72rem;
  font-weight: 700;
  cursor: pointer;
}

.picker-trigger:not(:disabled):hover,
.picker-trigger.active {
  color: var(--accent);
}

.trigger-line {
  width: 0.86rem;
  height: 0.18rem;
  border-radius: 1px;
  box-shadow:
    0 0 0 1px color-mix(in srgb, var(--text) 55%, transparent),
    0 0 0 2px color-mix(in srgb, var(--surface) 80%, transparent);
}

.trigger-line.is-auto {
  background: var(--text) !important;
}

.picker-trigger.mixed .trigger-line {
  box-shadow: 0 0 0 1px var(--text-muted);
}

.highlight-mark {
  width: 0.72rem;
  height: 0.9rem;
  border: 1px solid var(--text-muted);
  background: transparent;
}

.picker-trigger.mixed .trigger-line,
.picker-trigger.mixed .highlight-mark {
  background: repeating-linear-gradient(135deg, transparent 0 2px, var(--text-muted) 2px 3px);
}

.palette-panel {
  position: absolute;
  z-index: 30;
  top: calc(100% + 0.2rem);
  right: 0;
  display: grid;
  width: 7.7rem;
  grid-template-columns: repeat(5, 1.25rem);
  gap: 0.18rem;
  padding: 0.3rem;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--surface);
  box-shadow: 0 8px 20px rgba(0, 0, 0, 0.2);
}

.palette-clear {
  grid-column: 1 / -1;
  padding: 0.15rem 0.25rem;
  border: 0;
  border-radius: 3px;
  background: transparent;
  color: var(--text);
  font: inherit;
  font-size: 0.65rem;
  text-align: start;
  cursor: pointer;
}

.palette-clear:hover {
  background: var(--surface-2);
}

.swatch {
  width: 1.25rem;
  height: 1.25rem;
  padding: 0;
  border: 1px solid var(--border);
  border-radius: 3px;
  cursor: pointer;
}

.swatch.selected {
  outline: 2px solid var(--accent);
  outline-offset: 1px;
}
</style>
