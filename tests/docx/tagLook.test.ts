import { describe, expect, it } from 'vitest'
import { describeFingerprint, lookForTag } from '../../src/docx/tagLook'

describe('tagLook', () => {
  it('maps bold to HTML-like <b>', () => {
    expect(describeFingerprint('b', 'ru')).toEqual({
      open: '<b>',
      close: '</b>',
      title: 'Жирный',
    })
  })

  it('nests bold+italic like HTML', () => {
    const spans = [{ runIndices: [0], fingerprint: 'b|i', text: 'x' }]
    expect(lookForTag('{1}', spans, 'ru').symbol).toBe('<b><i>')
    expect(lookForTag('{2}', spans, 'ru').symbol).toBe('</i></b>')
  })

  it('uses <cf> for font/size', () => {
    expect(describeFingerprint('sz:24', 'en').open).toBe('<cf>')
  })
})
