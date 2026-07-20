# Shared Work (Jobs) Implementation Plan — J1→J4

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship “общая работа” (job): personal bilingual copies per translator, cloud job card for members/invites, live shared TM with presets/overrides, per-person progress for PM, and a soft confirm warning — without co-editing one segment grid.

**Architecture:** New `jobs` domain owns membership and resource presets. Each member’s segments stay in local IndexedDB (`meta.jobId`). Shared TM syncs as a job-scoped resource. Prior F2.0 co-edit (shared bilingual sync + project/segment locks) is frozen and not extended; reusable pieces (invite hashing, TM ACL patterns, Share dialog) are adapted.

**Tech Stack:** Vue 3 + TypeScript + IndexedDB; Go + chi + Postgres + goose; Vitest + Go tests.

**Spec:** [`docs/superpowers/specs/2026-07-17-shared-work-jobs-design.md`](../specs/2026-07-17-shared-work-jobs-design.md)

## Global Constraints

- Personal bilingual copies — **no** shared segment sync / co-edit locks
- Roles on job: `owner` | `translator` | `viewer` only
- Invite by **link** only (no SMTP)
- Never put **email** in job roster, TM attribution, or progress UI — nick / `anon:{userId}`
- Fingerprint mismatch on join → **warn**, do not hard-block
- No aggregate document % under verbal split — per-member progress + `part_done`
- Enabling Write on shared resource requires short privacy copy in UI
- E2E encryption out of scope
- **No auto `job_tm`** — live bases come from **attach** of selected DBs (J2 redo); built-in ephemeral job TM removed from product path
- **Job ≠ project** — join may create membership with `local_project_id = null`

## Locked product decisions (do not re-ask)

| Decision | Choice |
|----------|--------|
| `/projects` IA | **A** — two blocks: «Проекты» + «Общие работы»; click job → **job hub** |
| Join without local project | **1** — membership only → job hub; create/import/bind project later inside hub |
| Invite entry | Paste link in app chrome/header **and** `/job-invite/:token`; same accept flow |
| Invite / hub project actions | Create from DOCX, empty shell, or import `.tcat.zip`; then bind `local_project_id` |
| Boss (viewer) | Stats + final downloadable result only — **no** bilingual project required |
| Auto built-in `job_tm` | **Removed** from product; J2 = attach selected bases |

## Legacy F2.0 code (read before coding)

Co-edit F2.0 **removed** (Task 0 / `011_drop_coedit.sql`). Do not rebuild it.

| Keep / adapt | Do not revive |
|--------------|---------------|
| F1 `ShareProjectDialog` | Shared bilingual sync as “collab truth” |
| Invite token hash pattern | `shared_project_locks` / presence-as-editor |
| TM attach ACL ideas (`can_read/write/export/clone`) | Auto built-in ephemeral `job_tm` as default product path |
| `meta.jobId` | Forcing all members onto one segment store |

## File map

| Create | Role |
|--------|------|
| `api/migrations/011_drop_coedit.sql` | drop F2.0 co-edit tables (done) |
| `api/migrations/012_jobs.sql` | `jobs`, `job_members`, `job_invites`, resource preset/override tables |
| `api/internal/jobs/*` | store, invites, handlers, fingerprint helpers |
| `api/migrations/013_job_tm.sql` | job-scoped TM units |
| `src/types/job.ts` | Job, member, invite, resource types |
| `src/jobs/api.ts` | HTTP client |
| `src/jobs/fingerprint.ts` | filename + hash of docx bytes |
| `src/components/SharedWorkPanel.vue` | members, invites, progress, resources |
| `src/components/CreateSharedWorkDialog.vue` | «Сделать общей работой» |
| `src/pages/JobInviteAcceptPage.vue` | accept invite / join |
| `tests/jobs/*.test.ts` | fingerprint warn, progress aggregation helpers |

| Modify | Role |
|--------|------|
| `api/internal/httpapi/router.go` | mount `/api/jobs…` (solo lock/backup already restored) |
| `src/types/project.ts` | `meta.jobId`, fingerprint fields |
| `src/pages/EditorPage.vue` / `ProjectsPage.vue` | create job, panel, join |
| `src/i18n/locales/{ru,en}.ts` | copy |
| `PLAN.md` | J1–J4 checkboxes |

