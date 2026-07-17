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

- A **job** (UI: «общая работа») is a cloud card: members, invites, later attached bases, progress, final result for boss.
- **Job ≠ project.** Membership does **not** require a local bilingual project.
- `/projects` IA (**locked A**): two blocks — **Проекты** | **Общие работы**. Click a job → **job hub** (not straight into editor).
- Creating a local project from DOCX stays available. Owner may also **«Сделать общей работой»** from an existing project (links `meta.jobId`).
- Anyone may create a job (owner = creator). Owner may **transfer ownership**.
- Supervisor is **viewer** — stats + final downloadable result only; **no** bilingual project required for boss.

### Join (locked: membership-first)

- Invite link (header paste **or** `/job-invite/:token`) → accept → **membership** with optional `local_project_id`.
- Join **without** local project is allowed → land on **job hub**.
- From invite UI / job hub the member may later: import `.tcat.zip`, create from DOCX, or create empty shell, then bind.
- Fingerprint mismatch → **warn** only when binding a project that has fingerprint data; never hard-block.

### Personal copies

- Each translator’s segments stay in their IndexedDB project (`meta.jobId` when bound).
- Boss does not need a project — only job hub stats + finalized result download.

### Progress (split-by-agreement)

- Per member, from **their** linked project when present:
  - **TM coverage %** — segments with a usable TM hit / all segments
  - **Translated %** — actually translated segments / all segments
- Manual **«моя часть готова»** / finalize project for delivery.
- Normal that after verbal split + peer review clicks, one member can show ~100% translated and another ~50%.
- **No** fake single document-level % as the only truth.
- Finalizing translator marks project complete → translated DOCX available for **boss download** on job hub.

### Resources (TM / glossary) — attach model

- **No** auto built-in ephemeral `job_tm` as the default product path (removed).
- Members **attach** selected bases they can access; job has preset defaults + per-member overrides (Read/Write; export/clone later).
- Writes to **writable shared** bases go through a **deferred pending stack** (configurable delay on project create + settings): send/cancel all or per item; top item auto-flushes if untouched when timer expires — so accidental bad confirms can be fixed before leaving the device.
- Personal-only TM may write immediately (default).
- Live sync applies to **resource stores**, not segment grids.

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

### Join (membership-first)

Paste link in header or open `/job-invite/:token` → accept → membership (`local_project_id` optional) → **job hub**.  
Optionally import / create DOCX / empty shell / bind existing project from invite UI or hub; fingerprint warn on bind only.

### Report progress

Client posts TM-coverage % + translated % (+ part_done). Viewer UI lists members without email. Boss downloads finalized DOCX from hub.

### Confirm warning

Before finalize segment: if an **attached** shared TM has exact hit from other actor → modal confirm (re-enabled after attach-bases).

### Deferred shared TM writes

Pending stack with configurable delay; send/cancel all or per item; auto-flush top when timer expires if unchanged.

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

## UI (minimal) — locked IA

### `/projects` (variant A)

Two blocks on one page:

1. **Проекты** — personal bilingual copies (open editor as today); optional badge if bound to a job.
2. **Общие работы** — job cards (all roles). Click → **job hub**.

### Job hub (`/jobs/:id`)

- Members, invites, per-member dual progress, transfer owner (owner).
- Translator/owner: open linked project; **create project** (DOCX / empty); import `.tcat.zip` then bind.
- Viewer/boss: stats + **final result download** (no project required).
- Resources / attach UI — when J2 attach ships.

### Chrome

- Header control: **paste invite link** (full URL or raw token) → same accept flow as `/job-invite/:token`.

### Join

- Primary: accept membership **without** local project → job hub.
- Optional: import / create / bind project from invite UI or hub; fingerprint warn on bind.

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
