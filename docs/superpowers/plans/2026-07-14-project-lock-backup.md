# Project Lock + Backup Implementation Plan

> **For agentic workers:** Implement task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Cloud hard lock + single `.tcat.zip` backup per project (auto + manual + restore).

**Architecture:** JWT-scoped Postgres locks + filesystem backups; client combines tab-lease with cloud lock; pack/unpack reuse.

**Tech Stack:** Go/chi/pgx, Vue, existing `projectLease` / `projectFile`.

**Spec:** `docs/superpowers/specs/2026-07-14-project-lock-backup-design.md`

---

### Task 1: Migration + lock API
- [ ] `005_project_locks_backups.sql`
- [ ] `api/internal/projects` lock store/handlers + integration tests
- [ ] Router CORS PUT/DELETE/HEAD; wire main
- [ ] Commit

### Task 2: Client cloud lock
- [ ] API helpers + composable merge with tab lease
- [ ] EditorPage blocked if either fails
- [ ] Commit

### Task 3: Backup API + client
- [ ] File store PUT/GET; config `BACKUP_DIR`
- [ ] Auto debounce + manual button + restore on ProjectsPage
- [ ] i18n; PLAN checkboxes
- [ ] Verify tests; commit
