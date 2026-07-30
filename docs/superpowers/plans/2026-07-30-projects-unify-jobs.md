# Unify projects (former jobs) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** One UI/API entity «проект» (former job/shared work); remove the local-only projects list; move package backup/lock to `/api/backups`; keep personal bilingual + TM/glossary sync only (no co-edit).

**Architecture:** Breaking rename. Goose `026` renames `jobs*` → `projects*` tables/columns. Go: move `internal/projects` (backup/lock) → `internal/backups`; rename `internal/jobs` → `internal/projects` (collab). Client: collab API under `/api/projects`, backups under `/api/backups`; UI is former job hub list only. Local IndexedDB bilingual stays; `meta.jobId` → `meta.projectId`.

**Tech Stack:** Vue 3 + TS + IndexedDB; Go + chi + Postgres + goose; Vitest + `go test`.

**Spec:** [`docs/superpowers/specs/2026-07-30-projects-unify-jobs-design.md`](../specs/2026-07-30-projects-unify-jobs-design.md)

## Global Constraints

- No shared segment-grid co-edit / presence / auto-apply of colleague targets
- Sync only TM + glossaries per attachment ACL; suggestions ≥100% are pickable, not auto-inserted
- Data loss OK — no migrate old jobs / unbound local projects
- Old `/api/jobs` and `/api/projects/{id}/backup|lock` must 404 after cutover
- Never show email in roster/TM attribution
- Quota semantics unchanged (backups + owned originals; 507 on over-quota write)
- UI language: «проект», not «общая работа»

## File map (target)

| Area | Action |
|------|--------|
| `api/migrations/026_rename_jobs_to_projects.sql` | Create — RENAME tables/columns |
| `api/internal/backups/` | Create — moved from `api/internal/projects/` (backup/lock/purge) |
| `api/internal/projects/` | Replace — former `api/internal/jobs/` collab domain |
| `api/internal/httpapi/router.go` | Remount routes |
| `api/cmd` / wire-up (`main` or similar) | Update imports/constructors |
| `src/backups/api.ts` | Create — former `src/projects/api.ts` backup/lock client |
| `src/projects/` (collab client) | Former `src/jobs/` HTTP + helpers; paths `/api/projects` |
| `src/types/job.ts` → `cloudProject.ts` or fold into types | `Job` → keep distinct from local `ProjectRecord` as `CloudProject` (or `TeamProject`) to avoid clash |
| `src/pages/ProjectsPage.vue` | Single list = cloud projects; remove local list block |
| `src/pages/EditorPage.vue` | Remove promote-to-shared; open via hub |
| `src/router/index.ts` | `/project-invite/:token` |
| `src/i18n/locales/{ru,en}.ts` | Rename copy |
| Components `Job*` / `SharedWork*` | Rename labels/flows; file renames optional if time-boxed |

**Naming note:** Local bilingual types stay `ProjectRecord` / `ProjectMeta`. Cloud card type = `CloudProject` (JSON field names can stay camelCase `projectId`). UI string = проект.

---

### Task 1: DB migration rename jobs → projects

**Files:**
- Create: `api/migrations/026_rename_jobs_to_projects.sql`
- Modify: any raw SQL in `api/internal/auth/license.go` (quota join on originals), `api/internal/tm/access.go`, `api/internal/glossary/*` that reference `job_*` — can wait for Task 2–3 if those packages still say `job_` until store rewrite; **prefer updating SQL strings in the same PR as package move**.

**Produces:** Tables `projects`, `project_members`, `project_invites`, `project_tm_units`, `project_resource_presets`, `project_member_resource_overrides`, `project_tm_attachments`, `project_glossary_attachments` (if exists), `project_originals`; FKs/indexes renamed; columns `job_id` → `project_id`.

- [ ] **Step 1: Inventory tables**

```bash
rg -n "CREATE TABLE job" api/migrations
```

Expected: `jobs`, `job_members`, `job_invites`, `job_tm_units`, `job_resource_presets`, `job_member_resource_overrides`, `job_tm_attachments`, plus `job_originals`, `job_glossary_attachments` from later migrations.

- [ ] **Step 2: Write goose Up that RENAME TABLEs and columns** (no data copy). Pattern:

```sql
-- +goose Up
ALTER TABLE jobs RENAME TO projects;
ALTER TABLE job_members RENAME TO project_members;
ALTER TABLE project_members RENAME COLUMN job_id TO project_id;
-- … same for invites, originals, attachments, presets, overrides, tm_units
-- Rename indexes if Postgres kept old names (ALTER INDEX … RENAME)
```

Down: reverse renames.

- [ ] **Step 3: Apply on local/dev Postgres** (or CI test DB) and confirm `\dt` shows `projects*` not `jobs*`.

- [ ] **Step 4: Commit**

```bash
git add api/migrations/026_rename_jobs_to_projects.sql
git commit -m "Migrate: rename jobs tables to projects."
```

---

### Task 2: Move backup/lock package to `internal/backups` + `/api/backups`

**Files:**
- Move: `api/internal/projects/*.go` (current backup/lock) → `api/internal/backups/`
- Modify: `api/internal/httpapi/router.go` — mount `/api/backups/{projectID}/lock|backup`
- Modify: router tests, `api` main/wire
- Modify: client `src/projects/api.ts` → `src/backups/api.ts` (or update paths in place then move)
- Update call sites: `src/projects/backup.ts`, Settings storage UI, Editor backup, etc.

