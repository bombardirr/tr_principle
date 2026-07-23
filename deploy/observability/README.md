# Observability (Prometheus / Grafana)

Stack: same mini-PC `docker-compose.prod.yml` as app + Postgres.  
Spec: [`docs/superpowers/specs/2026-07-23-observability-prometheus-design.md`](../docs/superpowers/specs/2026-07-23-observability-prometheus-design.md)

## What is live

| Piece | Where | Auth |
|-------|--------|------|
| Raw Prometheus text | `GET /metrics` on app | `Bearer METRICS_TOKEN` **or** admin JWT (`is_admin`) |
| Admin SPA page | `https://appzac.ru/ops/metrics` | App login + `is_admin`; button → Grafana |
| Prometheus TSDB / UI | `127.0.0.1:9090` | Not on NPM (localhost / SSH only) |
| Grafana + dashboard **Appzac ops** | NPM → `appzac-prod-grafana:3000` | Grafana login (`GRAFANA_ADMIN_*`); **Access List recommended** |
| Host CPU/RAM/disk | `node-exporter` (scraped privately) | — |

Default public Grafana host: **`https://grafana.appzac.ru`**

## Secrets (`.env.prod`)

```bash
METRICS_TOKEN=…                 # openssl rand -hex 32
GRAFANA_ADMIN_USER=admin
GRAFANA_ADMIN_PASSWORD=…        # openssl rand -base64 24
GRAFANA_ROOT_URL=https://grafana.appzac.ru
```

Show password on server: `grep -E '^GRAFANA_ADMIN_(USER|PASSWORD)=' .env.prod`

SPA button URL is baked at image build (`VITE_GRAFANA_URL`, Dockerfile default `https://grafana.appzac.ru`). After changing the public host, rebuild `app`.

## Access model (who sees what)

- **Without any secret:** `/metrics` → 401; `/ops/metrics` → redirect/login; Grafana charts → not visible.
- **Grafana via NPM:** login **page** can be public if Proxy Host has no Access List. **Charts** need Grafana password.
- **Hardening:** NPM Access List (your IP) on the Grafana host; keep Prometheus off NPM.
- Appzac account ≠ Grafana account. `METRICS_TOKEN` ≠ Grafana password.

## NPM Proxy Host (Grafana)

If assets fail to load (“failed to load its application files”), `GRAFANA_ROOT_URL` must match the browser URL exactly (`https://grafana.appzac.ru`) and Grafana must be recreated after changing it.

1. DNS: `grafana.appzac.ru` → same IP as `appzac.ru`
2. Proxy Host:
   - Domain: `grafana.appzac.ru`
   - Forward: `http://appzac-prod-grafana:3000`
   - Websockets: **on**
   - SSL: Let's Encrypt + Force SSL
3. Access List (recommended)
4. Open https://grafana.appzac.ru → `admin` / `GRAFANA_ADMIN_PASSWORD`
5. Or from app: `/ops/metrics` → **Open Grafana**

Do **not** publish Prometheus `:9090` on NPM.

## SSH fallback

```bash
ssh -L 3000:127.0.0.1:3000 -L 9090:127.0.0.1:9090 USER@MINI_PC
```

## Compose services

`app`, `db`, `prometheus`, `grafana` (on `proxy_net` + default), `node-exporter`.  
Configs under `deploy/observability/`.

## Backlog (ops)

- Alertmanager / 5xx + disk alerts
- Postgres exporter
- Optional: more Grafana panels
