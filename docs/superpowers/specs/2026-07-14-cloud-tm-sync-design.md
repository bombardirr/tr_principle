# Cloud TM sync (local-first replica)

Date: 2026-07-14

## Goal

Sync each account’s translation memory between browser IndexedDB and the server so the same user gets the same TM on another device or after a wipe. Matching stays **local** (not Trados-style online lookup).

## Product rules

- One cloud TM per `user_id` (all language pairs in one store; units already carry langs / `sourceKey`).
- IndexedDB remains the working copy for fuzzy/exact/fragment match and offline use.
- Postgres is the source of truth across devices for that account.
- Writes still happen only through existing local paths (autosave, save-to-TM, TMX import, reset deletes) — sync follows those writes.
- No team/shared TM, no multi-TM priority, no conflict UI, no Telegram in this slice.

## Sync model

**Incremental pull + push** with LWW on `updatedAt`.

| Direction | Trigger | Behavior |
|-----------|---------|----------|
| Pull | After successful login / auth bootstrap when online; opportunistic when coming back online | `GET` units with `updatedAt > since`; merge into IDB |
| Push | After local upsert or delete; also any units pending since last failure | `POST` batch of units (including tombstones) |

- Sync cursor `since` (ISO) stored in `localStorage` per account (`appzac-tm-sync-since:{userId}`).
- After a successful pull, set `since` to server response `until` (server clock), so the client does not skip or double-fetch mid-batch.
- Dirty set of unit `id`s in `localStorage` (`appzac-tm-sync-dirty:{userId}`): add on local write/delete; clear ids that the server accepted. No separate outbox payload — source of truth for push body is always the current IDB row.

### Deletes

Soft-delete / tombstones:

- Local reset that removes TM today becomes: set `deletedAt = now`, bump `updatedAt`, keep row until synced (or keep tombstone in IDB until pull confirms peers got it — see client merge).
- Server stores tombstones; pull returns them; client **hard-deletes** the local row (or keeps tombstone out of match lists).
- Matching (`listTmUnits` / match engine) **ignores** units with `deletedAt`.

### Conflicts

- Same `id`: higher `updatedAt` wins. Losing side is discarded (no merge of fields).
- Different `id` with same `sourceKey`: both may exist (already possible locally when target changes creates a new UUID). No unique constraint on `sourceKey` on server. Optional later: “prefer newest target per sourceKey for exact match” stays a client match concern.

## Data model

Extend `TmUnit`:

```ts
deletedAt?: string | null  // ISO; null/absent = active
```

Postgres:

```sql
CREATE TABLE tm_units (
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  id         UUID NOT NULL,
  source     TEXT NOT NULL,
  target     TEXT NOT NULL,
  source_key TEXT NOT NULL,
  source_lang TEXT,
  target_lang TEXT,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  deleted_at TIMESTAMPTZ,
  project_id TEXT,
  created_by TEXT,
  updated_by TEXT,
  context_before TEXT,
  context_after TEXT,
  PRIMARY KEY (user_id, id)
);
CREATE INDEX tm_units_user_updated ON tm_units (user_id, updated_at);
CREATE INDEX tm_units_user_source_key ON tm_units (user_id, source_key);
```

Wire format = JSON fields camelCase mirroring `TmUnit` (+ `deletedAt`).

## API (JWT required)

| Method | Path | Notes |
|--------|------|--------|
| GET | `/api/tm/sync?since=<iso>` | `{ until: string, units: TmUnit[] }` — units with `updated_at > since` for this user (include tombstones). Cap page size (e.g. 500); if truncated, client loops with `since = last.updatedAt` or use `cursor` — MVP: single page + `hasMore` + next `since`. |
| POST | `/api/tm/sync` | Body `{ units: TmUnit[] }`. For each: insert or LWW update by `(user_id, id)`. Response `{ accepted: string[], rejected: { id, reason, unit? }[] }` optional in MVP — at least `{ ok: true, until }` is enough if server always applies LWW silently. |

Auth: existing Bearer middleware; always scope SQL by authenticated `user_id`. Never trust client `userId` field.

## Client integration

| Area | Change |
|------|--------|
| `types/tm.ts` | `deletedAt?` |
| `tmIdb.ts` | tombstone on delete; filter deleted in list used by match; IDB version bump if needed |
| New `tm/sync.ts` + thin API in `auth/api.ts` or `tm/api.ts` | pull/push, dirty set, cursor |
| `session` / bootstrap | after login → `syncTm()` |
| `EditorPage` / IDB writers | after upsert/import/delete → mark dirty → `pushTm()` (debounce 1–2s) |
| Match | skip `deletedAt` |

Failure: silent retry on next trigger; optional later banner (“TM sync offline”) — **not required** for this slice.

## Out of scope

- Server-side TM search / apply
- Full-database snapshot replace as primary protocol
- Project lock / backup
- Admin TM browser
- SMTP / Telegram password reset

## Success criteria

- Login on device B after translating on A → matching finds the new units.
- Delete (segment reset clearing TM) on A → after sync, unit gone (or ignored) on B.
- Offline edit then online → units eventually appear on server without user action beyond remaining logged in / refreshing.
- Another user’s JWT cannot read or write these rows.

## Implementation order

1. Migration + Go store/handlers + tests (LWW, auth scope, tombstones)
2. Client types + IDB tombstones + match filter
3. Sync client (pull on login, dirty push)
4. Wire writers; smoke two-browser / clear-site-data check
