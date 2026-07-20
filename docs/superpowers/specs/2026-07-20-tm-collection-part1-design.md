# TM collection — Part 1 (browse / pick / attach / detach / delete own)

Date: 2026-07-20  
Status: Approved  
Related: [`2026-07-20-job-tm-attach-only-design.md`](./2026-07-20-job-tm-attach-only-design.md)

## Goal

Give the user a **global TM collection** and a clear way to **attach / detach** bases to projects and jobs, without mixing “collection” with “attached to this context”.

## Part 1 scope

**In**

1. Ensure a **default personal TM** exists on first login / first open of collection.
2. Global **collection dialog** (`browse`) — entry on Projects page.
3. Project / job bases dialog — **only attached** bases: stats, R/W, **−** (detach).
4. **+** opens mini **picker** (`pick`): click to attach; button opens full collection.
5. If full collection was opened from project/job flow, **closing returns** to the project/job bases dialog.
6. **Delete own** base from collection — with confirmation (“delete for me”). Default personal TM is **cleared and kept** (same id), not removed forever.

**Out (later parts)**

- Create / Import / Clone UI
- ACL Export / Clone / Edit (all members vs per-person)
- Server `job_tm_attachments` API (Part 1: client mirror / stub for jobs)
- Leave someone else’s shared base; revoke for sharees
- Auto-attach default TM to every new project

## UX model (Approach A)

One collection component, two modes:

| Mode | Entry | Behavior |
|------|--------|----------|
| `browse` | Projects page button | Full collection: stats, delete own + confirm |
| `pick` | **+** in project/job bases dialog | Compact squares; click = attach (default R+W); already attached = marked / disabled |
| `browse` + `returnTo` | “Full list” inside `pick` | Same full UI; close → reopen project/job bases dialog (picker closes) |

### Surfaces

| Surface | Shows | Actions |
|---------|--------|---------|
| Projects page | Button “TM bases” | Open `browse` (no `returnTo`) |
| Project chip strip | Attached chips + **+** | Chip click = detach; **+** opens project bases dialog |
| `ProjectTmBasesDialog` | Attached only | R/W, **−** detach, **+** → `pick` |
| Job “Memories” | Same pattern as project | Same actions; persist = client stub until API |
| `TmCollectionDialog` | Entire collection | `pick` attach / `browse` delete |

### Navigation stack

```text
[project|job bases] → [pick] → [browse + returnTo]
Close browse with returnTo → [project|job bases]
Close browse from Projects page → nothing else
```

## Data

### Project attachments

`ProjectMeta.tmAttachments`: presence in the array = attached.

```ts
interface ProjectTmAttachment {
  id: ProjectTmAttachmentId
  canRead: boolean
  canWrite: boolean
}
```

- Drop `connected`. Migrate on read: `connected: true` → keep entry; `connected: false` or missing → omit; missing array → `[]`.
- New projects start with **empty** attachment list (default TM lives in collection only).
- Editor match/write: only attached bases with R / W (existing helpers updated for presence-in-list).

### Collection

- MVP catalog: one default personal TM (`personal-tm`), ensured on login or first collection open.
- Units: existing personal TM IndexedDB store.
- **Delete own (default personal):** clear all units + detach from all local projects (and job stub attachments); **keep** the default base id in the collection (empty shell).
- Catalog item fields: `id`, label, color, glyph — extensible later without Create UI in Part 1.

### Jobs

- Same UX as projects in Part 1.
- Persistence: local client mirror / in-memory until `job_tm_attachments` (Part 2). Spec must not block UI on missing API.

## Delete confirmation (own base)

Confirm copy includes:

- Base name
- Unit count
- That it will detach from N local projects/jobs for **this user**
- That delete is **for me** (not destroying others’ copies — N/A for personal-only MVP, but wording stays honest)

Default personal: after confirm → clear + detach; base remains in collection empty.

## Components (implementation sketch)

| Component | Change |
|-----------|--------|
| `TmCollectionDialog` | New: modes `pick` \| `browse`, optional `returnTo`, attach / delete |
| `ProjectTmBasesDialog` | Attached-only cards; **−**; **+** opens pick; remove “Connected” switch |
| `ProjectListItem` | Chips = attached list; chip = detach; wire dialogs |
| `ProjectsPage` | Button → collection `browse` |
| `JobMemoriesPanel` | Mirror project attach UX (stub store) |
| `projectAttachments.ts` | Normalize without `connected`; attach / detach helpers; ensure default TM |

## Error / edge cases

- Attach already-attached → no-op / show as attached in pick.
- Detach last base → empty state + hint to use **+**.
- Delete while editor open → next match/write sees empty / detached (reload units).
- Offline: attach/detach/delete own on **local** data OK for Part 1; no cloud ACL yet.

## Success criteria

- User can open full collection from Projects page.
- User can attach a base to a project via **+** → pick → click.
- User can open full collection from pick and return to project bases dialog.
- **−** removes base from project/job list without deleting units.
- Delete own from collection asks confirm, clears personal TM, detaches everywhere locally, base stays in collection.
- No auto-attach on new projects.

## Follow-ups (not Part 1)

1. Part 2 — `job_tm_attachments` API + sync  
2. Part 3 — Create / Import / Clone  
3. Part 4 — ACL Export/Clone/Edit (all vs per-member) on shared works  
4. Leave / forget shared bases; revoke for sharees  
