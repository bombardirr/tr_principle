import { describe, expect, it } from 'vitest'
import { collectProjectFonts, DEFAULT_STYLE_FONTS } from '../../src/docx/runStyle'

it('merges defaults with fonts from fingerprints', () => {
  const fonts = collectProjectFonts([
    { spans: [{ start: 0, end: 1, fingerprint: 'font:Comic Sans MS|b' }] },
  ])
  expect(fonts).toContain('Comic Sans MS')
  for (const d of DEFAULT_STYLE_FONTS) expect(fonts).toContain(d)
})

it('deduplicates font names case-insensitively', () => {
  const fonts = collectProjectFonts([
    {
      spans: [
        { start: 0, end: 1, fingerprint: 'font:Arial' },
        { start: 1, end: 2, fingerprint: 'font:arial' },
      ],
    },
  ])

  expect(fonts.filter((font) => font.toLocaleLowerCase() === 'arial')).toEqual(['Arial'])
})