---

## Part 0 — Remove co-edit product path

### Task 0: Delete F2.0 co-edit (done)

Co-edit code and tables removed; see `docs/superpowers/notes/2026-07-17-f20-coedit-removed.md`.

- [x] **Step 1:** Remove `api/internal/collab`, client co-edit UI/API, restore solo lock/backup routes
- [x] **Step 2:** Migration `011_drop_coedit.sql`
- [x] **Step 3: Commit** cleanup when ready

---

## Part J1 — Job + handoff

### Task 1: Migration `012_jobs.sql`

**Files:**
- Create: `api/migrations/012_jobs.sql`

```sql
-- +goose Up
CREATE TABLE jobs (
  id UUID PRIMARY KEY,
  owner_user_id UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  source_lang TEXT,
  target_lang TEXT,
  source_filename TEXT,
  source_hash TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE job_members (
  job_id UUID NOT NULL REFERENCES jobs (id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('owner', 'translator', 'viewer')),
  local_project_id UUID,
  part_done BOOLEAN NOT NULL DEFAULT false,
  progress_done INT NOT NULL DEFAULT 0,
  progress_total INT NOT NULL DEFAULT 0,
  last_active_at TIMESTAMPTZ,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (job_id, user_id)
);

CREATE TABLE job_invites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID NOT NULL REFERENCES jobs (id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  role TEXT NOT NULL CHECK (role IN ('translator', 'viewer')),
  created_by UUID NOT NULL REFERENCES users (id),
  expires_at TIMESTAMPTZ,
  max_uses INT,
  uses_count INT NOT NULL DEFAULT 0,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX job_members_user ON job_members (user_id);
CREATE INDEX job_invites_job ON job_invites (job_id);

-- +goose Down
DROP TABLE IF EXISTS job_invites;
DROP TABLE IF EXISTS job_members;
DROP TABLE IF EXISTS jobs;
```

- [x] **Step 1: Add migration file** (goose style like `008_shared_projects.sql`)
- [ ] **Step 2: Commit** `Add jobs, members, and invite tables.`

### Task 2: Go jobs store — create, invite, accept, fingerprint fields

**Files:**
- Create: `api/internal/jobs/types.go`, `store.go`, `invites.go`, `acl.go`
- Test: `api/internal/jobs/invites_test.go`

**Interfaces:**
- `CreateJob(ctx, ownerID, jobID, title, langs, filename, hash, localProjectID) (Job, error)` — inserts job + owner member
- `CreateInvite(...) (rawToken, Invite, error)` — sha256 hex hash; raw token once
- `AcceptInvite(ctx, rawToken, userID, localProjectID *uuid.UUID) (jobID, role, error)`
- `RoleOf`, `IsOwner`

Reuse invite validation rules from collab (revoked/expired/max_uses).

- [ ] **Step 1: Failing test** — invite max_uses=1 burns (skip without `DATABASE_URL`)
- [ ] **Step 2: Implement store**
- [ ] **Step 3: `go test ./internal/jobs/...` from `api/`**
- [ ] **Step 4: Commit** `Add jobs store with create and invite accept.`

### Task 3: HTTP `/api/jobs` + accept

**Files:**
- Create: `api/internal/jobs/handlers.go`
- Modify: `router.go`, `main.go`, test `NewRouter` call sites

**Routes (no trailing-slash traps — register full paths):**

```
POST   /api/jobs
GET    /api/jobs
GET    /api/jobs/{id}
PATCH  /api/jobs/{id}
POST   /api/jobs/{id}/transfer   { userId }
GET    /api/jobs/{id}/members
PATCH  /api/jobs/{id}/members/me  { partDone?, progressDone?, progressTotal?, localProjectId? }
DELETE /api/jobs/{id}/members/{userId}
POST   /api/jobs/{id}/invites
GET    /api/jobs/{id}/invites
POST   /api/jobs/{id}/invites/{inviteId}/revoke
POST   /api/job-invites/accept   { token, localProjectId? }
```

Member JSON: `userId`, `displayName`, `role`, `partDone`, `progressDone`, `progressTotal`, `lastActiveAt` — **no email**.

