# Segment chrome + magnetic rail — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split segment headers into source/target columns matching pane widths, relocate style controls into the target header, and snap a single center-rail action cluster (copy / leave-empty / reset) to the hovered or focused row.

**Architecture:** Each `ParagraphBlock` owns two column headers (no shared three-column meta strip). Pair-actions leave the per-row mid-toolbar and become one floating cluster in `MagneticSegmentRail`, positioned with CSS `transform: translateY(...)` from row geometry. Style toolbar mounts in the active row’s target header (or every row, disabled when inactive).

**Tech Stack:** Vue 3 + `<script setup>`, TypeScript, existing SCSS in components, Vitest for pure geometry helper.

## Global Constraints

- Spec: [`docs/superpowers/specs/2026-07-16-segment-chrome-magnetic-rail-design.md`](../specs/2026-07-16-segment-chrome-magnetic-rail-design.md)
- Magnet snaps to **whole row** vertical centre (no X magnet to panes)
- Animation: CSS transition only (~150–220ms); no physics library
- Copy / leave-empty / reset behaviour unchanged
- Audit + concordance = source header center; undo/redo + TM-save = target header end
- Remove page sticky `StyleToolbar` host
- Desktop breakpoint continues ~800px; stacked layout disables Y magnet
- Preserve DOCX / `targetStyles` behaviour; this is chrome only
- Do not implement format painter (F4)

---

## File map

| File | Role |
|------|------|
| `src/editor/magnetGeometry.ts` | Pure Y-offset helper (testable) |
| `tests/editor/magnetGeometry.test.ts` | Unit tests for magnet math |
| `src/components/MagneticSegmentRail.vue` | Floating cluster + transform |
| `src/components/ParagraphBlock.vue` | Split headers into columns; emit hover; drop per-row mid-toolbar |
| `src/components/StyleToolbar.vue` | Unchanged API; new parent |
| `src/pages/EditorPage.vue` | List wrapper, rail wiring, remove sticky style host, pointerdown selectors |
| `PLAN.md` | Note chrome layout done (optional one-liner under styles section) |

---

### Task 1: Magnet geometry helper + tests

**Files:**
- Create: `src/editor/magnetGeometry.ts`
- Create: `tests/editor/magnetGeometry.test.ts`

**Interfaces:**
- Produces: `magnetClusterTranslateY({ listTop, rowCenterY, clusterHeight }): number`
- Produces: `pickMagnetRowId({ activeId, hoverId }): string | null`

- [ ] **Step 1: Write failing tests**

```ts
import { describe, expect, it } from 'vitest'
import { magnetClusterTranslateY, pickMagnetRowId } from '@/editor/magnetGeometry'

describe('magnetClusterTranslateY', () => {
  it('aligns cluster center with row center relative to list top', () => {
    // listTop=100, row center at 300, cluster 40px → translateY = 300-100-20 = 180
    expect(
      magnetClusterTranslateY({ listTop: 100, rowCenterY: 300, clusterHeight: 40 }),
    ).toBe(180)
  })

  it('handles zero-size cluster', () => {
    expect(
      magnetClusterTranslateY({ listTop: 0, rowCenterY: 50, clusterHeight: 0 }),
    ).toBe(50)
  })
})

describe('pickMagnetRowId', () => {
  it('prefers active over hover', () => {
    expect(pickMagnetRowId({ activeId: 'a', hoverId: 'b' })).toBe('a')
  })
  it('falls back to hover', () => {
    expect(pickMagnetRowId({ activeId: null, hoverId: 'b' })).toBe('b')
  })
  it('returns null when neither set', () => {
    expect(pickMagnetRowId({ activeId: null, hoverId: null })).toBe(null)
  })
})
```

- [ ] **Step 2: Run tests — expect FAIL**

Run: `npx vitest run tests/editor/magnetGeometry.test.ts`

Expected: FAIL (module not found)

- [ ] **Step 3: Implement helper**

