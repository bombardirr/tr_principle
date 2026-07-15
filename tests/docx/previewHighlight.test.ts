import { describe, expect, it } from 'vitest'
import { JSDOM } from 'jsdom'
import type { Segment } from '@/types/project'
import {
  highlightPreviewSegment,
  indexPreviewSegments,
  isSegmentDone,
  markPreviewSegments,
  normalizePreviewText,
  PREVIEW_DONE_CLASS,
  PREVIEW_HIT_CLASS,
  resolvePreviewSegmentClick,
} from '@/docx/previewHighlight'

function seg(
  id: string,
  source: string,
  target = '',
  status: Segment['status'] = 'empty',
): Segment {
  return {
    id,
    storyKey: 'document',
    storyFile: 'word/document.xml',
    paraIndex: 0,
    paragraphKey: `document:${id}`,
    sentenceIndex: 0,
    source,
    target,
    status,
    inTable: false,
    inTextbox: false,
    inCaption: false,
    spans: [],
  }
}

describe('previewHighlight', () => {
  it('normalizes tagged text', () => {
    expect(normalizePreviewText('{1}Hello {2}{3}world{4}')).toBe('hello world')
  })

  it('maps segments to preview paragraphs by text', () => {
    const dom = new JSDOM(
      '<div id="host"><p>Hello world</p><p>Second paragraph</p></div>',
    )
    const host = dom.window.document.getElementById('host')!
    const segments = [seg('seg-1', 'Hello world'), seg('seg-2', 'Second paragraph')]

    const map = indexPreviewSegments(host, segments)
    expect(map.get('seg-1')?.textContent).toBe('Hello world')
    expect(map.get('seg-2')?.textContent).toBe('Second paragraph')
  })

  it('prefers target text when present', () => {
    const dom = new JSDOM('<div id="host"><p>Привет мир</p></div>')
    const host = dom.window.document.getElementById('host')!
    const segments = [seg('seg-1', 'Hello world', 'Привет мир')]

    const map = indexPreviewSegments(host, segments)
    expect(map.get('seg-1')?.textContent).toBe('Привет мир')
  })

  it('marks done segments and active hit in preview', () => {
    const dom = new JSDOM(
      '<div id="host"><p>Done</p><p>Empty</p><p>Also done</p></div>',
    )
    const host = dom.window.document.getElementById('host')!
    const segments = [
      seg('seg-1', 'Done', 'Done', 'done'),
      seg('seg-2', 'Empty'),
      seg('seg-3', 'Also done', 'Also done', 'done'),
    ]
    const map = indexPreviewSegments(host, segments)

    highlightPreviewSegment(host, map, segments, 'seg-2', { scroll: false })

    expect(map.get('seg-1')?.classList.contains(PREVIEW_DONE_CLASS)).toBe(true)
    expect(map.get('seg-2')?.classList.contains(PREVIEW_DONE_CLASS)).toBe(false)
    expect(map.get('seg-2')?.classList.contains(PREVIEW_HIT_CLASS)).toBe(true)
    expect(map.get('seg-3')?.classList.contains(PREVIEW_DONE_CLASS)).toBe(true)
    expect(isSegmentDone(segments[0])).toBe(true)
    expect(isSegmentDone(segments[1])).toBe(false)
  })

  it('marks intentionally empty done segments as done', () => {
    const segment = seg('seg-1', 'Hello', '', 'done')
    expect(isSegmentDone(segment)).toBe(true)
  })

  it('marks preview paragraphs and resolves click target to segment id', () => {
    const dom = new JSDOM('<div id="host"><p>Hello world</p></div>')
    const host = dom.window.document.getElementById('host')!
    const segments = [seg('seg-1', 'Hello world')]
    const map = indexPreviewSegments(host, segments)
    markPreviewSegments(map)

    const paragraph = map.get('seg-1')!
    expect(paragraph.getAttribute('data-appzac-segment-id')).toBe('seg-1')
    expect(resolvePreviewSegmentClick(paragraph)).toBe('seg-1')
    expect(resolvePreviewSegmentClick(paragraph.firstChild!)).toBe('seg-1')
    expect(resolvePreviewSegmentClick(host)).toBeNull()
  })

  it('splits multi-sentence paragraphs into per-sentence highlight targets', () => {
    const dom = new JSDOM(
      '<div id="host"><p>We like you. We really like you. We like you</p></div>',
    )
    const host = dom.window.document.getElementById('host')!
    const segments: Segment[] = [
      {
        ...seg('1', 'Вы нам нравитесь.'),
        paragraphKey: 'document:0',
        sentenceIndex: 0,
        target: 'We like you.',
        status: 'done',
      },
      {
        ...seg('2', 'Вы нам реально нравитесь.'),
        paragraphKey: 'document:0',
        sentenceIndex: 1,
        paraIndex: 0,
        target: 'We really like you.',
        status: 'empty',
      },
      {
        ...seg('3', 'Вы нам нравитесь'),
        paragraphKey: 'document:0',
        sentenceIndex: 2,
        paraIndex: 0,
        target: 'We like you',
        status: 'empty',
      },
    ]

    const map = indexPreviewSegments(host, segments)
    expect(map.get('1')).not.toBe(map.get('2'))
    expect(map.get('2')).not.toBe(map.get('3'))
    expect(map.get('1')?.textContent?.trim()).toBe('We like you.')
    expect(map.get('2')?.textContent?.trim()).toBe('We really like you.')

    highlightPreviewSegment(host, map, segments, '2', { scroll: false })

    expect(map.get('1')?.classList.contains(PREVIEW_DONE_CLASS)).toBe(true)
    expect(map.get('2')?.classList.contains(PREVIEW_HIT_CLASS)).toBe(true)
    expect(map.get('1')?.classList.contains(PREVIEW_HIT_CLASS)).toBe(false)
    expect(resolvePreviewSegmentClick(map.get('2')!)).toBe('2')
  })
})
