<script setup lang="ts">
import AppTooltip from '@/components/AppTooltip.vue'
import { useAnchoredTooltip } from '@/composables/useAnchoredTooltip'

const props = withDefaults(
  defineProps<{
    text: string
    as?: string
  }>(),
  { as: 'span' },
)

const { tip, tooltipRef, showAtAnchor, hide } = useAnchoredTooltip()

function onShow(event: MouseEvent | FocusEvent) {
  if (!props.text) return
  void showAtAnchor(event.currentTarget as HTMLElement, props.text)
}
</script>

<template>
  <component
    :is="as"
    v-bind="$attrs"
    @mouseenter="onShow"
    @mouseleave="hide"
    @focus="onShow"
    @blur="hide"
  >
    <slot />
    <AppTooltip
      ref="tooltipRef"
      :text="tip.text"
      :visible="tip.visible"
      :ready="tip.ready"
      :x="tip.x"
      :y="tip.y"
      :placement="tip.placement"
    />
  </component>
</template>
