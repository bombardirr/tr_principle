import { nextTick, ref } from 'vue'
import {
  positionTooltipNearAnchor,
  type TooltipPlacement,
} from '@/utils/tooltipPlacement'

export function useAnchoredTooltip() {
  const tip = ref({
    visible: false,
    ready: false,
    text: '',
    x: 0,
    y: 0,
    placement: 'top' as TooltipPlacement,
  })

  const tooltipRef = ref<{ root: HTMLElement | null } | null>(null)

  async function showAtAnchor(anchor: HTMLElement, text: string) {
    if (!text) return
    const rect = anchor.getBoundingClientRect()
    tip.value = {
      visible: true,
      ready: false,
      text,
      x: rect.left + rect.width / 2,
      y: rect.top,
      placement: 'top',
    }
    await nextTick()
    const root = tooltipRef.value?.root
    if (!root) return
    const pos = positionTooltipNearAnchor(anchor, root)
    tip.value = { visible: true, ready: true, text, ...pos }
  }

  function hide() {
    tip.value.visible = false
    tip.value.ready = false
  }

  return { tip, tooltipRef, showAtAnchor, hide }
}