**Produces:** `backups.Handler` with same methods; routes under `/api/backups/{projectID}`; old `/api/projects/{id}/backup|lock` gone.

- [ ] **Step 1: Update Go tests for path group / router auth matrix** to expect `/api/backups/...` instead of `/api/projects/.../backup`.

- [ ] **Step 2: Move package, fix import paths, remount router.**

- [ ] **Step 3: Point frontend backup client at `/api/backups/${id}/...`.**

- [ ] **Step 4: `go test ./internal/backups/... ./internal/httpapi/...` and client typecheck.**

- [ ] **Step 5: Commit**

```bash
git commit -m "Move project backups/locks to /api/backups."
```

---

### Task 3: Collab domain `internal/jobs` → `internal/projects` + `/api/projects`

**Files:**
- Move: `api/internal/jobs/` → `api/internal/projects/` (collab)
- Update all SQL `jobs`/`job_*` → `projects`/`project_*`
- JSON: prefer `projectId` in new responses where `jobId` was; update client together
- Router: mount former job routes at `/api/projects` and `/api/projects/{id}/...`
- Fix `auth` quota SQL joining originals via `projects`
- Fix `tm`/`glossary` access joins
- Metrics path group tests: `/api/projects/*/members`

**Produces:** Collab API at `/api/projects`; `/api/jobs` 404.

- [ ] **Step 1: Move package + rewrite store SQL for new table names.**

- [ ] **Step 2: Remount all former job routes under `/api/projects` (Create/List/Get/…/attachments).** Ensure no conflict with `/api/backups`.

- [ ] **Step 3: `go test ./...` from `api/`.**

- [ ] **Step 4: Commit**

```bash
git commit -m "Rename collab jobs API to /api/projects."
```

---

### Task 4: Frontend collab client rename + `meta.projectId`

**Files:**
- Rename/move `src/jobs/*` → `src/cloudProjects/*` or `src/collab/*` (pick one; recommend `src/cloudProjects`)
- `src/types/job.ts` → `src/types/cloudProject.ts` (`CloudProject`, etc.)
- `ProjectMeta.jobId` → `projectId` in `src/types/project.ts` + all references
- Update imports across `src/`, `tests/`
- API base paths `/api/projects`

**Produces:** Client talks only to `/api/projects` and `/api/backups`; no `jobId` in meta.

- [ ] **Step 1: Introduce types + API module with new paths; update call sites (can leave thin re-exports briefly).**

- [ ] **Step 2: Replace `meta.jobId` → `meta.projectId` everywhere.**

- [ ] **Step 3: `npx vitest run` relevant suites; `npm run typecheck` if present.**

- [ ] **Step 4: Commit**

```bash
git commit -m "Point client collab API at /api/projects; meta.projectId."
```

---

### Task 5: UI — single projects list, hub-first create, drop local list

**Files:**
- `src/pages/ProjectsPage.vue` — remove local projects section + DOCX→local-only list flow; keep cloud list + hub; create opens former CreateSharedWork flow renamed
- `src/components/CreateSharedWorkDialog.vue` — retitle to create project; always create cloud project
- `src/pages/EditorPage.vue` — remove «Сделать общей» / SharedWork promote entry
- `src/router/index.ts` — `project-invite`; redirect old `job-invite` optional
- `src/i18n/locales/ru.ts`, `en.ts` — «Проекты», hub copy; remove «Общие работы» as primary
- Rename user-visible strings in JobHubInline / SharedWorkPanel (component file rename optional)

**Produces:** `/projects` = one list; create → hub with you only; no second list.

- [ ] **Step 1: Strip local list UI from ProjectsPage; wire create → cloud project → open hub.**

- [ ] **Step 2: Editor: remove promote CTA; keep hub panel entry only when `meta.projectId` set.**

- [ ] **Step 3: Invite route + i18n.**

- [ ] **Step 4: Manual smoke or component tests if any; commit**

```bash
git commit -m "Unify /projects UI to cloud project hubs only."
```

---

### Task 6: Verification + docs touch

**Files:**
- Update `PLAN.md` one-liner if it still says dual list / deferred jobs naming
- Spec status already Approved; optionally mark «Implementing» → «Implemented» when done

- [ ] **Step 1: Grep guards**

```bash
rg -n "/api/jobs" api src --glob "!**/node_modules/**" --glob "!**/docs/**"
rg -n "jobId|Общие работы|sharedWorksTitle|CreateSharedWork" src --glob "!**/node_modules/**"
rg -n "/api/projects/.*/backup" src api --glob "!**/docs/**"
```

Expected: no live `/api/jobs` in app code; backup only under `/api/backups`; UI not advertising dual list.

- [ ] **Step 2: `go test ./...` (api) + `npx vitest run`**

- [ ] **Step 3: Commit any leftovers**

```bash
git commit -m "Finish projects unify: verify and doc pointers."
```

---

## Spec coverage check

| Spec item | Task |
|-----------|------|
| Single list / hub-first / no local list | 5 |
| Create → cloud + local bind → hub | 5 |
| `/api/projects` collab | 3–4 |
| `/api/backups` | 2 |
| Table rename | 1 |
| `projectId` / i18n | 4–5 |
| No co-edit / no auto-apply | unchanged behavior; constraint |
| Old routes 404 | 2–3 |
| Quota unchanged | 2–3 (SQL join fix) |

## Execution

User requested immediate implementation (`делай`). Use **subagent-driven-development**: one implementer per task, review between tasks, no pauses for “continue?”.
