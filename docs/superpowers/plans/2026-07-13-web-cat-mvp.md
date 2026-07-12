# Phase A Web CAT MVP — Implementation Plan

> **For agentic workers:** Execute inline in this session. Steps use checkbox syntax.

**Goal:** Ship a local-first Vue 3 CAT MVP: DOCX in → paragraph editor with format tags → project file/IndexedDB → DOCX out with preserved markup.

**Architecture:** Client-only OOXML pipeline (JSZip + DOMParser). Original ZIP/XML is source of truth; translations write back into existing `w:r`/`w:t` nodes. Vue Router for Projects + Editor; IndexedDB for working copy; `.tcat.zip` project package.

**Tech Stack:** Vue 3, Vite, TypeScript, Vue Router, vue-i18n, JSZip, Tailwind CSS, vitest (docx unit tests)

## Global Constraints

- Phase A only: no TM, glossary, cloud, MT, mobile-first UI
- Preserve all DOCX formatting; length layout shifts ignored
- Paragraph = segment; body + headers/footers; tables as cell paragraphs
- Inline tags: bold/italic/underline/hyperlink + opaque; broken tags block export
- Empty targets on export → use source
- i18n: ru default + en
- Desktop-first UI
- Wipe old draft `src/` before scaffold

## File structure

```
src/
  main.ts, App.vue, style.css
  i18n/index.ts, locales/ru.ts, locales/en.ts
  router/index.ts
  types/project.ts
  docx/
    types.ts
    xmlUtils.ts
    extractSegments.ts
    applyTranslations.ts
    openDocx.ts
    exportDocx.ts
    tags.ts
  storage/
    idb.ts
    projectFile.ts
  composables/
    useProjects.ts
    useEditor.ts
  pages/
    ProjectsPage.vue
    EditorPage.vue
  components/
    SegmentRow.vue
    TaggedText.vue
    AppHeader.vue
tests/docx/
  tags.test.ts
  roundtrip.test.ts
fixtures/ (generated minimal docx in tests)
```

### Task 1: Reset + scaffold

- Delete old `src/**` draft composables/components/pages
- Keep vite/tsconfig/tailwind; add vue-i18n, idb (or native IDB wrapper), vitest
- Wire router: `/`, `/project/:id`
- i18n ru/en shell
- Projects + Editor stub pages

### Task 2: DOCX extract + tags + write-back

- `openDocx(file)` → `{ zip, stories, segments, runMaps }`
- Segment per `w:p` with text; `paraId` stable index per story file
- Tags from consecutive run format fingerprints
- `applyTranslations(zip, segments)` → mutated zip bytes
- Identity round-trip tests

### Task 3: Storage

- IndexedDB projects CRUD + autosave
- Export/import `.tcat.zip` (project.json + original.docx)

### Task 4: UI

- Projects: upload DOCX, open project file, delete, open editor
- Editor: two-pane segments, progress, save project, export DOCX, tag highlight, export blocked on bad tags

### Task 5: Verify

- `npm run build` + `npm test`
- Manual smoke with `tests/fixtures/sample.docx` if present
