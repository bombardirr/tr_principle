import JSZip from 'jszip'
import { describe, expect, it } from 'vitest'
import { applyTranslationsToStories } from '../../src/docx/applyTranslations'
import { extractSegmentsFromStories } from '../../src/docx/extractSegments'
import { openDocx } from '../../src/docx/openDocx'
import { buildTranslatedDocx } from '../../src/docx/exportDocx'

const W =
  'http://schemas.openxmlformats.org/wordprocessingml/2006/main'

function minimalDocumentXml(bodyInner: string): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="${W}">
  <w:body>
    ${bodyInner}
    <w:sectPr/>
  </w:body>
</w:document>`
}

async function makeDocx(parts: Record<string, string>): Promise<ArrayBuffer> {
  const zip = new JSZip()
  zip.file(
    '[Content_Types].xml',
    `<?xml version="1.0" encoding="UTF-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`,
  )
  zip.folder('_rels')?.file(
    '.rels',
    `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`,
  )
  for (const [path, xml] of Object.entries(parts)) {
    zip.file(path, xml)
  }
  return zip.generateAsync({ type: 'arraybuffer' })
}

describe('docx round-trip', () => {
  it('extracts plain paragraph', async () => {
    const xml = minimalDocumentXml(
      `<w:p><w:r><w:t>Hello world</w:t></w:r></w:p>`,
    )
    const bytes = await makeDocx({ 'word/document.xml': xml })
    const opened = await openDocx(bytes)
    expect(opened.segments).toHaveLength(1)
    expect(opened.segments[0]!.source).toBe('Hello world')
  })

  it('preserves bold via tags', async () => {
    const xml = minimalDocumentXml(
      `<w:p>
        <w:r><w:t>Hello </w:t></w:r>
        <w:r><w:rPr><w:b/></w:rPr><w:t>world</w:t></w:r>
      </w:p>`,
    )
    const stories = [{ key: 'document', path: 'word/document.xml', xml }]
    const segments = extractSegmentsFromStories(stories)
    expect(segments[0]!.source).toBe('{1}Hello {2}{3}world{4}')

    segments[0]!.target = '{1}Привет {2}{3}мир{4}'
    const updated = applyTranslationsToStories({ 'word/document.xml': xml }, segments)
    expect(updated['word/document.xml']).toContain('Привет')
    expect(updated['word/document.xml']).toContain('мир')
    expect(updated['word/document.xml']).toContain('<w:b')
  })

  it('identity export keeps text', async () => {
    const xml = minimalDocumentXml(
      `<w:p><w:r><w:t>Same</w:t></w:r></w:p>`,
    )
    const bytes = await makeDocx({ 'word/document.xml': xml })
    const opened = await openDocx(bytes)
    const blob = await buildTranslatedDocx(bytes, opened.segments)
    const outZip = await JSZip.loadAsync(blob)
    const outXml = await outZip.file('word/document.xml')!.async('string')
    expect(outXml).toContain('Same')
  })

  it('reads table cell paragraphs', () => {
    const xml = minimalDocumentXml(
      `<w:tbl>
        <w:tr>
          <w:tc><w:p><w:r><w:t>Cell A</w:t></w:r></w:p></w:tc>
          <w:tc><w:p><w:r><w:t>Cell B</w:t></w:r></w:p></w:tc>
        </w:tr>
      </w:tbl>`,
    )
    const segments = extractSegmentsFromStories([
      { key: 'document', path: 'word/document.xml', xml },
    ])
    expect(segments.map((s) => s.source)).toEqual(['Cell A', 'Cell B'])
    expect(segments.every((s) => s.inTable)).toBe(true)
  })

  it('merges trailing punctuation only when format matches', () => {
    const xml = minimalDocumentXml(
      `<w:p>
        <w:r><w:t>Кому</w:t></w:r>
        <w:r><w:t>:</w:t></w:r>
      </w:p>`,
    )
    const segments = extractSegmentsFromStories([
      { key: 'document', path: 'word/document.xml', xml },
    ])
    expect(segments[0]!.source).toBe('Кому:')
    expect(segments[0]!.source.includes('{')).toBe(false)
  })

  it('keeps colon outside underlined run (НУЖНОЕ ПОДПИСАТЬ:)', async () => {
    const xml = minimalDocumentXml(
      `<w:p>
        <w:r><w:rPr><w:b/><w:u w:val="single"/></w:rPr><w:t>НУЖНОЕ ПОДПИСАТЬ</w:t></w:r>
        <w:r><w:rPr><w:b/></w:rPr><w:t>:</w:t></w:r>
      </w:p>`,
    )
    const segments = extractSegmentsFromStories([
      { key: 'document', path: 'word/document.xml', xml },
    ])
    expect(segments[0]!.source).toBe('{1}НУЖНОЕ ПОДПИСАТЬ{2}{3}:{4}')
    const uSpan = segments[0]!.spans.find((s) => s.fingerprint.includes('u:'))
    expect(uSpan?.text).toBe('НУЖНОЕ ПОДПИСАТЬ')
    expect(segments[0]!.spans.some((s) => s.text === ':')).toBe(true)

    const updated = applyTranslationsToStories({ 'word/document.xml': xml }, segments)
    const out = updated['word/document.xml']!
    const underlined = [...out.matchAll(/<w:r[\s>][\s\S]*?<\/w:r>/g)]
      .map((m) => m[0]!)
      .filter((r) => /<w:u[\s/>]/.test(r))
      .map((r) =>
        [...r.matchAll(/<w:t[^>]*>([\s\S]*?)<\/w:t>/g)].map((x) => x[1]!).join(''),
      )
      .join('')
    expect(underlined).toBe('НУЖНОЕ ПОДПИСАТЬ')
    expect(underlined.includes(':')).toBe(false)
  })

  it('keeps underlined whitespace blanks as their own marker span', () => {
    const xml = minimalDocumentXml(
      `<w:p>
        <w:r><w:t xml:space="preserve">метод работы </w:t></w:r>
        <w:r><w:rPr><w:u w:val="single"/></w:rPr><w:t xml:space="preserve">        </w:t></w:r>
        <w:r><w:t xml:space="preserve"> календарных дней</w:t></w:r>
      </w:p>`,
    )
    const segments = extractSegmentsFromStories([
      { key: 'document', path: 'word/document.xml', xml },
    ])
    expect(segments[0]!.source).toBe(
      '{1}метод работы {2}{3}        {4}{5} календарных дней{6}',
    )
    expect(segments[0]!.spans.some((s) => s.fingerprint.startsWith('u:'))).toBe(true)
  })

  it('preserves w:tab gaps between signature labels on identity export', () => {
    const xml = minimalDocumentXml(
      `<w:p>
        <w:r><w:tab/><w:tab/><w:tab/></w:r>
        <w:r><w:t>подпись</w:t></w:r>
        <w:r><w:tab/><w:tab/><w:tab/><w:tab/></w:r>
        <w:r><w:t>ФИО работника</w:t></w:r>
      </w:p>`,
    )
    const stories = [{ key: 'document', path: 'word/document.xml', xml }]
    const segments = extractSegmentsFromStories(stories)
    expect(segments.length).toBe(2)
    expect(segments[0]!.source).toMatch(/подпись\t+$/)
    expect(segments[1]!.source.replace(/\s+$/, '')).toBe('ФИО работника')

    const updated = applyTranslationsToStories({ 'word/document.xml': xml }, segments)
    const out = updated['word/document.xml']!
    expect(out.match(/<w:tab\b/g)?.length ?? 0).toBeGreaterThanOrEqual(7)
    expect(out).toMatch(/подпись[\s\S]*?<w:tab[\s\S]*?ФИО работника/)
  })

  it('keeps tab gaps on vacation notification fixture when present', async () => {
    const { readFileSync, existsSync } = await import('node:fs')
    const { resolve } = await import('node:path')
    const fixture = resolve('tmp-vacation.docx')
    if (!existsSync(fixture)) return

    const zip = await JSZip.loadAsync(readFileSync(fixture))
    const xml = await zip.file('word/document.xml')!.async('string')
    const segments = extractSegmentsFromStories([
      { key: 'document', path: 'word/document.xml', xml },
    ])
    const sig = segments.filter(s => /подпись/i.test(s.source))
    const fio = segments.filter(s => /ФИО работника/i.test(s.source))
    expect(sig.length).toBeGreaterThanOrEqual(1)
    expect(fio.length).toBeGreaterThanOrEqual(1)
    // Layout fields are separate editor units, not one merged source.
    expect(sig.every(s => !/ФИО работника/i.test(s.source))).toBe(true)
    expect(fio.every(s => !/подпись/i.test(s.source))).toBe(true)
    expect(sig.some(s => /\t{2,}/.test(s.source))).toBe(true)

    const updated = applyTranslationsToStories({ 'word/document.xml': xml }, segments)
    const out = updated['word/document.xml']!
    expect(out).toMatch(/подпись[\s\S]*?<w:tab[\s\S]*?ФИО работника/)
    expect((out.match(/<w:tab\b/g) ?? []).length).toBeGreaterThanOrEqual(20)
  })

  it('keeps original XML untouched when nothing is translated (faithful preview)', async () => {
    const xml = minimalDocumentXml(
      `<w:p>
        <w:r><w:tab/><w:tab/><w:tab/></w:r>
        <w:r><w:t>подпись</w:t></w:r>
        <w:r><w:tab/><w:tab/><w:tab/><w:tab/></w:r>
        <w:r><w:t>ФИО работника</w:t></w:r>
      </w:p>`,
    )
    const bytes = await makeDocx({ 'word/document.xml': xml })
    const opened = await openDocx(bytes)
    const blob = await buildTranslatedDocx(bytes, opened.segments)
    const outZip = await JSZip.loadAsync(blob)
    const outXml = await outZip.file('word/document.xml')!.async('string')
    expect(outXml).toBe(xml)
  })

  it('opens sample vacation schedule fixture when present', async () => {
    const { readFileSync, existsSync } = await import('node:fs')
    const { resolve } = await import('node:path')
    const fixture = resolve('tests/fixtures/sample.docx')
    if (!existsSync(fixture)) return

    const buf = readFileSync(fixture)
    const opened = await openDocx(new Uint8Array(buf))
    expect(opened.segments.length).toBeGreaterThan(0)
    const blob = await buildTranslatedDocx(opened.zipBytes, opened.segments)
    const outZip = await JSZip.loadAsync(blob)
    expect(outZip.file('word/document.xml')).toBeTruthy()
  })

  it('keeps вахтовый fill-in underline blank from local notification fixture', async () => {
    const { readFileSync, existsSync } = await import('node:fs')
    const fixture =
      'D:/DEV/Rosatom/Документы/Уведомление о наступлении отпуска.docx'
    if (!existsSync(fixture)) return

    const zip = await JSZip.loadAsync(readFileSync(fixture))
    const xml = await zip.file('word/document.xml')!.async('string')
    const segments = extractSegmentsFromStories([
      { key: 'document', path: 'word/document.xml', xml },
    ])
    const hit = segments.find((s) => s.source.includes('вахтовый'))
    expect(hit).toBeTruthy()
    expect(hit!.source).toContain('{18}{19}        {20}{21}')
    expect(hit!.spans.some((s) => /u:/.test(s.fingerprint) && /^\s+$/.test(s.text))).toBe(
      true,
    )
  })
})
