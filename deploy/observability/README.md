# Observability Phase 2–3 (compose) — notes

Prometheus scrapes `app:8080/metrics` with `METRICS_TOKEN` and `node-exporter:9100`.
Grafana provisions datasource + dashboard `Appzac ops` (`uid: appzac-ops`).

## Ports (localhost only)

| Service | Bind |
|---------|------|
| Grafana | `127.0.0.1:3000` |
| Prometheus | `127.0.0.1:9090` |

Do not add these to public NPM Proxy Hosts unless you add auth separately.

## SSH tunnel (from laptop)

```bash
ssh -L 3000:127.0.0.1:3000 -L 9090:127.0.0.1:9090 USER@MINI_PC
```

Then open http://127.0.0.1:3000 (Grafana) and/or http://127.0.0.1:9090 (Prometheus).

In the app, admins can use **Open Grafana** on `/ops/metrics` (opens `http://127.0.0.1:3000/d/appzac-ops` — needs the tunnel).
Override base URL at SPA build time with `VITE_GRAFANA_URL` if needed.
