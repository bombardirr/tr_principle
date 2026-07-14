# Sentence segments + CAT-like TM UX — Design Spec

**Date:** 2026-07-14  
**Status:** Approved for planning  
**Product:** appzac (Translation Tool)

## 1. Goal

Align segmentation and TM behaviour with translator expectations (Trados-like):

- Never store a multi-sentence paragraph as one TM / project translation unit.
- Keep Word-paragraph sentences **visually** grouped in the editor.
- Offer **explicit** choice among multiple TM hits (no auto-apply, no mass apply).
- Toolbar: work estimate (TM coverage + done), match threshold, language pair, TM autosave toggle.
- First-open project settings; soft migration for existing paragraph-based projects.
- Record **who** created/edited a translation (and allow peeking **context** of a TM hit).

## 2. Decisions (from brainstorm)

| Topic | Decision |
|-------|----------|
| Storage | **B** — sentence-level `Segment` rows only; never merge in DB |
| Visual block | Sentences from the **same Word paragraph** |
| Architecture | Flat segments + `paragraphKey` (+ `sentenceIndex`) |
| Auto-apply | **None** (also no batch apply) |
| TM pick UI | Badge `N · %` on **target slot** (placeholders when empty); click → list; apply to that slot only |
| Mid-toolbar | Remove **TM only**; copy / leave-empty / reset act on **active** sentence segment |
| TM payload | Store target **as-is** (with tags if present); match on tag-stripped text |
| Match threshold default | **100%** (configurable) |
| Language pairs (MVP) | Only: `ru→en`, `en→ru`, `ru→en-GB`, `en-GB→ru`; more languages post-MVP |
| TM autosave | Default **off**; remember preference |
| Coverage | **Two** metrics: TM coverage (≥ threshold hit) + done (%) |
| Old projects | Soft prompt «Re-segment?» (**C**) |
| Auth UI later | Landing with motion (inspire disput / peerling), not a bare login form |

## 3. Data model

### 3.1 `Segment` (project)

Extend current segment:

```ts
paragraphKey: string      // e.g. `${storyKey}:${paraIndex}` — visual + export group
sentenceIndex: number     // 0..n-1 within paragraph
// keep: storyKey, storyFile, paraIndex, source, target, status, spans, flags…
tmSavePending?: boolean   // deprecated for composite-apply; remove after rewrite
```

Optional segment audit (MVP-lite):

```ts
updatedAt?: string
updatedBy?: string        // login | 'local' | 'tm:<unitId>' until auth
origin?: 'manual' | 'tm' | 'copy-source' | 'leave-empty' | 'reset'
```

Full segment event history → post-MVP / admin (same as former “audit” backlog).

### 3.2 `TmUnit`

```ts
id, source, target, sourceKey, sourceLang, targetLang
createdAt, updatedAt
projectId?: string

// Attribution (CAT-like field values)
createdBy?: string        // login or 'local'
updatedBy?: string

// Context snapshot at save time (neighbor sentences in document order)
contextBefore?: string    // previous sentence source (same doc flow), if any
contextAfter?: string     // next sentence source, if any
```

Lookup may return **multiple** units above threshold (not only best-one). UI lists them all.

### 3.3 Project settings

On `ProjectMeta` (or nested `settings`):

```ts
sourceLang: 'ru' | 'en' | 'en-GB'  // as needed by pair
targetLang: 'ru' | 'en' | 'en-GB'
fuzzyMinScore: number             // default 1.0 (100%)
tmAutoSave: boolean               // default false; also mirrored in localStorage preference
settingsConfirmedAt?: string      // first-open wizard done
segmentSchemaVersion?: number     // for migration prompts
```

## 4. Import / export

### Import (DOCX)

1. Extract paragraphs as today (story, table, header/footer…).
2. Split each paragraph plain/tagged text into sentences (reuse/extend `splitTmFragments`; respect tags where possible).
3. Emit one `Segment` per sentence with shared `paragraphKey`, rising `sentenceIndex`.
4. Spans: split run coverage across sentence boundaries best-effort; do not drop markup.

### Export

1. Group segments by `paragraphKey`.
2. Concatenate targets (with original spacing/punct rules) back into one paragraph write path.
3. Round-trip still uses original OOXML paragraph; sentence split is an editor/TM layer.

### Migration (existing projects)

- Detect `segmentSchemaVersion < sentence` (or missing `paragraphKey`).
- On open: modal **«Пересегментировать проект?»**  
  - Yes → split paragraph segments; try to map existing target onto sentence slots (heuristic); leftover text on first slot if unsure; warn user.  
  - Later → keep reading in legacy mode until accepted (or block TM slot UI until migrated — choose in implementation plan: prefer require migrate for new TM UX).

## 5. Editor UX

### Visual paragraph block

- One card/row per `paragraphKey`.
- Source: sentences inline (subtle separators optional).
- Target: **slots** aligned to sentences; empty → placeholders.
- Active slot = focused sentence (caret rules: boundary after prev sentence’s end punct → still prev if “tight to the right of period”, as discussed — implement with slot DOM ranges, not a single contenteditable blob if that fights boundaries; preferred: **one editor per slot** lightly styled as continuous text).

### TM badge + picker

- On each target slot with ≥1 hit ≥ threshold: badge `N · best%`.
- Click → popover list: %, target preview, **createdBy/updatedBy**, dates; **«Контекст»** expands `contextBefore` / `contextAfter` (and later 101% context match).
- Selecting a row applies **only** to that slot. Never auto-fill on focus/open.

### Mid-toolbar

- Keep copy source, leave empty, reset — scoped to **active slot**.
- Remove apply-TM / strike-TM controls.

### Toolbar

- `TM xx%` | `Done yy%`
- Threshold control (default 100%)
- Language pair readout (from project settings)
- Single TM control: **autosave to TM** on/off (default off, persist)

### First open

Wizard/modal: language pair (4 presets) + threshold (+ optional note about TM autosave). Save to project meta.

## 6. Attribution & context (in scope for this redesign)

Present in similar tools (Trados field values / TU properties; context for disambiguation).

**MVP must:**

1. On TM write: set `createdBy`/`updatedBy` (`local` until auth; then account login), timestamps; store `contextBefore`/`contextAfter` from neighboring sentence segments at save time.
2. In variant picker: show who/when; allow expand context.
3. On segment edit: set `origin` / `updatedBy` lightly (enough to debug; full history UI later).

**After auth:** same fields use real user ids; cloud TM preserves them.

**Out of MVP:** dedicated TM admin CRUD UI; full segment timeline panel; true 101% context *match ranking* (fields prepared now → ranking later).

## 7. Non-goals (this change)

- Auto-propagation / mass TM apply  
- Multi-TM / SRX / MT  
- XLIFF  
- Full concordance panel (badge list is enough for now)

## 8. Implementation order (high level)

1. Schema: `paragraphKey`, `sentenceIndex`, TM attribution + context fields; settings on project.
2. Sentence split on import + export reassembly + tests.
3. Editor: paragraph blocks, slots, badges, picker (no auto-apply).
4. Toolbar metrics + threshold + pair + autosave toggle; first-open wizard.
5. Soft migration prompt.
6. Wire TM write with context/attribution; remove obsolete composite TM UX (`tmSavePending`, mid-toolbar TM).

## 9. Open implementation details (non-blocking)

- Exact caret “sticky boundary” between slots — prefer separate slot editors vs one CE.
- Whether “Skip re-segment” allows limited legacy editing or forces read-only until migrate.
- Display names for pairs (`EN/Brit` label → `en-GB` code).
