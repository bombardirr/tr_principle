import type { Segment } from '@/types/project'

/** Types shown in the UI (not plain body text). */
export const SEGMENT_KINDS = [
  'header',
  'footer',
  'footnote',
  'endnote',
  'comment',
  'textbox',
  'table',
  'caption',
] as const

export type SegmentKind = (typeof SEGMENT_KINDS)[number]

export function resolveSegmentKinds(segment: Segment): SegmentKind[] {
  const kinds: SegmentKind[] = []
  const { storyKey } = segment

  if (storyKey.startsWith('header:')) kinds.push('header')
  else if (storyKey.startsWith('footer:')) kinds.push('footer')
  else if (storyKey === 'footnotes') kinds.push('footnote')
  else if (storyKey === 'endnotes') kinds.push('endnote')
  else if (storyKey === 'comments') kinds.push('comment')

  if (segment.inTextbox) kinds.push('textbox')
  if (segment.inTable) kinds.push('table')
  if (segment.inCaption) kinds.push('caption')

  return kinds
}
