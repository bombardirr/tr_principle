export function parseXml(xml: string): Document {
  const doc = new DOMParser().parseFromString(xml, 'application/xml')
  const err = doc.querySelector('parsererror')
  if (err) {
    throw new Error(`XML parse error: ${err.textContent ?? 'unknown'}`)
  }
  return doc
}

export function serializeXml(doc: Document, originalXml: string): string {
  let out = new XMLSerializer().serializeToString(doc)
  if (!out.startsWith('<?xml')) {
    const decl =
      originalXml.match(/<\?xml[^?]*\?>/)?.[0] ??
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
    out = `${decl}\n${out}`
  }
  return out
}

export function localName(el: Element): string {
  return el.localName || el.nodeName.replace(/^.*:/, '')
}

export function isW(el: Element, name: string): boolean {
  return localName(el) === name
}

export function childrenElements(parent: Element): Element[] {
  return Array.from(parent.childNodes).filter((n): n is Element => n.nodeType === 1)
}

/** Fallback when NS lookups fail (some serializers drop NS). */
export function allParagraphsLoose(root: Element | Document): Element[] {
  const list = root.getElementsByTagName('*')
  const out: Element[] = []
  for (let i = 0; i < list.length; i++) {
    const el = list[i]!
    if (localName(el) === 'p') out.push(el)
  }
  return out
}

export function isInsideTable(para: Element): boolean {
  let n: Element | null = para.parentElement
  while (n) {
    if (localName(n) === 'tbl') return true
    n = n.parentElement
  }
  return false
}

export function getTextNodes(run: Element): Element[] {
  const out: Element[] = []
  const walk = (el: Element) => {
    if (localName(el) === 't') out.push(el)
    for (const c of childrenElements(el)) walk(c)
  }
  walk(run)
  return out
}

export function runText(run: Element): string {
  return getTextNodes(run)
    .map((t) => t.textContent ?? '')
    .join('')
}

export function setRunText(run: Element, text: string): void {
  const nodes = getTextNodes(run)
  if (nodes.length === 0) return
  nodes[0]!.textContent = text
  if (
    text.length > 0 &&
    (/\s/.test(text[0]!) || /\s/.test(text[text.length - 1] ?? ''))
  ) {
    nodes[0]!.setAttribute('xml:space', 'preserve')
  }
  for (let i = 1; i < nodes.length; i++) {
    nodes[i]!.textContent = ''
  }
}

/** Collect runs that currently have w:t (for write-back indexing). */
export function collectRunsWithT(para: Element): Element[] {
  const runs: Element[] = []
  const walk = (el: Element) => {
    for (const c of childrenElements(el)) {
      const name = localName(c)
      if (name === 'r') {
        if (getTextNodes(c).length > 0) runs.push(c)
      } else if (name === 'hyperlink' || name === 'sdt' || name === 'sdtContent') {
        walk(c)
      }
    }
  }
  walk(para)
  return runs
}

export function formatFingerprint(run: Element): string {
  const inHyperlink = (() => {
    let n: Element | null = run.parentElement
    while (n) {
      if (localName(n) === 'hyperlink') return true
      if (localName(n) === 'p') break
      n = n.parentElement
    }
    return false
  })()

  let rPr: Element | null = null
  for (const c of childrenElements(run)) {
    if (localName(c) === 'rPr') {
      rPr = c
      break
    }
  }

  /** Properties that only affect proofing/lang — ignore for span boundaries. */
  const noise = new Set([
    'lang',
    'noProof',
    'proofErr',
    'rtl',
    'cs',
    'eastAsianLayout',
    'w',
  ])

  const flags: string[] = []
  if (inHyperlink) flags.push('link')
  if (rPr) {
    for (const c of childrenElements(rPr)) {
      const n = localName(c)
      if (noise.has(n)) continue
      if (n === 'b' || n === 'bCs') flags.push('b')
      else if (n === 'i' || n === 'iCs') flags.push('i')
      else if (n === 'u')
        flags.push(`u:${c.getAttribute('w:val') ?? c.getAttribute('val') ?? 'single'}`)
      else if (n === 'sz' || n === 'szCs')
        flags.push(`${n}:${c.getAttribute('w:val') ?? c.getAttribute('val') ?? ''}`)
      else if (n === 'color')
        flags.push(`color:${c.getAttribute('w:val') ?? c.getAttribute('val') ?? ''}`)
      else if (n === 'rFonts') {
        const ascii = c.getAttribute('w:ascii') ?? c.getAttribute('ascii') ?? ''
        const hAnsi = c.getAttribute('w:hAnsi') ?? c.getAttribute('hAnsi') ?? ''
        flags.push(`font:${ascii}|${hAnsi}`)
      } else if (n === 'vertAlign' || n === 'strike' || n === 'dstrike' || n === 'highlight') {
        flags.push(
          `${n}:${c.getAttribute('w:val') ?? c.getAttribute('val') ?? '1'}`,
        )
      } else {
        flags.push(`x:${n}`)
      }
    }
  }
  return flags.sort().join('|') || 'plain'
}
