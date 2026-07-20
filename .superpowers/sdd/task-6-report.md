# Task 6 Report

## Status

Implemented `ProjectTmBasesDialog` and the project-list TM dialog stack.

## Changes

- Added an attached-only project TM dialog with:
  - normalized attached base cards;
  - personal TM unit statistics;
  - read/write permission toggles;
  - detach action;
  - empty state and collection-picker handoff.
- Added attached TM chips to `ProjectListItem`; clicking a chip detaches it and `+` opens the project bases dialog.
- Wired `TmCollectionDialog` pick/browse transitions, return-to-project behavior, attach/save, deletion refresh, and error forwarding.

## Verification

- `npx vue-tsc --noEmit` — passed.
- `npx vitest run tests/tm/projectAttachments.test.ts` — passed (7 tests).
- IDE lints for both changed components — clean.

## Concern

~~`cloneProjectRecord` in `src/storage/idb.ts` does not currently copy `meta.tmAttachments`. As a result, existing `saveProject` calls can discard attachment changes when cloning records for IndexedDB. This is outside the two-file Task 6 scope but should be corrected before relying on attachment persistence.~~

## Review fix: persist tmAttachments through clone/save

**Finding:** `cloneProjectRecord()` omitted `meta.tmAttachments`, so attach/detach/R/W changes were dropped on `saveProject()` / `getProject()`.

**Fix:** Copy `tmAttachments` in `cloneProjectRecord` (deep-clone each attachment entry alongside existing meta fields).

**Test:** Added `tests/storage/cloneProjectRecord.test.ts` — verifies `tmAttachments` round-trips through clone and stays undefined when absent.

```text
$ npm test -- tests/storage/cloneProjectRecord.test.ts
 ✓ tests/storage/cloneProjectRecord.test.ts (2 tests)
 Test Files  1 passed (1)
      Tests  2 passed (2)
```

**Commit:** `fix: persist tmAttachments through project clone/save`
