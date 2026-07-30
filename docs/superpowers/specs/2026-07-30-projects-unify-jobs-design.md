# Unify projects = former shared works (jobs) — design

Date: 2026-07-30  
Status: Implemented  
Supersedes (product IA): dual list «Проекты | Общие работы» in [`2026-07-17-shared-work-jobs-design.md`](./2026-07-17-shared-work-jobs-design.md)  
Keeps (collaboration semantics): personal bilingual copies + live shared TM/glossary — same doc  
Related: [`2026-07-27-pro-keys-quota-design.md`](./2026-07-27-pro-keys-quota-design.md), [`2026-07-14-project-lock-backup-design.md`](./2026-07-14-project-lock-backup-design.md)

## Goal

One product entity named **проект**: cloud card + members + invites + attached resources, with each translator’s segments in a **personal local** bilingual. Remove the separate local-only projects list and the «Сделать общей работой» step. Rename HTTP/API from `jobs` → `projects`; move solo backup/lock off `/api/projects` to avoid collision.

Data loss for existing jobs / unbound local projects is **acceptable** (solo pre-users).

## Why

- Two lists and a promote-to-shared action duplicated one concept.
- Industry names the unit «project»; collaboration is a property (roster), not a second object type.
- Hub-first UI already matches freelance/LSP practice better than a flat local file list.

## Collaboration model (locked — not Google Docs)

| Do | Do not |
|----|--------|
| Each member has their own bilingual (IndexedDB) | One shared segment grid / co-edit |
| Sync **TM and glossaries** when attachments allow Read/Write | Auto-insert a colleague’s target into your row |
| After someone else confirms into a shared writable TM, you can see a fresh exact/context (≥100%) **suggestion to pick** | Live cursors, presence, or activity chrome in the editor |
| Soft warn on confirm if shared exact hit authored by someone else (existing behavior) | Hard-block or force-accept |

«Co-edit одной сетки» is listed only as an explicit **non-goal** (past F2.0 mistake), not as planned work.

## Product rules

### Entity

- **Project** (API/DB: former `job`) = cloud card: owner, members, roles, invites, lang pair, fingerprint, original DOCX, TM/glossary attachments, per-member progress.
- **Local bilingual** = personal package bound to that project when the member translates. Not shown as a parallel top-level list.
- Membership does **not** require a local bilingual (viewer/boss).
- Solo project = roster of one (you). Invite/remove anytime.

### IA (`/projects`)

- Single list: former «Общие работы» UI, copy renamed to «Проекты».
- Click → **hub** (former job hub). Not straight into editor.
- Create → always cloud project + owner local bilingual (if translating) → **open hub**.
- Remove: local projects section, «Сделать общей работой», editor entry that creates unbound local-only projects as first-class list items.
- Invite routes: `/project-invite/:token` (replace `/job-invite/:token`).

### Create (auth required)

1. Title + lang pair; optional DOCX / empty / import path as today for shared-work create.
2. `POST /api/projects` → you are owner/member.
3. Create/bind owner local bilingual when applicable.
4. Land on hub.

### Editor

- Open from hub (or deep-link if already a member with a bound local copy).
- No shared-work promote CTA.

### Storage / quota (unchanged semantics)

- Source of truth for segments: **local** IndexedDB.
- Cloud quota counts: package **backups** + **owned project originals** (former job originals).
- Free 50 MiB / Pro 50 GiB; over limit → `507` on upload; read/delete OK; local edit unrestricted; free over-quota grace + purge of oldest backups per existing Pro design.
- Offline: edit existing local bilingual; create/invite/resource sync need network + session.

### Migration / breaking

- Drop or replace `jobs` / `job_*` tables with `projects` / `project_*` via new goose migrations (no preserve-data requirement).
- Relocate backup/lock handlers off current `/api/projects/{id}/backup|lock`.
- No migration of orphan IDB projects; ignore or wipe locally in release notes.

## API rename

| Was | Becomes |
|-----|---------|
| `/api/jobs…` (collab) | `/api/projects…` (same handlers, new paths) |
| `/api/projects/{id}/backup`, `/lock` | `/api/backups/{id}` … (and lock under backups or `/api/backups/{id}/lock`) |
| Client `jobId`, types `Job`, i18n «общая работа» | `projectId`, `Project` (collab), UI «проект» |
| Go package `internal/jobs` | Prefer `internal/collabproject` or reuse/rename to `internal/projects` **if** backup code moves to `internal/backups` — avoid two meanings of `projects` in one package |

Handler behavior (members, invites, original, attachments, progress) stays equivalent; only naming and mount paths change. Old `/api/jobs` and old backup paths → **404**.

## Non-goals

- Shared bilingual / segment-grid co-edit / OT / presence
- Preserving existing job or unbound local project data
- Renaming every historical doc/commit; this spec is the IA source of truth going forward
- Changing Pro pricing or quota numbers
- Auto-apply TM hits from colleagues

## Typical flows

**Solo:** create project → hub (you only) → open editor → work locally → optional cloud backup within quota.

**Team:** owner creates → invites → members accept → each binds/creates own bilingual → attach shared TM → confirms write to shared TM → peers see suggestions on lookup, not forced fills.

## Verification

- Create → hub with one member → editor → invite second user.
- `/projects` has no second local-only list; strings say проект, not общая работа.
- Backup/lock on new paths; quota `507` still enforced.
- Former `/api/jobs` and `/api/projects/.../backup` return 404.
- Colleague confirm into shared TM → peer can pick ≥100% suggestion; nothing auto-inserted; no peer activity UI in the grid.
