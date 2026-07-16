# Style toolbar — necessary minimum

**Date:** 2026-07-16  
**Status:** Approved for implementation  
**Depends on:** `2026-07-15-styles-vs-tags-design.md` (F1–F2 landed)  
**Plan:** `PLAN.md` → срез «тулбар стилей (минимум)» перед закрытием MVP; остаток фазы E и фаза C — после MVP

## 1. Goal

Довести панель стилизации target до **необходимого минимума Word-like props**, уже описанных в модели (`TargetStyleRange` / `RunStyle` / export `w:rPr`), без пипетки F4 и остального бэклога E.

Переводчик должен выделить фрагмент перевода и задать: **bold, italic, underline, strike, superscript/subscript, font, size, text color, highlight** — с отражением в поле, превью и DOCX.

## 2. Non-goals (явно после MVP)

| Item | Notes |
|------|--------|
| F4 format paint / «как в оригинале» | отдельный срез E |
| E3 pop-out превью | drag/resize overlay |
| E1b predominant style на export | когда нет ручных override |
| E4 инспектор стилей с превью | click → карточка → apply |
| E5 CAT placeables | lock-fields / non-translatable |
| Фаза C — глоссарий | termbase / TBX |
| doubleStrike в UI | parse/copy ок; кнопка не нужна |
| Hyperlinks, caps/smallCaps, shading | вне модели MVP |

## 3. Placement & layout

- Остаётся в **target header center** (рядом с существующим reveal-chrome).
- **Compact inline** одна строка:

  `B I U | S | x² x₂ | Font ▾ | Size ▾ | A▾ | ▮▾`

- Узкая шапка: короткие controls (иконки ~1.5–1.75rem, select с `max-width`, swatch ~1.25rem). При нехватке места — сжатие gap/font truncate, **не** второй ряд и не overflow-меню (решение продукта).
- Reveal-правила шапки (hover/focus ряда, owns-chrome) **не меняем**.

## 4. Controls

| Control | Model field | Behaviour |
|---------|-------------|-----------|
| B / I / U | `bold` / `italic` / `underline` | Toggle on selection (как сейчас). Ctrl+B/I/U. |
| S | `strike` | Toggle. |
| x² / x₂ | `vertAlign` | Mutually exclusive: set `superscript` / `subscript`, or clear if already active. |
| Font ▾ | `font` | Options = fonts discovered in open project source spans ∪ short Word defaults (e.g. Calibri, Arial, Times New Roman, Georgia, Courier New). Applying sets `font` on selection. |
| Size ▾ | `fontSizePt` | Presets 8, 9, 10, 11, 12, 14, 16, 18, 20, 24, 28, 36. If selection has another size, show it as selected/extra option. |
| A▾ | `color` | Small palette of hex RGB (no `#` in model) + **Auto** (clear `color`). |
| ▮▾ | `highlight` | Word highlight vals already mapped in `HIGHLIGHT_CSS` + **None**. |

**Enablement:** same as today — non-empty selection in active target; disabled when lease/readonly.

**Active state:** for toggles — property covers the whole selection; for font/size/color/highlight — show common value if uniform, else empty / mixed indicator (dash or blank).

## 5. Engine changes

1. Generalize `toggleStyleRange` (or add `applyStyleRange`) to support:
   - boolean toggles: `bold` \| `italic` \| `underline` \| `strike`
   - exclusive enum: `vertAlign` (`superscript` \| `subscript` \| clear)
   - set/clear scalars: `font`, `fontSizePt`, `color`, `highlight`
2. Wire `StyleToolbar` → `EditorPage` → apply → `stylePaintNonce` / undo snapshot (existing path).
3. Confirm `RichTargetEditor` paints all props (already reads most via `runStyle` / data-*); fill gaps if any.
4. Confirm styled export path writes full `rPr` (already in `xmlUtils` / `applyTranslations`); add/extend tests for strike, vertAlign, color, highlight, font, size.

## 6. i18n / a11y

- Toolbar `aria-label` remains; each control has title/tooltip (ru/en).
- Color/highlight popovers: keyboard-reachable buttons; Escape closes.
- No new required shortcuts beyond B/I/U.

## 7. Acceptance

- [ ] All listed controls visible in target header and act on selection.
- [ ] Changes visible in target editor and DOCX preview after export rebuild.
- [ ] Round-trip tests cover the new props (not only B/I/U).
- [ ] PLAN marks remaining E + phase C as after MVP; implementation order points at this slice as current.

## 8. Open (resolved)

| Topic | Decision |
|-------|----------|
| Scope vs rest of E | Toolbar full model now; F4 / pop-out / E1b / E4 / E5 after MVP |
| Phase C | After MVP |
| Layout | Compact inline, not overflow / flyout |
| doubleStrike | No UI |
| Font list | Doc ∪ short defaults |
