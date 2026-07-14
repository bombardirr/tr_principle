# Project lock + cloud backup

Date: 2026-07-14

## Goal

Prevent two online sessions of the same account from editing the same project at once, and keep a recoverable `.tcat.zip` snapshot per project in the cloud (auto after save + manual upload).

## Product rules

- Hard lock when online: second client is **read-only** until the holder releases or TTL expires. No steal in MVP.
- Local **tab lease** stays for multi-tab on one browser; cloud lock for cross-device / multi-browser.
- Offline / API down: cloud lock skipped; tab lease still applies; edits stay local; backup retries when online.
- Backup = one current snapshot per `(user_id, project_id)` (overwrite). No version history.
- Auto upload after successful local `saveProject` (debounced) + manual «В облако» button.
- Restore from cloud on projects list (GET → unpack → IndexedDB).
- Project id remains the client UUID (`crypto.randomUUID()`); no separate cloud project registry beyond lock + backup rows.

## Lock

### Schema

```sql
CREATE TABLE project_locks (
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  project_id  UUID NOT NULL,
  holder_id   TEXT NOT NULL,   -- stable browser/tab id
  token       TEXT NOT NULL,   -- claim secret
  expires_at  TIMESTAMPTZ NOT NULL,
  PRIMARY KEY (user_id, project_id)
);
CREATE INDEX project_locks_expires ON project_locks (expires_at);
```

### API (JWT)

| Method | Path | Behavior |
|--------|------|----------|
| POST | `/api/projects/{id}/lock` | Body `{ holderId, token? }`. If no row or expired or same holder+token → upsert (issue/renew token), extend `expires_at`. Else `409` with `{ holderId, expiresAt }`. |
| DELETE | `/api/projects/{id}/lock` | Body/query `holderId` + `token`. Delete only if match. |

TTL ≈ 30s; client heartbeat ≈ 10s while editor is open and is cloud-lock leader.

### Client

- On editor open (online): try `POST` lock. Fail → `blocked` like tab lease (`leaseBlocked` / dedicated copy).
- Heartbeat renew while leader.
- On leave/unmount: `DELETE` (best-effort).
- Combine with tab lease: must win **both** local tab lease and cloud lock to write. Either failure → read-only.

## Backup

### Schema

Prefer filesystem under a data dir (size of DOCX+JSON); DB stores metadata:

```sql
CREATE TABLE project_backups (
  user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  project_id   UUID NOT NULL,
  updated_at   TIMESTAMPTZ NOT NULL,
  size_bytes   BIGINT NOT NULL,
  storage_path TEXT NOT NULL,  -- relative path under BACKUP_DIR
  PRIMARY KEY (user_id, project_id)
);
```

File bytes at `{BACKUP_DIR}/{user_id}/{project_id}.tcat.zip`. Env: `BACKUP_DIR` (default `/data/backups`).

### API (JWT)

| Method | Path | Behavior |
|--------|------|----------|
| PUT | `/api/projects/{id}/backup` | `Content-Type: application/zip` (or octet-stream). Max size e.g. 50 MiB. Overwrite file + metadata. |
| GET | `/api/projects/{id}/backup` | Stream zip, or `404` if none. |
| HEAD | `/api/projects/{id}/backup` | Optional: `Content-Length`, `Last-Modified` for UI without download. |

CORS: allow `PUT`, `DELETE`, `HEAD`. Raise HTTP timeout for backup routes (or global) above current 30s if needed for large files.

### Client

- Reuse `packProjectFile` / `unpackProjectFile`.
- After local save: debounce ~3–5s → `PUT`.
- Toolbar/projects: «В облако» → immediate `PUT`.
- Projects list: «Из облака» → `GET` → unpack → `saveProject` (confirm overwrite if local exists).
- Failures: silent retry on next save / notice on manual action.

## Security

- All routes behind auth middleware; always filter by authenticated `user_id`.
- Path traversal: `project_id` must be UUID; storage path built only from UUIDs.
- Do not log JWT or file contents.

## Out of scope

- Lock steal / force unlock UI  
- Multi-version backup history  
- Bidirectional live project sync (segment-level)  
- Sharing projects across users  

## Success criteria

- Device A editing → device B same project is read-only until A leaves or TTL ends.
- After save (or manual), GET backup from another browser restores the same DOCX + segments.
- User B’s JWT cannot read/write user A’s lock or backup.

## Implementation order

1. Migration + lock API + tests  
2. Client cloud lock wired with tab lease  
3. Backup storage + PUT/GET + tests  
4. Client auto/manual upload + restore UI  
5. CORS/timeout + PLAN checkboxes  
