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

  it('merges trailing punctuation into previous span (no bogus tags)', () => {
    const xml = minimalDocumentXml(
      `<w:p>
        <w:r><w:rPr><w:b/></w:rPr><w:t>Кому</w:t></w:r>
        <w:r><w:t>:</w:t></w:r>
      </w:p>`,
    )
    const segments = extractSegmentsFromStories([
      { key: 'document', path: 'word/document.xml', xml },
    ])
    expect(segments[0]!.source).toBe('Кому:')
    expect(segments[0]!.source.includes('{')).toBe(false)
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
})
