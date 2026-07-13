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

function onShowTip(event: MouseEvent) {
  if (!overflow.value) return
  void showAtAnchor(event.currentTarget as HTMLElement, props.text)
}
</script>

<template>
  <div
    ref="root"
    class="marquee-text"
    :style="{ maxWidth }"
    @mouseenter="onShowTip"
    @mouseleave="hide"
  >
    <div
      class="marquee-text__track"
      :class="{ 'marquee-text__track--scroll': overflow }"
      :style="overflow ? { '--marquee-duration': `${durationSec}s` } : undefined"
    >
      <span class="marquee-text__label">{{ text }}</span>
      <span v-if="overflow" class="marquee-text__label" aria-hidden="true">{{ text }}</span>
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

.marquee-text__track--scroll {
  animation: marquee-scroll var(--marquee-duration, 12s) linear infinite;
}

.marquee-text__track--scroll:hover {
  animation-play-state: paused;
}

.marquee-text__label {
  display: inline-block;
  padding-inline-end: 2rem;
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
