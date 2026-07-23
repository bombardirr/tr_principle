# Observability (Prometheus / Grafana) — design

Date: 2026-07-23  
Status: Implemented (phases 1–3) — `/metrics` + admin SPA; Prometheus + node_exporter + Grafana; public UI via NPM `grafana.appzac.ru` (Access List recommended); alerts backlog
Stack: same mini-PC `docker-compose.prod.yml` as app + Postgres (behind NPM)

## Goal

Self-hosted **ops** metrics without external SaaS: host load, app health/traffic, and coarse “site visits” as HTTP hit counts. Product analytics (Yandex Metrica, funnels) stay a **separate** track and are out of this design.

## Non-goals (this design)

- Yandex Metrica / marketing events / cookie banner
- Admin JWT browser UI for metrics
- Alertmanager / paging (later)
- Per-user or per-segment telemetry (privacy)
- Publishing `/metrics` on the public NPM host

## Architecture (target)

```text
                    NPM (public HTTPS)
                         │
                    app:8080  (SPA + /api/* only)
                         │
┌────────────────────────┼────────────────────────┐
│ docker compose (private network)                │
│  app ──/metrics──► prometheus ◄── node_exporter │
│                         │                       │
│                      grafana (UI; not on NPM    │
│                      unless optional later)     │
└─────────────────────────────────────────────────┘
```

- **Prometheus** scrapes targets on the Docker network only.
- **Grafana** reads Prometheus; default access = SSH tunnel / LAN / separate NPM host with basic auth (ops choice; not required for phase 1–2).
- **App** exposes Prometheus text format at `GET /metrics`.

## Access model for `/metrics`

**Dual gate** (either succeeds):

1. **Scrape token** — `Authorization: Bearer <METRICS_TOKEN>` when `METRICS_TOKEN` is set (Prometheus on Docker network).
2. **Admin JWT** — same Bearer JWT as the SPA; user must have `users.is_admin = true`.

If `METRICS_TOKEN` is empty in local/dev: allow scrape without token (document risk); **prod must set a token**. Admin JWT still required for humans in all environments when not using the token.

**Browser UX (preferred):** a small authenticated **SPA page** (e.g. route `/ops/metrics` or `/metrics` handled by Vue, not raw Prometheus text as the document navigation target):

1. User logs into the app as usual.
2. Opens the metrics page in the app.
3. Page checks `user.is_admin`; if not admin → 403 / “нет доступа”.
4. Page `fetch`es `GET /metrics` with the existing `Authorization: Bearer <jwt>` and shows the Prometheus text (monospace / downloadable). Optional later: link out to Grafana.

**NPM:** may expose `/metrics` (API) and the SPA route. Unauthenticated browsers get 401 JSON/text — not a public dump.

**Why a page works:** the SPA already stores the JWT and sends it on API calls. A dedicated page is the natural place to attach that header; no Basic Auth and no cookie migration required. Typing a “naked” URL that bypasses the SPA still needs a token or would 401 — that is fine; admins use the in-app page (or curl with JWT/token).

**Do not** require a separate admin password for phase 1 beyond `is_admin` + normal login.

## What we measure

### App (Go)

| Metric / series | Purpose |
|-----------------|--------|
| `promhttp` / process collectors | Go mem, GC, goroutines, process CPU |
| `http_requests_total{method,path_group,code}` | RPS, errors |
| `http_request_duration_seconds` | Latency histogram |
| existing `/api/health` | Liveness for compose healthcheck (unchanged) |

**Path grouping:** low-cardinality labels only — e.g. `/api/auth/login`, `/api/tm/bases/:id/sync` → `/api/tm/bases/*/sync`, SPA fallback → `spa`. Never raw UUIDs/emails as labels.

**“Visits” (phase 1 meaning):** count of HTTP requests to `spa` + selected public paths. Not unique users. Unique/anonymous product visits remain Metrika (later).

### Host (node_exporter)

CPU, memory, disk, load — standard node exporter metrics.

### Optional later (not phase 1)

- Postgres exporter
- cAdvisor (container CPU/mem)
- App counters: register/login success, TM push bytes (still no PII)

## Phased delivery

### Phase 1 — App `/metrics` + admin SPA page (this repo, ship first)

1. Add `prometheus/client_golang` to the Go API.
2. Middleware on the chi router: duration + counters with path groups.
3. `GET /metrics` with dual gate (METRICS_TOKEN **or** admin JWT); register default Go/process collectors.
4. Config: `METRICS_TOKEN` in `config.FromEnv` + `.env.prod.example`.
5. Vue page (admin-only): fetch `/metrics` with session JWT, render plain text.
6. Unit/integration smoke: no auth → 401; non-admin JWT → 403; admin JWT / token → `text/plain` with `# HELP`.
7. Document: curl with token; admin opens in-app metrics page. Prometheus scrape uses token (phase 2).

### Phase 2 — Prometheus + node_exporter in compose

1. Services `prometheus`, `node-exporter` in `docker-compose.prod.yml` (private network; no `proxy_net` publish required).
2. `prometheus.yml`: scrape `app:8080/metrics` with bearer token from env/file; scrape `node-exporter:9100`.
3. Persist Prometheus TSDB volume; retention ~15–30d (configurable).
4. Ops notes in README / deploy doc: token file mount, restart order.

### Phase 3 — Grafana + starter dashboard

1. `grafana` service + volume; default admin password from `.env.prod`.
2. Provision Prometheus datasource + one dashboard JSON: HTTP RPS/latency/5xx, Go mem, node CPU/RAM/disk.
3. Access: NPM `https://grafana.appzac.ru` → `appzac-prod-grafana:3000` (Access List recommended); SSH `127.0.0.1:3000` fallback. SPA button on `/ops/metrics`.

### Phase 4+ (backlog)

- Alert rules (5xx rate, disk > 85%, scrape down)
- Postgres exporter
- First-party `POST /api/telemetry/pageview` only if Metrika is still deferred and ops want SPA route names without Yandex

## Privacy

- Ops metrics: aggregates and infra only.
- No emails, JWT, segment text, or project contents in labels or log-derived metrics.
- Token is a secret (same class as `JWT_SECRET`); rotate by changing env and Prometheus scrape config.

## Relation to PLAN.md

- Replaces the open checkbox under **Observability ops** with this phased design.
- Does **not** close **Яндекс.Метрика** (product layer A).

## Success criteria

- Phase 1: authenticated `/metrics` works; admin SPA page shows series; curl with token works.
- Phase 2: Prometheus UI (or `promtool`) shows `up=1` for app and node.
- Phase 3: Grafana panel shows live RPS and host CPU without external SaaS.
