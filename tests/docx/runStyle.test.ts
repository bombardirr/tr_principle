import { describe, expect, it } from 'vitest'
import {
  styledPiecesFromTagged,
  targetStylesFromTaggedSource,
  toggleStyleRange,
  effectiveTargetStyles,
  predominantSourceStyle,
} from '../../src/docx/runStyle'
import type { RunSpan } from '../../src/types/project'

describe('runStyle', () => {
  it('maps tagged source to underlined then plain colon', () => {
    const spans: RunSpan[] = [
      {
        runIndices: [0],
        fingerprint: 'b|u:single',
        text: 'НУЖНОЕ ПОДПИСАТЬ',
      },
      { runIndices: [1], fingerprint: 'b', text: ':' },
    ]
    const pieces = styledPiecesFromTagged('{1}НУЖНОЕ ПОДПИСАТЬ{2}{3}:{4}', spans)
    expect(pieces).toEqual([
      {
        text: 'НУЖНОЕ ПОДПИСАТЬ',
        style: { bold: true, underline: true, underlineVal: 'single' },
      },
      { text: ':', style: { bold: true } },
    ])
  })

  it('builds targetStyles from tagged source for copy including font/size/color', () => {
    const spans: RunSpan[] = [
      {
        runIndices: [0],
        fingerprint: 'b|color:FF0000|font:Arial||sz:22|u:single',
        text: 'ab',
      },
      {
        runIndices: [1],
        fingerprint: 'font:Arial||highlight:yellow|sz:20',
        text: 'cd',
      },
    ]
    expect(targetStylesFromTaggedSource('{1}ab{2}{3}cd{4}', spans)).toEqual([
      {
        start: 0,
        end: 2,
        bold: true,
        underline: true,
        underlineVal: 'single',
        font: 'Arial',
        fontSizePt: 11,
        color: 'FF0000',
      },
      {
        start: 2,
        end: 4,
        font: 'Arial',
        fontSizePt: 10,
        highlight: 'yellow',
      },
    ])
  })

  it('inherits source styles onto target when targetStyles absent', () => {
    const spans: RunSpan[] = [
      {
        runIndices: [0],
        fingerprint: 'b|font:Arial||sz:22',
        text: 'ab',
      },
      {
        runIndices: [1],
        fingerprint: 'font:Calibri||sz:20',
        text: 'cd',
      },
    ]
    const tagged = '{1}ab{2}{3}cd{4}'
    expect(effectiveTargetStyles('abcd', tagged, spans, undefined)).toEqual(
      targetStylesFromTaggedSource(tagged, spans),
    )
    expect(effectiveTargetStyles('abcd', tagged, spans, [{ start: 0, end: 4, italic: true }])).toEqual([
      { start: 0, end: 4, italic: true },
    ])
    expect(effectiveTargetStyles('abcd', tagged, spans, [])).toEqual([])
    // Different length → proportional map (first half from first run, etc.)
    const mapped = effectiveTargetStyles('xxxx', tagged, spans, undefined)
    expect(mapped[0]).toMatchObject({ start: 0, end: 2, bold: true, font: 'Arial', fontSizePt: 11 })
    expect(mapped[1]).toMatchObject({ start: 2, end: 4, font: 'Calibri', fontSizePt: 10 })
  })

  it('predominantSourceStyle picks longest run', () => {
    const spans: RunSpan[] = [
      { runIndices: [0], fingerprint: 'font:Arial||sz:20', text: 'a' },
      { runIndices: [1], fingerprint: 'b|font:Calibri||sz:24', text: 'bbb' },
    ]
    expect(predominantSourceStyle('{1}a{2}{3}bbb{4}', spans)).toEqual({
      bold: true,
      font: 'Calibri',
      fontSizePt: 12,
    })
  })

  it('parses strike / vertAlign from fingerprint', () => {
    const spans: RunSpan[] = [
      {
        runIndices: [0],
        fingerprint: 'i|strike:1|vertAlign:superscript',
        text: 'x',
      },
    ]
    expect(styledPiecesFromTagged('{1}x{2}', spans)[0]!.style).toEqual({
      italic: true,
      strike: true,
      vertAlign: 'superscript',
    })
  })

  it('toggles bold on a range', () => {
    const next = toggleStyleRange(undefined, 5, 1, 4, 'bold')
    expect(next).toEqual([{ start: 1, end: 4, bold: true }])
    expect(toggleStyleRange(next, 5, 1, 4, 'bold')).toEqual([])
  })
})
