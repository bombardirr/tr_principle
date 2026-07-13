<script setup lang="ts">
defineProps<{
  light: boolean
}>()
</script>

<template>
  <span class="theme-toggle-glyph" :class="{ 'is-light': light }">
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true">
      <g class="theme-rays" stroke-linecap="round">
        <line x1="8" y1="1.1" x2="8" y2="2.65" />
        <line x1="8" y1="1.1" x2="8" y2="2.65" transform="rotate(45 8 8)" />
        <line x1="8" y1="1.1" x2="8" y2="2.65" transform="rotate(90 8 8)" />
        <line x1="8" y1="1.1" x2="8" y2="2.65" transform="rotate(135 8 8)" />
        <line x1="8" y1="1.1" x2="8" y2="2.65" transform="rotate(180 8 8)" />
        <line x1="8" y1="1.1" x2="8" y2="2.65" transform="rotate(225 8 8)" />
        <line x1="8" y1="1.1" x2="8" y2="2.65" transform="rotate(270 8 8)" />
        <line x1="8" y1="1.1" x2="8" y2="2.65" transform="rotate(315 8 8)" />
      </g>
      <circle class="theme-sun" cx="8" cy="8" r="3.1" fill="currentColor" stroke="none" />
      <g class="theme-moon">
        <circle cx="8" cy="8" r="5.25" />
        <path
          fill="currentColor"
          stroke="none"
          d="M8 2.75a5.25 5.25 0 0 1 0 10.5V2.75Z"
        />
      </g>
    </svg>
  </span>
</template>

<style scoped>
.theme-toggle-glyph {
  display: flex;
  width: 1rem;
  height: 1rem;
  transition: transform 0.55s cubic-bezier(0.4, 0, 0.2, 1);
}

.theme-toggle-glyph.is-light {
  transform: rotate(180deg);
}

.theme-toggle-glyph svg {
  width: 100%;
  height: 100%;
  display: block;
}

.theme-rays {
  opacity: 0;
  transform-box: fill-box;
  transform-origin: center;
  transition: opacity 0.25s ease;
}

.theme-sun {
  opacity: 0;
  transition: opacity 0.25s ease;
}

.theme-moon {
  opacity: 1;
  transform-box: fill-box;
  transform-origin: center;
  transition: opacity 0.25s ease;
  animation: theme-glyph-spin 14s linear infinite;
}

.is-light .theme-rays {
  opacity: 1;
  animation: theme-glyph-spin 14s linear infinite;
}

.is-light .theme-sun {
  opacity: 1;
}

.is-light .theme-moon {
  opacity: 0;
  animation-play-state: paused;
}

@keyframes theme-glyph-spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