- [ ] **Step 1: Integration test create → invite → accept → list members**
- [ ] **Step 2: Handlers + router smoke (401 not 404 on `/api/jobs`)**
- [ ] **Step 3: Commit** `Expose jobs and invite HTTP APIs.`

### Task 4: Client fingerprint + types + API

**Files:**
- Create: `src/types/job.ts`, `src/jobs/api.ts`, `src/jobs/fingerprint.ts`
- Modify: `src/types/project.ts` — add `jobId?: string`, `sourceFilename?: string`, `sourceHash?: string`
- Test: `tests/jobs/fingerprint.test.ts`

```ts
export async function fingerprintDocx(filename: string, docx: ArrayBuffer): Promise<{ filename: string; hash: string }>
// hash = hex sha-256 of bytes; filename = basename only
```

```ts
export function fingerprintMismatch(
  job: { sourceFilename?: string | null; sourceHash?: string | null },
  local: { filename: string; hash: string },
): boolean
// true if job has hash and hashes differ OR (no hash but filenames differ case-insensitively)
```

- [ ] **Step 1: Vitest for mismatch true/false cases**
- [ ] **Step 2: Implement fingerprint + job API wrappers**
- [ ] **Step 3: Commit** `Add job client types and DOCX fingerprint helper.`

### Task 5: Create shared work + invite accept/join UI

**Files:**
- Create: `CreateSharedWorkDialog.vue`, `JobInviteAcceptPage.vue`, `SharedWorkPanel.vue` (members/invites only in J1)
- Modify: `router/index.ts` (`/job-invite/:token`), `EditorPage.vue`, `ProjectsPage.vue`, i18n
- Keep F1 Share dialog for raw zip; add «Сделать общей работой» / «Пригласить в общую работу»

**Create flow:** compute fingerprint → `POST /api/jobs` with same id as local project id **or** new job id + store `meta.jobId` → save project.

**Accept flow:** accept API → if no local project, create empty shell or wait for import; if import-then-join, call accept with `localProjectId` after import; show warn modal if `fingerprintMismatch`.

**Clone (minimal J1):** owner action “Создать ссылку для переводчика”; recipient accept creates membership; payload for full bilingual clone can be: download `.tcat` via existing pack from owner machine is offline — for in-app clone MVP, accept may instruct «импортируйте файл» **or** owner uploads one-shot package blob.  

**Locked decision for J1 clone:**  
1) Invite link makes membership.  
2) Recipient imports `.tcat.zip` (Share dialog) then «Привязать к работе» with token **or** accept page offers file picker then join.  
3) True server-side bilingual clone blob is **J1.1 optional** — not required if import+join works.

- [ ] **Step 1: Wire create job dialog + persist `meta.jobId`**
- [ ] **Step 2: Invite accept page + import+join with fingerprint warn**
- [ ] **Step 3: SharedWorkPanel roster + create/revoke invite + copy link**
- [ ] **Step 4: i18n ru/en + vitest/build**
- [ ] **Step 5: Commit** `Add shared-work create, invite join, and members panel.`

---

## Part J2 — Live shared TM

### Task 6: Job TM tables + sync API

**Files:**
- Create: `api/migrations/013_job_tm.sql` (`job_tm_units`, `job_resource_presets`, `job_member_resource_overrides`)
- Create: `api/internal/jobs/tm.go`, handlers for sync + preset/override
- Prefer **new job_*** tables** over overloading old project TM (removed).

Preset row: `kind='job_tm'` (built-in job memory) + later personal attaches.  
Defaults on job create: insert job TM attachment preset `can_read=true`, `can_write=true` for translators; export/clone owner-only defaults in override logic.

- [ ] **Step 1: Migration**
- [ ] **Step 2: Pull/Push job TM; gate read/write; strip email attribution (reuse `projectTmActor` pattern)**
- [ ] **Step 3: Tests can_read / write / no email**
- [ ] **Step 4: Commit** `Add job-scoped TM sync and resource presets.`

### Task 7: Client match/write + resource UI

**Files:**
- Modify: EditorPage TM match merge; confirm/autosave write to job TM when override Write
- Modify: `SharedWorkPanel` / new `JobResourcesPanel.vue` — preset (owner) + personal overrides; privacy note on Write
- i18n

