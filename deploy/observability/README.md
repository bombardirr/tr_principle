# Observability Phase 2–3 (compose) — notes

Prometheus scrapes `app:8080/metrics` with `METRICS_TOKEN` and `node-exporter:9100`.
Grafana provisions datasource + dashboard `Appzac ops` (`uid: appzac-ops`).

## Ports

| Service | Access |
|---------|--------|
| Grafana | **NPM** `https://grafana.appzac.ru` → `appzac-prod-grafana:3000` on `proxy_net` |
| Grafana | also `127.0.0.1:3000` (SSH fallback) |
| Prometheus | `127.0.0.1:9090` only — **do not** put on NPM |

## NPM Proxy Host (Grafana)

1. DNS: `grafana.appzac.ru` → same IP as appzac.ru  
2. Proxy Host:
   - Domain: `grafana.appzac.ru`
   - Scheme: `http`
   - Forward Hostname: `appzac-prod-grafana` (or `${STACK_NAME}-grafana`)
   - Forward Port: `3000`
   - Websockets: **on**
   - SSL: Let's Encrypt + Force SSL
3. Access List (recommended): restrict to your IP / basic auth in NPM  
4. Grafana still asks for `admin` / `GRAFANA_ADMIN_PASSWORD`

In `.env.prod`:
```
GRAFANA_ROOT_URL=https://grafana.appzac.ru
```

Rebuild app after URL change so the SPA button points at the public host (`VITE_GRAFANA_URL` baked in Dockerfile, default `https://grafana.appzac.ru`).

## SSH tunnel fallback

```bash
ssh -L 3000:127.0.0.1:3000 -L 9090:127.0.0.1:9090 USER@MINI_PC
```

In the app, admins use **Open Grafana** on `/ops/metrics`.
