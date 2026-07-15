import { existsSync, readFileSync } from 'node:fs'
import JSZip from 'jszip'
import { describe, expect, it } from 'vitest'
import {
  applyTranslationsToStories,
  mergeParagraphGroup,
} from '../../src/docx/applyTranslations'
import { extractSegmentsFromStories } from '../../src/docx/extractSegments'
import { buildTranslatedDocx } from '../../src/docx/exportDocx'
import { openDocx } from '../../src/docx/openDocx'
import { prepareSegmentsForExport, splitTaggedText } from '../../src/docx/tags'

function longBoldTexts(xml: string): string[] {
  const paras = [...xml.matchAll(/<w:p[\s>][\s\S]*?<\/w:p>/g)].map((m) => m[0])
  const out: string[] = []
  for (const p of paras) {
    for (const r of p.matchAll(/<w:r[\s>][\s\S]*?<\/w:r>/g)) {
      const run = r[0]!
      if (!/<w:b[\s/>]/.test(run)) continue
      const t = [...run.matchAll(/<w:t[^>]*>([\s\S]*?)<\/w:t>/g)]
        .map((x) => x[1]!)
        .join('')
      if (t.length > 30) out.push(t)
    }
  }
  return out
}

describe('bold collapse on empty-target export', () => {
  it('does not put whole paragraph into first bold run (notification fixture)', async () => {
    const fixture =
      'D:/DEV/Rosatom/Документы/Уведомление о наступлении отпуска.docx'
    if (!existsSync(fixture)) return

    const buf = readFileSync(fixture)
    const zip = await JSZip.loadAsync(buf)
    const xml = await zip.file('word/document.xml')!.async('string')
    const origLongBold = longBoldTexts(xml)

    const opened = await openDocx(new Uint8Array(buf))
    expect(opened.segments.every((s) => s.target === '')).toBe(true)

    const blob = await buildTranslatedDocx(opened.zipBytes, opened.segments)
    const outZip = await JSZip.loadAsync(blob)
    const outXml = await outZip.file('word/document.xml')!.async('string')
    const outLongBold = longBoldTexts(outXml)

    const ready = prepareSegmentsForExport(opened.segments)
    const groups = new Map<string, typeof ready>()
    for (const s of ready) {
      const k = s.paragraphKey || `${s.storyKey}:${s.paraIndex}`
      const list = groups.get(k) ?? []
      list.push(s)
      groups.set(k, list)
    }

    const collapses: string[] = []
    for (const g of groups.values()) {
      const m = mergeParagraphGroup(g)
      if (!m || m.spans.length < 2) continue
      if (!m.spans[0]!.fingerprint.includes('b')) continue
      const parts = splitTaggedText(
        m.source,
        m.target.trim() === '' ? m.source : m.target,
      )
      if (!parts) continue
      const firstOrig = m.spans[0]!.text.length
      if (parts[0]!.length > Math.max(40, firstOrig * 3)) {
        collapses.push(
          `${m.id}: parts0=${JSON.stringify(parts[0]!.slice(0, 60))} spans0=${JSON.stringify(m.spans[0]!.text)} source=${JSON.stringify(m.source.slice(0, 80))}`,
        )
      }
    }

    // Diagnostic helpers for failure message
    expect(
      { origLongBold: origLongBold.length, outLongBold: outLongBold.length, collapses },
      `long-bold grew or span parts collapsed.\nOUT sample: ${JSON.stringify(outLongBold.slice(0, 3))}\ncollapses: ${collapses.slice(0, 5).join('\n')}`,
    ).toEqual({
      origLongBold: origLongBold.length,
      outLongBold: origLongBold.length,
      collapses: [],
    })
  })

  it('identity apply keeps bold extent on mixed paragraph', () => {
    const W =
      'http://schemas.openxmlformats.org/wordprocessingml/2006/main'
    const xml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="${W}">
  <w:body>
    <w:p>
      <w:r><w:rPr><w:b/></w:rPr><w:t>Уведомление</w:t></w:r>
      <w:r><w:t xml:space="preserve"> о наступлении отпуска. Второй сегмент длинный текст.</w:t></w:r>
    </w:p>
    <w:sectPr/>
  </w:body>
</w:document>`
    const segments = extractSegmentsFromStories([
      { key: 'document', path: 'word/document.xml', xml },
    ])
    const ready = prepareSegmentsForExport(segments)
    const updated = applyTranslationsToStories({ 'word/document.xml': xml }, ready)
    const out = updated['word/document.xml']!
    const boldRuns = longBoldTexts(out)
    expect(boldRuns.some((t) => t.includes('Второй'))).toBe(false)
    expect(out).toContain('Уведомление')
    expect(out).toContain('Второй сегмент')
  })
})