```ts
// src/editor/magnetGeometry.ts
export function magnetClusterTranslateY(opts: {
  listTop: number
  rowCenterY: number
  clusterHeight: number
}): number {
  return opts.rowCenterY - opts.listTop - opts.clusterHeight / 2
}

export function pickMagnetRowId(opts: {
  activeId: string | null | undefined
  hoverId: string | null | undefined
}): string | null {
  if (opts.activeId) return opts.activeId
  if (opts.hoverId) return opts.hoverId
  return null
}
```

- [ ] **Step 4: Run tests — expect PASS**

Run: `npx vitest run tests/editor/magnetGeometry.test.ts`

- [ ] **Step 5: Commit**

```bash
git add src/editor/magnetGeometry.ts tests/editor/magnetGeometry.test.ts
git commit -m "Add magnet geometry helpers for segment rail positioning."
```

---

### Task 2: Split ParagraphBlock headers into source/target columns

**Files:**
- Modify: `src/components/ParagraphBlock.vue`

**Interfaces:**
- Emits (add): `row-hover: [segId: string | null]` — `segId` of first segment in block on mouseenter; `null` on mouseleave (EditorPage may ignore leave when moving to rail)
- Props: keep existing; still receive `stylePaintNonce`, style selection not handled here yet (Task 4)
- Remove: per-row `.mid-toolbar` DOM (rail moves in Task 3)
- Structure: `.meta` three-column strip → headers inside `.source-col` / `.target-col`

- [ ] **Step 1: Restructure template**

Replace the top-level `.meta` + `.segment-workspace` pattern with:

```vue
<article
  :id="`segment-${sorted[0]?.id}`"
  class="row"
  :class="{ active: ..., 'concordance-open': ..., 'audit-open': ... }"
  @mouseenter="emit('rowHover', sorted[0]?.id ?? null)"
  @mouseleave="emit('rowHover', null)"
>
  <div class="segment-workspace">
    <div class="col source-col">
      <div class="source-header">
        <div class="header-start">
          <span class="seg-id">{{ displayId }}</span>
          <!-- kinds as today -->
        </div>
        <div class="header-center" role="toolbar">
          <TmConcordancePanel ... />
          <SegmentAuditPopover ... />
        </div>
        <div class="header-end" aria-hidden="true" />
      </div>
      <div class="pane source-pane" ...>
        <!-- RichSourceView slots unchanged -->
      </div>
    </div>

    <!-- gutter placeholder: keeps 1fr | auto | 1fr alignment with page rail -->
    <div class="rail-gutter" aria-hidden="true" />

    <div class="col target-col">
      <div class="target-header">
        <div class="header-start">
          <TmVariantPicker ... />
        </div>
        <div class="header-center">
          <!-- StyleToolbar slot: Task 4; leave empty comment for now -->
        </div>
        <div class="header-end">
          <!-- undo/redo + tm-save as today -->
        </div>
      </div>
      <div class="pane target-pane" ...>
        <!-- RichTargetEditor slots unchanged -->
      </div>
    </div>
  </div>
</article>
```

Delete the old `.mid-toolbar` block (pair-actions temporarily unavailable until Task 3 — finish Task 2+3 in one session if needed; do not leave main broken overnight without Task 3).

- [ ] **Step 2: CSS**

```scss
$rail-col-width: 2rem;
$row-gap: 0.65rem;

.segment-workspace {
  display: grid;
  grid-template-columns: 1fr $rail-col-width 1fr;
  column-gap: $row-gap;
  align-items: stretch;
}

.source-header,
.target-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.35rem;
  min-height: 1.5rem;
  margin-bottom: 0.35rem;
  font-size: 0.8rem;
}

.header-start,
.header-center,
.header-end {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  min-width: 0;
}

.header-center {
  justify-content: center;
  flex: 1 1 auto;
}

.header-end {
  justify-content: flex-end;
  margin-left: auto;
}

.rail-gutter {
  width: $rail-col-width;
}

// Remove opacity:0 hide on old meta-center; headers stay visible.
// Keep media query ~800px: stack source-col above target-col; gutter becomes horizontal strip.
```

