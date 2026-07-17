<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import AppTooltip from '@/components/AppTooltip.vue'
import { useAnchoredTooltip } from '@/composables/useAnchoredTooltip'

const props = withDefaults(
  defineProps<{
    text: string
    maxWidth?: string
  }>(),
  { maxWidth: '14rem' },
)

const root = ref<HTMLElement | null>(null)
const overflow = ref(false)
const scrolling = ref(false)
const durationSec = ref(12)
let observer: ResizeObserver | null = null

const { tip, tooltipRef, showAtAnchor, hide } = useAnchoredTooltip()

async function measure() {
  await nextTick()
  const el = root.value
  if (!el) return
  const label = el.querySelector<HTMLElement>('.marquee-text__label')
  if (!label) return
  const needsScroll = label.scrollWidth > el.clientWidth + 1
  overflow.value = needsScroll
  if (!needsScroll) scrolling.value = false
  if (needsScroll) {
    durationSec.value = Math.min(24, Math.max(8, label.scrollWidth / 28))
  }
}

onMounted(() => {
  void measure()
  if (!root.value) return
  observer = new ResizeObserver(() => {
    void measure()
  })
  observer.observe(root.value)
})

onBeforeUnmount(() => {
  observer?.disconnect()
})

watch(
  () => props.text,
  () => {
    void measure()
  },
)

function onEnter(event: MouseEvent) {
  if (overflow.value) {
    scrolling.value = true
    void showAtAnchor(event.currentTarget as HTMLElement, props.text)
  }
}

function onLeave() {
  scrolling.value = false
  hide()
}
</script>

<template>
  <div
    ref="root"
    class="marquee-text"
    :style="{ maxWidth }"
    @mouseenter="onEnter"
    @mouseleave="onLeave"
  >
    <div
      class="marquee-text__track"
      :class="{ 'marquee-text__track--scroll': overflow && scrolling }"
      :style="overflow ? { '--marquee-duration': `${durationSec}s` } : undefined"
    >
      <span
        class="marquee-text__label"
        :class="{ 'marquee-text__label--ellipsis': overflow && !scrolling }"
      >{{ text }}</span>
      <span
        v-if="overflow && scrolling"
        class="marquee-text__label"
        aria-hidden="true"
      >{{ text }}</span>
    </div>
  </div>
  <AppTooltip
    ref="tooltipRef"
    :text="tip.text"
    :visible="tip.visible"
    :ready="tip.ready"
    :x="tip.x"
    :y="tip.y"
    :placement="tip.placement"
  />
</template>

<style scoped>
.marquee-text {
  min-width: 0;
  overflow: hidden;
}

.marquee-text__track {
  display: inline-flex;
  align-items: center;
  white-space: nowrap;
}

.marquee-text__track:not(.marquee-text__track--scroll) {
  display: block;
  width: 100%;
  max-width: 100%;
}

.marquee-text__track--scroll {
  display: inline-flex;
  animation: marquee-scroll var(--marquee-duration, 12s) linear infinite;
}

.marquee-text__label {
  display: inline-block;
  padding-inline-end: 2rem;
}

.marquee-text__label--ellipsis {
  display: block;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  padding-inline-end: 0;
}

.marquee-text__track--scroll .marquee-text__label {
  display: inline-block;
  padding-inline-end: 2rem;
  overflow: visible;
  text-overflow: clip;
  max-width: none;
}

@keyframes marquee-scroll {
  from {
    transform: translateX(0);
  }
  to {
    transform: translateX(-50%);
  }
}
</style>
