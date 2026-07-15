# Styles vs markers (фаза E)

Date: 2026-07-15  
Plan: `PLAN.md` → Фаза E  
Status: draft for review (перед кодом)

## Goal

Развести три разных понятия, которые сейчас сваливаются в слово «теги»:

1. **Маркеры форматирования** — внутренние `{n}` / границы Word-runs для round-trip DOCX.
2. **Стилизация перевода** — bold / italic / underline / шрифт / размер на выделении в target (как в CAT: панель форматирования, не чипы в строке).
3. **CAT-теги / placeables** — служебный / повторяющийся контент (колонтитулы уже `kind`; поля и lock — позже, E5).

Редактор по умолчанию показывает **plain text** (без визуальных чипов `{n}`). Превью DOCX остаётся главным источником правды по внешнему виду. Export **не ломает** round-trip.

## Product rules

- Source и target в поле ввода **не обязаны** выглядеть как Word: берут **преобладающий стиль** сегмента; нужное выделяют и стилизуют руками.
- Панель стилей — **одна** на редактор, **над колонкой перевода**, по центру этой колонки. **Не** в шапке страницы (`#app-header` / topbar). **Не** дублировать B/I/U в каждом ряду.
- Панель активна только при focus/active сегменте и (для применения стиля) непустом selection в target. Пустой selection — кнопки disabled или «следующий ввод» (MVP: disabled без selection, проще и предсказуемее).
- Превью результата остаётся; в той же панели — **swap** оригинал ↔ перевод. Отдельный полный инспектор Word — не цель.
- Pop-out превью — то же содержимое (drag + resize, min size); зум страницы важнее жёсткого aspect-lock.
- В UI и i18n: «маркеры форматирования» вместо «теги», где речь о `{n}`. Колонтитулы / `kind` не называть tags.
- TM «штраф за маркеры» = штраф за **различие последовательностей `{n}`**, не за bold/italic и не CAT-placeables. Копирайт UI/PLAN — «маркеры»; код может ещё называться `tag*`.

## Current state (as-is)

| Тема | Как сейчас |
|------|------------|
| `RunSpan` | `{ runIndices, fingerprint, text }` — typed bold/italic **нет**; стили упакованы в `fingerprint` (`formatFingerprint` из `w:rPr`) |
| Редактор | `TaggedEditor` режет `{\d+}` → нередактируемые чипы; подписи через `tagLook` (`<b>`, `</i>`, …) |
| Display style | Текст в редакторе **не** рисуется bold/italic; только чипы |
| Export | Текст мапится обратно на существующие `w:r` по span-ами; `rPr` runs **не пересоздаётся** — меняется только текст |
| TM penalty | Сравнивает **только** списки id маркеров `{n}`, max 0.15 |
| Sentence split | У `sentenceIndex > 0` часто `spans: []`, есть общие `paragraphSpans` |

Ключевые файлы: `src/types/project.ts`, `src/docx/extractSegments.ts`, `src/docx/tags.ts`, `src/docx/tagLook.ts`, `src/docx/applyTranslations.ts`, `src/docx/exportDocx.ts`, `src/docx/xmlUtils.ts`, `src/components/TaggedEditor.vue`, `src/tm/match.ts`.

## Target UX (to-be)

```text
┌──────── source meta ────────┬──── mid ────┬────── target meta ──────┐
│  #ID · kind                 │             │  TM ▾   [B I U …]  💾   │
│                             │  copy/…     │  ↑ style bar (centered) │
├─────────────────────────────┼─────────────┼─────────────────────────┤
│  plain source (markers off) │             │  plain target + style   │
└─────────────────────────────┴─────────────┴─────────────────────────┘
```

- Style bar живёт в зоне **meta-target / над target-pane** активной строки (или sticky strip, привязанный к колонке target) — визуально по центру колонки перевода.
- Toggle «показать маркеры» (dev/power) — опционально; дефолт **скрыты**.
- Preview panel: swap Original / Translation; optional pop-out.

## Data model

### Keep

- `RunSpan` + `fingerprint` + `paragraphSpans` как источник **исходного** форматирования Word и якоря export для «незатронутых» кусков.
- Tagged `source` string с `{n}` **внутри хранения** (для TM exact/tagMatch и export path), даже если UI их прячет.

### Add (эволюционно)

Стили **target**, заданные переводчиком, хранить отдельно от «голой» строки `target` (plain или с маркерами — см. ниже).

Рекомендуемый MVP-модель:

```ts
/** Inclusive-exclusive ranges in target *plain* text (markers stripped). */
export interface TargetStyleRange {
  start: number
  end: number
  bold?: boolean
  italic?: boolean
  underline?: boolean
  /** Optional; omit = inherit predominant */
  font?: string
  /** Half-points or CSS-like pt string — decide in E2 impl; prefer pt number */
  fontSizePt?: number
}

// Segment additions:
targetStyles?: TargetStyleRange[]
```

Правила:

- Ranges на **plain target** (без `{n}`). При вставке/удалении текста — сдвигать ranges (как rich-text offsets).
- Пустой `targetStyles` / отсутствие поля = «весь target → **преобладающий стиль** source-сегмента» (из spans / fingerprint majority).
- Перекрытие: при apply B/I/U на selection — нормализовать (merge / split), без дыр и без вложенности разных смыслов на один диапазон для одного свойства.
- Старые проекты без `targetStyles`: поведение как сейчас (только rewrite text на исходные runs).

### Export strategy (два слоя)

**E1 (минимальный сдвиг, без ручных styles в UI):**