- [ ] **Step 1: Pull job TM when `meta.jobId` set; merge into `findTmMatches`**
- [ ] **Step 2: On TM save paths, also upsert job TM if Write enabled**
- [ ] **Step 3: UI toggles + privacy sentence**
- [ ] **Step 4: Commit** `Wire job TM into editor match and save.`

---

## Part J3 — Progress for PM

### Task 8: Report progress + viewer card

**Files:**
- Modify: jobs `PATCH …/members/me` already in Task 3 — call from EditorPage on save / interval
- Modify: `SharedWorkPanel` progress columns; Projects list badge for jobs where role=viewer
- Helper: `computeProgress(segments) => { done, total, wordsDone, wordsTotal }` — words optional in J3 (segments first)

- [ ] **Step 1: Unit test computeProgress**
- [ ] **Step 2: Push progress + partDone toggle**
- [ ] **Step 3: Viewer can open job card without editor write access**
- [ ] **Step 4: Commit** `Report per-member job progress for PM viewers.`

---

## Part J4 — Soft warning + transfer

### Task 9: Confirm soft warning

**Files:**
- Modify: confirm/finalize path in EditorPage / ParagraphBlock
- Helper: `shouldWarnSharedExact(jobTmHits, currentActor): boolean`

Rule: exact/context hit from job TM where `createdBy/updatedBy` ≠ current actor label/`anon:id`.

- [ ] **Step 1: Unit test shouldWarnSharedExact**
- [ ] **Step 2: Modal — continue / cancel; continue still confirms**
- [ ] **Step 3: Commit** `Warn before confirm when shared TM already has exact hit.`

### Task 10: Transfer owner + PLAN

**Files:**
- API already has transfer in Task 3 — finish UI if missing
- Modify: `PLAN.md` checkboxes J1–J4
- Commit plan link

- [x] **Step 1: Owner UI transfer**
- [x] **Step 2: Tick PLAN J1–J4; note manual smoke**
- [x] **Step 3: Commit** `Complete shared-work J4 transfer and PLAN status.`

---

## Part J5 — Job hub IA + deferred TM save + finalize (next)

> Tasks 0–10 landed a first slice; auto `job_tm` product path was **removed**. Execute J5 next.

### Locked IA (variant A)

`/projects` shows **two blocks**:

1. **Проекты** — personal bilingual copies (as today), optional badge if `meta.jobId` set.
2. **Общие работы** — job cards for every membership (owner / translator / viewer). Click → **job hub** (not straight into editor).

**Job hub** (page or full panel): members, invites, progress, «создать/открыть/привязать мой проект», later resources, later finalize/result for boss.

### Locked join (variant 1)

- `POST /api/job-invites/accept` with **optional** `localProjectId`.
- Join **without** local project = membership only → land on **job hub**.
- Create / import / bind project **later** from hub or invite UI.
- Fingerprint warn only when binding a local project that has docx fingerprint.

### Task 11: Paste invite link in chrome + join without project

**Files:**
- Modify: app header / `ProjectsPage` chrome — paste/open invite URL or raw token → route to accept flow
- Modify: `JobInviteAcceptPage.vue` — primary CTA «Вступить в работу» **without** requiring local project; then show hub actions
- Modify: accept API client — `localProjectId` optional (already on server)

- [ ] **Step 1: Header control** «Вставить ссылку-приглашение» → parse `/job-invite/:token` or bare token → navigate
- [ ] **Step 2: Accept without project** → membership → redirect to job hub (`/jobs/:id` or hub panel)
- [ ] **Step 3: Vitest/router smoke + Commit** `Allow job join without local project; paste invite in chrome.`

### Task 12: `/projects` IA variant A + job hub

**Files:**
- Create: `src/pages/JobHubPage.vue` (or expand `SharedWorkPanel` to route `/jobs/:id`)
- Modify: `ProjectsPage.vue` — two blocks «Проекты» | «Общие работы»
- Modify: router; i18n

**Job hub actions (translator/owner):** open my linked project if any; **создать проект** (DOCX / empty shell); import `.tcat.zip` then bind; invites/members/progress; viewer: stats only + later result download.

