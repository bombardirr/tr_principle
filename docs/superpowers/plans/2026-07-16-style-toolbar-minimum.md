# Style toolbar minimum — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expand the target style toolbar to the full MVP minimum (B/I/U, strike, sup/sub, font, size, color, highlight) with apply + export coverage.

**Architecture:** Reuse `targetStyles` + `flattenStylesToMarks` / `rebuildRangesFromMarks`. Add `applyStyleRange` in `runStyle.ts` for toggles and set/clear scalars; thicken `StyleToolbar` into a compact inline control strip; wire through `ParagraphBlock` → `EditorPage`. Export already writes full `rPr` via `xmlUtils` — extend round-trip tests.

**Tech Stack:** Vue 3 + Vite + TypeScript, Vitest, existing DOCX pipeline (`applyTranslations`, `xmlUtils`).

**Spec:** `docs/superpowers/specs/2026-07-16-style-toolbar-minimum-design.md`

## Global Constraints

- Compact **inline** toolbar in target header center (not overflow menu, not second row).
- No F4 / pop-out / E1b / E4 / E5 / glossary in this plan.
- No `doubleStrike` UI control.
- Color stored as hex RGB **without** `#`; highlight = Word `w:highlight` vals.
- Enable only on non-empty target selection; same lease/readonly rules as B/I/U.
- i18n ru/en for new control titles.
- Commits per task; do not push unless asked.

## File map

| File | Role |
|------|------|
| `src/docx/runStyle.ts` | `applyStyleRange`, `selectionStyleUniform`, font helpers |
| `tests/docx/runStyle.apply.test.ts` | Unit tests for apply / uniform |
| `tests/docx/targetStyles.test.ts` | Export round-trip for new props |
| `src/components/StyleToolbar.vue` | Compact controls UI |
| `src/components/ParagraphBlock.vue` | Pass props/events |
| `src/pages/EditorPage.vue` | Apply handlers, active/uniform state, font list |
| `src/i18n/locales/en.ts`, `ru.ts` | Strings |
| `PLAN.md` | Check off toolbar-minimum items when done |

---

### Task 1: `applyStyleRange` engine

**Files:**
- Modify: `src/docx/runStyle.ts`
- Create: `tests/docx/runStyle.apply.test.ts`

**Interfaces:**
- Produces:
```ts
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
): TargetStyleRange[]

/** True if `prop` is set on every character in [start, end). */
export function selectionHasProp(
  styles: TargetStyleRange[] | undefined,
  plainLen: number,
  start: number,
  end: number,
  prop: StyleToggleProp,
): boolean

/** Common scalar across selection, or null if empty/mixed/cleared. */
export function selectionUniformValue<K extends 'font' | 'fontSizePt' | 'color' | 'highlight' | 'vertAlign'>(
  styles: TargetStyleRange[] | undefined,
  plainLen: number,
  start: number,
  end: number,
  prop: K,
): TargetStyleRange[K] | null | undefined
// undefined = mixed; null = uniformly absent; value = uniform
```

- Keep `toggleStyleRange` as a thin wrapper calling `applyStyleRange(..., { op: 'toggle', prop })` so existing callers keep working.

- [ ] **Step 1: Write failing tests**

