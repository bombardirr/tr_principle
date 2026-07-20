# Final review fix: refresh editor TM state

## Status

Fixed the stale in-memory Personal TM state in open editors. Successful Personal TM deletion
now dispatches `tm-collection-changed`; each mounted editor reloads persisted project metadata,
clears inaccessible TM units and pending autosave IDs, or reloads accessible TM units.

## Verification

- `npx vitest run tests/tm tests/components/JobMemoriesPanel.test.ts`
  — 13 files passed, 71 tests passed.
- `npx vue-tsc --noEmit` — passed (exit 0).
- IDE diagnostics for changed files — no errors.

## Manual check

Not run. Open a project with Personal TM attached, delete Personal TM from the collection dialog,
then verify the still-open editor immediately shows no matches and cannot write to Personal TM.
