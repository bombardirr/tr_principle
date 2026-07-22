# Job TM — Export / Clone ACL UI

Date: 2026-07-22  
Status: Implemented (main)  
Related:

- [`2026-07-20-job-tm-attachments-part2-design.md`](./2026-07-20-job-tm-attachments-part2-design.md) — flags in API, UI was R/W only
- [`2026-07-21-cloud-tm-bases-share-design.md`](./2026-07-21-cloud-tm-bases-share-design.md) — shared units in local IDB
- [`2026-07-21-tm-named-bases-design.md`](./2026-07-21-tm-named-bases-design.md) — named local/owned bases
- Deferred post-MVP: standalone share ACL; project cross-user sync

## Goal

Let the **job owner** toggle `canExport` / `canClone` on shared TM attachments, and let **members** (with those flags) **export TMX** or **clone** units into an owned base (Personal or named) — client-side, using already-synced IDB units.

## Decisions

| Topic | Choice |
|-------|--------|
| Scope | Job shared attachments only (not project; not local overlay) |
| Flags + actions | Both: owner toggles E/C; members get Export / Clone when allowed |
| Clone target | **Picker:** Personal TM or any **owned** named base |
| UI surface | **Job → Memories** (`JobMemoriesPanel`); owner E/C also in `JobTmBasesDialog` |
| Implementation | **Client IO** + ACL from server attachment list (no new export/clone API) |
| Editor bulk TMX | Unchanged (Readable union); not gated by per-attachment `canExport` |

## UX

### Owner (shared list)

- Permission toggles: **R / W / E / C** (short labels + tooltips).
- Defaults unchanged: R on, W/E/C off when attaching.
- Mutations via existing `PATCH /api/jobs/{id}/tm-attachments/{attachmentId}`.

### Member (shared list)

- If `canExport`: button **Export TMX** on that attachment row.
- If `canClone`: button **Clone…** → dialog listing owned catalog bases (ensure personal); confirm → clone.
- Without flag: no button (do not show disabled tease unless useful for empty state — prefer hide).
- Owner may use the same actions on their own shared attachments when flags are on (optional; at least members must).

### Local overlay

- No Export/Clone flags or actions (member’s private extras).

## Behavior

### Preconditions

- Use attachment’s `tmBaseId` + `ownerId` → local shared id (`share:{ownerId}:{tmBaseId}` when namespaced).
- If local unit count is 0: run `syncTmBase(wireOrLocal, { jobId })` once, then proceed; if still empty → notice “nothing to export/clone”.
- Gate on flags from the **server** shared list (`canExport` / `canClone`), not local overlay.

### Export

1. `listTmUnits({ baseIds: [localSharedId] })` (active only).
2. `exportTmx(units, langs if known)`.
3. Download blob (filename e.g. `{label-or-id}.tmx`).

### Clone

1. User picks owned target `baseId` (personal or named).
2. For each active unit in source shared base: new UUID, `baseId = target`, clear tombstones.
3. `importTmUnits` + mark dirty / owned sync push.
4. Notice with count; do not modify source units.

### ACL semantics (unchanged server)

- Orthogonal flags; Export does not imply Write; Clone does not imply Export.
- `canRead` still required for match; Export/Clone without Read is allowed only if units were previously cached — **prefer require effective Read** (hide Export/Clone if `!canRead`) to avoid stale cache surprises.

## Out of scope

- `POST …/export` / `…/clone` server endpoints
- Project attachment E/C UI
- Standalone base share invites
- Rate limits / audit log
- Cloning into a newly created base in one step (user creates base in collection first, or picker can offer “create new” later — **not required**)

## Success criteria

- [ ] Owner can toggle E/C on a shared job attachment; values persist via PATCH
- [ ] Member without `canExport` / `canClone` does not see the corresponding action
- [ ] Member with Export downloads TMX of that shared base’s units
- [ ] Member with Clone picks an owned base and receives new unit copies there
- [ ] Empty shared base after sync → clear empty notice, no crash
- [ ] Local overlay unchanged (R/W only)
- [ ] Tests: flag toggles in UI/API client; export/clone helpers respect flags and target baseId

## Implementation notes (non-binding)

- Reuse `exportTmx` / `importTmUnits` / `listTmUnits` / `listOwnedTmBaseIds` or `listTmCatalog` filtered to owned.
- i18n: `tmPermExport`, `tmPermClone`, short E/C, button labels, clone dialog, empty notices (en + ru).