Adapt `@media (max-width: 800px)` so columns stack; `rail-gutter` can collapse or sit between columns as a short horizontal bar (pair icons return in Task 3 mobile path).

- [ ] **Step 3: Wire `rowHover` in emit types**

```ts
rowHover: [segId: string | null]
```

- [ ] **Step 4: Manual smoke**

Run: `npm run dev` → open a project → headers sit over their panes; mid-toolbar missing until Task 3.

- [ ] **Step 5: Commit**

```bash
git add src/components/ParagraphBlock.vue
git commit -m "Split segment headers into source and target columns."
```

---

### Task 3: `MagneticSegmentRail` + EditorPage wiring

**Files:**
- Create: `src/components/MagneticSegmentRail.vue`
- Modify: `src/pages/EditorPage.vue`
- Modify: `src/components/ParagraphBlock.vue` (ensure row ids stable: `segment-${id}` already)

**Interfaces:**
- Consumes: `pickMagnetRowId`, `magnetClusterTranslateY`
- Consumes from page: `activeSegmentId`, `hoverSegmentId`, handlers `copySourceById`, `leaveEmptyById`, `resetTargetById`, `leaveEmptyActive` (or recompute via `isIntentionallyEmpty`)
- Produces: floating cluster with buttons; `translateY` px; class `magnetic-rail`

- [ ] **Step 1: Create rail component**

```vue
<!-- src/components/MagneticSegmentRail.vue — sketch -->
<script setup lang="ts">
import { nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { magnetClusterTranslateY, pickMagnetRowId } from '@/editor/magnetGeometry'
import IconButton from './IconButton.vue'
import EditorGlyph from './EditorGlyph.vue'

const props = defineProps<{
  activeSegmentId: string | null
  hoverSegmentId: string | null
  leaveEmptyActive: boolean
  /** Ref to the scroll/list element that wraps rows (position: relative). */
  listEl: HTMLElement | null
}>()

const emit = defineEmits<{
  copy: []
  leaveEmpty: []
  reset: []
}>()

const cluster = ref<HTMLElement | null>(null)
const translateY = ref(0)
const dimmed = ref(true)

function measure() {
  const list = props.listEl
  const id = pickMagnetRowId({
    activeId: props.activeSegmentId,
    hoverId: props.hoverSegmentId,
  })
  dimmed.value = !id
  if (!list || !id || !cluster.value) return
  const row = document.getElementById(`segment-${id}`)
  if (!row) return
  const listRect = list.getBoundingClientRect()
  const rowRect = row.getBoundingClientRect()
  const rowCenterY = rowRect.top + rowRect.height / 2
  const ch = cluster.value.getBoundingClientRect().height
  translateY.value = magnetClusterTranslateY({
    listTop: listRect.top,
    rowCenterY,
    clusterHeight: ch,
  })
  // When list scrolls inside a container, prefer offsets relative to list:
  // translateY = (row.offsetTop + row.offsetHeight/2) - clusterHeight/2
  // Prefer offsetTop path if list is the offsetParent chain root — switch if getBoundingClientRect drifts on scroll.
}

// watch props + ResizeObserver + scroll listener on list/window → measure()
</script>

<template>
  <div class="magnetic-rail" aria-hidden="false">
    <div
      ref="cluster"
      class="magnetic-cluster"
      :class="{ dimmed }"
      role="toolbar"
      :style="{ transform: `translateY(${translateY}px)` }"
    >
      <IconButton ... @click="emit('copy')"><EditorGlyph name="copy" /></IconButton>
      <IconButton :active="leaveEmptyActive" ... @click="emit('leaveEmpty')">...</IconButton>
      <IconButton ... @click="emit('reset')">...</IconButton>
    </div>
  </div>
</template>
```