Create `tests/docx/runStyle.apply.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import {
  applyStyleRange,
  selectionHasProp,
  selectionUniformValue,
  toggleStyleRange,
} from '../../src/docx/runStyle'

describe('applyStyleRange', () => {
  it('toggles strike on like bold', () => {
    const next = applyStyleRange([], 5, 1, 4, { op: 'toggle', prop: 'strike' })
    expect(selectionHasProp(next, 5, 1, 4, 'strike')).toBe(true)
    const off = applyStyleRange(next, 5, 1, 4, { op: 'toggle', prop: 'strike' })
    expect(selectionHasProp(off, 5, 1, 4, 'strike')).toBe(false)
  })

  it('sets and clears font', () => {
    const set = applyStyleRange([], 4, 0, 4, { op: 'set', prop: 'font', value: 'Arial' })
    expect(selectionUniformValue(set, 4, 0, 4, 'font')).toBe('Arial')
    const cleared = applyStyleRange(set, 4, 0, 4, { op: 'set', prop: 'font', value: null })
    expect(selectionUniformValue(cleared, 4, 0, 4, 'font')).toBeNull()
  })

  it('vertAlign is exclusive; same value clears', () => {
    const sup = applyStyleRange([], 3, 0, 3, {
      op: 'set',
      prop: 'vertAlign',
      value: 'superscript',
    })
    expect(selectionUniformValue(sup, 3, 0, 3, 'vertAlign')).toBe('superscript')
    const cleared = applyStyleRange(sup, 3, 0, 3, {
      op: 'set',
      prop: 'vertAlign',
      value: 'superscript',
    })
    // StyleToolbar will send null when clicking active; engine treats explicit null as clear.
    // For exclusive toggle-in-toolbar: pass null to clear, or pass other value to switch.
    expect(selectionUniformValue(sup, 3, 0, 3, 'vertAlign')).toBe('superscript')
    const sub = applyStyleRange(sup, 3, 0, 3, {
      op: 'set',
      prop: 'vertAlign',
      value: 'subscript',
    })
    expect(selectionUniformValue(sub, 3, 0, 3, 'vertAlign')).toBe('subscript')
    const none = applyStyleRange(sub, 3, 0, 3, { op: 'set', prop: 'vertAlign', value: null })
    expect(selectionUniformValue(none, 3, 0, 3, 'vertAlign')).toBeNull()
  })

  it('reports mixed font as undefined', () => {
    let styles = applyStyleRange([], 4, 0, 2, { op: 'set', prop: 'font', value: 'Arial' })
    styles = applyStyleRange(styles, 4, 2, 4, { op: 'set', prop: 'font', value: 'Georgia' })
    expect(selectionUniformValue(styles, 4, 0, 4, 'font')).toBeUndefined()
  })

  it('toggleStyleRange still works for bold', () => {
    const next = toggleStyleRange([], 3, 0, 3, 'bold')
    expect(selectionHasProp(next, 3, 0, 3, 'bold')).toBe(true)
  })
})
```

- [ ] **Step 2: Run tests — expect FAIL**

Run: `npx vitest run tests/docx/runStyle.apply.test.ts`

Expected: FAIL — `applyStyleRange` / helpers not exported.

- [ ] **Step 3: Implement**

In `src/docx/runStyle.ts`, add types + functions. Implementation sketch:

```ts
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
        ;(m as any)[patch.prop] = true
        if (patch.prop === 'underline' && !m.underlineVal) m.underlineVal = 'single'
      } else {
        delete (m as any)[patch.prop]
        if (patch.prop === 'underline') delete m.underlineVal
      }
    }
  } else {
    for (let i = a; i < b; i++) {
      const m = marks[i]!
      if (patch.value == null) delete (m as any)[patch.prop]
      else (m as any)[patch.prop] = patch.value
      if (patch.prop === 'vertAlign' && patch.value) {
        /* value already set */
      }
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
```

Fix the vertAlign test: remove the dead assert; toolbar clears via `{ value: null }`, switches via other value (not “click same clears” inside engine).

- [ ] **Step 4: Run tests — expect PASS**

Run: `npx vitest run tests/docx/runStyle.apply.test.ts`

- [ ] **Step 5: Commit**

```bash
git add src/docx/runStyle.ts tests/docx/runStyle.apply.test.ts
git commit -m "Add applyStyleRange for full target style props."
```

---

### Task 2: Export round-trip for new props

**Files:**
- Modify: `tests/docx/targetStyles.test.ts`

**Interfaces:**
- Consumes: existing `applyTranslationsToStories` styled path + `xmlUtils` rPr writers (already support strike/color/highlight/sz/font/vertAlign).

- [ ] **Step 1: Add failing (or verifying) tests**

Append to `tests/docx/targetStyles.test.ts`:

```ts
it('writes strike, vertAlign, color, highlight, font, size from targetStyles', async () => {
  const xml = minimalDocumentXml(
    `<w:p><w:r><w:t>Hello world</w:t></w:r></w:p>`,
  )
  const bytes = await makeDocx({ 'word/document.xml': xml })
  const segments = extractSegmentsFromStories([
    { key: 'document', path: 'word/document.xml', xml },
  ])
  segments[0]!.target = 'Hello world'
  segments[0]!.status = 'done'
  segments[0]!.targetStyles = [
    {
      start: 0,
      end: 5,
      strike: true,
      vertAlign: 'superscript',
      color: 'FF0000',
      highlight: 'yellow',
      font: 'Arial',
      fontSizePt: 14,
    },
  ]
  const updated = applyTranslationsToStories({ 'word/document.xml': xml }, segments)
  const out = updated['word/document.xml']!
  expect(out).toMatch(/<w:strike[\s/>]/)
  expect(out).toMatch(/w:val="superscript"/)
  expect(out).toMatch(/w:val="FF0000"/i)
  expect(out).toMatch(/w:val="yellow"/)
  expect(out).toMatch(/w:ascii="Arial"/)
  expect(out).toMatch(/w:val="28"/) // 14pt → 28 half-points
})
```

