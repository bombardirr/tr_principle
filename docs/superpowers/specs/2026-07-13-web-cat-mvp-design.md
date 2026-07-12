# Web CAT MVP — Design Spec

**Date:** 2026-07-13  
**Status:** Approved for planning  
**Product working name:** Translation Tool (web CAT for freelancers / small business)

## 1. Goal

Lightweight browser-based CAT tool focused on freelancers and small businesses in the RU/CIS market. Not a Trados clone: minimal, intuitive, fast to learn. Freemium later (local free / cloud paid on mini-PC); **phase A has no server**.

Primary quality bar for phase A: **DOCX round-trip preserves formatting/markup**. Layout shift from different source/target text length is out of scope.

## 2. Market positioning (context)

- Competitors for this niche: Smartcat (UX/freemium), Trados Go (browser light), CafeTran/OmegaT (budget desktop).
- Enterprise RU CAT (PROMT, etc.) is not the first target.
- Mobile-first CAT is not a market expectation; **desktop-first UI only**.

## 3. Phased roadmap

| Phase | Scope |
|-------|--------|
| **A (this MVP)** | DOCX import → paragraph segments → editor → local project file + IndexedDB → DOCX export with preserved markup |
| **B** | Translation Memory: TMX import/export, match suggestions |
| **C** | Simple glossary + highlight |
| **D** | Paid cloud sync on mini-PC (auth, backup/sync) |

Build in order A → B → C → D. Do not pull later phases into A.

## 4. Architecture

**Approach:** pure client-side OOXML pipeline (no conversion server).

```
DOCX (ZIP)
  → unzip (JSZip)
  → parse stories: word/document.xml, header*.xml, footer*.xml
  → segment paragraphs (incl. table cells)
  → build inline format tags + run map
  → Editor UI
  → write translations back into original runs/XML
  → zip → DOCX out

Parallel: ProjectStore (IndexedDB) + project file export/import
```

**Stack:** Vue 3 + Vite + TypeScript + existing CSS approach (Tailwind/SCSS as needed).

**Rule:** original OOXML is source of truth. Never rebuild the document from scratch.

**Hosting:** static SPA. Mini-PC used later for paid sync only.

## 5. Document scope (phase A)

**In scope**
- Main document body (including tables: cell paragraphs are segments)
- Headers and footers
- Inline formatting via simplified tags: bold, italic, underline, hyperlink; other run properties as opaque preserve-tags

**Out of scope (leave XML untouched)**
- Footnotes / endnotes
- Comments / track changes as editable content
- Text boxes / floating shapes as first-class stories (do not break; do not require translation UI)
- XLSX, PPTX, XLIFF, SDLXLIFF
- Password-protected / encrypted DOCX
- Machine translation, TM, glossary, accounts

**Segmentation:** one Word paragraph (`w:p` with extractable text) = one segment. No sentence splitting in phase A.

## 6. Data model

### Project
- `id`, `name`, timestamps
- optional `sourceLang` / `targetLang`
- original DOCX blob (IndexedDB; also inside project file)
- list of segments + tag/run maps

### Segment
- `id`
- `story`: `document` | `header:{n}` | `footer:{n}`
- `paraPath`: stable pointer into XML for write-back
- `source`, `target`: strings **including inline tags**
- `status`: `empty` | `draft` | `done`
- UI hints: `inTable`, story label

### Inline tags
- Paired markers in text, e.g. `{1}…{2}`
- Self-closing only if required for non-wrapping markers
- Tag id → original Word run / hyperlink mapping
- Export parses target tags and writes text into mapped runs; paragraph/table structure unchanged
- Broken/missing tags: **block export** until fixed; show list of offending segments

### Non-segments
- Paragraphs with no extractable text (breaks, image-only): skip; XML unchanged

### Project file
- Downloadable portable package (ZIP recommended): original DOCX + segment/tag JSON
- Open project file → restore session without cloud
- IndexedDB holds working copy between sessions

## 7. UI / UX

- **Locale:** i18n with **Russian default**; ship `ru` + `en` first; more UI languages later
- **Projects screen:** list (IndexedDB), new from DOCX, open project file, delete
- **Editor (desktop-first):**
  - Two columns: source (read-only, tags visible) | target (editable)
  - Toolbar: progress, save project file, export DOCX
  - Labels for table / header / footer segments
  - Tags highlighted; warn on tag damage before export
- **Not required:** phone-optimized one-segment mode, swipe navigation
- Narrow viewports: usable but not a product goal (no broken layout only)

## 8. Error handling

| Case | Behavior |
|------|----------|
| Not DOCX / corrupt ZIP | Clear error; no project |
| Encrypted DOCX | Unsupported message |
| Empty doc | Project with 0 segments + hint |
| Broken tags on export | Block export; list offending segments |
| Empty targets on export | Fill with **source** so document stays complete |
| IndexedDB quota | Prompt to download project file |
| Corrupt project file | Error; do not silently wipe IndexedDB |

## 9. Verification

1. **Identity round-trip:** import → export with no edits → document/header/footer XML logically equivalent (structure + text/runs preserved; ZIP packaging metadata may differ)
2. **Fixtures:** plain text, table, mixed bold/italic, hyperlink, header/footer
3. **Manual Word check:** styles, table layout, headers/footers after translation

## 10. Repository reset

- Remove current draft application code
- Keep and rewrite `README.md` and `PLAN.md` to match this spec
- Greenfield Vue 3 + Vite + TS scaffold aligned with this design

## 11. Success criteria (phase A)

A tester can:
1. Upload a real DOCX (with table + header + some bold/links)
2. Translate segments in the browser
3. Download a project file and reopen it
4. Export DOCX that opens in Word with original structure/formatting preserved (text content translated)

## 12. Explicit non-goals (phase A)

Mobile-first UI, cloud, billing, TM/TB, MT, multi-user, full Office format suite, pixel-perfect layout after length change.
