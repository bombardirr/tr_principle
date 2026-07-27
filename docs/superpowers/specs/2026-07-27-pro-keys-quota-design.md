# Pro keys + cloud quota — design

Date: 2026-07-27  
Status: Implemented  
Related: `2026-07-16-plan-entitlement-design.md`

## Goal

Manual Pro sales via one-time keys; cloud storage quota as the only free/Pro gate; soft freeze when over free quota after Pro expires (no auto-purge in v1).

## Product rules

### Plans
- Effective Pro: `plan=pro` AND `status IN (active, trialing)` AND (`current_period_end` IS NULL OR `current_period_end > now()`).
- Lazy expiry on `/me` and before quota checks: if period ended → `status=canceled`.
- Admin ≠ Pro.

### License keys
- Table `license_keys`: `key_hash` (SHA-256 of full key), `key_hint` (non-secret preview), `sku`, `duration_days`, `status` (`unused`|`redeemed`|`revoked`), `note`, `created_by`, `redeemed_by`, `redeemed_at`, `created_at`.
- SKUs: `pro_1m` (30), `pro_3m` (90), `pro_6m` (182), `pro_12m` (365).
- Redeem (authed): single transaction — mark redeemed, extend subscription:
  - `base = max(now, current_period_end)` while still Pro
  - `current_period_end = base + duration`
  - `plan=pro`, `status=active`
- Plaintext never stored. Replay blocked by `unused` → `redeemed`. Forged client keys fail (no matching hash).

### Quota (cloud files only)
- Count: `SUM(project_backups.size_bytes)` + job originals for jobs owned by the user.
- Free: **50 MiB**. Pro: **50 GiB** soft cap.
- Over limit: `507 storage quota exceeded` on upload; read/download/delete OK.
- No auto-trim in v1.

### UI
- Settings: activate key; storage usage + delete cloud backups.
- Header: Pro days when ≤14 left; storage warn when ≥80%.
- `/pro`: as-is copy, periods.
- **Admin** (`is_admin`): Settings → «Ключи Pro» popup — generate, list, revoke unused, edit note.

## Generate a key (ops)

### Preferred: admin UI
1. Sign in as admin (`users.is_admin = true`).
2. Settings → account → **Ключи Pro**.
3. Pick period (SKU), optional note (buyer email / order), **Generate**.
4. Copy plaintext once → send to buyer.
5. Track status in the same dialog (unused / redeemed + email / revoked).

### CLI fallback (no UI / offline)
```bash
cd api
go run ./cmd/mklicense -sku pro_12m -note "buyer@example.com"
```
Prints `key`, `hint`, `hash`, and `INSERT` SQL. Run the SQL against prod Postgres. Send **only** the `key` line to the buyer.

### Grant Pro without a key (support)
```sql
UPDATE subscriptions
SET plan = 'pro', status = 'active',
    current_period_end = now() + interval '30 days',
    updated_at = now()
WHERE user_id = '<uuid>';
```

## API

| Method | Path | Who | Notes |
|--------|------|-----|-------|
| POST | `/api/auth/license/redeem` | user | `{ key }` |
| GET | `/api/auth/storage` | user | usage + backup list |
| DELETE | `/api/projects/{id}/backup` | user | remove cloud zip |
| GET | `/api/auth/license/keys` | admin | list + stats |
| POST | `/api/auth/license/keys` | admin | `{ sku, note? }` → includes `key` once |
| POST | `/api/auth/license/keys/revoke` | admin | `{ key_hash }` unused only |
| PATCH | `/api/auth/license/keys/note` | admin | `{ key_hash, note }` |
| GET | `/api/auth/me` | user | + `current_period_end`, storage fields |

## Migrations
- `022_drop_telegram_auth.sql` — drop Telegram tables
- `023_license_keys.sql` — license inventory

Applied automatically on API boot (`db.Migrate`).

## Non-goals (v1)
- Digiseller, SMTP, auto-purge cron, CAT feature paywall, TM/glossary in quota.
