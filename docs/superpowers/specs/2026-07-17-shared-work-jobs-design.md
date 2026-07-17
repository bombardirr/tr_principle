# Shared work (jobs): personal copies + live resources — design

Date: 2026-07-17  
Status: Approved for planning  
Slice: Phase F — revised MVP collaboration model  
**Supersedes:** [`2026-07-17-group-collaboration-design.md`](./2026-07-17-group-collaboration-design.md) (shared bilingual + segment/project locks)

## Goal

Let several people work on **one document as one shared work item** while each keeps a **personal bilingual project copy**. What syncs live is **attached resources** (TM now; glossary later), not co-editing of segments. A supervisor can observe members and simple per-person progress without seeing live cursors.

This matches common freelance / LSP practice (package / own file + server TM) better than realtime co-editing, which translators often dislike.

## Why the previous F0 was wrong for us

The earlier design assumed one cloud bilingual, membership, and write locks (project then segment). Feedback: translators do not want others poking the same project synchronously. They set up **their own** projects from a verbal brief, attach agreed TMs, optionally split the document by hand, and only need shared **memory/term** state in realtime.

## Industry alignment

| Practice | Industry | Our choice |
|----------|----------|------------|
| Personal package / own bilingual | Classic Trados / memoQ freelance | **Yes** |
| Live shared TM / termbase | Server TM | **Yes** |
| Concurrent segment editing + locks | GroupShare-style | **No** (superseded) |
| PM dashboard (who / % / activity) | LSP job | **Yes** — lightweight |
| XLIFF interchange | Standard handoff | **Later** (after in-app + `.tcat.zip`) |
| Zero-knowledge E2E on TM | Rare in CAT | **Backlog** — honest limits for now |

## Product rules

### Shared work (`job`)

- A **job** (UI: «общая работа» / shared work) is a cloud card that ties people and resource presets together.
- Creating a local project from DOCX stays as today. An explicit action **«Сделать общей работой»** creates the job and links the creator’s copy (`jobId`).
- Anyone may create a job (owner = creator). Owner may **transfer ownership** later.
- Supervisor is invited as **viewer (PM)** — metrics and roster, not co-editing.

### Personal copies

- Each translator has their own IndexedDB project (segments, styles, local backup).
- Join paths:
  1. **In-app send / clone** — recipient gets a copy linked to the same `jobId`.
  2. **Import file** (`.tcat.zip`; XLIFF later) then **join job** via link/code.
- If imported DOCX **name or content hash** differs from the job fingerprint → **warn**, do not hard-block (wrong file = user’s problem).

### Progress (split-by-agreement)

- Verbal split of one document means a single document-level % would lie.
- MVP shows **per-member** progress (done segments / source words on **their** copy) and a manual **«моя часть готова»**.
- **No** aggregate “document 100%” until a later feature (zones or PM acceptance).

### Resources (TM / glossary)

- Job holds a **preset** of recommended memories/termbases and default Read/Write.
- Each member has **overrides**: enable/disable, Read / Write (and later Export / Clone as already designed for TM ACL).
- Matching uses the member’s effective attachments; confirm/autosave writes only where Write is on.
- Live sync applies to **resource stores**, not to colleagues’ segment grids.

### Duplicate work soft guard

- On confirm, if there is a fresh **exact/context** hit from a **shared** TM attached to the job, authored by **someone else** (not current actor) → soft warning: translation already in TM; user may still confirm.
- Not a hard block. Personal-only TM hits do not trigger this job-specific warning (normal TM UX remains).

### Privacy (honest limits)

- Bilingual segments are **local by default** and are **not** required in cloud for collaboration.
- Putting text into a **shared TM/glossary** is an explicit share of fragments with the service and other members who can Read.
- UI must state this briefly when enabling Write to a shared resource.
- Encryption at rest (hosting) is fine; **E2E zero-knowledge shared TM** is out of scope (backlog). Application servers will see plaintext of synced resource units.

### Attribution

- Never store or show email in TM/audit/job roster UI — nick / `anon:{userId}` only.

## Non-goals

- Shared bilingual sync / project or segment write locks for co-editing
- Mandatory XLIFF in the first implementation slice
- Segment assignment zones
- OT/CRDT realtime cursors
- SMTP email invites (link invites only)
- Full LSP reporting / TM leverage metrics (optional later)
- E2E encryption of shared TM

## Typical scenario (verbal brief)

1. Boss says: translate this DOC, use these TMs with these settings, work with Ivan.
2. Worker 1 creates project from DOCX → «Сделать общей работой» → sets resource preset.
3. Invites Ivan (link / in-app) and optionally Boss as viewer.
4. Ivan gets clone **or** imports a file and joins; warn if fingerprint mismatch.
5. Each tunes attachments; both write to shared TM when Write is on.
6. Boss sees who is on the job, per-person progress, last activity — not live segments.
7. If both touch the same sentence, the second gets a soft warning when confirming over a fresh Exact from the shared TM.

