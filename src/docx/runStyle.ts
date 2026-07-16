import type { RunSpan, TargetStyleRange } from '@/types/project'
import { TAG_RE, extractTagIds, stripMarkers } from './tags'

/** Visual run style — Word rPr subset we display / copy / export. */
export interface RunStyle {
  bold?: boolean
  italic?: boolean
  underline?: boolean
  underlineVal?: string
  font?: string
  /** Points (Word half-points / 2). */
  fontSizePt?: number
  /** Hex RGB without #. */
  color?: string
  strike?: boolean
  doubleStrike?: boolean
  vertAlign?: 'superscript' | 'subscript'
  highlight?: string
}

const FP_KNOWN =
  /^(?:b|i|u:[^|]*|sz:\d+|szCs:\d+|color:[^|]*|highlight:[^|]*|vertAlign:[^|]*|strike:[^|]*|dstrike:[^|]*|link|plain|x:[^|]*|font:.+)$/

export function parseFingerprint(fingerprint: string): RunStyle {
  if (!fingerprint || fingerprint === 'plain') return {}
  const style: RunStyle = {}
  const raw = fingerprint.split('|')
  const parts: string[] = []
  for (let i = 0; i < raw.length; i++) {
    const p = raw[i]!
    if (p.startsWith('font:')) {
      let font = p
      while (
        i + 1 < raw.length &&
        !FP_KNOWN.test(raw[i + 1]!) &&
        !raw[i + 1]!.startsWith('font:')
      ) {
        i++
        font += `|${raw[i]}`
      }
      parts.push(font)
      continue
    }
    if (p) parts.push(p)
  }
  for (const part of parts) {
    if (part === 'b') style.bold = true
    else if (part === 'i') style.italic = true
    else if (part.startsWith('u:')) {
      const val = part.slice(2) || 'single'
      if (val !== 'none') {
        style.underline = true
        style.underlineVal = val
      }
    } else if (part.startsWith('sz:') || part.startsWith('szCs:')) {
      const half = Number(part.split(':')[1] ?? '')
      if (Number.isFinite(half) && half > 0) style.fontSizePt = half / 2
    } else if (part.startsWith('font:')) {
      const body = part.slice('font:'.length)
      const [ascii, hAnsi] = body.split('|')
      const name = (ascii || hAnsi || '').trim()
      if (name) style.font = name
    } else if (part.startsWith('color:')) {
      const c = part.slice('color:'.length).trim()
      if (c && c.toLowerCase() !== 'auto') style.color = c.replace(/^#/, '')
    } else if (part.startsWith('highlight:')) {
      const h = part.slice('highlight:'.length).trim()
      if (h && h !== 'none') style.highlight = h
    } else if (part.startsWith('vertAlign:')) {
      const v = part.slice('vertAlign:'.length)
      if (v === 'superscript' || v === 'subscript') style.vertAlign = v
    } else if (part.startsWith('strike:')) {
      style.strike = true
    } else if (part.startsWith('dstrike:')) {
      style.doubleStrike = true
    }
  }
  return style
}

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

const HIGHLIGHT_CSS: Record<string, string> = {
  yellow: '#ffff00',
  green: '#00ff00',
  cyan: '#00ffff',
  magenta: '#ff00ff',
  blue: '#0000ff',
  red: '#ff0000',
  darkBlue: '#000080',
  darkCyan: '#008080',
  darkGreen: '#008000',
  darkMagenta: '#800080',
  darkRed: '#800000',
  darkYellow: '#808000',
  darkGray: '#808080',
  lightGray: '#c0c0c0',
  black: '#000000',
  white: '#ffffff',
}

function wrapStyled(text: string, style: RunStyle): string {
  if (!text) return ''
  let html = escapeHtml(text).replace(/\n/g, '<br>')
  const classes: string[] = []
  if (style.bold) classes.push('rs-b')
  if (style.italic) classes.push('rs-i')
  if (style.underline) classes.push('rs-u')
  if (style.strike || style.doubleStrike) classes.push('rs-strike')
  if (style.vertAlign === 'superscript') classes.push('rs-sup')
  if (style.vertAlign === 'subscript') classes.push('rs-sub')

  const inline: string[] = []
  if (style.font) inline.push(`font-family:${JSON.stringify(style.font)}`)
  if (style.fontSizePt) inline.push(`font-size:${style.fontSizePt}pt`)
  if (style.color) inline.push(`color:#${style.color.replace(/^#/, '')}`)
  if (style.highlight) {
    const bg = HIGHLIGHT_CSS[style.highlight] ?? style.highlight
    inline.push(`background-color:${bg}`)
  }
  const deco: string[] = []
  if (style.underline) deco.push('underline')
  if (style.strike || style.doubleStrike) deco.push('line-through')
  if (deco.length) {
    // Shorthand is more reliable inside contenteditable than text-decoration-line alone.
    let decoCss = `text-decoration:${deco.join(' ')}`
    if (style.underlineVal === 'thick') decoCss += ' 2px'
    if (style.underlineVal === 'double' || style.doubleStrike) decoCss += ' double'
    else if (style.underlineVal === 'wave') decoCss += ' wavy'
    inline.push(decoCss)
  }

  const data: string[] = []
  if (style.underlineVal) data.push(`data-u="${escapeHtml(style.underlineVal)}"`)
  if (style.highlight) data.push(`data-highlight="${escapeHtml(style.highlight)}"`)
  if (style.vertAlign) data.push(`data-valign="${style.vertAlign}"`)
  if (style.doubleStrike) data.push(`data-dstrike="1"`)
  else if (style.strike) data.push(`data-strike="1"`)
  if (style.color) data.push(`data-color="${escapeHtml(style.color.replace(/^#/, ''))}"`)

  const cls = classes.length ? ` class="${classes.join(' ')}"` : ''
  const st = inline.length ? ` style="${inline.join(';')}"` : ''
  const attrs = data.length ? ` ${data.join(' ')}` : ''
  if (!cls && !st && !attrs) return html
  return `<span${cls}${st}${attrs}>${html}</span>`
}

export type StyledPiece = { text: string; style: RunStyle }

export function styledPiecesFromTagged(
  tagged: string,
  spans: RunSpan[],
): StyledPiece[] {
  const plain = stripMarkers(tagged)
  if (!tagged.includes('{')) {
    const style = parseFingerprint(spans[0]?.fingerprint ?? 'plain')
    return plain ? [{ text: plain, style }] : []
  }

  const ids = extractTagIds(tagged)
  const pieces: StyledPiece[] = []
  let i = 0
  let cursor = 0
  const s = tagged

  while (i < ids.length) {
    const open = ids[i]!
    const close = ids[i + 1]
    const openTok = `{${open}}`
    const closeTok = close != null ? `{${close}}` : ''
    const start = s.indexOf(openTok, cursor)
    if (start < 0) break
    const contentStart = start + openTok.length
    if (start > cursor) {
      const lead = stripMarkers(s.slice(cursor, start))
      if (lead) pieces.push({ text: lead, style: {} })
    }
    let contentEnd = contentStart
    if (close != null) {
      const end = s.indexOf(closeTok, contentStart)
      if (end < 0) {
        pieces.push({
          text: stripMarkers(s.slice(contentStart)),
          style: parseFingerprint(
            spans[Math.floor((open - 1) / 2)]?.fingerprint ?? 'plain',
          ),
        })
        return pieces.filter((p) => p.text.length > 0)
      }
      contentEnd = end
      cursor = end + closeTok.length
    } else {
      pieces.push({
        text: stripMarkers(s.slice(contentStart)),
        style: parseFingerprint(
          spans[Math.floor((open - 1) / 2)]?.fingerprint ?? 'plain',
        ),
      })
      return pieces.filter((p) => p.text.length > 0)
    }
    const text = s.slice(contentStart, contentEnd)
    const spanIdx = Math.floor((open - 1) / 2)
    pieces.push({
      text: text.replace(TAG_RE, ''),
      style: parseFingerprint(spans[spanIdx]?.fingerprint ?? 'plain'),
    })
    i += 2
  }
  if (cursor < s.length) {
    const tail = stripMarkers(s.slice(cursor))
    if (tail) pieces.push({ text: tail, style: {} })
  }
  return pieces.filter((p) => p.text.length > 0)
}

export function piecesToHtml(pieces: StyledPiece[]): string {
  if (!pieces.length) return ''
  return pieces.map((p) => wrapStyled(p.text, p.style)).join('')
}

export function hasVisualStyle(style: RunStyle): boolean {
  return Boolean(
    style.bold ||
      style.italic ||
      style.underline ||
      style.font ||
      style.fontSizePt ||
      style.color ||
      style.strike ||
      style.doubleStrike ||
      style.vertAlign ||
      style.highlight,
  )
}

export function rangePropsFromStyle(
  style: RunStyle,
): Omit<TargetStyleRange, 'start' | 'end'> {
  return {
    ...(style.bold ? { bold: true } : {}),
    ...(style.italic ? { italic: true } : {}),
    ...(style.underline ? { underline: true } : {}),
    ...(style.underlineVal ? { underlineVal: style.underlineVal } : {}),
    ...(style.font ? { font: style.font } : {}),
    ...(style.fontSizePt ? { fontSizePt: style.fontSizePt } : {}),
    ...(style.color ? { color: style.color } : {}),
    ...(style.strike ? { strike: true } : {}),
    ...(style.doubleStrike ? { doubleStrike: true } : {}),
    ...(style.vertAlign ? { vertAlign: style.vertAlign } : {}),
    ...(style.highlight ? { highlight: style.highlight } : {}),
  }
}

function styleKey(style: RunStyle): string {
  return [
    style.bold ? 'b' : '',
    style.italic ? 'i' : '',
    style.underline ? 'u' : '',
    style.underlineVal ?? '',
    style.font ?? '',
    style.fontSizePt ?? '',
    style.color ?? '',
    style.strike ? 's' : '',
    style.doubleStrike ? 'ds' : '',
    style.vertAlign ?? '',
    style.highlight ?? '',
  ].join('|')
}

function rebuildRangesFromMarks(marks: RunStyle[]): TargetStyleRange[] {
  const out: TargetStyleRange[] = []
  let i = 0
  while (i < marks.length) {
    const style = marks[i]!
    if (!hasVisualStyle(style)) {
      i++
      continue
    }
    const key = styleKey(style)
    let j = i + 1
    while (j < marks.length && styleKey(marks[j]!) === key) j++
    out.push({ start: i, end: j, ...rangePropsFromStyle(style) })
    i = j
  }
  return out
}

function flattenStylesToMarks(
  plainLen: number,
  styles: TargetStyleRange[] | undefined,
): RunStyle[] {
  const marks: RunStyle[] = Array.from({ length: plainLen }, () => ({}))
  for (const r of styles ?? []) {
    const a = Math.max(0, Math.min(plainLen, r.start))
    const b = Math.max(a, Math.min(plainLen, r.end))
    const piece: RunStyle = {
      ...(r.bold ? { bold: true } : {}),
      ...(r.italic ? { italic: true } : {}),
      ...(r.underline ? { underline: true } : {}),
      ...(r.underlineVal ? { underlineVal: r.underlineVal } : {}),
      ...(r.font ? { font: r.font } : {}),
      ...(r.fontSizePt ? { fontSizePt: r.fontSizePt } : {}),
      ...(r.color ? { color: r.color } : {}),
      ...(r.strike ? { strike: true } : {}),
      ...(r.doubleStrike ? { doubleStrike: true } : {}),
      ...(r.vertAlign ? { vertAlign: r.vertAlign } : {}),
      ...(r.highlight ? { highlight: r.highlight } : {}),
    }
    for (let i = a; i < b; i++) {
      marks[i] = { ...marks[i], ...piece }
    }
  }
  return marks
}

/** Build targetStyles mirroring Word spans in a tagged source (e.g. copy-source). */
export function targetStylesFromTaggedSource(
  tagged: string,
  spans: RunSpan[],
): TargetStyleRange[] {
  const pieces = styledPiecesFromTagged(tagged, spans)
  const out: TargetStyleRange[] = []
  let offset = 0
  for (const p of pieces) {
    const start = offset
    const end = offset + p.text.length
    offset = end
    if (!hasVisualStyle(p.style)) continue
    out.push({ start, end, ...rangePropsFromStyle(p.style) })
  }
  return out
}

/** Longest styled run wins (Word “most of the selection” / default typing style). */
export function predominantSourceStyle(
  taggedSource: string,
  spans: RunSpan[],
): RunStyle {
  const pieces = styledPiecesFromTagged(taggedSource, spans)
  if (!pieces.length) return {}
  let best = pieces[0]!
  for (const p of pieces) {
    if (p.text.length > best.text.length) best = p
  }
  return { ...best.style }
}

/**
 * Styles the target editor should paint / toolbar should reflect.
 * Stored `targetStyles` win; otherwise inherit from source runs
 * (1:1 when lengths match, else proportional — Word-like look before overrides).
 */
export function effectiveTargetStyles(
  targetPlain: string,
  taggedSource: string,
  spans: RunSpan[],
  stored?: TargetStyleRange[],
): TargetStyleRange[] {
  // Explicit store (including []) wins — otherwise toggle-off / clear snaps back to source.
  if (stored !== undefined) return stored
  if (!targetPlain) return []
  const pieces = styledPiecesFromTagged(taggedSource, spans)
  const sourcePlain = pieces.map((p) => p.text).join('')
  if (!sourcePlain) return []
  if (targetPlain === sourcePlain || targetPlain.length === sourcePlain.length) {
    return targetStylesFromTaggedSource(taggedSource, spans)
  }
  const srcMarks: RunStyle[] = []
  for (const p of pieces) {
    for (let k = 0; k < p.text.length; k++) srcMarks.push({ ...p.style })
  }
  const marks: RunStyle[] = Array.from({ length: targetPlain.length }, () => ({}))
  for (let i = 0; i < targetPlain.length; i++) {
    const srcIdx = Math.min(
      srcMarks.length - 1,
      Math.floor((i * srcMarks.length) / targetPlain.length),
    )
    marks[i] = { ...srcMarks[srcIdx]! }
  }
  return rebuildRangesFromMarks(marks)
}

export function styledPiecesFromTarget(
  plain: string,
  styles: TargetStyleRange[] | undefined,
): StyledPiece[] {
  if (!plain) return []
  if (!styles?.length) return [{ text: plain, style: {} }]

  const marks = flattenStylesToMarks(plain.length, styles)
  const pieces: StyledPiece[] = []
  let i = 0
  while (i < plain.length) {
    const style = { ...marks[i]! }
    const key = styleKey(style)
    let j = i + 1
    while (j < plain.length && styleKey(marks[j]!) === key) j++
    pieces.push({ text: plain.slice(i, j), style })
    i = j
  }
  return pieces
}

export type StyleToggleProp = 'bold' | 'italic' | 'underline' | 'strike'

export type StyleApplyPatch =
  | { op: 'toggle'; prop: StyleToggleProp }
  | { op: 'set'; prop: 'font'; value: string | null }
  | { op: 'set'; prop: 'fontSizePt'; value: number | null }
  | { op: 'set'; prop: 'color'; value: string | null }
  | { op: 'set'; prop: 'highlight'; value: string | null }
  | { op: 'set'; prop: 'vertAlign'; value: 'superscript' | 'subscript' | null }

export function applyStyleRange(
  styles: TargetStyleRange[] | undefined,
  plainLen: number,
  start: number,
  end: number,
  patch: StyleApplyPatch,
): TargetStyleRange[] {
  const a = Math.max(0, Math.min(plainLen, Math.min(start, end)))
  const b = Math.max(0, Math.min(plainLen, Math.max(start, end)))
  if (a >= b) return styles ? [...styles] : []
  const marks = flattenStylesToMarks(plainLen, styles)

  if (patch.op === 'toggle') {
    const coverage = new Array(b - a).fill(false)
    for (let i = a; i < b; i++) {
      if (marks[i]![patch.prop]) coverage[i - a] = true
    }
    const turnOn = coverage.some((x) => !x)
    for (let i = a; i < b; i++) {
      const m = marks[i]!
      if (turnOn) {
        ;(m as Record<string, unknown>)[patch.prop] = true
        if (patch.prop === 'underline' && !m.underlineVal) m.underlineVal = 'single'
      } else {
        delete (m as Record<string, unknown>)[patch.prop]
        if (patch.prop === 'underline') delete m.underlineVal
      }
    }
  } else {
    for (let i = a; i < b; i++) {
      const m = marks[i]!
      if (patch.value == null) delete (m as Record<string, unknown>)[patch.prop]
      else (m as Record<string, unknown>)[patch.prop] = patch.value
    }
  }
  return rebuildRangesFromMarks(marks)
}

export function toggleStyleRange(
  styles: TargetStyleRange[] | undefined,
  plainLen: number,
  start: number,
  end: number,
  prop: 'bold' | 'italic' | 'underline',
): TargetStyleRange[] {
  return applyStyleRange(styles, plainLen, start, end, { op: 'toggle', prop })
}

export function selectionHasProp(
  styles: TargetStyleRange[] | undefined,
  plainLen: number,
  start: number,
  end: number,
  prop: StyleToggleProp,
): boolean {
  const a = Math.max(0, Math.min(plainLen, Math.min(start, end)))
  const b = Math.max(0, Math.min(plainLen, Math.max(start, end)))
  if (a >= b) return false
  const marks = flattenStylesToMarks(plainLen, styles)
  for (let i = a; i < b; i++) if (!marks[i]![prop]) return false
  return true
}

export function selectionUniformValue<
  K extends 'font' | 'fontSizePt' | 'color' | 'highlight' | 'vertAlign',
>(
  styles: TargetStyleRange[] | undefined,
  plainLen: number,
  start: number,
  end: number,
  prop: K,
): TargetStyleRange[K] | null | undefined {
  const a = Math.max(0, Math.min(plainLen, Math.min(start, end)))
  const b = Math.max(0, Math.min(plainLen, Math.max(start, end)))
  if (a >= b) return null
  const marks = flattenStylesToMarks(plainLen, styles)
  let seen: TargetStyleRange[K] | null | undefined = undefined
  let init = false
  for (let i = a; i < b; i++) {
    const v = (marks[i]![prop] ?? null) as TargetStyleRange[K] | null
    if (!init) {
      seen = v
      init = true
      continue
    }
    if (v !== seen) return undefined
  }
  return seen ?? null
}

export function shiftTargetStyles(
  styles: TargetStyleRange[] | undefined,
  at: number,
  removed: number,
  inserted: number,
): TargetStyleRange[] | undefined {
  if (!styles?.length) return styles
  const delta = inserted - removed
  const removeEnd = at + removed
  const out: TargetStyleRange[] = []
  for (const r of styles) {
    let { start, end } = r
    if (end <= at) {
      out.push({ ...r })
      continue
    }
    if (start >= removeEnd) {
      out.push({ ...r, start: start + delta, end: end + delta })
      continue
    }
    if (start < at && end > removeEnd) {
      out.push({ ...r, end: at })
      out.push({ ...r, start: at + inserted, end: end + delta })
      continue
    }
    if (start < at) {
      out.push({ ...r, end: at })
      continue
    }
    if (end > removeEnd) {
      out.push({ ...r, start: at + inserted, end: end + delta })
    }
  }
  return out.filter((r) => r.end > r.start)
}

export const DEFAULT_STYLE_FONTS = [
  'Calibri',
  'Arial',
  'Times New Roman',
  'Georgia',
  'Courier New',
] as const

export const STYLE_SIZE_PRESETS_PT = [
  8, 9, 10, 11, 12, 14, 16, 18, 20, 24, 28, 36,
] as const

/** Unique font names from RunSpan fingerprints in segments, sorted, merged with defaults. */
export function collectProjectFonts(
  segments: { spans?: RunSpan[]; paragraphSpans?: RunSpan[] }[],
): string[] {
  const seen = new Map<string, string>()
  for (const font of DEFAULT_STYLE_FONTS) seen.set(font.toLocaleLowerCase(), font)
  for (const seg of segments) {
    for (const group of [seg.spans, seg.paragraphSpans]) {
      for (const span of group ?? []) {
        const font = parseFingerprint(span.fingerprint ?? 'plain').font
        if (font && !seen.has(font.toLocaleLowerCase())) {
          seen.set(font.toLocaleLowerCase(), font)
        }
      }
    }
  }
  return [...seen.values()].sort((a, b) =>
    a.localeCompare(b, undefined, { sensitivity: 'base' }),
  )
}
