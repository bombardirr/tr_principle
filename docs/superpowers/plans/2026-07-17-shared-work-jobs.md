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

## Legacy F2.0 code (read before coding)

Present in repo (do **not** build F2.1 on it):

| Keep / adapt | Freeze / stop using for product |
|--------------|----------------------------------|
| F1 `ShareProjectDialog` | `POST/GET …/sync` bilingual snapshot as “collab truth” |
| Invite token hash pattern | `shared_project_locks` as UX for co-edit |
| TM attach ACL ideas (`can_read/write/export/clone`) | Presence-as-who-edits-segment |
| `cloudShared` flag → migrate meaning to `jobId` | Forcing all members onto one segment store |

**Task 0** makes freeze explicit so agents do not wire new UI to co-edit sync.

## File map

| Create | Role |
|--------|------|
| `api/migrations/011_jobs.sql` | `jobs`, `job_members`, `job_invites`, resource preset/override tables |
| `api/internal/jobs/*` | store, invites, handlers, fingerprint helpers |
| `api/migrations/012_job_tm.sql` | job-scoped TM units (or rename/adapt `project_tm_*` → job in a follow-up migration) |
| `src/types/job.ts` | Job, member, invite, resource types |
| `src/jobs/api.ts` | HTTP client |
| `src/jobs/fingerprint.ts` | filename + hash of docx bytes |
| `src/components/SharedWorkPanel.vue` | members, invites, progress, resources |
| `src/components/CreateSharedWorkDialog.vue` | «Сделать общей работой» |
| `src/pages/JobInviteAcceptPage.vue` | accept invite / join |
| `tests/jobs/*.test.ts` | fingerprint warn, progress aggregation helpers |

| Modify | Role |
|--------|------|
| `api/internal/httpapi/router.go` | mount `/api/jobs…`; leave old collab routes mounted but unused by new UI |
| `src/types/project.ts` | `meta.jobId`, fingerprint fields |
| `src/pages/EditorPage.vue` / `ProjectsPage.vue` | create job, panel, join |
| `src/i18n/locales/{ru,en}.ts` | copy |
| `PLAN.md` | J1–J4 checkboxes |

---

## Part 0 — Freeze co-edit product path

### Task 0: Document freeze + stop new UI on co-edit sync

**Files:**
- Create: `docs/superpowers/notes/2026-07-17-f20-coedit-freeze.md` (short)
- Modify: `PLAN.md` already points at jobs — ensure Editor/Projects do not advertise co-edit lock as the collab model in user-facing copy if any new strings say “shared editing”

- [ ] **Step 1: Write freeze note** listing routes/tables that are legacy (`/api/projects` collab sync/lock/presence, `projects`/`project_sync_state` as co-edit). State: new feature work uses `/api/jobs` only.

- [ ] **Step 2: Commit**

```bash
git add docs/superpowers/notes/2026-07-17-f20-coedit-freeze.md
git commit -m "Note freeze of co-edit F2.0 paths in favor of jobs model."
```

---

## Part J1 — Job + handoff

### Task 1: Migration `011_jobs.sql`

**Files:**
- Create: `api/migrations/011_jobs.sql`

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

- [ ] **Step 1: Add migration file** (goose style like `008_shared_projects.sql`)
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
- Create: `api/migrations/012_job_tm.sql` (`job_tm_units`, `job_resource_presets`, `job_member_resource_overrides`)
- Create: `api/internal/jobs/tm.go`, handlers for sync + preset/override
- Prefer **new job_*** tables** over overloading `project_tm_*` (clearer semantics). Optionally leave old tables frozen.

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

- [ ] **Step 1: Owner UI transfer**
- [ ] **Step 2: Tick PLAN J1–J4; note manual smoke**
- [ ] **Step 3: Commit** `Complete shared-work J4 transfer and PLAN status.`

---

## Spec coverage checklist

| Spec item | Task |
|-----------|------|
| Freeze co-edit north star | Task 0 |
| jobs / members / invites | Tasks 1–3 |
| Create shared work + clone/import join + fingerprint warn | Tasks 4–5 |
| Resource preset + overrides + live TM | Tasks 6–7 |
| Per-member progress + part_done + viewer | Task 8 |
| Soft confirm warning | Task 9 |
| Transfer owner | Tasks 3 + 10 |
| No email / privacy copy on Write | Tasks 3, 7 |
| No shared bilingual sync | Task 0 + all tasks avoid it |
| XLIFF / E2E / zones | out of plan |

## Execution note

Prefer executing **Part 0 + J1 (Tasks 0–5)** first as a shippable slice; then J2→J4. Do not start F2.1 segment locks.
