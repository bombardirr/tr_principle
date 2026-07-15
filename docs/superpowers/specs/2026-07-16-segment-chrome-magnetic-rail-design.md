# Segment chrome + magnetic rail — Design Spec

**Date:** 2026-07-16  
**Status:** Draft for review  
**Depends on:** Word-like styles (`targetStyles`, `StyleToolbar`, rich source/target)

## 1. Goal

Make segment chrome match the two-column mental model: controls that belong to the **original** live over the source column; controls that belong to the **translation** live over the target column. Pair-actions (copy / leave-empty / reset) sit on a vertical **magnetic rail** between columns and snap to the hovered or focused row.

## 2. Non-goals

- Physics / spring animation libraries.
- Sliding icons toward the left or right column on the X axis.
- Changing TM matching, concordance search logic, or style data model.
- Format painter (F4) — separate track.

## 3. Layout

Each segment row uses the same three-column width recipe as the body:

`1fr | rail | 1fr`

### 3.1 Source header (left pane width)

Flex, `justify-content: space-between` (or three zones: start / center / end):

| Zone | Contents |
|------|----------|
| Start | Segment display index (`#n`). Optional kind badges stay next to the id. |
| Center | Segment audit popover + TM concordance (search). |
| End | Empty (reserved for balance / future). |

### 3.2 Target header (right pane width)

Flex with three zones:

| Zone | Contents |
|------|----------|
| Start | TM variant picker (percent matches) — same behaviour as today. |
| Center | Inline style controls (B / I / U for now). Replaces the page-level sticky `StyleToolbar` host. |
| End | Undo / redo + “save to TM” (when pending). |

### 3.3 Magnetic rail (center column)

Full height of the segment list (or editor scrollport). Hosts a **single** floating cluster of pair-actions:

- Copy source → target (text + styles)
- Leave empty
- Reset target

The cluster **translates vertically** to the vertical centre of the active row:

1. Focus inside a target editor → that row wins.
2. Else hover over a row → that row wins.
3. Else last focused/activated row (or first visible) — cluster may be dimmed.

Horizontal position stays in the rail gutter (no X magnet to panes).

Motion: CSS `transform` + short `transition` (~150–220ms). No spring library.

## 4. Style toolbar relocation

- Remove sticky page-level style toolbar from `EditorPage` chrome.
- Mount B/I/U in each row’s **target header center** (or one shared instance portaled into the active row’s center slot — implementation detail; UX must feel local to the translation column).
- Shortcuts Ctrl/Cmd+B/I/U still apply to the active segment selection.
- Disabled when no segment is active / lease blocked / no non-empty selection (same rules as today).

## 5. Interaction & a11y

- Rail buttons remain real focusable controls (not hover-only). Keyboard and screen readers can activate copy / leave-empty / reset for the active segment without relying on magnet animation.
- Magnet position is a progressive enhancement on pointer/hover.
- Mid-toolbar opacity tricks that hide controls until row hover are replaced by: headers always show their column controls; rail cluster always present but snaps + optional dimming when idle.
- Existing `pointerdown` exceptions for `.target-pane`, `.mid-toolbar`, `.meta-target`, `.tm-picker`, `.style-toolbar-host` must be updated for the new class names / rail host so focusing styles or rail does not clear `activeSegmentId`.

## 6. Responsive

- Below the existing ~800px breakpoint: stack source above target; rail becomes a horizontal strip between panes (or an inline action group under the source header). Magnet Y-tracking is disabled when stacked.
- Exact stacked layout can reuse current mobile stacking with controls redistributed (source meta → target meta → actions).

## 7. Implementation sketch (non-binding)

1. Restructure `ParagraphBlock`: drop unified `.meta` grid; put `.source-header` inside/above source column and `.target-header` inside/above target column so widths always match panes.
2. Lift rail cluster to `EditorPage` (or a sibling of the segment list) and drive `translateY` from `ResizeObserver` / scroll + `activeSegmentId` / row hover events.
3. Move `StyleToolbar` into target header; delete sticky host styles.
4. Update tests only if any snapshot/DOM queries depend on old meta classnames (prefer behaviour tests over class names).

## 8. Acceptance

- [ ] Source header width equals source pane; target header width equals target pane.
- [ ] Number + (kinds) on the left of source header; audit + concordance centered on source.
- [ ] TM picker left, styles center, undo/redo + TM-save right on target header.
- [ ] Page sticky style toolbar gone.
- [ ] Rail cluster snaps to hover/focus row on desktop; actions still work via keyboard for active segment.
- [ ] Copy / leave-empty / reset behaviour unchanged.
- [ ] Mobile stack remains usable (no overlapping magnet).

## 9. Open points (resolved in this draft)

| Topic | Decision |
|-------|----------|
| Magnet target | Whole row (vertical centre), not left/right pane. |
| History | Audit popover sits in source header center; undo/redo stay on target end. |
| Styles | Per translation column (target header), not page sticky. |
| Animation | Simple CSS transition, not physics. |
