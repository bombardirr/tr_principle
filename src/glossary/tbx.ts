import type { GlossaryTerm, GlossaryTermStatus } from '@/types/glossary'

function xmlEscape(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/** Export active terms to a pragmatic TBX-Basic-like document. */
export function exportTbx(terms: GlossaryTerm[]): string {
  const active = terms.filter((t) => !t.deletedAt)
  const entries = active
    .map((t) => {
      const note =
        t.note || t.status === 'forbidden'
          ? `<note>${xmlEscape([t.status === 'forbidden' ? 'forbidden' : '', t.note ?? ''].filter(Boolean).join(': '))}</note>`
          : ''
      return `  <termEntry id="${xmlEscape(t.id)}">
    <langSet xml:lang="${xmlEscape(t.sourceLang)}">
      <tig><term>${xmlEscape(t.sourceTerm)}</term></tig>
    </langSet>
    <langSet xml:lang="${xmlEscape(t.targetLang)}">
      <tig><term>${xmlEscape(t.targetTerm)}</term>${note}</tig>
    </langSet>
  </termEntry>`
    })
    .join('\n')

  return `<?xml version="1.0" encoding="UTF-8"?>
<martif type="TBX" xml:lang="en">
<martifHeader>
  <fileDesc><sourceDesc><p>appzac glossary</p></sourceDesc></fileDesc>
</martifHeader>
<body>
${entries}
</body>
</martif>
`
}

function textContent(el: Element | null): string {
  return (el?.textContent ?? '').trim()
}

function parseStatusFromNote(note: string): { status: GlossaryTermStatus; note?: string } {
  if (note.startsWith('forbidden')) {
    const rest = note.replace(/^forbidden:?\s*/i, '').trim()
    return { status: 'forbidden', note: rest || undefined }
  }
  return { status: 'approved', note: note || undefined }
}

/** Parse TBX-ish XML into glossary terms (new UUIDs unless termEntry@id is a UUID). */
export function parseTbx(xml: string): GlossaryTerm[] {
  const doc = new DOMParser().parseFromString(xml, 'application/xml')
  if (doc.querySelector('parsererror')) {
    throw new Error('invalid TBX')
  }
  const now = new Date().toISOString()
  const out: GlossaryTerm[] = []
  const entries = doc.querySelectorAll('termEntry')
  entries.forEach((entry) => {
    const langSets = [...entry.querySelectorAll('langSet')]
    if (langSets.length < 2) return
    const src = langSets[0]!
    const tgt = langSets[1]!
    const sourceLang = src.getAttribute('xml:lang') || src.getAttribute('lang') || ''
    const targetLang = tgt.getAttribute('xml:lang') || tgt.getAttribute('lang') || ''
    const sourceTerm = textContent(src.querySelector('term'))
    const targetTerm = textContent(tgt.querySelector('term'))
    if (!sourceLang || !targetLang || !sourceTerm || !targetTerm) return
    const noteRaw = textContent(tgt.querySelector('note')) || textContent(entry.querySelector('note'))
    const { status, note } = parseStatusFromNote(noteRaw)
    const idAttr = entry.getAttribute('id') || ''
    const id =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(idAttr)
        ? idAttr
        : crypto.randomUUID()
    out.push({
      id,
      sourceLang,
      targetLang,
      sourceTerm,
      targetTerm,
      status,
      note,
      caseSensitive: false,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
      createdBy: 'local',
    })
  })
  return out
}
