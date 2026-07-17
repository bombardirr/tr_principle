# Group Collaboration (F1 → F2.0 → F2.1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship file-based project handoff (F1), then cloud shared projects with invites, membership, sync, project lock, project TM + attach ACL (F2.0), then segment locks with presence avatars (F2.1).

**Architecture:** Cloud `projects` registry is source of truth for shared work; each member caches in IndexedDB. Invites are hashed link tokens (TTL / max uses / named / revoke). Write access uses project lock (F2.0) then per-segment lock (F2.1). TM matching unions attachments with `canRead`; writes/`export`/`clone` gated by orthogonal flags. Personal TM sync stays user-scoped and separate from `project_tm_units`.

**Tech Stack:** Vue 3 + TypeScript + IndexedDB (client); Go + chi + Postgres + goose (API); Vitest + Go tests.

**Spec:** [`docs/superpowers/specs/2026-07-17-group-collaboration-design.md`](../specs/2026-07-17-group-collaboration-design.md)

## Global Constraints

- Roles: `owner` | `editor` | `viewer` only
- Invite by **link** only (no SMTP)
- Never put **email** in audit, TM `createdBy`, presence, or member list UI — nick / `anon:{userId}` only
- Personal TM does **not** auto-attach to projects
- Owner alone edits TM attachment ACL in F2
- No OT/CRDT; sync + locks only
- F1 must ship and be usable without any F2 tables
- Prefer industry defaults: project TM Read+Write for editors; Export+Clone owner-only until changed

## File map

| Create | Role |
|--------|------|
| `api/migrations/008_shared_projects.sql` | `projects`, `project_members`, `project_invites`, evolve locks |
| `api/migrations/009_project_tm.sql` | `project_tm_units`, `project_tm_attachments` |
| `api/migrations/010_segment_locks.sql` | `project_segment_locks`, presence helper if needed |
| `api/internal/collab/…` | shared project domain: store, invites, members, sync, presence |
| `api/internal/projecttm/…` | project TM units + attach + export/clone handlers |
| `src/types/collab.ts` | roles, invite, member, presence, attachment types |
| `src/projects/collabApi.ts` | HTTP client for collab endpoints |
| `src/projects/collabSync.ts` | pull/push project segments+meta |
| `src/components/ShareProjectDialog.vue` | F1 share + import hint |
| `src/components/ProjectMembersPanel.vue` | members + invites UI |
| `src/components/ProjectTmAttachmentsPanel.vue` | attach ACL checkboxes |
| `src/pages/InviteAcceptPage.vue` | accept invite route |
| `tests/collab/*.test.ts` | client unit tests |
| `api/internal/collab/*_test.go` | invite/lock/ACL integration |

| Modify | Role |
|--------|------|
| `api/internal/httpapi/router.go` | mount collab routes |
| `api/cmd/server/main.go` | wire handlers |
| `api/internal/projects/*` | migrate lock PK from `(user_id,project_id)` → `project_id` for shared |
| `src/router/index.ts` | `/invite/:token` |
| `src/pages/EditorPage.vue` | share dialog, lock/presence, TM union |
| `src/pages/ProjectsPage.vue` | shared badge; import hint already exists |
| `src/i18n/locales/{ru,en}.ts` | copy |
| `src/tm/match.ts` + save paths | multi-attachment read/write |
| `PLAN.md` | checkboxes |

**DOCX decision (locked):** F2.0 sync API carries `meta` + `segments` (+ `docxRev` / hash). Full `original.docx` bytes use member-scoped **project blob** storage (evolve backup to `project_id` ownership, not `user_id`-only) uploaded by lock holder when docx changes. Members download blob when hash differs.

---

## Part A — F1 (file share polish)

### Task 1: Share dialog + i18n (preserve actors)

**Files:**
- Create: `src/components/ShareProjectDialog.vue`
- Modify: `src/pages/EditorPage.vue` (wire share; keep archive download or fold into dialog)
- Modify: `src/i18n/locales/ru.ts`, `src/i18n/locales/en.ts`
- Test: `tests/storage/projectFile.actors.test.ts`

