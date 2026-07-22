# Plan entitlement (free / Pro) — design

Date: 2026-07-16  
Status: Implemented (main)  
Slice: cloud MVP closeout §2 (contract + UI; no paywall)

## Goal

Introduce an industry-shaped **billing entitlement** layer so free vs Pro is real in the data model and API, without Stripe or feature limits yet. New users are **free** and currently **unrestricted** (full CAT). Admin stays a separate RBAC flag.

## Product rules

- **Identity ≠ plan.** `users.is_admin` is ops/RBAC only. It does **not** grant Pro.
- **Entitlement source of truth:** table `subscriptions` (one current row per user).
- New registration → subscription `plan=free`, `status=active`.
- Effective Pro: `plan = 'pro'` **and** `status IN ('active', 'trialing')`.
- Free users: same product surface as today (no gated CAT / TM / backup in this slice).
- UI: show a Pro badge when effective Pro; no upgrade CTAs / paywalls in this slice.
- Manual grant (dev/ops): SQL upsert on `subscriptions` (no admin UI yet).
- Kill-switches in `src/features.ts` remain **orthogonal** to plan (e.g. concordance).

## Non-goals (this slice)

- Stripe (or any provider) SDK, Checkout, Customer Portal, webhooks
- Soft limits, quotas, trial UX, invoices
- Server middleware rejecting free on TM/lock/backup
- Team / seats / multiple concurrent subscriptions
- Promote-to-admin or grant-Pro UI
- Mapping `is_admin → plan` (explicitly forbidden)

Later billing fills nullable provider columns and updates `plan` / `status` via webhooks; client contract stays the same.

## Data model

### Unchanged: `users`

Keep existing columns (`id`, `email`, `password_hash`, `session_version`, `is_admin`, `display_name`, `telegram_id`, `created_at`). **Do not** add `plan` on `users`.

### New: `subscriptions`

One row per user (current entitlement). Create on register in the same transaction as the user insert.

| Column | Type | Notes |
|--------|------|--------|
| `user_id` | UUID PK → `users(id)` ON DELETE CASCADE | Exactly one row per user |
| `plan` | TEXT NOT NULL | Check: `free` \| `pro` |
| `status` | TEXT NOT NULL | Check: `active` \| `trialing` \| `past_due` \| `canceled` \| `inactive` |
| `current_period_end` | TIMESTAMPTZ NULL | Unused in UI now; reserved |
| `provider` | TEXT NULL | e.g. `stripe` later |
| `provider_customer_id` | TEXT NULL | |
| `provider_subscription_id` | TEXT NULL | |
| `updated_at` | TIMESTAMPTZ NOT NULL DEFAULT now() | Bump on every write |

Defaults for new users: `plan='free'`, `status='active'`, provider fields null.

Indexes: PK on `user_id` is enough for MVP. Optional unique on `(provider, provider_subscription_id)` where not null — **skip** until Stripe.

### Effective plan (server helper)

```text
effectivePro(sub) =
  sub.plan == 'pro' && sub.status in ('active', 'trialing')

effectivePlan(sub) =
  effectivePro(sub) ? 'pro' : 'free'
```

If a user somehow has no subscription row (legacy): treat as `free` / `inactive` and repair with upsert on next login/me (defensive). Prefer always creating the row at register so this path is rare.

## API

### Public user JSON (login / register / me)

Extend existing payload:

```ts
{
  id: string
  email: string
  display_name: string
  is_admin: boolean
  plan: 'free' | 'pro'          // effective plan (derived)
  plan_status: SubscriptionStatus // raw status from subscriptions row
}
```

- `plan` is **effective** (canceled Pro → API reports `plan: 'free'` with `plan_status: 'canceled'` so the client can show “expired” later without a second round-trip).
- For this slice UI only needs `plan === 'pro'` for the badge; still return `plan_status` so we do not change the wire shape when billing arrives.
- JWT claims: **unchanged** (no plan in token). Entitlement is read from DB on `/me` and on auth responses after login/register. Avoid stale plan in long-lived JWTs.

### Register

In one DB transaction:

1. Insert `users`
2. Insert `subscriptions` (`free` / `active`)
3. Issue JWT as today
4. Return public user including `plan` / `plan_status`

### Login / me / patch me

Load user + subscription; return public user with derived fields. `PATCH /auth/me` does not accept plan changes.

### No new HTTP routes in this slice

Grant/revoke Pro via SQL only until billing or admin tools exist.

## Client

### Types

Extend `AuthUser` with `plan` and `plan_status`.

### Helpers

- `isPro(user): boolean` → `user?.plan === 'pro'`
- Expose `isPro` from `useAuth()` (computed from current user)
- Do **not** use `is_admin` for product entitlement
- Keep `FEATURE_*` in `features.ts` as code kill-switches only

### UI

- Small badge «Pro» next to display name in the topbar and/or account settings when `isPro`
- No upgrade button, no disabled menus for free in this slice

### Offline

Plan comes from last successful auth/me payload in memory/session. No separate IndexedDB entitlement cache required for MVP (badge may be wrong until next `/me` if SQL grant happened mid-session — acceptable).

## Tests

- Migration / store: register creates `subscriptions` row `free`/`active`
- Effective plan helper: pro+active → pro; pro+canceled → free; free+active → free; trialing pro → pro
- Auth JSON: `/me` (or handler unit) includes `plan` / `plan_status`
- Client: `isPro` true/false unit tests
- No E2E billing

## Manual ops

```sql
-- Grant Pro
UPDATE subscriptions
SET plan = 'pro', status = 'active', updated_at = now()
WHERE user_id = '<uuid>';

-- Revoke → free
UPDATE subscriptions
SET plan = 'free', status = 'active', updated_at = now()
WHERE user_id = '<uuid>';
```

Admin promote remains a separate SQL on `users.is_admin`.

## Relation to PLAN.md

Replaces the stub «admin = Pro» mapping in cloud MVP closeout §2. Implementation follows this spec; then continue closeout (TM toolbar polish → Word checklist → tag MVP).

## Success criteria

- [ ] New user has `subscriptions` row free/active; API reports `plan: "free"`
- [ ] Manual SQL grant → `/me` reports `plan: "pro"`; badge visible
- [ ] `is_admin` alone does not show Pro
- [ ] No CAT feature gated for free
- [ ] Provider columns exist and are unused
