# Yandex Metrica (product analytics) — design

Date: 2026-07-24  
Status: Implemented (main pending deploy) — counter via `VITE_YANDEX_METRIKA_ID`; SPA hits + goals; no webvisor
Counter ID: **not in git** — `VITE_YANDEX_METRIKA_ID` / `.env.prod` only

## Goal

Product pageviews + funnel goals on appzac.ru (landing + SPA). Separate from Prometheus/Grafana ops.

## Non-goals

- Webvisor / session replay (PII on screen: email, translations)
- Cookie consent banner (unless hosting policy later requires it)
- Sending email, JWT, segment text, project contents

## Approach

1. Load official `tag.js` when `VITE_YANDEX_METRIKA_ID` is a non-empty numeric string (baked at SPA build).
2. Init: `clickmap`, `trackLinks`, `accurateTrackBounce`; **no** `webvisor`.
3. Vue Router `afterEach` → `ym(id, 'hit', url)` for SPA navigations.
4. Goals via `ym(id, 'reachGoal', name)` only:
   - `register`, `login`, `project_open`, `export_docx`
5. No ecommerce / dataLayer unless needed later.

## Deploy

`.env.prod`: `VITE_YANDEX_METRIKA_ID=…`  
Docker build args pass it into the frontend stage. Rebuild `app` after changing the ID.

## Metrika UI

Create matching **Goals** (JavaScript event / reachGoal) with the same names so reports show conversions.