**Interfaces:**
- Produces: dialog emits `download` → parent calls existing `packProjectFile`
- Consumes: `packProjectFile` from `@/storage/projectFile`

- [ ] **Step 1: Write failing test — audit `by` survives pack/unpack**

```ts
// tests/storage/projectFile.actors.test.ts
import { describe, expect, it } from 'vitest'
import { packProjectFile, unpackProjectFile } from '@/storage/projectFile'
import type { ProjectRecord } from '@/types/project'

describe('projectFile actors', () => {
  it('preserves segment audit by through zip round-trip', async () => {
    const record: ProjectRecord = {
      meta: {
        id: '11111111-1111-1111-1111-111111111111',
        name: 'P',
        sourceLang: 'en',
        targetLang: 'ru',
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
      segments: [
        {
          id: 's1',
          source: 'Hello',
          target: 'Привет',
          status: 'done',
          audit: [{ at: '2026-01-01T00:00:00.000Z', action: 'manual', by: 'anon:abc' }],
        },
      ],
      docx: new ArrayBuffer(8),
    }
    const blob = await packProjectFile(record)
    const again = await unpackProjectFile(await blob.arrayBuffer())
    expect(again.segments[0]!.audit?.[0]!.by).toBe('anon:abc')
  })
})
```

- [ ] **Step 2: Run test**

Run: `npx vitest run tests/storage/projectFile.actors.test.ts`  
Expected: PASS if pack already preserves audit (documents invariant). If FAIL, fix `cloneProjectRecord` / pack to deep-clone `audit`.

- [ ] **Step 3: Add i18n keys**

```ts
// en — under editor:
shareProject: 'Share project',
shareProjectHint: 'Download a .tcat.zip for a colleague to import',
shareImportHint:
  'Colleague: Projects → Import project file (.tcat.zip). Audit authors stay as nick / Incognito.',
shareDownload: 'Download .tcat.zip',
```

Mirror in `ru.ts`.

- [ ] **Step 4: Implement `ShareProjectDialog.vue`**

Minimal modal: title, `shareImportHint` paragraph, primary button Download, secondary Close. On Download emit `download`.

- [ ] **Step 5: Wire EditorPage**

Replace or supplement archive `IconButton` with Share that opens dialog; on download call existing `downloadProject()` / `packProjectFile`. Tooltip: `shareProjectHint`.

- [ ] **Step 6: Commit**

```bash
git add src/components/ShareProjectDialog.vue src/pages/EditorPage.vue src/i18n/locales/en.ts src/i18n/locales/ru.ts tests/storage/projectFile.actors.test.ts
git commit -m "Add F1 share dialog with import hint for .tcat.zip handoff."
```

---

## Part B — F2.0 foundation

### Task 2: Migration — projects, members, invites

**Files:**
- Create: `api/migrations/008_shared_projects.sql`
- Test: exercise via later Go tests (Task 4)

- [ ] **Step 1: Write migration**

```sql
-- +goose Up
CREATE TABLE projects (
  id UUID PRIMARY KEY,
  owner_user_id UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  source_lang TEXT,
  target_lang TEXT,
  meta JSONB NOT NULL DEFAULT '{}',
  docx_hash TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE project_members (
  project_id UUID NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('owner', 'editor', 'viewer')),
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (project_id, user_id)
);

CREATE TABLE project_invites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  role TEXT NOT NULL CHECK (role IN ('editor', 'viewer')),
  created_by UUID NOT NULL REFERENCES users (id),
  expires_at TIMESTAMPTZ,
  max_uses INT,
  uses_count INT NOT NULL DEFAULT 0,
  invited_user_id UUID REFERENCES users (id),
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX project_members_user ON project_members (user_id);
CREATE INDEX project_invites_project ON project_invites (project_id);

-- Shared lock: one row per project (migrate from per-user lock)
ALTER TABLE project_locks ADD COLUMN IF NOT EXISTS lock_user_id UUID REFERENCES users (id);
-- New table preferred if ALTER is messy:
CREATE TABLE IF NOT EXISTS shared_project_locks (
  project_id UUID PRIMARY KEY REFERENCES projects (id) ON DELETE CASCADE,
  holder_user_id UUID NOT NULL REFERENCES users (id),
  holder_id TEXT NOT NULL,
  token TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL
);

-- +goose Down
DROP TABLE IF EXISTS shared_project_locks;
DROP TABLE IF EXISTS project_invites;
DROP TABLE IF EXISTS project_members;
DROP TABLE IF EXISTS projects;
```

