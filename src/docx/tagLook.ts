import type { RunSpan } from '@/types/project'

export interface TagLook {
  /** Chip label, e.g. <b> or </b> */
  symbol: string
  /** Full name for tooltip */
  title: string
}

type Dict = {
  plain: string
  bold: string
  italic: string
  underline: string
  link: string
  font: string
  size: string
  color: string
  strike: string
  superscript: string
  subscript: string
  highlight: string
  cf: string
  other: string
  open: string
  close: string
}

const RU: Dict = {
  plain: 'Обычный текст',
  bold: 'Жирный',
  italic: 'Курсив',
  underline: 'Подчёркивание',
  link: 'Гиперссылка',
  font: 'Шрифт',
  size: 'Размер',
  color: 'Цвет',
  strike: 'Зачёркивание',
  superscript: 'Надстрочный',
  subscript: 'Подстрочный',
  highlight: 'Выделение',
  cf: 'Форматирование символа',
  other: 'Стиль',
  open: 'открывающий тег',
  close: 'закрывающий тег',
}

const EN: Dict = {
  plain: 'Regular text',
  bold: 'Bold',
  italic: 'Italic',
  underline: 'Underline',
  link: 'Hyperlink',
  font: 'Font',
  size: 'Size',
  color: 'Color',
  strike: 'Strikethrough',
  superscript: 'Superscript',
  subscript: 'Subscript',
  highlight: 'Highlight',
  cf: 'Character formatting',
  other: 'Style',
  open: 'opening tag',
  close: 'closing tag',
}

function dict(locale: string): Dict {
  return locale.startsWith('en') ? EN : RU
}

type Piece = { open: string; close: string; title: string }

/**
 * Industry-style HTML/CAT markers: <b>, </b>, <i>, <a>, <cf>, …
 */
export function describeFingerprint(
  fingerprint: string,
  locale = 'ru',
): { open: string; close: string; title: string } {
  const d = dict(locale)
  if (!fingerprint || fingerprint === 'plain') {
    return { open: '<cf>', close: '</cf>', title: d.plain }
  }

  const pieces: Piece[] = []
  const seen = new Set<string>()
  let hasCf = false
  const cfDetails: string[] = []

  for (const part of fingerprint.split('|')) {
    if (seen.has(part)) continue
    seen.add(part)

    if (part === 'b') {
      pieces.push({ open: '<b>', close: '</b>', title: d.bold })
    } else if (part === 'i') {
      pieces.push({ open: '<i>', close: '</i>', title: d.italic })
    } else if (part.startsWith('u:')) {
      pieces.push({ open: '<u>', close: '</u>', title: d.underline })
    } else if (part === 'link') {
      pieces.push({ open: '<a>', close: '</a>', title: d.link })
    } else if (part.startsWith('strike') || part.startsWith('dstrike')) {
      pieces.push({ open: '<s>', close: '</s>', title: d.strike })
    } else if (part.startsWith('vertAlign:superscript') || part.includes('superscript')) {
      pieces.push({ open: '<sup>', close: '</sup>', title: d.superscript })
    } else if (part.startsWith('vertAlign:subscript') || part.includes('subscript')) {
      pieces.push({ open: '<sub>', close: '</sub>', title: d.subscript })
    } else if (part.startsWith('highlight:')) {
      pieces.push({ open: '<mark>', close: '</mark>', title: d.highlight })
    } else if (part.startsWith('font:')) {
      if (seen.has('__font__')) continue
      seen.add('__font__')
      hasCf = true
      const name = part.slice(5).replace(/\|/g, ' ').trim()
      cfDetails.push(name ? `${d.font}: ${name}` : d.font)
    } else if (part.startsWith('sz:') || part.startsWith('szCs:')) {
      if (seen.has('__size__')) continue
      seen.add('__size__')
      hasCf = true
      cfDetails.push(`${d.size}: ${part.split(':')[1] ?? ''}`)
    } else if (part.startsWith('color:')) {
      hasCf = true
      cfDetails.push(`${d.color}: ${part.slice(6)}`)
    } else if (part.startsWith('x:')) {
      hasCf = true
      cfDetails.push(`${d.other}: ${part.slice(2)}`)
    } else {
      hasCf = true
      cfDetails.push(`${d.other}: ${part}`)
    }
  }

  if (hasCf) {
    pieces.push({
      open: '<cf>',
      close: '</cf>',
      title: cfDetails.length ? cfDetails.join(', ') : d.cf,
    })
  }

  if (pieces.length === 0) {
    return { open: '<cf>', close: '</cf>', title: d.cf }
  }

  return {
    open: pieces.map((p) => p.open).join(''),
    close: [...pieces].reverse().map((p) => p.close).join(''),
    title: pieces.map((p) => p.title).join(', '),
  }
}

/**
 * Tag numbers: {1}{2} = span0 open/close, {3}{4} = span1, …
 */
export function lookForTag(
  tagToken: string,
  spans: RunSpan[] | undefined,
  locale = 'ru',
): TagLook {
  const m = tagToken.match(/^\{(\d+)\}$/)
  if (!m) return { symbol: tagToken, title: tagToken }

  const n = Number(m[1])
  const spanIndex = Math.floor((n - 1) / 2)
  const isOpen = n % 2 === 1
  const d = dict(locale)
  const fp = spans?.[spanIndex]?.fingerprint ?? 'plain'
  const { open, close, title } = describeFingerprint(fp, locale)

  return {
    symbol: isOpen ? open : close,
    title: `${title} — ${isOpen ? d.open : d.close}`,
  }
}
