# Observability Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship Go `GET /metrics` (Prometheus text) with dual auth (scrape token **or** admin JWT), HTTP request metrics, and an admin-only SPA page at `/ops/metrics`.

**Architecture:** Chi middleware records low-cardinality HTTP counters/histograms. `/metrics` is registered on the API router and forwarded by `MountSPA` (so it is not swallowed by `index.html`). Humans open `/ops/metrics` in the Vue app; Prometheus (phase 2) scrapes `/metrics` with `METRICS_TOKEN`.

**Tech Stack:** Go + `prometheus/client_golang`, chi, Vue 3 + vue-router, existing `users.is_admin`.

**Spec:** [`docs/superpowers/specs/2026-07-23-observability-prometheus-design.md`](../specs/2026-07-23-observability-prometheus-design.md)

## Global Constraints

- Dual gate: `Authorization: Bearer <METRICS_TOKEN>` **or** JWT with `is_admin=true`
- No auth → 401; non-admin JWT → 403
- Path labels: never raw UUIDs/emails — group with `*`
- No PII in metric labels
- Phase 2–3 (Prometheus/Grafana compose) are **out of this plan** — listed as follow-ups only

## File map

| File | Role |
|------|------|
| `api/internal/httpapi/metrics.go` | Registry, HTTP middleware, path grouping, `promhttp` handler |
| `api/internal/httpapi/metrics_auth.go` | Dual-auth wrapper |
| `api/internal/httpapi/metrics_test.go` | Auth + path group unit tests |
| `api/internal/httpapi/router.go` | Wire middleware + `/metrics` |
| `api/internal/httpapi/spa.go` | Forward `/metrics` to API |
| `api/internal/config/config.go` | `METRICS_TOKEN` |
| `api/cmd/server/main.go` | Pass token into router |
| `.env.prod.example` | Document token |
| `src/pages/OpsMetricsPage.vue` | Admin UI |
| `src/router/index.ts` | Route `/ops/metrics` |
| `src/App.vue` + i18n | Link for admins in settings |

---

### Task 1: Path group helper + dual-auth gate (TDD)

**Files:**
- Create: `api/internal/httpapi/metrics.go`
- Create: `api/internal/httpapi/metrics_auth.go`
- Create: `api/internal/httpapi/metrics_test.go`

**Interfaces:**
- Produces: `func PathGroup(path string) string`
- Produces: `func MetricsAuth(token string, auth *auth.Handler, next http.Handler) http.Handler`
- Produces: `func Instrument(next http.Handler) http.Handler` (Task 2 may complete body)
- Produces: `func MetricsHandler() http.Handler`

- [ ] **Step 1: Failing tests for PathGroup + MetricsAuth**

```go
func TestPathGroup_ReplacesUUIDs(t *testing.T) {
  got := PathGroup("/api/jobs/550e8400-e29b-41d4-a716-446655440000/members")
  if got != "/api/jobs/*/members" {
    t.Fatalf("got %q", got)
  }
}

func TestMetricsAuth_NoAuth401(t *testing.T) { /* ... */ }
func TestMetricsAuth_WrongToken401(t *testing.T) { /* ... */ }
func TestMetricsAuth_TokenOK(t *testing.T) { /* ... */ }
func TestMetricsAuth_NonAdminJWT403(t *testing.T) { /* ... */ }
func TestMetricsAuth_AdminJWT200(t *testing.T) { /* ... */ }
```

For JWT tests: use `auth.NewTokenIssuer` + stub `Store` is hard; prefer a small `MetricsAuthorizer` interface:

```go
type MetricsUserLookup interface {
  UserFromBearer(r *http.Request) (user auth.User, ok bool, err error)
}
```

Or reuse real `auth.Handler.Middleware` pattern: parse JWT in MetricsAuth via `Tokens.Parse` + `Store.FindByID` — integration-style with nil Store only for token path; for JWT path use a test double.

Simpler approach for unit tests: extract

```go
type adminChecker func(r *http.Request) (isAdmin bool, authenticated bool)
```

Injectable in tests; production wires JWT+Store.

**Recommended production signature:**

```go
func MetricsAuth(metricsToken string, lookup func(*http.Request) (admin bool, authed bool), next http.Handler) http.Handler
```

Production wrapper in `router.go`:

```go
lookup := func(r *http.Request) (bool, bool) {
  // parse Bearer JWT via authHandler.Tokens + Store; return is_admin, true if valid user
}
```

