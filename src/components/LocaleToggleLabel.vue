<script setup lang="ts">
import { nextTick, onMounted, ref, watch } from 'vue'

const props = defineProps<{
  locale: string
}>()

type Phase = 'idle' | 'exit-up' | 'exit-down' | 'enter-up' | 'enter-down'

type Slot = {
  char: string
  phase: Phase
}

const LETTER_MS = 220

const slots = ref<Slot[]>([
  { char: 'R', phase: 'idle' },
  { char: 'U', phase: 'idle' },
])

const letterRefs = ref<(HTMLElement | null)[]>([null, null])
let animating = false

function setLetterRef(index: number, el: Element | { $el?: Element } | null) {
  const node = el instanceof HTMLElement ? el : null
  letterRefs.value[index] = node
}

function toCode(locale: string): string {
  return locale.toUpperCase().slice(0, 2)
}

function syncSlots(locale: string) {
  const chars = toCode(locale)
  slots.value = [
    { char: chars[0] ?? ' ', phase: 'idle' },
    { char: chars[1] ?? ' ', phase: 'idle' },
  ]
}

function wait(ms: number) {
  return new Promise<void>((resolve) => {
    window.setTimeout(resolve, ms)
  })
}

async function waitForLetter(index: number) {
  const el = letterRefs.value[index]
  if (!el) {
    await wait(LETTER_MS)
    return
  }
  await new Promise<void>((resolve) => {
    const fallback = window.setTimeout(resolve, LETTER_MS + 60)
    const onEnd = (event: TransitionEvent) => {
      if (event.target !== el || event.propertyName !== 'transform') return
      window.clearTimeout(fallback)
      el.removeEventListener('transitionend', onEnd)
      resolve()
    }
    el.addEventListener('transitionend', onEnd)
  })
}

async function animateSlot(index: number, fromChar: string, toChar: string) {
  const exitDir = Math.random() < 0.5 ? 'up' : 'down'
  const enterDir = Math.random() < 0.5 ? 'up' : 'down'

  slots.value[index] = { char: fromChar, phase: 'idle' }
  await nextTick()

  slots.value[index] = { char: fromChar, phase: exitDir === 'up' ? 'exit-up' : 'exit-down' }
  await waitForLetter(index)

  slots.value[index] = { char: toChar, phase: enterDir === 'up' ? 'enter-up' : 'enter-down' }
  await nextTick()
  slots.value[index] = { char: toChar, phase: 'idle' }
  await waitForLetter(index)
}

async function runSwitch(fromLocale: string, toLocale: string) {
  if (animating) return
  animating = true
  const from = toCode(fromLocale)
  const to = toCode(toLocale)
  const order = Math.random() < 0.5 ? [0, 1] : [1, 0]

  for (const index of order) {
    await animateSlot(index, from[index] ?? ' ', to[index] ?? ' ')
  }

  animating = false
}

onMounted(() => {
  syncSlots(props.locale)
})

watch(
  () => props.locale,
  (next, prev) => {
    if (!prev || next === prev) return
    void runSwitch(prev, next)
  },
)
</script>

<template>
  <span class="locale-toggle" aria-hidden="true">
    <span v-for="(slot, index) in slots" :key="index" class="locale-slot">
      <span
        :ref="(el) => setLetterRef(index, el)"
        class="locale-letter"
        :class="`locale-letter--${slot.phase}`"
      >
        {{ slot.char }}
      </span>
    </span>
  </span>
</template>

<style scoped>
.locale-toggle {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.02em;
  width: 1.5rem;
  min-height: 1em;
  font-variant-numeric: tabular-nums;
}

.locale-slot {
  display: inline-block;
  width: 0.62em;
  height: 1em;
  overflow: hidden;
  text-align: center;
}

.locale-letter {
  display: block;
  line-height: 1;
  transition:
    transform 0.22s cubic-bezier(0.4, 0, 0.2, 1),
    opacity 0.18s ease;
}

.locale-letter--idle {
  transform: translateY(0);
  opacity: 1;
}

.locale-letter--exit-up {
  transform: translateY(-115%);
  opacity: 0;
}

.locale-letter--exit-down {
  transform: translateY(115%);
  opacity: 0;
}

.locale-letter--enter-up {
  transform: translateY(-115%);
  opacity: 0;
}

.locale-letter--enter-down {
  transform: translateY(115%);
  opacity: 0;
}
</style>
