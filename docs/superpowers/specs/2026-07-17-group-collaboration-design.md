# Group collaboration (shared projects + TM attach) — design

Date: 2026-07-17  
Status: **Superseded**  
Superseded by: [`2026-07-17-shared-work-jobs-design.md`](./2026-07-17-shared-work-jobs-design.md)  

> Product direction changed: translators keep **personal bilingual copies**; live sharing is **TM/glossary resources** + a **job** card — not one shared segment grid with locks. Keep this file only as historical context for invites/TM ACL ideas.

Slice: Phase F — F0 spec (F1 → F2.0 → F2.1); F3 / glossary C2 referenced, not fully specified here

## Goal

Enable **multiple accounts** to work on one **cloud project** the way CAT tools expect: invite links, roles, presence, editing locks, project sync, and **translation memories attached to the project** with independent read / write / export / clone permissions.

Personal cloud TM (today) and personal glossary (C1) stay. Shared work does **not** mean “one login for two people.”

## Industry alignment (what we copy vs skip)

| Practice | Industry | Our choice |
|----------|----------|------------|
| Shared **project** first, team TM second | Common (Phrase / memoQ / Trados cloud) | **Yes** — F2 before full F3 |
| Roles owner / editor / viewer | Standard | **Yes** |
| Invite by email | Very common in CAT | **Later** (no mailer yet) |
| Invite **link** with role, TTL, max uses, revoke | SaaS norm (Notion / Figma / Slack) | **Yes** — primary invite path |
| Named (user-bound) invites | Common | **Yes** |
| Project-level exclusive lock | Simpler tools / checkout | **F2.0** |
| Segment / paragraph lock + presence avatars | Stronger collab / modern CAT-ish | **F2.1** (same spec, next step) |
| Project TM + attachable TMs | Standard | **Yes** |
| Separate **update TM** vs **export** | Standard (IP protection) | **Yes** — plus in-app **clone** |
| Realtime OT/CRDT | Rare in CAT MVP | **No** — sync + locks |
| Email in audit / TM authors | Avoided here already | **Keep** nick / `anon:id` only |

## Product rules

- **Path B from PLAN:** shared cloud project + members. File handoff (F1) remains as a lightweight alternative.
- **Roles:** `owner` \| `editor` \| `viewer`.
  - `owner`: full project settings, invites, members, TM attach permissions, delete/transfer later.
  - `editor`: edit when holding a write lock; cannot change dangerous project/TM ACL unless owner allows later (MVP: only owner edits attach ACL).
  - `viewer`: read-only always.
- **One write surface at a time (phased):**
  - **F2.0:** at most one **project** write lock among members who may edit.
  - **F2.1:** write locks at **block/segment** granularity; multiple editors on different units; presence avatars on busy units.
- **Presence:** show who is in the project (and in F2.1 who holds which segment lock). Display **avatar / nick / incognito color** — never email.
- **TM model (correct from day one):**
  - Every shared project has a **project TM**.
  - Additional memories attach via `project_tm_attachments` with flags: `canRead`, `canWrite`, `canExport`, `canClone` (orthogonal).
  - Defaults on create: project TM → members with edit rights get Read+Write; **Export and Clone only owner** unless changed.
  - A member’s **personal TM is not auto-attached**; opt-in attach with chosen flags.
  - Matching uses all attachments with `canRead`. Confirm/autosave writes only to attachments with `canWrite`.
  - **Export** (TMX file) requires `canExport` on that attachment.
  - **Clone** (server-side copy into the member’s personal TM) requires `canClone`. This is the industry-shaped “take a permanent copy without file ping-pong,” separate from file export.
- **Privacy:** no email in segment audit, TM `createdBy`, or presence UI.
- **Personal TM / glossary do not leak** into the project unless explicitly attached (TM) or later C2 (glossary).

## Non-goals (this phase)

- SMTP / email invites (link invites only until mailer exists)
- Shared password / one account for two people
- OT/CRDT realtime cursors
- Full multi-TM priority UI (weights, penalties) — simple stable order is enough for F2
- Glossary project attach (**C2**, after or with F2 when members exist)
- Billing seats / per-member plan gating
- Steal-proofing against manual copy from the variant picker (impossible if Read is granted)

## Typical scenario

1. Owner creates/opens a project → cloud project row + **project TM**.
2. Owner creates an invite link (role, TTL, max uses, optional named user) → shares URL.
3. Colleague signs in → accepts invite → becomes member.
4. Editors take a write lock (project-wide in F2.0; segment in F2.1); others see presence / read-only where locked.
5. Confirmed segments sync to the cloud project; TM writes go only to attachments with `canWrite` (usually project TM).
6. If owner grants `canClone` on a corporate/personal TM attachment, a member may **pull a permanent copy** into their personal TM without TMX file exchange.
7. Mass TMX download only with `canExport`.

