# Auth API + landing (auth-first)

Date: 2026-07-14

## Goal

Ship account auth and a public landing presentation. All CAT features require login. No guest mode.

## Product rules

- `/` — landing only (brand, short pitch, login / register).
- `/projects` and `/project/:id` — JWT required; otherwise redirect to `/`.
- Logout → landing. Local data for that account stays in its IndexedDB scope.
- No Telegram / password-reset / cloud TM in this slice.

## Identity

- `users.id` = UUID (opaque public account id). No serial ints in the SPA.
- JWT `sub` = UUID. `/auth/me` returns `{ id, login, is_admin }`.
- IndexedDB DB names scoped by that UUID (not by login).

## API

| Method | Path | Notes |
|--------|------|--------|
| GET | `/api/health` | `{ ok: true }` |
| POST | `/api/auth/register` | creates user, returns JWT |
| POST | `/api/auth/login` | bumps `session_version`, returns JWT |
| GET | `/api/auth/me` | needs Bearer |
| POST | `/api/auth/logout` | bumps `session_version` |

JWT HS256 claims: `sub`, `login`, `sv`, `exp`. Middleware rejects mismatched `sv`.

## Stack

- Go API + Postgres (`api/`, `docker-compose.local.yml`)
- Vue SPA: auth client, router guards, landing, per-account IDB
