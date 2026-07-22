# Task 4 Report — Client cloud sync + promote + session

## Status

Implemented per-base glossary cloud sync, job-attachment promotion, and owned-base session bootstrap.

## Delivered

- Added glossary base catalog and per-base sync API clients.
- Added base/job-scoped cursor and dirty keys, plus `syncGlossaryBase`.
- Added attachment promotion: ensure local base, create/update cloud base, push terms, then POST the job attachment.
- Bootstrapping now creates the personal glossary base and syncs every owned base.
- Added cursor-isolation and promotion-order tests.

## Tests

- `npm test -- tests/glossary/sync.test.ts --pool=threads` passed once: 2 tests passed.
- A repeat run and `npm run build` terminated with Windows process exit `0xC0000005` before test/build output. IDE diagnostics and `git diff --check` are clean.

## Commit

Pending the requested Task 4 commit.
