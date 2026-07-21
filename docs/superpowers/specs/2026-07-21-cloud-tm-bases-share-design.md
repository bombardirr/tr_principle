# Cloud TM bases — job share + unit sync

Date: 2026-07-21  
Status: Approved (brainstorm)  
Related:

- [`2026-07-14-cloud-tm-sync-design.md`](./2026-07-14-cloud-tm-sync-design.md) — existing per-account unit sync (extend, do not replace)
- [`2026-07-21-tm-named-bases-design.md`](./2026-07-21-tm-named-bases-design.md) — local catalog + `baseId` + multi-base editor
- [`2026-07-20-job-tm-attachments-part2-design.md`](./2026-07-20-job-tm-attachments-part2-design.md) — job attachment CRUD (metadata only until this slice)

## Goal

Close the Part 2 gap: when a **job owner** attaches a TM base (including **Personal TM**), **members** with `canRead` / `canWrite` actually **match and write the same cloud units** as the owner. A base that exists only locally is **promoted to cloud** on attach.

## Decisions

| Topic | Choice |
|-------|--------|
| Primary outcome | Cross-account unit access via **job attachments** (not standalone share ACL) |
| Which bases | **Any** owner collection id, including `personal-tm` |
| Writes | Into the **owner’s same cloud base** (LWW on unit `id`); member is not the row owner |
| Local → cloud | **Auto-promote** catalog + units on attach (or immediately before) |
| Architecture | Extend `tm_units` with `base_id` + new `tm_bases` catalog; shared sync authorized via job membership |
| Project attachments | Unchanged — **no** cross-user sync via project in this slice |
| Export / Clone UI | Out of scope |

## Architecture

```
Owner device                    Postgres                         Member device
─────────────                   ────────                         ─────────────
tm_bases (IDB)  ←── sync ──→   tm_bases (owner_id, id)         
tm units/baseId ←── sync ──→   tm_units (user_id=owner, base_id)
     │                              ▲
     │ POST job attachment          │ ACL: job_tm_attachments
     └──────────────────────────────┤
                                    │
                         GET/POST /api/tm/bases/{baseId}/sync
                                    │
                                    └──→ member IDB (same baseId) + editor access sets
```

- Matching stays **local** (union of Readable attached bases).
- Owner `user_id` on `tm_units` is always the **base owner**, including rows last written by a member (`updated_by` = actor).

## Data model

### `tm_bases`

| Column | Notes |
|--------|--------|
| `owner_id` | UUID → users |
| `id` | TEXT — `personal-tm` or client uuid |
| `label`, `color` | Display |
| `created_at` / `updated_at` | ISO / timestamptz |
| `deleted_at` | Soft-delete catalog row |

**PK:** `(owner_id, id)` so every user has their own `personal-tm`.

Bootstrap: ensure personal row for owner on first catalog sync or first unit push.

### `tm_units` (extend)

- Add `base_id TEXT NOT NULL DEFAULT 'personal-tm'`
- Existing rows migrate to `personal-tm`
- Keep `PRIMARY KEY (user_id, id)` with `user_id` = base owner
- Index `(user_id, base_id, updated_at)` for sync

Wire format: `TmUnit.baseId` required (client already has it).

### Unchanged

- `job_tm_attachments` soft `tm_base_id` (no FK to catalog — still soft ref)
- Product path for legacy `job_tm_units` stays disabled

## API

Auth: JWT. Never trust client-supplied owner id for ACL.

### Owner catalog

| Method | Path | Notes |
|--------|------|--------|
| GET | `/api/tm/bases` | List caller’s bases (omit or include tombstones consistently with unit sync) |
| POST | `/api/tm/bases` | Create named base `{ id?, label, color? }` |
| PATCH | `/api/tm/bases/{id}` | Rename / color |
| DELETE | `/api/tm/bases/{id}` | Soft-delete; `personal-tm` cannot be removed (clear units only, mirror client) |

### Owner unit sync

Prefer **per-base** endpoints for all unit traffic (owner and member):

| Method | Path | Notes |
|--------|------|--------|
| GET/POST | `/api/tm/bases/{baseId}/sync` | Owner always allowed for own bases; members per ACL below |

