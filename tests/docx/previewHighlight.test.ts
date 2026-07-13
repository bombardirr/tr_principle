import { describe, expect, it } from 'vitest'
import { JSDOM } from 'jsdom'
import type { Segment } from '@/types/project'
import { indexPreviewSegments, normalizePreviewText } from '@/docx/previewHighlight'

function seg(id: string, source: string, target = ''): Segment {
  return {
    id,
    storyKey: 'document',
    storyFile: 'word/document.xml',
    paraIndex: 0,
    source,
    target,
    status: 'empty',
    inTable: false,
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
})
