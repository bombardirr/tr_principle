# Telegram link + password reset

**Date:** 2026-07-25  
**Status:** Approved (chat) — implementing

## Goal

Password reset without email: link Telegram account, send reset codes via `@appzac_bot`, confirm in SPA.

## Flow

1. **Link (logged in):** `POST /api/auth/telegram/link` → `{ deep_link, expires_at }`. User opens `t.me/appzac_bot?start=link_<token>`. Bot `/start` with payload binds `users.telegram_id`.
2. **Unlink:** `DELETE /api/auth/telegram` clears `telegram_id`.
3. **Reset request:** `POST /api/auth/password-reset/request` `{ email }` → always `{ ok: true }`; if user has `telegram_id`, send 6-digit code.
4. **Reset confirm:** `POST /api/auth/password-reset/confirm` `{ email, code, password }` → new hash + bump `session_version`.

## Webhook

`POST /api/telegram/webhook` — Telegram `secret_token` must match `TELEGRAM_WEBHOOK_SECRET`. On startup (if token set), `setWebhook` to `https://appzac.ru/api/telegram/webhook`.

## Env

- `TELEGRAM_BOT_TOKEN` (optional; feature off if empty)
- `TELEGRAM_WEBHOOK_SECRET` (required if token set)
- `TELEGRAM_BOT_USERNAME` (default `appzac_bot`)
- `TELEGRAM_WEBHOOK_URL` optional override (default derived from `CORS_ORIGIN` + `/api/telegram/webhook`)

## Security

- Rate limit request/confirm/link/webhook abuse
- Link tokens + reset codes: random, hashed at rest, short TTL (15m)
- No email enumeration on reset request
- Codes only to linked Telegram chats

## Out of scope

Separate bot process; email SMTP; changing email via bot.
