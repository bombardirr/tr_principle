# Task 8 report: Project TM sync, attachments, export, and clone

## Delivered

- Added project TM sync routes. Cloud-shared editors now merge readable project and attached personal
  units into matching, and send confirmed/autosaved units to the writable project TM.
- Added attachment APIs and an owner-managed panel:
  - Members can attach their personal TM.
  - Owners alone can toggle read, write, export, and clone permissions.
  - Allowed attachments can be exported as TMX or cloned into the caller’s personal TM.
- Clone assigns fresh UUIDs and preserves the existing non-email attribution fields.

## Tests

- Added Go integration coverage for export denial (`403`) and clone UUID isolation/persistence.
- `DATABASE_URL=postgres://…@localhost:55432/appzac?sslmode=disable go test ./internal/collab -run 'TestProjectTm(Export|Clone)' -count=1 -v` — passed (2 tests).
- `go test ./...` — passed.
- `npm test` — passed: 35 files, 151 tests.
- `npm run build` — passed.
- IDE diagnostics — no errors in edited files.

## Concern

The normal Go suite runs database integration tests only when `DATABASE_URL` is set; the dedicated
Task 8 command above used the running local Postgres service so the two new tests executed rather
than being skipped.
