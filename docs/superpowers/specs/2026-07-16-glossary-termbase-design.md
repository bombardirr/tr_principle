# Glossary (termbase) — design

Date: 2026-07-16  
Status: Approved for planning  
Slice: Phase C — MVP (industry-shaped, personal first)

## Goal

Ship a real CAT **termbase** (separate from TM): personal glossary per account, cloud sync, TBX interchange, source-term highlighting in the editor. Project-scoped termbases follow in C2 (before / with phase F), without redoing the entry model.

## Product rules

- Termbase ≠ TM. Terms are concepts/phrases for consistency; TM is segment-level reuse.
- **C1 (this slice):** one **personal** termbase per `user_id` (all language pairs in one store; each entry carries `sourceLang` / `targetLang`).
- IndexedDB = working copy + offline; Postgres = source of truth across devices (same sync pattern as TM).
- Highlight matching terms in **source** of the active/visible segments (case policy below).
- Click / UI to insert target term into the target field (optional in C1 — at minimum show hit + preferred target).
- **TBX** import/export (TBX-Basic subset) in C1.
- No MT, no multi-termbase priority UI, no shared/project TB in C1.
- Forbidden / approved status on entries (industry-useful; forbidden = highlight differently, do not auto-suggest insert).

## Non-goals (C1)

- Project-attached or team termbases (→ **C2**, before F2)
- Full TBX Core / multi-term variants / concept groups beyond simple entry
- Admin CRUD UI separate from in-app glossary panel
- Server-side term lookup API for matching (match stays local on IDB cache)

## C2 (superseded sketch)

Replaced by full named-bases + job share design:

→ [`2026-07-22-glossary-named-bases-design.md`](./2026-07-22-glossary-named-bases-design.md)

(Entry fields unchanged; storage gains `base_id` + catalog + job attachments like TM.)

---

## Data model

### Entry (`GlossaryTerm`)

| Field | Notes |
|-------|--------|
| `id` | UUID |
| `sourceLang` / `targetLang` | BCP-47-ish codes as in project meta |
| `sourceTerm` | Surface form to match in source text |
| `targetTerm` | Preferred translation |
| `status` | `approved` \| `forbidden` (default `approved`) |
| `note` | Optional plain note |
| `caseSensitive` | bool, default false |
| `createdAt` / `updatedAt` | ISO |
| `deletedAt` | ISO \| null (tombstone for sync) |
| `createdBy` | opaque actor ref (nick / `anon:id`), never email |

Matching for highlight (C1):

- Filter by project language pair
- Ignore `deletedAt`
- Prefer longer source terms when overlaps
- `caseSensitive === false` → case-insensitive match on word/phrase boundaries (Unicode-aware enough for RU/EN; no full ICU morphology in C1)

### Storage

**Client IndexedDB** (scoped by account id, sibling of TM store): e.g. `appzac-glossary` / store `terms`.

**Server** table `glossary_terms` (row-per-term), `user_id` owner, same LWW + tombstone fields as `tm_units`.

### Sync

Mirror TM sync:

| Direction | Trigger |
|-----------|---------|
| Pull | After login / bootstrap when online; on reconnect |
| Push | After local upsert/delete; retry dirty set |

- Endpoints: `GET/POST /api/glossary/sync` (or `/api/tb/sync`) — pull `since`, push upserts+tombstones, response `until`
- Cursor + dirty set in `localStorage` per account (`appzac-glossary-sync-since:{userId}`, `…-dirty:…`)
- Conflict: same `id` → higher `updatedAt` wins

---

## TBX

**Export:** all non-deleted personal terms → TBX-Basic-ish XML (langSet source/target, termNote for status/note where mappable).

**Import:** merge by (sourceLang, targetLang, normalized sourceTerm) or always new UUID + LWW on re-import of same id if present; document chosen rule in implementation plan (prefer: new UUID on import unless `id`/`termEntry` id preserved).

C1 supports a **pragmatic subset** sufficient for round-trip of our fields; full TBX Core is backlog.

---

## UI

1. **Glossary panel** (editor or projects shell): list/filter by langs, add/edit/delete, status toggle, TBX import/export buttons.
2. **Source highlight:** marks in `RichSourceView` (or overlay) for hits in current segment; forbidden vs approved visually distinct.
3. **Insert:** from hit popover / click → insert `targetTerm` at caret in target (if target focused); forbidden hits show warning, no one-click insert.
4. i18n ru/en; no email in term attribution.

---

## API (C1)

| Method | Path | Notes |
|--------|------|--------|
| GET | `/api/glossary/sync?since=` | pull |
| POST | `/api/glossary/sync` | push batch |

Auth: JWT; only own `user_id` rows. No plan-gate in C1 (free gets glossary).

---

## Testing

- Unit: normalize/match/highlight spans; longer-term wins overlap
- Unit: TBX export/import round-trip of core fields
- Store/sync: register-free user; push/pull LWW + tombstone (integration if `DATABASE_URL`)
- Component smoke: panel CRUD; highlight appears for known term

## Success criteria (C1)

- [ ] CRUD terms offline; sync when online
- [ ] Source highlighting for project lang pair
- [ ] TBX import/export
- [ ] Forbidden vs approved distinction
- [ ] Schema ready for C2 project ownership without renaming core fields

## Relation to PLAN.md

Phase C MVP; starts after cloud closeout tooling. Then C2 / F for project & team.