1. Как сейчас: `splitTaggedText` → текст по span-ам → `setRunText` на существующих runs.
2. Если маркеры target испорчены — `coerceTargetTags` (уже есть).
3. Пока нет `targetStyles`: не трогать `rPr`.

**E2+ (с ручными styles):**

Когда есть `targetStyles`, export **не может** честно уложить произвольные ranges только в старые run boundaries. Тогда:

1. Построить plain target + ranges.
2. Смержить с boundary маркеров (если маркеры показаны/хранятся) → упорядоченный список **новых** run-кусочков `{ text, styleProps }`.
3. В абзаце Word: либо переписать детей `w:r` для paragraph group (сохраняя non-text runs / bookmarks по возможности), либо заменить текстовые runs последовательностью новых с собранным `rPr` из predominant + overrides.
4. Превью по-прежнему через `buildTranslatedDocx` — один путь правды.

MVP E2: поддержать **bold / italic / underline**; font/size — если тривиально из fingerprint predominant + optional override. Цвет / highlight / vertAlign — позже (E4 inspector может показывать read-only).

### Predominant style

Из `paragraphSpans` (или segment spans): majority vote по `fingerprint` (или по длине текста). Парсер fingerprint → `{ bold, italic, underline, font, size }` для дефолта target и для «очистить локальный стиль» (= убрать range, inherit predominant).

## UI details

### Style toolbar (E2)

- Кнопки: **B**, **I**, **U**; опционально font / size dropdowns из набора, встреченного в source spans сегмента (+ system fallback).
- Место: над колонкой target, centered в этой колонке; одна панель (не в каждом `ParagraphBlock` meta дублировать логику — можно teleports/sticky-host в `EditorPage`, но **якорь визуально у target**, не у topbar).
- Disabled без active segment / без selection в target / read-only lease.
- Hotkeys later (вкладка «Клавиши»); в E2 достаточно кнопок + стандартные Ctrl+B/I/U **если** не конфликтуют с браузером — опционально, не блокер.

### Markers toggle (E1)

- Дефолт: markers hidden — `TaggedEditor` / mode показывает plain (`stripTags` visual), редактирование plain; внутренне при blur/commit можно снова вшивать маркеры по эвристике **или** хранить target всегда plain и маркеры только в source (предпочтительно для UX: **target plain**, markers только source/debug).
- **Решение (зафиксировано):**  
  - **Source display:** plain by default; toggle «маркеры» показывает чипы.  
  - **Target storage/display MVP:** plain text; markers for export reconstructed via existing coerce/split against `paragraphSpans` / source tag skeleton (как сегодня после coerce). Не требовать от переводчика расставлять `{n}` в target.  
  - Debug toggle может показать reconstructed skeleton read-only.

### Preview (E3)

- Swap: тот же `DocxPreviewPanel`, переключение blob оригинал vs translated; сохранить scroll/segment highlight по возможности.
- Pop-out: windowed overlay или `window.open` с тем же HTML — предпочтительно in-app overlay (проще sync). Persist position/size in `localStorage` keyed by project id.

### Inspector (E4, после E2–E3)

- Click in preview → activate segment + card: font, size, B/I (read from rendered/docx model, not raw CSS copy).
- «Apply to selection» → write into `targetStyles` for current selection.

## Out of scope

- Полный WYSIWYG Word в строке сегмента.
- Три одновременных превью (док + popup + detached) без swap.
- Жёсткий letterbox / aspect-lock resize страницы.
- Копирование CSS из `docx-preview` 1:1 в runs.
- Настоящие CAT placeables / lock-fields (E5).
- Issues tray, multi-user (фаза F).
- Persist undo связанный со styles — следует из текущей RAM undo-модели; ranges должны входить в snapshot undo **когда** styles появятся (расширить `useSegmentHistory` snapshot в E2).

## Phased delivery

| Phase | Deliverable | Done when |
|-------|-------------|-----------|
| **E0** | Спека + i18n/PLAN/README («маркеры»); словарь B2 | Нет «теги = Bold / placeables» в пользовательском копирайте |
| **E1** | Plain display source/target; predominant style на export без `targetStyles`; markers toggle | Старые `.tcat` открываются; round-trip tests green; дефолт без чипов |
| **E2** | Toolbar над target; `targetStyles`; B/I/U persist + export rebuild runs; undo snapshot includes styles | Выделил слово → Bold → export/preview shows bold |
| **E3** | Preview swap + pop-out | Один viewport; pop-out не ломает sync сегмента |
| **E4** | Preview → style card → apply to selection | Не блокирует E1–E3 |
| **E5** | CAT placeables; rename TM penalty in UI | Параллельно / после |

Порядок: `E0 → E1 → E2 → E3 → E4`; E5 не блокирует.

## Testing

- Unit: fingerprint parse; predominant; range merge/split on edit; export with B/I/U on subset of phrase.
- Round-trip: existing `tests/docx/roundtrip*` + cases with `targetStyles`.
- Manual: long DOCX, table/header kinds, lease read-only disables toolbar.

## Open points (не блокеры старта E0–E1)

1. Pop-out: in-app overlay vs `window.open` — default **in-app overlay**.
2. Font size unit in model: prefer `fontSizePt: number`.
3. Exact DOM host for style bar (sticky vs in-row meta-target) — выбрать при вёрстке E2, сохранив «над target / по центру колонки».

## Success criteria

- Переводчик не думает, что `{n}` / чипы = «теги Trados».
- Можно перевести документ, не видя маркеров, и получить корректный DOCX.
- Можно выделить фрагмент перевода, сделать жирным, увидеть это в превью и в экспорте.
- Style UI не отнимает место у topbar и не размножается на каждый сегмент.
