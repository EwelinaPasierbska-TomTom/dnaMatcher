---
project: dnaMatcher
deployed_at: 2026-05-25
platform: Render
service_name: dnaMatcher
service_url: https://dnamatcher.onrender.com
region: Frankfurt (EU)
plan: free
runtime: python
context_type: mvp
---

## What Was Deployed

FastAPI stub (`main.py`) serving two endpoints:
- `GET /` → `{"status":"ok","project":"dnaMatcher","version":"0.1.0"}`
- `GET /health` → `{"status":"healthy","version":"0.1.0"}`

No database, no auth, no frontend — backend skeleton only. Frontend (React Router v7) and application features are implemented in subsequent lessons.

## Deploy Pipeline

```
git push origin main
  → GitHub Actions ci.yml
      → uv run ruff check .
      → uv run ruff format --check .
      → uv run mypy .
      → uv run pytest
      → curl $RENDER_DEPLOY_HOOK_URL   (only on main push, after all checks pass)
  → Render build
      → pip install uv && uv sync --frozen --no-dev
      → uv run uvicorn main:app --host 0.0.0.0 --port $PORT
```

## Infrastructure Decisions Made

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Platform | Render free tier | Permanent free tier + native FastAPI support + MCP server (GA) |
| Region | Frankfurt | EU-first launch; immutable after creation |
| Database | Supabase (external) | Eliminates Render free-tier PostgreSQL 30-day expiry risk |
| Single service | FastAPI serves both API + (future) static bundle | Zero-cost, one pipeline |
| Deploy trigger | Render webhook via GitHub Actions | Decouples CI gate from deploy; deploy only fires on green build |

## Secrets Wired

| Secret | Location | Purpose |
|--------|----------|---------|
| `RENDER_DEPLOY_HOOK_URL` | GitHub repo → Settings → Secrets | Allows CI to trigger Render deploy |
| `DATABASE_URL` | Render Dashboard → Environment | Supabase connection string (set when DB is needed) |
| `SECRET_KEY` | Render Dashboard → Environment | JWT signing key (set when auth is implemented) |

## Keep-Alive

`.github/workflows/keep-alive.yml` pings `https://dnamatcher.onrender.com/health` every 5 minutes via GitHub Actions cron. Prevents the 60-second cold start during active development sessions on the free tier.

## Known Risks (from infrastructure.md risk register)

| Risk | Mitigation |
|------|-----------|
| 60s cold start on free tier | keep-alive.yml ping every 5 min; upgrade to Starter ($7/mth) before beta |
| No CLI rollback — must use Render REST API | `POST /v1/services/{serviceId}/rollback` with `RENDER_API_KEY` |
| Region immutable — migration requires full teardown | Frankfurt chosen deliberately for EU-first launch |
| Ephemeral filesystem | PRD guardrail: raw CSV discarded after processing; no local state |

## What's Next

- Implement auth (FR-001, FR-002): FastAPI auth routes + Supabase → wire `DATABASE_URL` and `SECRET_KEY`
- Scaffold React Router v7 frontend in `frontend/` → update `render.yaml` buildCommand
- Add E2E tests as features ship
- Upgrade to Render Starter plan before first beta users
