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

export function isInsideTextbox(para: Element): boolean {
  let n: Element | null = para.parentElement
  while (n) {
    const name = localName(n)
    if (name === 'txbxContent' || name === 'textbox') return true
    n = n.parentElement
  }
  return false
}

function paragraphStyleVal(para: Element): string | null {
  for (const child of childrenElements(para)) {
    if (localName(child) !== 'pPr') continue
    for (const pPrChild of childrenElements(child)) {
      if (localName(pPrChild) !== 'pStyle') continue
      return pPrChild.getAttribute('w:val') ?? pPrChild.getAttribute('val')
    }
  }
  return null
}

export function isCaptionParagraph(para: Element): boolean {
  const style = paragraphStyleVal(para)
  if (!style) return false
  return /caption/i.test(style)
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
  let out = ''
  for (const c of childrenElements(run)) {
    const name = localName(c)
    if (name === 't') out += c.textContent ?? ''
    else if (name === 'tab') out += '\t'
  }
  return out
}

function runHasTab(run: Element): boolean {
  return childrenElements(run).some(c => localName(c) === 'tab')
}

/** True when the run carries text and/or tab stops (layout-significant). */
export function runHasContent(run: Element): boolean {
  return getTextNodes(run).length > 0 || runHasTab(run)
}

const W_NS = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'

export type RunStyleProps = {
  bold?: boolean
  italic?: boolean
  underline?: boolean
  underlineVal?: string
  font?: string
  /** Points (Word sz is half-points). */
  fontSizePt?: number
  color?: string
  strike?: boolean
  doubleStrike?: boolean
  vertAlign?: 'superscript' | 'subscript'
  highlight?: string
}

function createWElement(doc: Document, local: string): Element {
  return doc.createElementNS(W_NS, local)
}

function setWVal(el: Element, val: string): void {
  el.setAttributeNS(W_NS, 'w:val', val)
  el.setAttribute('w:val', val)
}

function setRFonts(el: Element, font: string): void {
  el.setAttributeNS(W_NS, 'w:ascii', font)
  el.setAttribute('w:ascii', font)
  el.setAttributeNS(W_NS, 'w:hAnsi', font)
  el.setAttribute('w:hAnsi', font)
}

/** Write visual run properties (replaces prior b/i/u/sz/rFonts on the run). */
export function setRunStyle(run: Element, style: RunStyleProps): void {
  const doc = run.ownerDocument
  if (!doc) return

  let rPr: Element | null = null
  for (const c of childrenElements(run)) {
    if (localName(c) === 'rPr') {
      rPr = c
      break
    }
  }

  if (!rPr) {
    rPr = createWElement(doc, 'rPr')
    const first = childrenElements(run)[0]
    if (first) run.insertBefore(rPr, first)
    else run.appendChild(rPr)
  }

  const managed = new Set([
    'b',
    'bCs',
    'i',
    'iCs',
    'u',
    'sz',
    'szCs',
    'rFonts',
    'color',
    'highlight',
    'strike',
    'dstrike',
    'vertAlign',
  ])
  for (const c of [...childrenElements(rPr)]) {
    if (managed.has(localName(c))) rPr.removeChild(c)
  }

  if (style.bold) {
    rPr.appendChild(createWElement(doc, 'b'))
    rPr.appendChild(createWElement(doc, 'bCs'))
  }
  if (style.italic) {
    rPr.appendChild(createWElement(doc, 'i'))
    rPr.appendChild(createWElement(doc, 'iCs'))
  }
  if (style.underline) {
    const u = createWElement(doc, 'u')
    setWVal(u, style.underlineVal || 'single')
    rPr.appendChild(u)
  }
  if (style.strike) rPr.appendChild(createWElement(doc, 'strike'))
  if (style.doubleStrike) rPr.appendChild(createWElement(doc, 'dstrike'))
  if (style.vertAlign) {
    const va = createWElement(doc, 'vertAlign')
    setWVal(va, style.vertAlign)
    rPr.appendChild(va)
  }
  if (style.color) {
    const color = createWElement(doc, 'color')
    setWVal(color, style.color.replace(/^#/, ''))
    rPr.appendChild(color)
  }
  if (style.highlight) {
    const hl = createWElement(doc, 'highlight')
    setWVal(hl, style.highlight)
    rPr.appendChild(hl)
  }
  if (style.fontSizePt && style.fontSizePt > 0) {
    const half = String(Math.round(style.fontSizePt * 2))
    const sz = createWElement(doc, 'sz')
    setWVal(sz, half)
    rPr.appendChild(sz)
    const szCs = createWElement(doc, 'szCs')
    setWVal(szCs, half)
    rPr.appendChild(szCs)
  }
  if (style.font) {
    const rf = createWElement(doc, 'rFonts')
    setRFonts(rf, style.font)
    rPr.appendChild(rf)
  }
}

export function cloneRun(run: Element): Element {
  return run.cloneNode(true) as Element
}

export function insertRunAfter(refRun: Element, newRun: Element): void {
  const parent = refRun.parentElement
  if (!parent) return
  const next = refRun.nextSibling
  if (next) parent.insertBefore(newRun, next)
  else parent.appendChild(newRun)
}

export function setRunText(run: Element, text: string): void {
  const doc = run.ownerDocument
  if (!doc) return

  for (const c of [...childrenElements(run)]) {
    const name = localName(c)
    if (name === 't' || name === 'tab') run.removeChild(c)
  }

  if (text === '') {
    const empty = createWElement(doc, 't')
    empty.textContent = ''
    run.appendChild(empty)
    return
  }

  const parts = text.split('\t')
  for (let i = 0; i < parts.length; i++) {
    if (i > 0) run.appendChild(createWElement(doc, 'tab'))
    const part = parts[i]!
    if (part === '') continue
    const t = createWElement(doc, 't')
    t.textContent = part
    if (/\s/.test(part[0]!) || /\s/.test(part[part.length - 1]!)) {
      t.setAttributeNS('http://www.w3.org/XML/1998/namespace', 'xml:space', 'preserve')
      t.setAttribute('xml:space', 'preserve')
    }
    run.appendChild(t)
  }
}

/** Collect runs with w:t and/or w:tab (for extract + write-back indexing). */
export function collectRunsWithT(para: Element): Element[] {
  const runs: Element[] = []
  const walk = (el: Element) => {
    for (const c of childrenElements(el)) {
      const name = localName(c)
      if (name === 'r') {
        if (runHasContent(c)) runs.push(c)
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