## Phased delivery (one spec, staged code)

| Stage | Delivers |
|-------|----------|
| **F1** | “Share project” → download `.tcat.zip` + short import hint; preserve audit/TM actors on import |
| **F2.0** | Cloud project registry, members, invite link types, project sync, **project lock**, project presence, project TM, TM attachments + R/W/Export/Clone |
| **F2.1** | Segment/block locks + avatars on busy units; project-wide lock becomes optional fallback or removed for editors |
| **F3** (outline only) | Richer team/workspace TM catalog; still uses same attachment permission model |
| **C2** (separate) | Project glossary attach — entry schema unchanged; ownership/ACL like TM attach |

---

## Data model

### `projects` (cloud registry)

Source of truth for shared work. Local IndexedDB remains a **cache** per member.

| Column | Notes |
|--------|--------|
| `id` | UUID (may equal today’s client project id when “promoting” local → cloud) |
| `owner_user_id` | FK users |
| `name` | Display name |
| `source_lang` / `target_lang` | From meta |
| `meta` | JSON (threshold, settings subset — no secrets) |
| `created_at` / `updated_at` | |

Solo users today keep working locally + backup; **promoting** or creating cloud-shared projects is an explicit action (or first invite). Exact UX: implementation plan.

### `project_members`

| Column | Notes |
|--------|--------|
| `project_id` | FK |
| `user_id` | FK |
| `role` | `owner` \| `editor` \| `viewer` |
| `joined_at` | |

Unique `(project_id, user_id)`. Exactly one `owner` (or owner always = `projects.owner_user_id` and mirrored in members — pick one in implementation; prefer single source: `projects.owner_user_id` + members without duplicate owner row **or** members includes owner with role owner).

**Decision:** `projects.owner_user_id` is canonical; members table includes the owner row with `role=owner` for uniform listing.

### `project_invites`

Industry-shaped link invites:

| Column | Notes |
|--------|--------|
| `id` | UUID |
| `project_id` | FK |
| `token_hash` | Store hash only; raw token in URL once |
| `role` | Role granted on accept (`editor` \| `viewer`; owner not via invite) |
| `created_by` | user id |
| `expires_at` | NULL = no expiry; **editable** at create/update for expiring links |
| `max_uses` | NULL = unlimited; `1` = classic single-use “burns” |
| `uses_count` | Increment on accept |
| `invited_user_id` | NULL = open link; set = **named** invite (only that account may accept) |
| `revoked_at` | NULL or set on revoke |
| `created_at` | |

**Link types (product names):**

1. **Open reusable** — `max_uses` null, optional TTL  
2. **Burning (N uses)** — `max_uses = N` (UI default N=1), optional TTL  
3. **Named** — `invited_user_id` set; burning or not via `max_uses`; optional TTL  
4. **Revoked / expired** — accept rejected  

Owner can list, edit TTL/max_uses (where not yet exhausted), revoke, reissue.

### Project payload sync

Not only zip backup: sync **segments + project meta** (and refs needed to open the editor). DOCX binary may remain backup-style blob or sync separately — implementation plan chooses; product rule: **members see the same segment state**.

Conflict policy:

- **F2.0:** only lock holder writes → no concurrent segment writers.  
- **F2.1:** reject or LWW write if segment lock held by someone else; never silent clobber of another editor’s in-progress segment.

### Locks

**F2.0 — project lock** (evolve today’s `project_locks`):

- Keyed by `project_id` (not `user_id + project_id` alone).  
- Holder must be a member with `owner` or `editor`.  
- Viewers never acquire write lock.  
- Heartbeat + TTL as today; no steal in MVP (wait or ask owner offline process later).

**F2.1 — segment/block lock:**

- Rows `(project_id, segment_id, holder_user_id, holder_client_id, expires_at)`.  
- “Block” = paragraph group or single segment — implementation picks one; default **segment** for precision.  
- Presence UI: avatar on locked rows; list of online members in chrome.

### TM stores

- **Personal TM:** existing `tm_units` / user-scoped sync — unchanged.  
- **Project TM:** units keyed by `project_id` (new table or `tm_units` + nullable `project_id` + ownership rule). Prefer **separate `project_tm_units`** (or `tm_units` with `scope=user|project` + `project_id`) so personal sync cannot accidentally pull project rows.

### `project_tm_attachments`

| Column | Notes |
|--------|--------|
| `project_id` | FK |
| `tm_ref` | Discriminator: `project` (the built-in project TM) \| `user` + `user_id` (that user’s personal TM) \| future `workspace` |
| `can_read` | bool |
| `can_write` | bool |
| `can_export` | bool |
| `can_clone` | bool |
| `created_at` / `updated_at` | |

Only **owner** changes attachment flags in F2 (editors do not self-grant Export/Clone on corporate TM).

