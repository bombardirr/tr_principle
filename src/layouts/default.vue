<script lang="ts" setup>
// Layout компонент
</script>

<template>
  <div class="tr">
    <div class="tr__container">
      <router-view />
    </div>
  </div>
</template>

<style lang="scss">
@reference "tailwindcss";

.tr {
  @apply h-full;
  @apply bg-gray-50;

  &__container {
    @apply h-full;
    @apply max-w-11/12;
    @apply mx-auto;
    @apply px-4 py-8;
    @apply text-center;
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
