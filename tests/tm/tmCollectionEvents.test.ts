import { describe, expect, it, vi } from 'vitest'

import {
  TM_COLLECTION_CHANGED_EVENT,
  notifyTmCollectionChanged,
} from '../../src/tm/tmCollectionEvents'

describe('tmCollectionEvents', () => {
  it('notifies listeners when the TM collection changes', () => {
    const listener = vi.fn()
    window.addEventListener(TM_COLLECTION_CHANGED_EVENT, listener)

    notifyTmCollectionChanged()

    expect(listener).toHaveBeenCalledOnce()
    window.removeEventListener(TM_COLLECTION_CHANGED_EVENT, listener)
  })
})
