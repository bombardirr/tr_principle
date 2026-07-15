import JSZip from 'jszip'
import { describe, expect, it } from 'vitest'
import { applyTranslationsToStories } from '../../src/docx/applyTranslations'
import { extractSegmentsFromStories } from '../../src/docx/extractSegments'
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

function boldRunTexts(xml: string): string[] {
  return [...xml.matchAll(/<w:r[\s>][\s\S]*?<\/w:r>/g)]
    .map((m) => m[0]!)
    .filter((r) => /<w:b[\s/>]/.test(r))
    .map((r) =>
      [...r.matchAll(/<w:t[^>]*>([\s\S]*?)<\/w:t>/g)].map((x) => x[1]!).join(''),
    )
    .filter((t) => t.length > 0)
}

describe('targetStyles export', () => {
  it('rebuilds runs from targetStyles (bold first word)', async () => {
    const xml = minimalDocumentXml(
      `<w:p>
        <w:r><w:rPr><w:b/></w:rPr><w:t>Hello</w:t></w:r>
        <w:r><w:t> world</w:t></w:r>
      </w:p>`,
    )
    const bytes = await makeDocx({ 'word/document.xml': xml })
    const segments = extractSegmentsFromStories([
      { key: 'document', path: 'word/document.xml', xml },
    ])
    expect(segments).toHaveLength(1)
    expect(segments[0]!.source).toContain('Hello')

    segments[0]!.target = 'Привет world'
    segments[0]!.status = 'done'
    segments[0]!.targetStyles = [{ start: 0, end: 6, bold: true }]

    const updated = applyTranslationsToStories({ 'word/document.xml': xml }, segments)
    const out = updated['word/document.xml']!
    const boldTexts = boldRunTexts(out)

    expect(boldTexts).toEqual(['Привет'])
    expect(out).toContain('Привет')
    expect(out).toContain('world')
    expect(boldTexts.some((t) => t.includes('world'))).toBe(false)

    const blob = await buildTranslatedDocx(bytes, segments)
    const outZip = await JSZip.loadAsync(blob)
    const outXml = await outZip.file('word/document.xml')!.async('string')
    expect(boldRunTexts(outXml)).toEqual(['Привет'])
  })

  it('exports color, underline val, and highlight from targetStyles', () => {
    const xml = minimalDocumentXml(
      `<w:p><w:r><w:t>Hello</w:t></w:r></w:p>`,
    )
    const segments = extractSegmentsFromStories([
      { key: 'document', path: 'word/document.xml', xml },
    ])
    segments[0]!.target = 'Hello'
    segments[0]!.status = 'done'
    segments[0]!.targetStyles = [
      {
        start: 0,
        end: 5,
        underline: true,
        underlineVal: 'double',
        color: 'C00000',
        highlight: 'yellow',
        italic: true,
      },
    ]
    const updated = applyTranslationsToStories({ 'word/document.xml': xml }, segments)
    const out = updated['word/document.xml']!
    expect(out).toMatch(/<w:i[\s/>]/)
    expect(out).toMatch(/w:val="double"/)
    expect(out).toMatch(/w:val="C00000"/)
    expect(out).toMatch(/w:val="yellow"/)
  })
})