- [ ] **Step 2: Run test**

Run: `npx vitest run tests/docx/targetStyles.test.ts`

Expected: PASS if export already complete; if FAIL, fix only the missing writer gap in `src/docx/xmlUtils.ts` (do not expand scope).

- [ ] **Step 3: Commit**

```bash
git add tests/docx/targetStyles.test.ts src/docx/xmlUtils.ts
git commit -m "Cover full style props in targetStyles export tests."
```

---

### Task 3: Font list helper

**Files:**
- Modify: `src/docx/runStyle.ts` (or create `src/docx/styleFonts.ts` if `runStyle.ts` feels overcrowded — prefer add to `runStyle.ts` unless >50 LOC)
- Create: `tests/docx/styleFonts.test.ts`

**Interfaces:**
- Produces:
```ts
export const DEFAULT_STYLE_FONTS = [
  'Calibri',
  'Arial',
  'Times New Roman',
  'Georgia',
  'Courier New',
] as const

export const STYLE_SIZE_PRESETS_PT = [8, 9, 10, 11, 12, 14, 16, 18, 20, 24, 28, 36] as const

/** Unique font names from RunSpan fingerprints in segments, sorted, merged with defaults. */
export function collectProjectFonts(
  segments: { spans?: RunSpan[]; paragraphSpans?: RunSpan[] }[],
): string[]
```

- [ ] **Step 1: Failing test**

```ts
import { describe, expect, it } from 'vitest'
import { collectProjectFonts, DEFAULT_STYLE_FONTS } from '../../src/docx/runStyle'

it('merges defaults with fonts from fingerprints', () => {
  const fonts = collectProjectFonts([
    { spans: [{ start: 0, end: 1, fingerprint: 'font:Comic Sans MS|b' }] },
  ])
  expect(fonts).toContain('Comic Sans MS')
  for (const d of DEFAULT_STYLE_FONTS) expect(fonts).toContain(d)
})
```

- [ ] **Step 2: Implement `collectProjectFonts` using `parseFingerprint`**

- [ ] **Step 3: Pass + commit**

```bash
git add src/docx/runStyle.ts tests/docx/styleFonts.test.ts
git commit -m "Collect project fonts for style toolbar font list."
```

---

### Task 4: Expand `StyleToolbar` UI

**Files:**
- Modify: `src/components/StyleToolbar.vue`
- Modify: `src/i18n/locales/en.ts`, `src/i18n/locales/ru.ts`

**Interfaces:**
- Props in:
```ts
disabled?: boolean
hasSelection?: boolean
boldActive?: boolean
italicActive?: boolean
underlineActive?: boolean
strikeActive?: boolean
vertAlign?: 'superscript' | 'subscript' | null
font?: string | null          // null absent; '' or omit for mixed → use placeholder
fontMixed?: boolean
fontSizePt?: number | null
fontSizeMixed?: boolean
color?: string | null         // hex without #
colorMixed?: boolean
highlight?: string | null
highlightMixed?: boolean
fonts: string[]
```
- Emits:
```ts
toggle: [prop: StyleToggleProp]
setFont: [value: string | null]
setFontSizePt: [value: number | null]
setColor: [value: string | null]
setHighlight: [value: string | null]
setVertAlign: [value: 'superscript' | 'subscript' | null]
```

