import JSZip from 'jszip'
import { describe, expect, it } from 'vitest'
import { resegmentParagraphs, resegmentProjectRecord } from '@/tm/resegment'
import type { ProjectRecord, Segment } from '@/types/project'

const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'

async function makeDocx(bodyInner: string): Promise<ArrayBuffer> {
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
  zip.file(
    'word/document.xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="${W}">
  <w:body>
    ${bodyInner}
    <w:sectPr/>
  </w:body>
</w:document>`,
  )
  return zip.generateAsync({ type: 'arraybuffer' })
}

function seg(partial: Partial<Segment> & Pick<Segment, 'source'>): Segment {
  return {
    id: '1',
    storyKey: 'document',
    storyFile: 'word/document.xml',
    paraIndex: 0,
    paragraphKey: 'document:0',
    sentenceIndex: 0,
    target: '',
    status: 'empty',
    inTable: false,
    inTextbox: false,
    inCaption: false,
    spans: [],
    paragraphSpans: [],
    ...partial,
  }
}

describe('resegmentParagraphs layout fields', () => {
  it('splits подпись / ФИО when source still has tab gaps', () => {
    const { segments } = resegmentParagraphs([
      seg({
        source: '\t\t\t\t\t\tподпись \t\t\t\tФИО работника',
        paragraphSpans: [
          { runIndices: [0], fingerprint: '', text: '\t\t\t\t\t\t' },
          { runIndices: [1], fingerprint: '', text: 'подпись \t\t\t\tФИО работника' },
        ],
      }),
    ])
    const texts = segments.map(s => s.source.replace(/\t/g, '⇥').trim())
    expect(segments.length).toBeGreaterThanOrEqual(2)
    expect(texts.some(t => t.includes('подпись'))).toBe(true)
    expect(texts.some(t => t.includes('ФИО'))).toBe(true)
    expect(segments.filter(s => /подпись/i.test(s.source)).length).toBe(1)
    expect(segments.filter(s => /ФИО/i.test(s.source)).length).toBe(1)
  })

  it('recovers adjacent label spans that lost tabs on old extract', () => {
    const { segments } = resegmentParagraphs([
      seg({
        source: 'подпись ФИО работника',
        paragraphSpans: [
          { runIndices: [0], fingerprint: '', text: 'подпись' },
          { runIndices: [1], fingerprint: '', text: 'ФИО работника' },
        ],
      }),
    ])
    expect(segments.length).toBeGreaterThanOrEqual(2)
    expect(segments.filter(s => /подпись/i.test(s.source) && !/ФИО/i.test(s.source)).length).toBe(
      1,
    )
    expect(segments.filter(s => /ФИО/i.test(s.source) && !/подпись/i.test(s.source)).length).toBe(
      1,
    )
  })
})

describe('resegmentProjectRecord', () => {
  it('re-extracts from DOCX so merged legacy sources become layout fields', async () => {
    const docx = await makeDocx(`<w:p>
        <w:r><w:tab/><w:tab/><w:tab/></w:r>
        <w:r><w:t>подпись</w:t></w:r>
        <w:r><w:tab/><w:tab/><w:tab/><w:tab/></w:r>
        <w:r><w:t>ФИО работника</w:t></w:r>
      </w:p>`)
    const record: ProjectRecord = {
      meta: {
        id: 'p1',
        name: 'test',
        createdAt: '',
        updatedAt: '',
        sourceLang: 'ru',
        targetLang: 'en',
        segmentCount: 1,
        doneCount: 0,
      },
      // Legacy extract: no tabs, one merged segment.
      segments: [
        seg({
          source: 'подпись ФИО работника',
          target: 'signature employee name',
          status: 'done',
          paragraphSpans: [
            { runIndices: [0], fingerprint: '', text: 'подпись ФИО работника' },
          ],
        }),
      ],
      docx,
    }
    const { segments } = await resegmentProjectRecord(record)
    expect(segments.length).toBe(2)
    expect(segments[0]!.source).toMatch(/подпись/)
    expect(segments[0]!.source).not.toMatch(/ФИО/)
    expect(segments[1]!.source).toMatch(/ФИО/)
    expect(segments[1]!.source).not.toMatch(/подпись/)
  })
})
