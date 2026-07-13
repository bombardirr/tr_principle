export const TAG_RE = /\{(\d+)\}/g

/** Build tagged source from format spans. Single span → plain text (no tags). */
export function buildTaggedText(spanTexts: string[]): string {
  if (spanTexts.length === 0) return ''
  if (spanTexts.length === 1) return spanTexts[0] ?? ''

  let id = 1
  let out = ''
  for (const text of spanTexts) {
    const open = id++
    const close = id++
    out += `{${open}}${text}{${close}}`
  }
  return out
}

export function extractTagIds(text: string): number[] {
  return [...text.matchAll(TAG_RE)].map((m) => Number(m[1]))
}

/** True if target has the same tag id sequence as source. */
export function tagsMatch(source: string, target: string): boolean {
  const a = extractTagIds(source)
  const b = extractTagIds(target)
  if (a.length !== b.length) return false
  return a.every((id, i) => id === b[i])
}

/**
 * Split tagged text into span texts matching source tag structure.
 * Untagged single-span source → one part = full target (tags stripped if any).
 */
export function splitTaggedText(source: string, target: string): string[] | null {
  const sourceTags = extractTagIds(source)
  if (sourceTags.length === 0) {
    return [target.replace(TAG_RE, '')]
  }

  if (!tagsMatch(source, target)) return null

  const parts: string[] = []
  let i = 0
  while (i < sourceTags.length) {
    const open = sourceTags[i]!
    const close = sourceTags[i + 1]!
    const openTok = `{${open}}`
    const closeTok = `{${close}}`
    const start = target.indexOf(openTok)
    const end = target.indexOf(closeTok, start + openTok.length)
    if (start < 0 || end < 0) return null
    parts.push(target.slice(start + openTok.length, end))
    i += 2
  }
  return parts
}

/**
 * If tags were dropped while translating, put all plain text into the first
 * format span so export still works (inline format may collapse for that segment).
 */
export function coerceTargetTags(source: string, target: string): string {
  const trimmed = target.trim() === '' ? source : target
  if (tagsMatch(source, trimmed)) return trimmed

  const tags = extractTagIds(source)
  if (tags.length === 0) return trimmed.replace(TAG_RE, '')

  const plain = trimmed.replace(TAG_RE, '')
  let out = ''
  for (let i = 0; i < tags.length; i += 2) {
    const open = tags[i]!
    const close = tags[i + 1]!
    out += `{${open}}${i === 0 ? plain : ''}{${close}}`
  }
  return out
}

import type { Segment } from '@/types/project'

export function prepareSegmentsForExport(segments: Segment[]): Segment[] {
  return segments.map((s) => ({
    ...s,
    target:
      s.status === 'done' && s.target.trim() === ''
        ? s.target
        : coerceTargetTags(s.source, s.target),
  }))
}