Prefer **offset-based** positioning once rail is `position:absolute; top:0; left:…` inside the list:

```ts
translateY.value =
  row.offsetTop + row.offsetHeight / 2 - cluster.value.offsetHeight / 2
```

Use `magnetClusterTranslateY` with `listTop: 0`, `rowCenterY: row.offsetTop + row.offsetHeight/2` so tests stay meaningful.

CSS:

```scss
.magnetic-rail {
  position: absolute;
  top: 0;
  bottom: 0;
  left: 50%;
  width: 2rem;
  transform: translateX(-50%);
  pointer-events: none;
  z-index: 3;
}
.magnetic-cluster {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  align-items: center;
  pointer-events: auto;
  transition: transform 180ms ease, opacity 150ms ease;
}
.magnetic-cluster.dimmed {
  opacity: 0.35;
}
```

At `max-width: 800px`: hide absolute rail; render the same three buttons in `.rail-gutter` of each row (or only active row) without transform — pass prop `stacked` from a `matchMedia` / resize check on the page.

- [ ] **Step 2: Wire EditorPage**

```ts
const hoverSegmentId = ref<string | null>(null)
const segmentListEl = ref<HTMLElement | null>(null)

function onRowHover(segId: string | null) {
  hoverSegmentId.value = segId
}
```

Template:

```vue
<div ref="segmentListEl" class="segment-list">
  <MagneticSegmentRail
    :list-el="segmentListEl"
    :active-segment-id="activeSegmentId"
    :hover-segment-id="hoverSegmentId"
    :leave-empty-active="/* isIntentionallyEmpty(active seg) */"
    @copy="activeSegmentId && copySourceById(activeSegmentId)"
    @leave-empty="activeSegmentId && leaveEmptyById(activeSegmentId)"
    @reset="activeSegmentId && resetTargetById(activeSegmentId)"
  />
  <ParagraphBlock
    ...
    @row-hover="onRowHover"
  />
</div>
```

Rail actions must target **`pickMagnetRowId` result**, not only `activeSegmentId`:

```ts
function magnetTargetId() {
  return pickMagnetRowId({
    activeId: activeSegmentId.value,
    hoverId: hoverSegmentId.value,
  })
}
// @copy="() => { const id = magnetTargetId(); if (id) copySourceById(id) }"
```

Also call `activateSegment(id)` before copy if needed so focus/history seed stay consistent.

- [ ] **Step 3: Update `onEditorPointerDown` allowlist**

```ts
if (
  target.closest(
    '.target-pane, .magnetic-rail, .magnetic-cluster, .source-header, .target-header, .tm-picker, .style-toolbar',
  )
) {
  return
}
```

- [ ] **Step 4: Manual test**

1. Hover rows → cluster slides to row centre  
2. Focus target → stays on that row when hover leaves to another (active wins)  
3. Click copy / leave-empty / reset → same as before  
4. Keyboard: Tab to cluster buttons works  

- [ ] **Step 5: Commit**

```bash
git add src/components/MagneticSegmentRail.vue src/pages/EditorPage.vue src/components/ParagraphBlock.vue
git commit -m "Add magnetic segment rail for pair actions."
```

---

### Task 4: Move StyleToolbar into target header

**Files:**
- Modify: `src/components/ParagraphBlock.vue`
- Modify: `src/pages/EditorPage.vue`
- Modify: `src/components/StyleToolbar.vue` (titles via i18n if easy; optional)

**Interfaces:**
- Props on ParagraphBlock (add):

```ts
styleDisabled?: boolean
hasStyleSelection?: boolean
boldActive?: boolean
italicActive?: boolean
underlineActive?: boolean
```

- Emits: `toggleStyle: [prop: 'bold' | 'italic' | 'underline']`

- [ ] **Step 1: Mount toolbar in target `header-center`**

