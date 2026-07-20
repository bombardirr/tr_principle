# Job TM attach (shared memory for a job) — design

Date: 2026-07-20  
Status: Approved for planning  
Slice: Phase F / J2 — Task 14 (attach selected bases)  
Parent: [`2026-07-17-shared-work-jobs-design.md`](./2026-07-17-shared-work-jobs-design.md)  
Related sync pattern: [`2026-07-14-cloud-tm-sync-design.md`](./2026-07-14-cloud-tm-sync-design.md)

## Goal

Give a shared work (**job**) one **job TM** that members can turn on for Read / Write, with a light UI and offline-first behaviour (local cache + cloud sync when online). Personal TM stays private. No auto ephemeral TM as the only product path — attach is explicit.

## Decision (locked)

| Choice | Decision |
|--------|----------|
| Model for MVP | **A** — one shared pool per job (`job_tm`), not links to someone else’s personal TM |
| Later (not this slice) | **B** — attach additional named / personal bases by ref |
| UI | Simple «Памяти» block: personal (always) + job TM toggles |
| Offline units | Match/write against IndexedDB cache; dirty push when online |
| Offline ACL edits | Changing preset/override requires network (queue later if needed) |
| Deferred write stack | Separate slice (Task 13), after attach works |
| Soft duplicate warn | Re-enable after shared writes are live again |
| Glossary attach (C2) | Same UI pattern later; out of this slice |

## Why not attach personal TMs by reference (yet)

Sharing another user’s personal cloud TM needs cross-user ACL, unexpected privacy surface, and harder offline caching. A single job-scoped store reuses `job_tm_units` / preset tables already in the schema and matches verbal briefs («одна общая память на эту работу»).

## Product rules

### Bases in the editor

| Base | Scope | Visibility |
|------|--------|------------|
| Personal TM | User | Only that user (unchanged) |
| Job TM | `job_id` | Members with effective **Read** |

- Match = personal ∪ job TM (if Read).
- Write to **personal** = always on confirm/autosave (immediate local + personal sync) — never drop private memory.
- Write to **job TM** = **additionally**, only if effective **Write**; units land in job TM cache (+ dirty). Pending deferred stack is the next plan after this slice ships a direct path.

### Attach = rights, not file copy

- **Owner preset** (`job_resource_presets`, kind `job_tm`): whether the job TM exists/is offered; default `can_read` / `can_write` for translators; viewers typically Read-only or off.
- **Member override** (`job_member_resource_overrides`): member may disable or narrow rights; **must not** exceed preset.
- Enabling **Write** shows a short privacy note: fragments go to the service and to members with Read. No E2E; honest limits (same as parent job spec).

### Creating / disabling job TM

- First time owner turns job TM on → ensure preset row `kind=job_tm` (may already exist from migration seed; product treats “off” as disabled preset or all members overridden off — pick one implementation: **enabled flag on preset** or empty effective Read for everyone). Prefer: preset always present; **`enabled`** (or `can_read=false` + `can_write=false` as “off”) is the product toggle «ТМ работы».
- Turning off does not delete historical `job_tm_units` (soft; units remain for re-enable). Hard purge is out of scope.

## Offline / online

```text
Editor
  ├─ match: personal TM ∪ job TM cache (if Read)
  ├─ write personal → personal IDB + dirty (as today)
  └─ write job TM → job TM IDB + dirty (if Write)
         │
         ├─ offline → dirty accumulates
         └─ online  → pull/push job TM (since + dirty), mirror personal TM sync
```

- Config (preset/override): **server is source of truth**. Client caches last known effective rights for match/write while offline. Editing toggles while offline: show that network is required (MVP). Do not silently invent ACL.
- Conflict merge: newer `updatedAt` wins (same as personal TM).
- Sync triggers: login, back online, open job hub / project with `jobId`, after local job TM writes (debounced push).

## UI — «Памяти»

Place: job hub / `SharedWorkPanel` (not buried in project settings only).

```text
Памяти
┌──────────────────────────────────────────┐
│ Личная ТМ     всегда · только вы         │
│ ТМ работы     [ Read ] [ Write ]         │
│   short privacy line when Write is on    │
└──────────────────────────────────────────┘
```

- **Owner:** toggles edit the **preset** (defaults for the job) and apply to the owner’s own effective use.
- **Translator:** toggles edit **personal override** (cannot exceed preset; if preset Write=false, Write control disabled).
- **Viewer:** Read only if preset allows; no Write.
- Job TM fully off: copy like «Общая ТМ выключена — каждый работает со своей».
- Do not ship a dense ACL matrix. Future «+ база» is a single add affordance, not part of MVP.

Attribution in UI/units: nick / `anon:{userId}` only — never email.

## Data / API (sketch)

Reuse / adapt existing:

- `job_tm_units` — shared units
- `job_resource_presets` / `job_member_resource_overrides` — ACL
- Job TM sync handlers (shelved auto path) — retarget to explicit attach + client cache

Client:

- IndexedDB store scoped by account + `jobId` for job TM units (or equivalent namespaced keys)
- Effective rights helper: `preset ⨯ override ⨯ role`
- Match pipeline: query personal + readable job TM caches
- Confirm / autosave path: if Write on job TM, upsert job unit + mark dirty (direct in this slice; stack later)

## Non-goals (this slice)

- Attaching another user’s personal TM by reference
- Multiple named TM pools per job
- Glossary attach (C2)
- Deferred pending write stack (Task 13)
- Soft confirm warning re-wire (depends on live shared writes)
- E2E encryption of job TM
- Boss download / finalize (Task 15)

## Acceptance

- Owner can turn job TM on/off and set default Read/Write; translators see simple toggles; privacy note on Write.
- With Read: editor shows matches from job TM cache; offline still matches cached units.
- With Write: confirms persist to job TM cache offline and sync when online; other member with Read sees them after sync.
- Personal TM never appears in another member’s match set via this feature.
- Viewer cannot Write.
- Member cannot grant themselves Write if preset denies it.

## Open implementation notes (not product blockers)

- Exact IDB schema name for job TM cache.
- Migration seed / existing jobs: job TM starts **off** until owner enables (no surprise sharing).
- Dual-write is locked above (personal always + job when Write).