**Clone behavior:** authenticated member with `canClone` triggers server job/API that copies allowed units into **their personal TM** (new ids, attribution preserved as original authors / opaque ids). Does not remove source. Rate-limit clone.

**Export behavior:** TMX download of that attached memory only if `canExport`. Audit log optional later.

---

## Flows

### F1 — file share

1. Owner (or any local project user): Share → download `.tcat.zip`.  
2. Short copy: import in the other account via existing project import.  
3. Preserve `audit[].by` and TM actors (nick / anon).  
4. No shared TM, no members.

### Invite accept

1. Signed-in user opens `/invite/{token}` (or query).  
2. Server validates hash, expiry, max uses, named user, not revoked.  
3. Inserts `project_members`, increments uses.  
4. Client pulls project into IDB cache and opens it.

### Editing (F2.0)

1. Open shared project → presence heartbeat.  
2. Try project write lock if role allows.  
3. On success: edit + push segment sync.  
4. On failure: read-only; show who holds the lock (nick/avatar).

### Editing (F2.1)

1. Same presence.  
2. On focus/edit of a segment: acquire segment lock; show avatar on that row.  
3. Other members may edit other free segments.  
4. Leaving segment / idle TTL releases lock.

### TM match / write / export / clone

1. Match: union of attachments with `canRead` (deterministic order: project TM first, then attachments by created_at).  
2. Write on confirm: all attachments with `canWrite` (or only primary writable — **Decision:** write to **all** `canWrite` attachments that match lang pair, matching common “update all writable TMs”; document in UI).  
3. Export / Clone: gated per attachment flags.

---

## API (sketch)

Auth: JWT. Authorize via membership + role + attachment flags.

| Area | Endpoints (indicative) |
|------|-------------------------|
| Projects | `POST /api/projects`, `GET /api/projects`, `GET/PATCH /api/projects/{id}` |
| Members | `GET /api/projects/{id}/members`, `DELETE …/members/{userId}` |
| Invites | `POST …/invites`, `GET …/invites`, `PATCH …/invites/{id}`, `POST …/invites/{id}/revoke`, `POST /api/invites/accept` |
| Sync | `GET/POST /api/projects/{id}/sync` (segments+meta since/cursor) |
| Lock | `POST/DELETE /api/projects/{id}/lock` (F2.0); later `…/segments/{segId}/lock` |
| Presence | `POST /api/projects/{id}/presence` (heartbeat), `GET …/presence` |
| TM attach | `GET/POST/PATCH/DELETE …/tm-attachments` |
| TM IO | `POST …/tm-attachments/{id}/export`, `POST …/tm-attachments/{id}/clone` |

Backup zip may remain for disaster recovery; shared editing truth is **sync**, not zip overwrite among members.

---

## UI (minimal)

- Projects list: badge “Shared” / member count.  
- Project settings: members, invites (create link types, TTL, max uses, copy URL, revoke), TM attachments + four checkboxes (Read/Write/Export/Clone) with plain-language warnings on Write/Export/Clone for non-project TMs.  
- Editor chrome: presence strip; lock banner; F2.1 avatars on segments.  
- F1: Share menu entry → zip + hint.  
- No email shown in member list — nick + optional avatar; email only in account settings for the signed-in user.

## Attribution

Unchanged rule: store and show `display_name` or `anon:{userId}` + color — **never email** — in audit, TM, presence, invites UI (invitee email may be used only server-side for named invites if we later add email; until then named invite = pick existing user id / share link after they register).

**Named invites without email (MVP):** create named invite only for a user id the owner already knows (e.g. paste user id — bad UX) **or** defer named-to-user until search-by-nick; **open + burning links ship first**. Named invites in schema from day one; UX can start with open/burning only.

---

## Testing

- Invite: accept, expire, max_uses, revoke, wrong user on named invite.  
- ACL: viewer cannot lock/write; editor cannot change attach flags; export/clone 403 without flags.  
- Lock: second editor read-only (F2.0); two editors different segments (F2.1).  
- TM: match respects canRead; write respects canWrite; clone copies into personal TM only.  
- Privacy: API responses for members/presence omit email.  
- F1: zip round-trip preserves audit actors.

## Success criteria

- [ ] Spec covers F1 + F2.0 + F2.1 contracts without TBD on roles, invites, TM permissions, lock phases  
- [ ] Implementation can ship F1 without cloud members  
- [ ] F2.0 enables real second-account editing on one project with project TM  
- [ ] Export/Clone cannot be done by a Read-only collaborator  
- [ ] Schema ready for F3 / C2 without renaming core permission flags  

## Relation to PLAN.md

Replaces the open “F0 — спека” checklist with this document. Implement in order **F1 → F2.0 → F2.1**; then F3 / C2. Do not implement OT/CRDT in MVP.
