import { describe, expect, it } from 'vitest'
import type { Segment } from '@/types/project'
import { resolveSegmentKinds } from '@/utils/segmentKind'

function seg(partial: Partial<Segment> & Pick<Segment, 'id'>): Segment {
  return {
    storyKey: 'document',
    storyFile: 'word/document.xml',
    paraIndex: 0,
    paragraphKey: `document:0`,
    sentenceIndex: 0,
    source: '',
    target: '',
    status: 'empty',
    inTable: false,
    inTextbox: false,
    inCaption: false,
    spans: [],
    ...partial,
  }
}

describe('resolveSegmentKinds', () => {
  it('returns empty for plain body text', () => {
    expect(resolveSegmentKinds(seg({ id: '1' }))).toEqual([])
  })

  it('detects table, header, and combined kinds', () => {
    expect(resolveSegmentKinds(seg({ id: '1', inTable: true }))).toEqual(['table'])
    expect(resolveSegmentKinds(seg({ id: '1', storyKey: 'header:1' }))).toEqual(['header'])
    expect(
      resolveSegmentKinds(
        seg({ id: '1', storyKey: 'footer:2', inTable: true, inTextbox: true }),
      ),
    ).toEqual(['footer', 'textbox', 'table'])
  })

  it('detects footnotes, endnotes, comments, and caption', () => {
    expect(resolveSegmentKinds(seg({ id: '1', storyKey: 'footnotes' }))).toEqual(['footnote'])
    expect(resolveSegmentKinds(seg({ id: '1', storyKey: 'endnotes' }))).toEqual(['endnote'])
    expect(resolveSegmentKinds(seg({ id: '1', storyKey: 'comments' }))).toEqual(['comment'])
    expect(resolveSegmentKinds(seg({ id: '1', inCaption: true }))).toEqual(['caption'])
  })
})
