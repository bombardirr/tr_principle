# Glossary — named bases + job share (C2)

Date: 2026-07-22  
Status: Approved (brainstorm)  
Related:

- [`2026-07-16-glossary-termbase-design.md`](./2026-07-16-glossary-termbase-design.md) — C1 personal termbase (superseded for storage/sync shape by this slice)
- [`2026-07-21-tm-named-bases-design.md`](./2026-07-21-tm-named-bases-design.md) — TM catalog + `baseId` pattern to mirror
- [`2026-07-21-cloud-tm-bases-share-design.md`](./2026-07-21-cloud-tm-bases-share-design.md) — cloud promote + job ACL sync
- [`2026-07-22-job-tm-export-clone-acl-design.md`](./2026-07-22-job-tm-export-clone-acl-design.md) — R/W/E/C + client Export/Clone

## Goal

Make the **glossary mirror TM bases**: named catalog, terms partitioned by `baseId`, cloud per-base sync, job attachments with **R / W / E / C**, editor highlight ∪ Readable / write → Writable, Export TBX / Clone into an owned base. Personal glossary is **not special** — only used when attached.

**Break:** remove legacy `GET/POST /api/glossary/sync` (bulk personal). New clients use per-base sync only. Existing terms migrate to `personal-glossary`.

## Decisions

| Topic | Choice |
|-------|--------|
| Architecture | **Mirror TM** (separate `glossary_*` tables; no shared ResourceStore) |
| Scope | Local catalog + cloud bases + job attach + member sync + E/C UI in **one** slice |
| Personal id | `personal-glossary` (ensure on open; clear-only on delete) |
| Attach surface | **Job** (and project strip if project already has glossary attach hooks — prefer job first; project local attach same as TM project attachments if already patterned) |
| Cross-user | Via **job attachments** only (not standalone share; not project cross-user) |
| Writes | Into **base owner’s** cloud rows; LWW on term `id`; `updated_by` = actor |
| Promote | Auto-promote local base + terms to cloud on job attach |
| ACL | **R / W / E / C**; defaults on attach: R on, W/E/C off |
| Export / Clone | **Client IO** from synced IDB (TBX export; clone → owned base); no server export/clone endpoints |
| Legacy sync | **Removed** |

## Architecture

```
Owner device                         Postgres                          Member device
─────────────                        ────────                          ─────────────
glossary_bases (IDB)  ←── sync ──→  glossary_bases (owner_id, id)
terms / baseId        ←── sync ──→  glossary_terms (user_id=owner, base_id)
     │                                   ▲
     │ POST job glossary-attachment      │ ACL: job_glossary_attachments
     └───────────────────────────────────┤
                                         │
                    GET/POST /api/glossary/bases/{baseId}/sync?jobId=
                                         │
                                         └──→ member IDB (share:{ownerId}:{baseId}) + access sets
```

- Highlight/match stays **local** (union of Readable bases).
- `user_id` on `glossary_terms` is always the **base owner**.

## Data model

### `glossary_bases`

| Column | Notes |
|--------|--------|
| `owner_id` | UUID → users |
| `id` | TEXT — `personal-glossary` or client uuid |
| `label`, `color` | Display |
| `created_at` / `updated_at` | |
| `deleted_at` | Soft-delete |

**PK:** `(owner_id, id)`.

### `glossary_terms` (extend)

- Add `base_id TEXT NOT NULL DEFAULT 'personal-glossary'`
- Migrate existing rows → `personal-glossary`
- Keep PK `(user_id, id)` with `user_id` = base owner
- Index `(user_id, base_id, updated_at)` for sync
- Entry fields unchanged (source/target, status approved|forbidden, note, caseSensitive, tombstones, …)

### `job_glossary_attachments`

Mirror `job_tm_attachments`:

| Column | Notes |
|--------|--------|
| `id` | UUID PK |
| `job_id` | FK jobs |
| `glossary_base_id` | Soft text ref |
| `label`, `color` | Snapshot for members |
| `can_read` / `can_write` / `can_export` / `can_clone` | bool |
| `created_by`, timestamps | |

Unique `(job_id, glossary_base_id)` (or owner-scoped soft uniqueness as TM).

### Client

- Catalog IDB (or sibling of glossary IDB): ensure `personal-glossary`
- Every term has `baseId`
- Shared local id: `share:{ownerId}:{glossaryBaseId}` (same helper pattern as TM)
- Access helpers: readable/writable/exportable/cloneable id sets from project + job attachments

## API

Auth: JWT. Never trust client owner id for ACL.

### Owner catalog

| Method | Path |
|--------|------|
| GET/POST | `/api/glossary/bases` |
| PATCH/DELETE | `/api/glossary/bases/{baseId}` |

`personal-glossary` cannot be hard-deleted (clear terms only).

### Per-base sync

| Method | Path |
|--------|------|
| GET/POST | `/api/glossary/bases/{baseId}/sync` |

Optional `?jobId=` for members. Authorize:

- Owner of base → always
- Else member of `jobId` with attachment to that `baseId` and `canRead` (pull) / `canWrite` (push)

### Job attachments

| Method | Path | Who |
|--------|------|-----|
| GET | `/api/jobs/{id}/glossary-attachments` | any member |
| POST | same | owner (promote base first if needed) |
| PATCH/DELETE | `…/{attachmentId}` | owner |

### Removed

- `GET/POST /api/glossary/sync` (legacy bulk)

## UX

### Collection

- Create named base; Import TBX → new or existing base; rename/color; delete named / clear personal
- List with counts where cheap

### Job (Memories / glossary section)

- Owner: attach from owned catalog; toggles **R / W / E / C**
- Member: Export TBX if E; Clone… if C → picker of owned glossary bases
- Hide actions when flag off (no disabled tease)

### Editor

- Source highlight ∪ Readable attached bases (lang-pair filter; longest match; forbidden distinct)
- Insert preferred target from approved hits; forbidden → no one-click insert
- Create/edit term only into Writable bases (picker if multiple)
- Detached personal (or any) base does not affect highlight/write

### Project

- If project already has TM-style attachment strip, add glossary attachments **local-only** (no cross-user sync via project) — same as TM project path. Job remains the share channel.

## Out of scope

- Shared ResourceStore / merging TM+glossary tables
- Standalone glossary share invites (no job)
- Project cross-user glossary sync
- Server-side TBX export/clone endpoints
- Full TBX Core / morphology
- Pro gate

## Success criteria

1. Create/import named glossary; terms tagged with `baseId`; legacy terms live under `personal-glossary`.
2. Owner attaches base to job; members with Read see highlights after sync.
3. Write with Write flag lands in owner’s cloud base; visible to other readers after sync.
4. E/C: Export TBX / Clone into owned base works client-side; flags default R-only.
5. Personal not attached → no highlight/write from it.
6. Legacy `/api/glossary/sync` gone; clients use per-base sync only.
7. No email in glossary UI attribution.

## Testing (minimum)

- Migration: existing terms → `personal-glossary`
- API: owner sync; member pull with Read; push denied without Write; non-member 403
- Attach CRUD + flag patch
- Client: access sets; highlight union; export/clone gated by flags
- Editor: detached personal ignored
