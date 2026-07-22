# TM collection — named local bases (Create / Import + multi-pool)

Date: 2026-07-21  
Status: Implemented (main)  
Related:

- [`2026-07-20-tm-collection-part1-design.md`](./2026-07-20-tm-collection-part1-design.md)
- [`2026-07-21-editor-job-tm-context-design.md`](./2026-07-21-editor-job-tm-context-design.md)

## Goal

Let the user **create** and **import (TMX)** named translation memories in the global collection, store units in **one IndexedDB** partitioned by `baseId`, and make the editor **match ∪ Readable** / **write → all Writable** attached bases. Personal TM is **not special**: if not attached, it is neither read nor written.

## Decisions

| Topic | Choice |
|-------|--------|
| Scope this slice | Local named bases only (no cross-account share yet) |
| Create + Import | Both: empty named base; TMX into new or existing |
| Unit storage | **One** TM IDB; every unit has `baseId` |
| Catalog | Persistent local catalog (`id`, `label`, color, timestamps); ensure `personal-tm` |
| Attachment ids | `string` (uuid or `personal-tm`) |
| Match | Union of units from all attached bases with Read (project; + job shared/local when `?job=`) |
| Write | All attached bases with Write (same layer rules as match) |
| Personal | Same as any base — no implicit always-on |

## Data model

### Catalog entry (`TmBase`)

| Field | Notes |
|-------|--------|
| `id` | `personal-tm` or generated uuid |
| `label` | Display name |
| `color` | From palette (optional index) |
| `createdAt` / `updatedAt` | ISO |

Stored in IndexedDB store or dedicated small DB (e.g. `tm_bases`); must survive reload.

### Units

- Existing `TmUnit` + required **`baseId: string`**
- Migrate-on-open: units missing `baseId` → `personal-tm`
- API shape: `listTmUnits({ baseIds?: string[] })`, `listTmUnitsForBase(baseId)`, `clearTmUnits(baseId)`, put/import tagged with `baseId`

### Attachments

- `ProjectTmAttachment.id: string`
- Job attachments already use soft `tmBaseId` text — align client catalog ids

## UX

**Collection (`browse`)**

- Actions: **Create** (name dialog), **Import TMX** (file → new base name or pick target base)
- List: all catalog bases with stats (unit count, last update) where cheap
- Delete own: non-personal → remove catalog row + delete units for `baseId`; personal → clear units only, keep id (as Part 1)

**Pick / project / job strips**

- Catalog-driven; attach any catalog id
- No change to bind merge policy (layers stay separate)

**Editor**

- Resolve readable/writable **base id sets** from project attachments (+ job layers if job context)
- Match against `listTmUnits` filtered to readable ids
- On confirm/autosave/import-to-TM: write unit copies (or upserts) into **each** writable `baseId`
- If personal not in readable/writable sets → unused

## Migration

1. Bump TM IDB version; add `baseId` (default `personal-tm` in upgrade when possible)
2. Ensure catalog contains personal + any ids already referenced in project/job attachments
3. Existing `canReadPersonalTm` / `resolvePersonalTmAccess` evolve to **multi-base** access helpers (readable/writable id sets), not personal-only OR

## Out of scope

- Server TM base catalog / cloud sync of named bases
- Export / Clone ACL UI
- Sharing a base with another account
- Per-base cloud unit sync endpoints

## Success criteria

- [ ] Create empty named base; appears in collection and pickers
- [ ] Import TMX into new or existing base; units tagged with that `baseId`
- [ ] Legacy units readable as `personal-tm` after migration
- [ ] Editor matches union of Readable attached bases; writes to all Writable
- [ ] Detached personal (or any) base does not affect match/write
- [ ] Delete named base removes units + catalog entry; personal clear-only
- [ ] Tests for catalog CRUD, `baseId` migration, match/write multi-base helpers