**UI details:**
- Group with thin separators (`|` via CSS `border-inline-start` on subgroups).
- Glyphs: B / I / U / S / `x²` / `x₂`.
- `<select>` for font (max-width ~7.5rem) and size (~3.5rem). Options from `fonts` + size presets; if mixed, first option `—` with empty value.
- Color / highlight: button showing swatch; `@click` toggles a small absolute panel of buttons (reuse pattern from `TmVariantPicker` popover lightness — keep minimal, no new lib).
- Color palette (hex without #): `000000`, `FF0000`, `C00000`, `FFC000`, `FFFF00`, `00B050`, `00B0F0`, `0070C0`, `7030A0`, `FFFFFF` + Auto (null).
- Highlight: `yellow`, `green`, `cyan`, `magenta`, `blue`, `red` + None (null) — subset of `HIGHLIGHT_CSS` keys.
- All mousedown on controls: `.prevent` so selection is not lost (same as IconButtons today).
- Keep `ghost` IconButtons; no heavy chrome.

- [ ] **Step 1: Replace `StyleToolbar.vue` template/script** per interfaces above; add i18n keys:
  - `editor.styleStrike`, `editor.styleSuperscript`, `editor.styleSubscript`
  - `editor.styleFont`, `editor.styleSize`, `editor.styleColor`, `editor.styleHighlight`
  - `editor.styleColorAuto`, `editor.styleHighlightNone`

- [ ] **Step 2: Manual smoke in browser** (dev server) — toolbar renders in a row without breaking header layout. Controllers can be non-wired briefly; prefer wire in Task 5 same session.

- [ ] **Step 3: Commit**

```bash
git add src/components/StyleToolbar.vue src/i18n/locales/en.ts src/i18n/locales/ru.ts
git commit -m "Expand StyleToolbar with full minimum style controls."
```

---

### Task 5: Wire `EditorPage` + `ParagraphBlock`

**Files:**
- Modify: `src/pages/EditorPage.vue`
- Modify: `src/components/ParagraphBlock.vue`

**Interfaces:**
- Consumes: `applyStyleRange`, `selectionHasProp`, `selectionUniformValue`, `collectProjectFonts`, `STYLE_SIZE_PRESETS_PT`
- Replace `toggleActiveStyle` with:

```ts
function applyActiveStyle(patch: StyleApplyPatch) {
  if (!record.value || projectLease.blocked.value) return
  const sel = targetSelection.value
  if (!sel || sel.start === sel.end) return
  const seg = record.value.segments.find((s) => s.id === sel.segId)
  if (!seg) return
  const next = applyStyleRange(seg.targetStyles, seg.target.length, sel.start, sel.end, patch)
  updateTarget(seg, seg.target, next)
  stylePaintNonce.value++
}
```

- For vertAlign button click in toolbar: if current uniform === clicked value, emit `null`; else emit that value.
- Computed `projectFonts = collectProjectFonts(record.segments)`.
- Pass active/uniform props into each `ParagraphBlock` only when `targetSelection?.segId === seg.id`.
- Update `ParagraphBlock` emit `toggleStyle` → broader emits matching toolbar (or single `applyStyle` with patch). Prefer one emit:

```ts
applyStyle: [patch: StyleApplyPatch]
```

- Keep Ctrl+B/I/U via `applyActiveStyle({ op: 'toggle', prop: ... })`.

- [ ] **Step 1: Wire props/events end-to-end**

- [ ] **Step 2: Manual check** — select word → strike / color / 14pt / Arial → visible in target; preview rebuild shows styles.

- [ ] **Step 3: Commit**

```bash
git add src/pages/EditorPage.vue src/components/ParagraphBlock.vue
git commit -m "Wire full style toolbar apply path into the editor."
```

---

### Task 6: PLAN checkboxes + docs commit

**Files:**
- Modify: `PLAN.md` (mark toolbar-minimum items `[x]` when verified)
- Ensure design/plan/spec files are committed if still dirty:
  - `docs/superpowers/specs/2026-07-16-style-toolbar-minimum-design.md`
  - `docs/superpowers/plans/2026-07-16-style-toolbar-minimum.md`
  - `docs/superpowers/specs/2026-07-15-styles-vs-tags-design.md`

- [ ] **Step 1: Run full related tests**

Run: `npx vitest run tests/docx/runStyle.apply.test.ts tests/docx/styleFonts.test.ts tests/docx/targetStyles.test.ts`

Expected: all PASS.

- [ ] **Step 2: Update PLAN checkboxes for the toolbar-minimum slice**

- [ ] **Step 3: Commit docs + PLAN**

```bash
git add PLAN.md docs/superpowers/specs/2026-07-16-style-toolbar-minimum-design.md docs/superpowers/plans/2026-07-16-style-toolbar-minimum.md docs/superpowers/specs/2026-07-15-styles-vs-tags-design.md
git commit -m "Document style toolbar minimum and defer E remainder and glossary."
```

---

## Spec coverage checklist

| Spec item | Task |
|-----------|------|
| B/I/U/strike/sup/sub/font/size/color/highlight | 1, 4, 5 |
| Compact inline layout | 4 |
| Doc ∪ default fonts | 3 |
| Size presets | 3, 4 |
| Export / preview via existing path | 2, 5 |
| No F4 / C / pop-out | (out of plan) |
| PLAN after-MVP reorder | docs already edited; Task 6 seals checkboxes |
| Tests for new props | 1, 2, 3 |

## Placeholder scan

None intentional. VertAlign “click active to clear” is handled in toolbar wiring (Task 5), not by magical engine toggle.