- [ ] **Step 2: Implement PathGroup + MetricsAuth**
- [ ] **Step 3: `go test ./internal/httpapi/ -count=1` — pass**
- [ ] **Step 4: Commit** `Add metrics path grouping and dual-auth gate.`

---

### Task 2: Prometheus registry + HTTP instrumentation + `/metrics` route

**Files:**
- Modify: `api/internal/httpapi/metrics.go`
- Modify: `api/internal/httpapi/router.go`
- Modify: `api/internal/httpapi/spa.go`
- Modify: `api/internal/httpapi/spa_test.go` (if exists) / add case
- Modify: `api/internal/config/config.go`
- Modify: `api/cmd/server/main.go`
- Modify: `api/go.mod` / `go.sum` via `go get`

**Interfaces:**
- Consumes: `MetricsAuth`, `PathGroup`
- Produces: `NewRouter(..., metricsToken string)` includes `GET /metrics` and `Instrument` middleware
- Config field: `MetricsToken string` from `METRICS_TOKEN`

- [ ] **Step 1: `cd api && go get github.com/prometheus/client_golang@v1.22.0`** (or latest stable)

- [ ] **Step 2: Implement collectors**

```go
var (
  httpRequests = prometheus.NewCounterVec(..., []string{"method", "path_group", "code"})
  httpDuration = prometheus.NewHistogramVec(..., []string{"method", "path_group"})
)

func init() {
  prometheus.MustRegister(httpRequests, httpDuration)
  // Also: collectors.NewGoCollector(), collectors.NewProcessCollector(...)
}

func Instrument(next http.Handler) http.Handler { /* wrap + observe */ }

func MetricsHandler() http.Handler {
  return promhttp.Handler()
}
```

- [ ] **Step 3: Wire router** — `r.Use(Instrument)` early; `r.Handle("/metrics", MetricsAuth(..., MetricsHandler()))` **before** auth-required groups. Do **not** put `/metrics` behind global JWT middleware.

- [ ] **Step 4: MountSPA** — if `p == "/metrics"`, `api.ServeHTTP` and return (same as `/api/`).

- [ ] **Step 5: Config + main** — read `METRICS_TOKEN` (optional string); pass to `NewRouter`.

- [ ] **Step 6: Tests** — PathGroup + MetricsAuth; optional httptest that Instrument increments (hit `/api/health` then scrape with token).

- [ ] **Step 7: Commit** `Expose /metrics with HTTP instrumentation.`

---

### Task 3: Admin SPA page `/ops/metrics`

**Files:**
- Create: `src/pages/OpsMetricsPage.vue`
- Modify: `src/router/index.ts`
- Modify: `src/App.vue` (settings link when `user.is_admin`)
- Modify: `src/i18n/locales/en.ts`, `ru.ts`
- Modify: `.env.prod.example`
- Modify: `PLAN.md` (tick phase-1 ops checkbox partially)
- Modify: spec status → Implemented phase 1 / In progress

**Behavior:**
- Route `meta: { requiresAuth: true }`
- On mount: if `!user.is_admin` show forbidden; else `fetch(apiBase() + '/metrics', { headers: { Authorization: 'Bearer ' + token } })` and show `pre` text + refresh button
- Settings: admin-only button «Metrics» → `router.push('/ops/metrics')`

- [ ] **Step 1: Page + route + i18n + settings link**
- [ ] **Step 2: Manual check** — non-admin redirected/forbidden; admin sees `# HELP`
- [ ] **Step 3: Commit** `Add admin SPA page for Prometheus metrics.`

---

### Task 4: Docs + env example

**Files:**
- `.env.prod.example` — `METRICS_TOKEN=`
- Spec status update
- `PLAN.md` — note phase 1 done; phase 2–3 still open

- [ ] **Step 1: Update docs**
- [ ] **Step 2: Commit** `Document METRICS_TOKEN and phase-1 observability.`

---

## Follow-ups (not this plan)

- Phase 2: `prometheus` + `node-exporter` in `docker-compose.prod.yml`
- Phase 3: Grafana + dashboard
- Alerts, postgres exporter, Yandex Metrica

## Self-review

- Spec dual-auth + SPA page + path cardinality → Tasks 1–3
- NPM may expose `/metrics` (401 without secret) — OK per revised spec
- No Grafana in phase 1 — intentional
