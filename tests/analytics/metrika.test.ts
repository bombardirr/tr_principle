import { describe, expect, it } from 'vitest'
import { getMetrikaCounterId, isMetrikaEnabled } from '../../src/analytics/metrika'

describe('metrika env gate', () => {
  it('is disabled when VITE_YANDEX_METRIKA_ID is unset in test build', () => {
    // Vitest build typically has no counter id → helpers no-op safely
    expect(isMetrikaEnabled()).toBe(Boolean(getMetrikaCounterId()))
    if (!import.meta.env.VITE_YANDEX_METRIKA_ID) {
      expect(isMetrikaEnabled()).toBe(false)
      expect(getMetrikaCounterId()).toBeNull()
    }
  })
})