Keep legacy `project_locks` for solo backup-era clients until Editor uses `shared_project_locks` for cloud-shared projects only.

- [ ] **Step 2: Commit migration**

```bash
git add api/migrations/008_shared_projects.sql
git commit -m "Add shared projects, members, and invite tables."
```

### Task 3: Migration — project TM + attachments

**Files:**
- Create: `api/migrations/009_project_tm.sql`

- [ ] **Step 1: Write migration**

```sql
-- +goose Up
CREATE TABLE project_tm_units (
  id UUID PRIMARY KEY,
  project_id UUID NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
  source TEXT NOT NULL,
  target TEXT NOT NULL,
  source_key TEXT NOT NULL,
  source_lang TEXT,
  target_lang TEXT,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  deleted_at TIMESTAMPTZ,
  created_by TEXT,
  updated_by TEXT,
  context_before TEXT,
  context_after TEXT
);
CREATE INDEX project_tm_units_project_updated ON project_tm_units (project_id, updated_at);

CREATE TABLE project_tm_attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('project', 'user')),
  user_id UUID REFERENCES users (id), -- required when kind=user
  can_read BOOLEAN NOT NULL DEFAULT true,
  can_write BOOLEAN NOT NULL DEFAULT false,
  can_export BOOLEAN NOT NULL DEFAULT false,
  can_clone BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (project_id, kind, user_id)
);

-- +goose Down
DROP TABLE IF EXISTS project_tm_attachments;
DROP TABLE IF EXISTS project_tm_units;
```

- [ ] **Step 2: Commit**

```bash
git add api/migrations/009_project_tm.sql
git commit -m "Add project TM units and attachment ACL table."
```

### Task 4: Go collab store — create project, invite accept, ACL helpers

**Files:**
- Create: `api/internal/collab/types.go`, `store.go`, `invites.go`, `acl.go`
- Test: `api/internal/collab/invites_test.go`

**Interfaces:**
- Produces:
  - `CreateProject(ctx, ownerID, id, name, langs, meta) (Project, error)` — also inserts owner member + default project TM attachment (`can_read/write=true`, `can_export/clone=true` for attachment row; runtime still checks owner for export UX defaults)
  - `CreateInvite(ctx, projectID, createdBy, role, expiresAt, maxUses, invitedUserID) (rawToken string, Invite, error)` — sha256 hash stored
  - `AcceptInvite(ctx, rawToken, userID) (projectID, role, error)`
  - `RoleOf(ctx, projectID, userID) (role, error)`
  - `CanEdit(role) bool` — owner|editor

- [ ] **Step 1: Failing test — burning invite max_uses=1**

```go
func TestAcceptInviteBurnsAfterOneUse(t *testing.T) {
  // boot test DB like other integration tests; skip if no DATABASE_URL
  // CreateProject → CreateInvite maxUses=1 → Accept as userB OK → Accept as userC → error
}
```

- [ ] **Step 2: Implement store + invite hash**

Use `sha256.Sum256` of raw token; raw token = base64url 32 random bytes. Reject if `revoked_at != nil`, `expires_at < now`, `uses_count >= max_uses` (when max_uses set), or named mismatch.

- [ ] **Step 3: Tests pass + commit**