```vue
<div class="header-center">
  <StyleToolbar
    :disabled="styleDisabled || seg.id !== activeId"
    :has-selection="hasStyleSelection && seg.id === activeId"
    :bold-active="boldActive && seg.id === activeId"
    :italic-active="italicActive && seg.id === activeId"
    :underline-active="underlineActive && seg.id === activeId"
    @toggle="emit('toggleStyle', $event)"
  />
</div>
```

Only the active row needs an interactive toolbar; inactive rows may omit the component (`v-if="seg.id === activeId"`) to avoid N toolbars — preferred.

- [ ] **Step 2: Remove sticky host from EditorPage**

Delete `.style-toolbar-host` block and its SCSS. Pass style props into `ParagraphBlock` and handle `@toggle-style="toggleActiveStyle"`.

Keep `onEditorKeydown` Ctrl+B/I/U as today.

- [ ] **Step 3: Manual test**

1. Select text in translation → B/I/U enable in that row’s header  
2. Shortcuts still work  
3. No sticky bar at top of editor list  

- [ ] **Step 4: Commit**

```bash
git add src/components/ParagraphBlock.vue src/pages/EditorPage.vue
git commit -m "Move style toolbar into the target column header."
```

---

### Task 5: Mobile stack + polish + PLAN note

**Files:**
- Modify: `src/components/ParagraphBlock.vue` (media query)
- Modify: `src/components/MagneticSegmentRail.vue` (`stacked` mode)
- Modify: `PLAN.md` (styles chrome bullet)

- [ ] **Step 1: Stacked layout**

At `max-width: 800px`:

- `.segment-workspace { grid-template-columns: 1fr; }`
- Source col, then inline action row (three IconButtons), then target col
- Hide absolutely positioned `MagneticSegmentRail` (`display: none` when `stacked`)
- Show per-row `.rail-gutter--stacked` with the three actions (emit same events as before via ParagraphBlock mid-actions restored only for stacked)

Simplest path: ParagraphBlock keeps a `stackedActions` toolbar `v-show="stacked"` toggled by `window.matchMedia('(max-width: 800px)')` composable or prop from EditorPage.

- [ ] **Step 2: PLAN.md**

Under styles section, add or adjust:

```md
- [x] Segment chrome: split source/target headers + magnetic rail for pair-actions
```

- [ ] **Step 3: Full manual acceptance (from spec §8)**

- [ ] Source header width equals source pane; target header equals target pane  
- [ ] Number + kinds on source start; audit + concordance source center  
- [ ] TM left, styles center, undo/redo + TM-save right on target  
- [ ] Sticky page style toolbar gone  
- [ ] Rail snaps on desktop; keyboard still works  
- [ ] Copy / leave-empty / reset unchanged  
- [ ] Mobile stack usable  

- [ ] **Step 4: Commit**

```bash
git add src/components/ParagraphBlock.vue src/components/MagneticSegmentRail.vue PLAN.md
git commit -m "Polish stacked segment chrome and mark rail layout done."
```

---

## Spec coverage check

| Spec item | Task |
|-----------|------|
| Split headers matching pane widths | 2 |
| Source: id / audit+concordance | 2 |
| Target: TM / styles / undo+TM-save | 2 + 4 |
| Magnetic rail Y to row | 1 + 3 |
| Active > hover priority | 1 + 3 |
| CSS transition only | 3 |
| Remove sticky StyleToolbar | 4 |
| pointerdown allowlist update | 3 |
| Mobile stack, no magnet | 5 |
| A11y focusable rail buttons | 3 |

## Placeholder scan

None intentional — mobile uses explicit stacked toolbar, not “TBD”.

## Type consistency

- `pickMagnetRowId` / `magnetClusterTranslateY` names shared by Tasks 1 and 3  
- Emit `rowHover` / `@row-hover`  
- Emit `toggleStyle` / `@toggle-style`  
- Row DOM id remains `segment-${segId}`