## Data model (sketch)

### `jobs`

| Column | Notes |
|--------|--------|
| `id` | UUID |
| `owner_user_id` | FK users |
| `title` | Display name |
| `source_lang` / `target_lang` | |
| `source_fingerprint` | e.g. original filename + content hash |
| `created_at` / `updated_at` | |

### `job_members`

| Column | Notes |
|--------|--------|
| `job_id`, `user_id` | PK |
| `role` | `owner` \| `translator` \| `viewer` |
| `local_project_id` | UUID of member’s copy (nullable for viewer-only) |
| `part_done` | bool — «моя часть готова» |
| `progress_done` / `progress_total` | optional cached counters reported by client |
| `last_active_at` | |

Owner row always present; transfer ownership updates `jobs.owner_user_id` + roles.

### `job_invites`

Link invites (token hash, role, expires_at, max_uses, revoked_at) — same spirit as prior invite design; role `translator` or `viewer`.

### `job_resource_presets` + `job_member_resource_overrides`

- Preset: which TM/glossary refs are recommended and default `can_read` / `can_write` (export/clone later).
- Override per member: enabled flag + effective permissions.

Shared TM units remain in a job-scoped or attachable store (may reuse / adapt prior `project_tm_*` ideas as **job TM**, not “one bilingual project”). Personal TM stays user-scoped.

### Client project meta

- `meta.jobId?: string`
- Fingerprint fields for join warnings

## Flows

### Create shared work

Owner opens project → create job → link local project → edit preset → copy invite link.

### Join via clone

Owner selects member / sends invite → accept → server records membership → client creates local copy from payload or pulls package → `jobId` set.

### Join via import

Import `.tcat.zip` → prompt «Присоединиться к общей работе?» with token → compare fingerprint → warn if mismatch → membership + `jobId`.

### Report progress

Client periodically or on save posts done/total (+ part_done). Viewer UI lists members without email.

### Confirm warning

Before finalize segment: if job shared TM has exact hit from other actor → modal/toast confirm.

### Transfer owner

Owner picks another member → role swap; former owner may remain translator.

## API (indicative)

| Area | Endpoints |
|------|-----------|
| Jobs | `POST/GET /api/jobs`, `GET/PATCH /api/jobs/{id}`, transfer ownership |
| Members | `GET …/members`, patch `part_done` / progress, remove |
| Invites | create/list/revoke/accept (link token) |
| Clone/send | `POST …/clone-to` or accept creates copy recipe |
| Resources | preset CRUD (owner); member overrides; TM sync for readable attachments |
| Privacy | no email in member/presence/TM attribution responses |

Bilingual segment sync endpoints from the superseded design are **not** part of this model.

## UI (minimal)

- Projects list: badge «общая работа»; viewer sees jobs they observe.
- Job panel: members, progress per person, invites, preset resources, transfer owner.
- Editor: attachment overrides; soft warning on confirm; share/join entry points.
- Clear copy when enabling Write on a shared resource (text leaves the device).

## Delivery phases

| Phase | Delivers |
|-------|----------|
| **J0** | This spec; mark old group-collaboration spec superseded |
| **J1** | jobs + roles + invites + in-app clone + import join + fingerprint warn |
| **J2** | resource preset + overrides + live shared TM |
| **J3** | per-member progress + part_done + viewer card |
| **J4** | narrow confirm warning + transfer owner |
| **Later** | XLIFF; glossary on same attach model; E2E TM; segment zones; TM leverage metrics |

## Relation to existing code

Implementation that assumed **shared bilingual sync + shared project locks** (prior F2.0 plan) does **not** match this product. Treat it as candidate to **adapt** (invites, TM attach ACL ideas) or **unwind** where it forces co-editing. New work follows **J1→J4**. Do not implement F2.1 segment locks for co-editing.

## Testing (acceptance ideas)

- Two users, two copies, same `jobId`; viewer sees two progress rows, no segment bodies.
- Fingerprint mismatch → warning path still allows join.
- Shared TM write from A → exact visible to B without sharing A’s segment grid.
- Confirm warning when Exact from other member’s TU; dismiss still confirms.
- Member JSON / TM attribution never include email.

## Success criteria

- [ ] Spec replaces co-editing F0 as the Phase F north star
- [ ] Verbal-brief scenario supported without requiring boss to create the job
- [ ] No document-level % that lies under verbal split
- [ ] Privacy stance documented and reflected in UI copy for shared Write
- [ ] Implementation plan can ship J1 without bilingual cloud sync
