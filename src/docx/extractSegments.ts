import type { RunSpan, Segment } from '@/types/project'
import { buildTaggedText } from './tags'
import { paragraphKeyOf, splitParagraphUnits } from '@/tm/sentences'
import {
  allParagraphsLoose,
  collectRunsWithT,
  formatFingerprint,
  isCaptionParagraph,
  isInsideTable,
  isInsideTextbox,
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

/** Word often splits "Кому" and ":" into different runs — don't force markers for that. */
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
    // Only fold punctuation/whitespace into a neighbour with the SAME format.
    // Cross-format merges (underlined «АТЬ» + plain «:») would extend underline on export.
    if (prev && isMinorSpanText(span.text) && prev.fingerprint === span.fingerprint) {
      prev.text += span.text
      prev.runIndices.push(...span.runIndices)
      continue
    }
    if (
      prev &&
      isMinorSpanText(prev.text) &&
      !isMinorSpanText(span.text) &&
      prev.fingerprint === span.fingerprint
    ) {
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

      const fullSource = buildTaggedText(spans.map((s) => s.text))
      const units = splitParagraphUnits(fullSource)
      const pKey = paragraphKeyOf(story.key, paraIndex)
      const paragraphSpans = spans.map((sp) => ({
        runIndices: [...sp.runIndices],
        fingerprint: sp.fingerprint,
        text: sp.text,
      }))

      units.forEach((sentenceSource, sentenceIndex) => {
        segments.push({
          id: String(seq++),
          storyKey: story.key,
          storyFile: story.path,
          paraIndex,
          paragraphKey: pKey,
          sentenceIndex,
          source: sentenceSource,
          target: '',
          status: 'empty',
          inTable: isInsideTable(para),
          inTextbox: isInsideTextbox(para),
          inCaption: isCaptionParagraph(para),
          spans: sentenceIndex === 0 ? paragraphSpans : [],
          paragraphSpans,
        })
      })
    })
  }

  return segments
}