- [ ] **Step 1: Route `/jobs/:id` hub**
- [ ] **Step 2: ProjectsPage two-block IA**
- [ ] **Step 3: Create/import/bind project from hub** (empty shell allowed)
- [ ] **Step 4: Commit** `Add job hub and split Projects / Shared works lists.`

### Task 13: Deferred TM write stack (delay before writable bases)

After attach-bases exists (Task 14+), TM writes that target **writable shared bases** go through a **pending stack**, not immediately.

**Behavior:**
- On project create + project settings: configurable delay (seconds) before the **top** pending TU is flushed to allowed writable bases.
- If user edits/cancels that pending item before timer fires — it does not flush.
- If user does nothing — top of stack flushes when timer expires; next item becomes top.
- UI: **send all** / **cancel all** / **send one** / **cancel one**.
- Manual save-to-TM still enters the same stack when destination includes shared writable bases; personal-only TM may write immediately (product default: personal immediate, shared via stack).

**Files:** `src/tm/pendingStack.ts` (or similar), EditorPage / project settings, vitest.

- [ ] **Step 1: Unit tests** stack order, delay flush, cancel one/all
- [ ] **Step 2: Settings** delay on create project + project settings
- [ ] **Step 3: Wire confirm/autosave** into stack for shared writable destinations
- [ ] **Step 4: Commit** `Add deferred TM write stack with per-item flush controls.`

### Task 14: Attach selected bases (replaces auto job_tm)

**Files:** reuse dormant `job_resource_*` / sync ideas; new attach UI; no auto ephemeral job TM.

> **Done (2026-07-20):** Model A — one `job_tm` pool per job via [`2026-07-20-job-tm-attach.md`](2026-07-20-job-tm-attach.md). Personal/cloud ref attach (Model B) remains future.

- [x] **Step 1: Attach personal / cloud TM refs to job** with preset + member overrides — *job_tm pool + preset/override (Model A)*
- [x] **Step 2: Editor match/write** only via attached bases + privacy copy on Write
- [x] **Step 3: Commit** `Attach selectable TM bases to shared work.`

### Task 15: Dual progress metrics + finalize for boss

**Progress (per member, from their linked project):**
- **TM coverage %** — segments with a usable TM hit / all segments
- **Translated %** — actually translated segments / all segments  
Normal that after verbal split + peer review clicks, one member can show ~100% translated and another ~50%.

**Finalize:**
- Finalizing translator marks **their project** complete → translated DOCX becomes available for **boss download** (upload result blob or generate on finalize).
- **Viewer/boss does not need a bilingual project** — only job stats + result download.

- [ ] **Step 1: Report both %** on `PATCH …/members/me` (+ UI columns)
- [ ] **Step 2: Finalize project** API + boss download entry on job hub
- [ ] **Step 3: Commit** `Add dual progress metrics and boss result finalize.`

### Task 11–12 (IA / join) — do next before attach

See Tasks 11–12 below (paste link, join without project, IA A, job hub). Soft-warn (old Task 9) re-enable only after attach-bases ships.

---

## Spec coverage checklist

| Spec item | Task |
|-----------|------|
| Remove co-edit | Task 0 |
| jobs / members / invites | Tasks 1–3 |
| Create shared work + import join + fingerprint warn | Tasks 4–5 |
| Auto job_tm product path | **Removed** (shelved; Task 14 attach replaces) |
| Per-member progress + part_done + viewer | Task 8 |
| Soft confirm warning | Task 9 (re-wire after Task 14) |
| Transfer owner | Tasks 3 + 10 |
| `/projects` IA A + join without project + paste link | Tasks 11–12 |
| Deferred TM write stack | Task 13 |
| Attach selected bases | Task 14 |
| Dual progress % + boss finalize/download | Task 15 |
| No email | all member/TM UI |
| No shared bilingual sync | Task 0 + all tasks avoid it |
| XLIFF / E2E / zones | out of plan |

## Execution note

**Next:** Task **13** deferred TM write stack, then soft-warn (Task 9 re-wire), then **15** dual progress + boss result. Model B (attach extra personal/cloud bases) after stack. Tasks **11–12** (IA / job hub) may proceed in parallel. Do not revive auto `job_tm`. Do not start F2.1 segment locks.