```bash
git add api/internal/collab
git commit -m "Add collab store with project create and invite accept rules."
```

### Task 5: HTTP — projects, members, invites

**Files:**
- Create: `api/internal/collab/handlers.go`
- Modify: `api/internal/httpapi/router.go`, `api/cmd/server/main.go`

**Routes:**

```
POST   /api/projects
GET    /api/projects
GET    /api/projects/{id}
PATCH  /api/projects/{id}
GET    /api/projects/{id}/members
DELETE /api/projects/{id}/members/{userId}
POST   /api/projects/{id}/invites
GET    /api/projects/{id}/invites
PATCH  /api/projects/{id}/invites/{inviteId}
POST   /api/projects/{id}/invites/{inviteId}/revoke
POST   /api/invites/accept   body: { "token": "..." }
```

Member list JSON **must not** include email — only `userId`, `displayName`, `role`.

- [ ] **Step 1: Integration test create → invite → accept → list members**
- [ ] **Step 2: Implement handlers + mount**
- [ ] **Step 3: Commit**

```bash
git commit -m "Expose shared project and invite HTTP APIs."
```

### Task 6: Project segment sync + shared lock + presence

**Files:**
- Create: `api/internal/collab/sync.go`, `lock.go`, `presence.go`
- Modify: client `src/projects/collabApi.ts`, `src/projects/collabSync.ts`, `src/composables/useProjectAccess.ts` / lease

**Sync payload:**

```ts
type ProjectSyncPull = {
  until: string
  meta: ProjectMeta
  segments: Segment[]
  docxHash?: string | null
}
```

`GET /api/projects/{id}/sync?since=`  
`POST /api/projects/{id}/sync` body: `{ meta?, segments: Segment[], docxHash? }` — **403** unless caller holds shared lock and role can edit.

Lock:

```
POST   /api/projects/{id}/lock    { holderId, token? }
DELETE /api/projects/{id}/lock
POST   /api/projects/{id}/presence  { holderId }
GET    /api/projects/{id}/presence
```

Presence entries: `{ userId, displayName, holderId, updatedAt }` — no email.

- [ ] **Step 1: Test — viewer cannot acquire lock; second editor gets 409**
- [ ] **Step 2: Implement server lock/presence/sync**
- [ ] **Step 3: Client: promote local project (POST /api/projects with same id), sync loop, use shared lock when `meta.cloudShared === true` (add flag on meta)**
- [ ] **Step 4: Commit**

```bash
git commit -m "Add shared project sync, lock, and presence heartbeats."
```

### Task 7: Client invite accept page + members/invites UI

**Files:**
- Create: `src/pages/InviteAcceptPage.vue`, `src/components/ProjectMembersPanel.vue`
- Modify: `src/router/index.ts`, `src/pages/EditorPage.vue` or settings dialog
- i18n

- [ ] **Step 1: Route `/invite/:token` → accept API → open project**
- [ ] **Step 2: Owner panel: create open/burning/TTL invite, copy link, revoke; list members; remove member**
- [ ] **Step 3: Named invite UI can be “paste user id” deferred — schema supports it; ship open+burning+TTL first**
- [ ] **Step 4: Commit**

```bash
git commit -m "Add invite accept page and project members/invites UI."
```

### Task 8: Project TM sync + attachments + match/write/export/clone

**Files:**
- Create: `api/internal/projecttm/*`
- Create: `src/components/ProjectTmAttachmentsPanel.vue`
- Modify: TM save paths in `EditorPage` / `tm/sync` consumers; `findTmMatches` call sites to pass merged units

**Rules to encode in tests:**
- Match: union units from attachments where `can_read` (project TM units + optional readable personal — personal units stay in user TM store; server exposes read API only if attachment grants `can_read` on that user TM — **MVP simplification:** only `kind=project` attachment ships in F2.0 first commit; `kind=user` attach in Task 8b)
- Write on confirm: all `can_write` attachments (project TM)
- Export/Clone: 403 without flags; clone copies into caller personal `tm_units` with **new UUIDs**

