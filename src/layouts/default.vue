<script setup lang="ts">
// Layout компонент
</script>

<template>
  <div class="app">
    <div class="app__container">
      <h1 class="app__title">Translation Tool</h1>
      <p class="app__description">Приложение для переводчиков</p>
    </div>
  </div>
</template>

<style lang="scss">
@reference "tailwindcss";

.app {
  @apply min-h-screen;
  @apply bg-gray-50;

  &__container {
    @apply max-w-6xl;
    @apply mx-auto;
    @apply px-4 py-8;
  }

  &__title {
    @apply text-3xl font-bold text-gray-800;
    @apply mb-4;
  }

  &__description {
    @apply text-gray-600;
  }
}
</style>

