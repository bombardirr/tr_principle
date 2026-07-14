# Sentence segments + CAT-like TM UX — Implementation Plan

> **For agentic workers:** Implement task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Sentence-level segments in storage, visual paragraph blocks, explicit TM picker with attribution/context, toolbar metrics — per [`2026-07-14-sentence-tm-ux-design.md`](../specs/2026-07-14-sentence-tm-ux-design.md).

**Architecture:** Flat `Segment` rows with `paragraphKey` + `sentenceIndex`. DOCX export merges siblings before write-back. TM returns multi-hits; UI applies one slot at a time. No auto-apply.

**Tech Stack:** Vue 3, TypeScript, IndexedDB, existing `docx/` + `tm/` modules.

## Global Constraints

- No auto / mass TM apply
- TM autosave default **off**; fuzzy default **100%**
- Language pairs MVP: ru↔en, ru↔en-GB only
- Preserve DOCX round-trip
- Attribution + context fields on `TmUnit` from day one

---

## File map

| File | Role |
|------|------|
| `src/types/project.ts` | `paragraphKey`, `sentenceIndex`, audit fields, meta settings |
| `src/types/tm.ts` | `createdBy`, context, multi-match type |
| `src/tm/fragments.ts` / new `src/tm/sentences.ts` | Tag-aware sentence split |
| `src/docx/extractSegments.ts` | Emit sentence segments |
| `src/docx/applyTranslations.ts` | Merge group before apply |
| `src/storage/idb.ts` | Clone new fields |
| `src/storage/tmIdb.ts` | Attribution + context on upsert |
| `src/tm/match.ts` | `findTmMatches` (list) |
| `src/tm/settings.ts` | Defaults: fuzzy 1.0, autoSave false |
| `src/tm/langPairs.ts` | 4 presets |
| `src/components/ParagraphBlock.vue` | Visual block + slots |
| `src/components/TmVariantPicker.vue` | Badge + list + context |
| `src/components/SegmentRow.vue` | Trim TM mid-toolbar / adapt or replace |
| `src/pages/EditorPage.vue` | Grouping, wizard, toolbar, migration |
| `tests/tm/*`, `tests/docx/*` | Split, merge export, multi-match |

---

## Task 1: Types + TM defaults + multi-match

- [ ] Extend `Segment`, `ProjectMeta`, `TmUnit`
- [ ] `findTmMatches` returning all ≥ threshold (sorted)
- [ ] Defaults: `fuzzyMinScore: 1`, `autoSaveToTm: false`
- [ ] Tests for multi-match / defaults
- [ ] Commit

## Task 2: Sentence split on import + export merge

- [ ] Tag-aware `splitTaggedSentences`
- [ ] `extractSegmentsFromStories` emits N sentences / paragraph with shared `paragraphKey`
- [ ] Keep full-paragraph `spans` on each sibling for export (or `paragraphSpans`)
- [ ] `applyTranslationsToStories` groups by `paragraphKey`, joins targets, applies once
- [ ] Round-trip tests
- [ ] Commit

## Task 3: Editor paragraph blocks + TM picker

- [ ] `ParagraphBlock`: source/target slots, active slot, mid-toolbar without TM
- [ ] `TmVariantPicker`: badge, list, attribution, context expand
- [ ] Wire `EditorPage`; remove composite `tmSavePending` apply UX
- [ ] Commit

## Task 4: Toolbar + wizard + migration

- [ ] Coverage metrics, threshold, lang pair, autosave toggle
- [ ] First-open settings modal
- [ ] Re-segment prompt for legacy projects
- [ ] TM upsert with `createdBy`/`contextBefore`/`contextAfter`
- [ ] Commit

---

## Manual test

1. Open DOCX with multi-sentence paragraphs → multiple slots in one block  
2. Empty targets show placeholders + badges when TM has hits  
3. Pick variant → only that slot fills; no mass fill  
4. Export DOCX still coherent  
5. Threshold 100% default; autosave TM off until enabled  
