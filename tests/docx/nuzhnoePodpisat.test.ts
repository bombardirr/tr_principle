import { existsSync, readFileSync } from 'node:fs'
import JSZip from 'jszip'
import { describe, expect, it } from 'vitest'
import { applyTranslationsToStories } from '../../src/docx/applyTranslations'
import { extractSegmentsFromStories } from '../../src/docx/extractSegments'
import { prepareSegmentsForExport } from '../../src/docx/tags'
import { buildTranslatedDocx } from '../../src/docx/exportDocx'
import { openDocx } from '../../src/docx/openDocx'

function runTextsByUnderline(xml: string): { underlined: string[]; plainColon: boolean } {
  const underlined: string[] = []
  let plainColon = false
  for (const m of xml.matchAll(/<w:r[\s>][\s\S]*?<\/w:r>/g)) {
    const r = m[0]!
    const t = [...r.matchAll(/<w:t[^>]*>([\s\S]*?)<\/w:t>/g)].map((x) => x[1]!).join('')
    if (!t) continue
    const u = /<w:u[\s/>]/.test(r)
    if (u) underlined.push(t)
    if (t === ':' && !u) plainColon = true
  }
  return { underlined, plainColon }
}

describe('НУЖНОЕ ПОДПИСАТЬ fixture', () => {
  const fixture =
    'D:/DEV/Rosatom/Документы/Уведомление о наступлении отпуска.docx'

  it('extract keeps colon off underline; identity export preserves that', async () => {
    if (!existsSync(fixture)) return

    const buf = readFileSync(fixture)
    const zip = await JSZip.loadAsync(buf)
    const xml = await zip.file('word/document.xml')!.async('string')

    const orig = runTextsByUnderline(xml)
    expect(orig.underlined.some((t) => t.includes('НУЖНОЕ ПОДПИСАТЬ'))).toBe(true)
    expect(orig.underlined.some((t) => t.includes(':'))).toBe(false)
    expect(orig.plainColon).toBe(true)

    const segments = extractSegmentsFromStories([
      { key: 'document', path: 'word/document.xml', xml },
    ])
    const hit = segments.find((s) => s.source.includes('НУЖНОЕ ПОДПИСАТЬ'))
    expect(hit).toBeTruthy()
    // eslint-disable-next-line no-console
    console.log(
      JSON.stringify(
        {
          source: hit!.source,
          spans: hit!.spans.map((s) => ({
            fp: s.fingerprint,
            t: s.text,
            runs: s.runIndices,
          })),
        },
        null,
        2,
      ),
    )

    expect(hit!.spans.find((s) => /u:/.test(s.fingerprint))?.text).toBe(
      'НУЖНОЕ ПОДПИСАТЬ',
    )
    expect(hit!.spans.some((s) => s.text === ':' && !/u:/.test(s.fingerprint))).toBe(
      true,
    )

    const ready = prepareSegmentsForExport(segments)
    const updated = applyTranslationsToStories({ 'word/document.xml': xml }, ready)
    const out = runTextsByUnderline(updated['word/document.xml']!)
    expect(out.underlined.some((t) => t.includes(':'))).toBe(false)
    expect(out.plainColon).toBe(true)

    const opened = await openDocx(new Uint8Array(buf))
    const blob = await buildTranslatedDocx(opened.zipBytes, opened.segments)
    const outZip = await JSZip.loadAsync(blob)
    const outXml = await outZip.file('word/document.xml')!.async('string')
    const rebuilt = runTextsByUnderline(outXml)
    expect(rebuilt.underlined.some((t) => t.includes(':'))).toBe(false)
    expect(rebuilt.plainColon).toBe(true)
  })
})
