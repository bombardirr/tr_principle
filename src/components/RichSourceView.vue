<script setup lang="ts">
import { computed } from 'vue'
import type { RunSpan } from '@/types/project'
import { piecesToHtml, styledPiecesFromTagged } from '@/docx/runStyle'

const props = defineProps<{
  taggedSource: string
  /** Prefer paragraphSpans; fall back to sentence spans. */
  spans?: RunSpan[]
}>()

const html = computed(() =>
  piecesToHtml(styledPiecesFromTagged(props.taggedSource, props.spans ?? [])),
)
</script>

<template>
  <div class="rich-source" v-html="html || '&nbsp;'" />
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
</style>