**MVP split inside Task 8:**
- **8a:** project TM only + default attachment + sync/match/write  
- **8b:** attach personal TM (`kind=user`) + Export/Clone endpoints + UI checkboxes (owner only)

- [ ] **Step 1: Go tests for export 403 and clone copies with new ids**
- [ ] **Step 2: Implement 8a then 8b**
- [ ] **Step 3: Client merges readable project TM into match list; writes on confirm to writable project TM**
- [ ] **Step 4: Commit**

```bash
git commit -m "Add project TM with attachment ACL, export, and clone."
```

### Task 9: F2.0 PLAN checkboxes + smoke

- [ ] Mark F2.0 items in `PLAN.md`
- [ ] Manual smoke: two users, invite, lock, edit, match from project TM
- [ ] Commit PLAN

---

## Part C — F2.1 segment locks + avatars

### Task 10: Migration + API segment locks

**Files:**
- Create: `api/migrations/010_segment_locks.sql`
- Extend: `api/internal/collab/segment_lock.go`

```sql
CREATE TABLE project_segment_locks (
  project_id UUID NOT NULL REFERENCES projects (id) ON DELETE CASCADE,
  segment_id TEXT NOT NULL,
  holder_user_id UUID NOT NULL REFERENCES users (id),
  holder_id TEXT NOT NULL,
  token TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (project_id, segment_id)
);
```

- [ ] **Step 1: Tests — two editors lock different segments OK; same segment 409**
- [ ] **Step 2: Routes `POST/DELETE /api/projects/{id}/segments/{segId}/lock`**
- [ ] **Step 3: Sync POST rejects segment update if locked by another user**
- [ ] **Step 4: Commit**

### Task 11: Editor UI — segment lock on focus + avatar

**Files:**
- Modify: `ParagraphBlock.vue` / `SegmentRow.vue` / `EditorPage.vue`
- Presence: show member avatar/initials on locked segment chrome

- [ ] **Step 1: On target focus → acquire segment lock; on blur/idle → release**
- [ ] **Step 2: Poll locks+presence; render avatar from `displayName` / anon color (reuse existing actor color helper)**
- [ ] **Step 3: Viewers never acquire; project-wide lock optional fallback off for shared projects when F2.1 enabled**
- [ ] **Step 4: Commit**

```bash
git commit -m "Add per-segment locks and editor presence avatars."
```

### Task 12: Final PLAN + spec success criteria

- [ ] Tick F1 / F2.0 / F2.1 items in `PLAN.md`
- [ ] Confirm spec success criteria list
- [ ] Commit

---

## Spec coverage checklist (self-review)

| Spec item | Task |
|-----------|------|
| F1 zip share + import hint + preserve actors | Task 1 |
| projects / members / invites schema | Task 2 |
| Invite TTL / maxUses / named / revoke | Tasks 4–5, 7 |
| Roles owner/editor/viewer | Tasks 4–6 |
| Project sync segments+meta; DOCX via hash+blob | Task 6 |
| Shared project lock F2.0 | Task 6 |
| Presence without email | Tasks 6–7, 11 |
| Project TM + attachments R/W/E/C | Tasks 3, 8 |
| Clone vs Export | Task 8 |
| Personal TM not auto-attached | Task 8 |
| Segment lock + avatars F2.1 | Tasks 10–11 |
| No SMTP / no OT | respected (non-goals) |
| C2 / F3 | out of plan (explicit) |

## Placeholder scan

No TBD steps; DOCX strategy and `kind=user` attach ordering locked above.

## Type consistency

- Roles string union identical on client (`src/types/collab.ts`) and DB check constraints  
- Invite accept always `POST /api/invites/accept` with `{ token }`  
- Attachment flags: `canRead`/`canWrite`/`canExport`/`canClone` in JSON; SQL `can_read` etc.
