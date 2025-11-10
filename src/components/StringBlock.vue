<script setup lang="ts">
const items = [
  {
    id: 1,
    source: 'Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.',
    settings: '2',
    target: '3',
  },
  {
    id: 2,
    source: '4',
    settings: 'Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.',
    target: '6',
  },
  {
    id: 3,
    source: '7',
    settings: '8',
    target: 'Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.',
  },
];
</script>

<template>
  <div class="string-block">
    <div class="string-block__container">
      <div v-for="item in items" :key="item.id" class="string-block__container--item">
        <div class="string-block__container--item-source">{{ item.source }}</div>
        <div class="string-block__container--item-settings">{{ item.settings }}</div>
        <div class="string-block__container--item-target">{{ item.target }}</div>
      </div>
    </div>
  </div>
</template>

<style lang="scss">
@reference "tailwindcss";

.string-block {
  @apply w-full h-full;
  @apply bg-green-500;

  &__container {
    @apply flex flex-col justify-start items-center;
    @apply w-full min-h-full;
    @apply bg-red-500;

    &--item {
      @apply flex;
      @apply w-full;
      @apply my-2 px-2;


      &-source {
        @apply w-1/2;
        @apply bg-blue-500;
      }

      &-settings {
        @apply w-24;
        @apply bg-yellow-500;
      }

      &-target {
        @apply w-1/2;
        @apply bg-green-500;
      }
    }
  }
}
</style>
