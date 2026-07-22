# Task 5 report — Collection UI + job E/C + editor

## Implemented

- Added `jobGlossaryIo` with sync-if-empty, TBX export, and clone-to-owned-base helpers.
- Added test coverage for helper export, empty export, and clone retag/dirty behavior.
- Added glossary collection create/import/delete UI and job attachments with R/W/E/C, gated TBX export, and clone picker.
- Updated editor glossary reads to use readable attached bases, and new terms to fan out to writable bases.
- Added English/Russian strings and marked Plan C2 complete.

## Verification

- `git diff --check` passes.
- The new Vitest test first failed as expected before the helper existed.
- Rerunning Vitest and `npm run build` were blocked by the local Windows Node/esbuild environment (`spawn EPERM`, then `Could not determine Node.js install directory`).

## Notes

- Existing unrelated modification: `.superpowers/sdd/task-4-report.md` was preserved.

## Review fixes

- Enforced writable-base ACLs for glossary create, edit, status, delete, and TBX import; imports now fan out new UUID-tagged copies to every writable base.
- Scoped panel TBX export to job-exportable bases, or locally owned bases outside a job, and passed all glossary access sets from the editor.
- Refreshing job glossary attachments now reloads glossary hits to remove entries from detached/unreadable bases.

## Review verification

- `npm test` — 61 files / 262 tests passed.
- `npm run build` remains blocked by the local Windows Node/esbuild process terminating with exit code `-4048` before diagnostics.
