# Plan entitlement (free / Pro) Implementation Plan

> **For agentic workers:** Execute task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Add `subscriptions` table, expose effective `plan` / `plan_status` on auth responses, client `isPro` + Pro badge — no CAT gating.

**Architecture:** Identity stays on `users`; entitlement is one `subscriptions` row per user created at register. API derives effective plan; JWT unchanged. Client reads `user.plan` only.

**Tech Stack:** Go + Postgres (goose migrations), Vue 3 + Vitest, existing auth package.

**Spec:** `docs/superpowers/specs/2026-07-16-plan-entitlement-design.md`

## Global Constraints

- `is_admin` must never imply Pro
- New users default `free` / `active`; free is unrestricted in this slice
- No Stripe SDK / webhooks / paywall UI
- Kill-switches in `features.ts` stay orthogonal to plan

## File map

| File | Role |
|------|------|
| `api/migrations/006_subscriptions.sql` | Table + backfill free for existing users |
| `api/internal/auth/subscription.go` | Types + `EffectivePlan` / `EffectivePro` |
| `api/internal/auth/subscription_test.go` | Unit tests for effective plan |
| `api/internal/auth/store.go` | Tx create user+sub; load/join/ensure sub |
| `api/internal/auth/handlers.go` | `PublicUser.plan` / `plan_status` |
| `api/internal/auth/handlers_integration_test.go` | Assert register → free |
| `src/auth/api.ts` | `AuthUser` fields |
| `src/auth/plan.ts` | `isPro` |
| `src/auth/session.ts` | expose `isPro` |
| `src/App.vue` | Pro badge |
| `src/i18n/locales/{ru,en}.ts` | badge label |
| `tests/auth/plan.test.ts` | client `isPro` |
| `tests/utils/actorLabel.test.ts` | add plan fields to fixture |

---

### Task 1: Migration + effective-plan helper

**Files:** create migration, `subscription.go`, `subscription_test.go`

- [ ] Add `006_subscriptions.sql` (table + checks + backfill)
- [ ] Implement `EffectivePlan` / `EffectivePro`
- [ ] Unit tests pass: `go test ./internal/auth/ -run Effective -count=1`
- [ ] Commit

### Task 2: Store + handlers

**Files:** `store.go`, `handlers.go`, integration test

- [ ] `CreateUser` in transaction inserts free subscription
- [ ] Finds load subscription; missing row → ensure free
- [ ] `toPublic` emits `plan` + `plan_status`
- [ ] Integration: register → me.plan == free (if DATABASE_URL set)
- [ ] Commit

### Task 3: Client + badge

**Files:** api/session/plan, App.vue, i18n, tests

- [ ] Types + `isPro` + `useAuth().isPro`
- [ ] Badge in topbar when Pro
- [ ] Vitest for `isPro`; fix AuthUser fixtures
- [ ] Commit
- [ ] Update PLAN.md §2 checkboxes

---
