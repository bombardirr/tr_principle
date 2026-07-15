# Styles vs markers (фаза E) — Word-like

Date: 2026-07-15 (updated 2026-07-16)  
Plan: `PLAN.md` → Фаза E  
Status: in progress (F0–F2 landing)

## Goal

Переводчик работает **как в Word**, без возни с маркерами `{n}`:

1. **Source** в редакторе повторяет inline-форматирование документа (из `RunSpan` / fingerprint).
2. **Target** стилизуется кнопками B/I/U (plain + `targetStyles`); то, что видно в поле = превью = export.
3. Маркеры `{n}` — только внутренняя кухня (extract / TM / legacy); **не** в обычном UX.
4. Полный HTML→runs (парсинг contenteditable-DOM в DOCX) — **не** цель MVP; export строит runs из plain + `targetStyles`.

## Product rules

- Source: **rich read-only** (bold/italic/underline/font/size из spans).
- Target: **plain string** + `targetStyles?: TargetStyleRange[]`; UI рисует стили.
- Панель стилей — одна, sticky **над колонкой перевода**, по центру; активна при непустом selection в target.
- Copy source → plain source + `targetStyles` из spans (не строка с `{n}`).
- Превью: swap оригинал ↔ перевод; один путь `buildTranslatedDocx`.
- Toggle маркеров `{}` убран из продукта.

## Data model

```ts
export interface TargetStyleRange {
  start: number
  end: number
  bold?: boolean
  italic?: boolean
  underline?: boolean
  font?: string
  fontSizePt?: number
}
```

- Ranges на plain target.
- Есть `targetStyles` → export **пересобирает** `w:r` + `w:rPr` (см. `applyTranslations` styled path).
- Нет `targetStyles` → прежний span-aligned / identity path.

### Run props (copy / display / export)

Поддерживаем типичный Word `w:rPr`: **bold, italic, underline (+ val), font, size, color, strike / doubleStrike, vertAlign (super/sub), highlight**.  
Не трогаем: hyperlink (отдельный узел), границы ячеек, paragraph shading, Capitals/smallCaps и экзотику `x:*` из fingerprint.

## Delivery

| Phase | Status |
|-------|--------|
| F0 spec WYSIWYG | this doc |
| F1 rich source | `RichSourceView` + `runStyle.ts` |
| F2 toolbar + targetStyles + export | `StyleToolbar`, `RichTargetEditor`, styled apply |
| F3 preview parity | same export blob |
| F4 format paint / «как в оригинале» | later |
| F5 font/size etc. | later |

## Success criteria

- «НУЖНОЕ ПОДПИСАТЬ» в source подчеркнуто, «:» — нет (в редакторе).
- Выделил в target → Bold → видно в поле, превью и DOCX.
- Маркеры не нужны для обычной работы.
