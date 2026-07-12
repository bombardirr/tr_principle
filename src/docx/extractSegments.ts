import type { RunSpan, Segment } from '@/types/project'
import { buildTaggedText } from './tags'
import {
  allParagraphsLoose,
  collectRunsWithT,
  formatFingerprint,
  isInsideTable,
  parseXml,
  runText,
} from './xmlUtils'

export interface StoryFile {
  key: string
  path: string
  xml: string
}

function groupSpans(runs: Element[]): RunSpan[] {
  const spans: RunSpan[] = []
  runs.forEach((run, index) => {
    const text = runText(run)
    const fingerprint = formatFingerprint(run)
    const last = spans[spans.length - 1]
    if (last && last.fingerprint === fingerprint) {
      last.runIndices.push(index)
      last.text += text
    } else {
      spans.push({ runIndices: [index], fingerprint, text })
    }
  })
  return mergeMinorSpans(spans.filter((s) => s.text.length > 0))
}

/** Word often splits "Кому" and ":" into different runs — don't force tags for that. */
function isMinorSpanText(text: string): boolean {
  const t = text.trim()
  if (!t) return true
  if (t.length > 4) return false
  return /^[\p{P}\p{S}]+$/u.test(t)
}

function mergeMinorSpans(spans: RunSpan[]): RunSpan[] {
  const out: RunSpan[] = []
  for (const span of spans) {
    const prev = out[out.length - 1]
    if (prev && isMinorSpanText(span.text)) {
      prev.text += span.text
      prev.runIndices.push(...span.runIndices)
      continue
    }
    if (prev && isMinorSpanText(prev.text) && !isMinorSpanText(span.text)) {
      // leading punctuation → glue onto following text span
      span.text = prev.text + span.text
      span.runIndices = [...prev.runIndices, ...span.runIndices]
      out[out.length - 1] = span
      continue
    }
    out.push({
      runIndices: [...span.runIndices],
      fingerprint: span.fingerprint,
      text: span.text,
    })
  }
  return out
}

export function extractSegmentsFromStories(stories: StoryFile[]): Segment[] {
  const segments: Segment[] = []
  let seq = 1

  for (const story of stories) {
    const doc = parseXml(story.xml)
    const root = doc.documentElement
    const paragraphs = allParagraphsLoose(root)

    paragraphs.forEach((para, paraIndex) => {
      const runs = collectRunsWithT(para)
      const spans = groupSpans(runs)
      const plain = spans.map((s) => s.text).join('')
      if (!plain.trim()) return

      const source = buildTaggedText(spans.map((s) => s.text))
      segments.push({
        id: `seg-${seq++}`,
        storyKey: story.key,
        storyFile: story.path,
        paraIndex,
        source,
        target: '',
        status: 'empty',
        inTable: isInsideTable(para),
        spans,
      })
    })
  }

  return segments
}