Keep legacy `GET/POST /api/tm/sync` temporarily as **owner-only bulk** of all bases (units stamped with `baseId`) for backward compatibility; new client code should use per-base sync. Deprecate bulk once clients migrate.

**Authorize `baseId`:**

1. Caller owns a `tm_bases` row with that `id`, **or**
2. Exists job membership for caller and `job_tm_attachments` row with `tm_base_id = baseId` and:
   - GET → `can_read`
   - POST → `can_write`

If multiple jobs attach the same `baseId`, flags **OR** across those jobs for this caller.

Ambiguity: same `baseId` string owned by different users (e.g. two `personal-tm`). **Resolution:** shared sync resolves owner via attachment context:

- Prefer query `?jobId=` when syncing from a job screen, **or**
- Server looks up attachments for caller: if exactly one distinct base owner for that `tm_base_id`, use it; if multiple owners share the same id string with this member, require `jobId` (or `ownerId`) on the request.

For `personal-tm`, always disambiguate with `jobId` (owner = that job’s owner / attachment creator’s base owner — specifically the **job owner’s** personal base when the attachment was created by the job owner attaching `personal-tm`).

### Promote on attach

On successful `POST /api/jobs/{id}/tm-attachments` by owner:

1. Ensure `tm_bases` row for `(owner_id, tmBaseId)` exists (create with label from client body optional field, or placeholder).
2. Client immediately pushes dirty/local units for that `baseId` via owner or shared sync.
3. If promote/push fails, surface error on attach UI; attachment row may still exist (metadata) — client retries push; members may see empty until units land.

Optional later: transactional “attach only if units uploaded” — **not required** for MVP; retry is enough.

## Client

| Area | Change |
|------|--------|
| Catalog | Sync local `tmBasesIdb` ↔ `/api/tm/bases` for **owned** bases |
| Shared metadata | On job attachment list load, upsert local catalog entries for shared bases (label/color from owner catalog endpoint subset or embed in attachment list) — mark as non-deletable |
| Sync cursors / dirty | **Per `(accountId, baseId)`** (+ `jobId` when disambiguating shared personal) |
| Owner writers | Existing mark-dirty → push; include `baseId` |
| Member writers | Editor already writes all Writable bases; dirty → shared sync POST |
| Triggers | Login: owner catalog + owner unit sync. Open/refresh job: pull each Readable shared `baseId`. After local write: debounced push |
| Detach / leave job | Keep cached units in IDB; **match only if** `resolveTmBaseAccess` still includes the base. Optional “Remove from device” out of scope |
| Delete named (owner) | Soft-delete catalog + tombstone/clear units as today locally; sync tombstones |

Editor access helper unchanged in spirit: project + job shared + local overlay → readable/writable id sets.

## Conflict & deletes

- LWW on `updatedAt` per `(owner_user_id, unit.id)` — same as personal sync.
- Soft-delete units via `deletedAt`; match ignores tombstones.
- Owner deletes named base → catalog tombstone; members’ next pull gets no active units / catalog deleted flag; UI can show stale chip until detach.

## Out of scope

- Standalone share invites / links for a base
- Cross-user sync via **project** attachments
- Export / Clone ACL UI
- Server-side TM search
- Reviving product “job TM” pool (`job_tm_units`)
- Quotas / offline subscription limits

## Success criteria

- [ ] Owner attaches Personal or named base to job → member with Read sees units in editor with matching `?job=`
- [ ] Member with Write upserts a unit → owner sees it after sync (same `id` / LWW)
- [ ] Local-only named base: attach triggers promote; members eventually receive units
- [ ] JWT without job attachment (and not owner) cannot pull/push that base
- [ ] Two jobs attaching same owner base → member gets OR’d R/W; single unit stream
- [ ] `personal-tm` shared sync is disambiguated (jobId / owner) — no cross-tenant leak
- [ ] Tests: migration `base_id`, catalog PK, shared ACL matrix, promote-on-attach client path

## Implementation order (suggested)

1. Migration: `tm_bases` + `tm_units.base_id`; backfill personal
2. Owner catalog API + extend `/api/tm/sync` with `baseId`
3. Shared sync API + ACL (job attachment + disambiguation)
4. Promote hook / client push on attach
5. Client: per-base cursors, shared pull on job open, wire dirty for shared writes
6. Tests + two-account smoke
