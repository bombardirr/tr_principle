<script setup lang="ts">
defineProps<{
  modelValue: boolean
  label?: string
  disabled?: boolean
}>()

defineEmits<{
  'update:modelValue': [value: boolean]
}>()
</script>

<template>
  <label class="app-check" :class="{ on: modelValue, disabled }">
    <span class="mark" aria-hidden="true">
      <span class="notch notch-tr" />
      <span class="notch notch-bl" />
      <span class="slash" />
    </span>
    <input
      type="checkbox"
      class="native"
      :checked="modelValue"
      :disabled="disabled"
      @change="$emit('update:modelValue', ($event.target as HTMLInputElement).checked)"
    />
    <span v-if="label" class="label">{{ label }}</span>
  </label>
</template>

<style scoped lang="scss">
/* Ink-notch check: corner marks + centered slash — not a stock square+✓ */
.app-check {
  position: relative;
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  cursor: pointer;
  user-select: none;
  font-size: 0.8rem;
  color: var(--text-muted);
  white-space: nowrap;
}
.app-check.disabled {
  opacity: 0.45;
  cursor: default;
  pointer-events: none;
}
.native {
  /* Visually gone, still focusable for a11y — clipped inside the label */
  position: absolute;
  width: 1px;
  height: 1px;
  margin: -1px;
  padding: 0;
  border: 0;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  clip-path: inset(50%);
  white-space: nowrap;
  appearance: none;
  opacity: 0;
  pointer-events: none;
}
.mark {
  position: relative;
  width: 0.95rem;
  height: 0.95rem;
  flex-shrink: 0;
  border-radius: 3px;
  background: var(--surface-2);
  overflow: hidden;
  isolation: isolate;
  transition: background 0.16s ease;
}
.notch {
  position: absolute;
  width: 0.34rem;
  height: 0.34rem;
  opacity: 0.85;
  pointer-events: none;
  transition: opacity 0.14s ease, border-color 0.14s ease;
}
.notch-tr {
  top: 1px;
  right: 1px;
  border-top: 1.5px solid var(--text-faint);
  border-right: 1.5px solid var(--text-faint);
  border-top-right-radius: 1px;
}
.notch-bl {
  left: 1px;
  bottom: 1px;
  border-left: 1.5px solid var(--text-faint);
  border-bottom: 1.5px solid var(--text-faint);
  border-bottom-left-radius: 1px;
}
.slash {
  position: absolute;
  left: 50%;
  top: 50%;
  width: 0.58rem;
  height: 1.5px;
  border-radius: 1px;
  background: var(--accent);
  transform: translate(-50%, -50%) rotate(-48deg) scaleX(0);
  transform-origin: center;
  pointer-events: none;
  transition: transform 0.18s cubic-bezier(0.2, 0.9, 0.3, 1.15);
}
.app-check:hover .mark,
.app-check:focus-within .mark {
  background: color-mix(in srgb, var(--accent) 14%, var(--surface-2));
}
.app-check.on {
  color: var(--text);
}
.app-check.on .mark {
  background: color-mix(in srgb, var(--accent) 22%, var(--surface-2));
}
.app-check.on .notch {
  border-color: var(--accent);
  opacity: 1;
}
.app-check.on .slash {
  transform: translate(-50%, -50%) rotate(-48deg) scaleX(1);
}
.label {
  line-height: 1.2;
}
</style>
