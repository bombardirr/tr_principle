<script setup lang="ts">
import type { Component } from 'vue'
import {
  Archive,
  ArrowDownToLine,
  ArrowLeftRight,
  ArrowRightFromLine,
  ArrowUpToLine,
  Braces,
  Check,
  ChevronLeft,
  CircleX,
  Clipboard,
  CloudDownload,
  CloudUpload,
  Contrast,
  Database,
  DatabaseArrowDown,
  DatabaseArrowUp,
  DatabaseCheck,
  DatabaseX,
  Download,
  Eye,
  EyeOff,
  FileDown,
  History,
  ListRestart,
  Percent,
  Redo2,
  RefreshCw,
  Save,
  Search,
  Settings,
  SquareCheck,
  Trash2,
  Undo2,
  Upload,
  X,
} from '@lucide/vue'

export type GlyphName =
  | 'back'
  | 'copy'
  | 'clipboard'
  | 'leave-empty'
  | 'reset'
  | 'preview'
  | 'preview-off'
  | 'refresh'
  | 'save'
  | 'export'
  | 'archive'
  | 'download-docx'
  | 'download-tmx'
  | 'upload-tmx'
  | 'tm'
  | 'tm-strike'
  | 'tm-commit'
  | 'percent'
  | 'import'
  | 'theme'
  | 'settings'
  | 'trash'
  | 'resegment'
  | 'check'
  | 'close'
  | 'cloud-upload'
  | 'cloud-download'
  | 'audit'
  | 'concordance'
  | 'undo'
  | 'redo'
  | 'markers'
  | 'swap'
  | 'scroll-top'
  | 'scroll-bottom'

const props = defineProps<{
  name: GlyphName
}>()

const icons: Record<GlyphName, Component> = {
  back: ChevronLeft,
  copy: ArrowRightFromLine,
  clipboard: Clipboard,
  'leave-empty': SquareCheck,
  reset: CircleX,
  preview: Eye,
  'preview-off': EyeOff,
  refresh: RefreshCw,
  save: Save,
  export: Download,
  archive: Archive,
  'download-docx': FileDown,
  'download-tmx': DatabaseArrowDown,
  'upload-tmx': DatabaseArrowUp,
  tm: Database,
  'tm-strike': DatabaseX,
  'tm-commit': DatabaseCheck,
  percent: Percent,
  import: Upload,
  theme: Contrast,
  settings: Settings,
  trash: Trash2,
  resegment: ListRestart,
  check: Check,
  close: X,
  'cloud-upload': CloudUpload,
  'cloud-download': CloudDownload,
  audit: History,
  concordance: Search,
  undo: Undo2,
  redo: Redo2,
  markers: Braces,
  swap: ArrowLeftRight,
  'scroll-top': ArrowUpToLine,
  'scroll-bottom': ArrowDownToLine,
}
</script>

<template>
  <component
    :is="icons[props.name]"
    :size="16"
    :stroke-width="1.5"
    aria-hidden="true"
  />
</template>
