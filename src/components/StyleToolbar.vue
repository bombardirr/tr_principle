<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import IconButton from './IconButton.vue'

const props = defineProps<{
  disabled?: boolean
  hasSelection?: boolean
  boldActive?: boolean
  italicActive?: boolean
  underlineActive?: boolean
}>()

const emit = defineEmits<{
  toggle: [prop: 'bold' | 'italic' | 'underline']
}>()

const { t } = useI18n()

const can = () => !props.disabled && props.hasSelection
</script>

<template>
  <div class="style-toolbar" role="toolbar" :aria-label="t('editor.styleToolbarLabel')">
    <IconButton
      ghost
      title="Bold (Ctrl+B)"
      :active="boldActive"
      :disabled="!can()"
      @mousedown.prevent
      @click="emit('toggle', 'bold')"
    >
      <span class="glyph">B</span>
    </IconButton>
    <IconButton
      ghost
      title="Italic (Ctrl+I)"
      :active="italicActive"
      :disabled="!can()"
      @mousedown.prevent
      @click="emit('toggle', 'italic')"
    >
      <span class="glyph glyph-i">I</span>
    </IconButton>
    <IconButton
      ghost
      title="Underline (Ctrl+U)"
      :active="underlineActive"
      :disabled="!can()"
      @mousedown.prevent
      @click="emit('toggle', 'underline')"
    >
      <span class="glyph glyph-u">U</span>
    </IconButton>
  </div>
</template>

<style scoped lang="scss">
.style-toolbar {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.1rem;
  padding: 0;
  background: transparent;
  border: none;
}

.glyph {
  font-size: 0.8rem;
  font-weight: 800;
  font-family: Georgia, 'Times New Roman', serif;
  line-height: 1;
}
.glyph-i {
  font-style: italic;
}
.glyph-u {
  text-decoration: underline;
  text-underline-offset: 0.12em;
}
</style>
