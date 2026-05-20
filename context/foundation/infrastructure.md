---
project: dnaMatcher
researched_at: 2026-05-20T10:00:00Z
recommended_platform: Render
runner_up: Railway
context_type: mvp
tech_stack:
  language: Python
  framework: FastAPI + React Router v7 (TypeScript)
  runtime: uvicorn
  database: Supabase (external)
---

## Recommendation

**Deploy on Render.**

FastAPI is natively supported on Render (GA, zero-config), the single-service model (FastAPI serving the built React Router v7 static bundle) works without platform hacks, and Render is the only platform among the three candidates with a permanent free tier that supports Python. The database runs on Supabase — an external provider — which eliminates Render's biggest free-tier risk (the 30-day free PostgreSQL expiry does not apply). The official Render MCP server (GA since August 2025) makes the platform fully agent-operable from Claude Code.

## Platform Comparison

| Platform | CLI-first | Managed | Agent docs | Stable deploy API | MCP | Free tier | Total |
|----------|-----------|---------|------------|-------------------|-----|-----------|-------|
| **Render** | Partial | Pass | Pass | Pass | Pass (GA) | ✓ | **4/5** |
| Railway | Pass | Pass | Partial | Pass | Partial (beta) | ✗ | 3.5/5 — dropped |
| Fly.io | Partial | Pass | Partial | Pass | Partial (experimental) | ✗ | 3/5 — dropped |
| Cloudflare Workers | Pass | Pass | Pass | Pass | Pass | ✓ | dropped — Python beta, 10ms CPU cap |
| Vercel | Pass | Pass | Pass | Pass | Partial | ✓ | dropped — 4 CPU-h/mth cap, BackgroundTasks broken |
| Netlify | Pass | Pass | Pass | Pass | Pass (GA) | ✓ | dropped — no Python function runtime |

### Shortlisted Platforms

#### 1. Render (Recommended)

Native FastAPI support via Cloud Native Buildpacks — no Dockerfile required. The single-service model (Uvicorn serves both the API and the built React static bundle) is the documented FastAPI-on-Render pattern. Official MCP server exposes 20+ tools covering deploy, logs, env vars, metrics, and service management — directly usable from Claude Code with an API key. Docs available as `llms.txt` and `llms-full.txt`. CLI covers deploy, log-tailing, and service listing; rollback is via REST API. Free tier provides 750 instance-hours/month with 60-second cold start after 15 minutes idle. **Database risk from free-tier PostgreSQL expiry is eliminated — Supabase is used instead.**

#### 2. Railway

Best-in-class cost efficiency ($5/month Hobby covers compute + co-located Postgres within the included credit). Full CLI rollback via `railway redeploy`. FastAPI auto-detected via Railpack. MCP server available but in beta as of May 2026. Docs as GitHub markdown — no `llms.txt`. **Dropped: no permanent free tier; $5/month is the hard floor.**

#### 3. Fly.io

Best global reach of the three (18 regions, anycast routing). Dockerfile-first workflow gives maximum control. `flyctl mcp-server` available but marked experimental. No free tier since late 2024; realistic cost $5–12/month including IPv4 and a minimal volume. **Dropped: no free tier; higher operational complexity (Dockerfile required, no native `fly rollback`).**

## Anti-Bias Cross-Check: Render

### Devil's Advocate — Weaknesses

1. **Rollback requires Dashboard or REST API, not CLI** — `render rollback` does not exist. An agent must call `POST /v1/services/{serviceId}/rollback` via curl or SDK; this adds brittleness to automated rollback workflows.
2. **60-second cold start on the free tier** — after 15 minutes of idle, the first request triggers a ~60-second spin-up. For a solo developer testing after hours, every session that resumes after a break will hit this. It is invisible to users (Render shows a loading page), but degrades the development loop.
3. **Only 5 compute regions** — US West, US East ×2, Frankfurt, Singapore. No nodes in LATAM, Middle East, or broader APAC. API responses are routed to the nearest of 5 points; users outside these zones see 150–250ms baseline latency.
4. **Region is immutable after service creation** — migrating to a different region requires full teardown and redeploy. Cannot be changed in-flight.
5. **Ephemeral filesystem** — any writes to local disk (temp uploads, SQLite, cached files) are lost on every restart or spin-down. All state must go through Supabase or external storage.

### Pre-Mortem — How This Could Fail

Ewa deployed dnaMatcher on Render's free tier. The first two weeks went fine — she was testing alone, cold starts were annoying but acceptable. In week three she invited the first beta testers. They reported the app "doesn't respond" — the 60-second spin-up without user feedback looks like a hung request. She upgraded the service to the Starter plan ($7/month) and the problem disappeared. Six weeks later, a tester in Australia reported comparisons taking 12–15 seconds. The service was running in Frankfurt; every API call round-tripped from Sydney to Frankfurt and back. Render's Singapore region exists, but migrating required deleting the Frankfurt service and recreating it in Singapore — an hour of downtime and a manual re-wiring of Supabase connection strings and environment variables. The failure was not a platform defect; it was an infrastructure decision made for development convenience that was never validated against the real user geography.

### Unknown Unknowns

1. **The free tier is designed for demos, not active development** — the 60-second cold start fires on every session that resumed after a coffee break. Upgrade to Starter ($7/month) before inviting real users; treat free tier as "staging only."
2. **CLI authentication uses long-lived API keys** — no OAuth, no short-lived tokens. The API key must be stored in every environment (local, Claude Code session, future CI). Rotation means updating it everywhere manually.
3. **Single-service model (FastAPI + static files) is simpler but ignores CDN for static assets** — all traffic hits the compute instance. At MVP scale this is fine; if static asset requests dominate later, a free Render Static Site + paid Web Service only for the API gives better cost efficiency.
4. **`release_command` in `render.yaml` is the only pre-start hook** — if you need to run database migrations before the new version takes traffic, `release_command` is the mechanism. It is not well-documented for FastAPI; test it explicitly before going to production.
5. **Render Workflows (multi-step build pipelines) is still in beta** — the long-term migration pipeline path; `release_command` is the current workaround.

## Operational Story

- **Preview deploys**: Each Git branch triggers a preview deploy at a unique `<branch>-<service>.onrender.com` URL (GA on paid plans; on free tier, preview deploys exist but the service still spins down after inactivity). No branch protection required by default; protect via Render's access rules if needed.
- **Secrets**: Environment variables live in the Render Dashboard → Environment section and are injectable via `render.yaml`. The Supabase connection string (`DATABASE_URL`) and any JWT secret go here. The Render MCP server can read and write env vars programmatically — never hardcode secrets in source.
- **Rollback**: Call `POST /v1/services/{serviceId}/rollback` via the Render REST API (requires `RENDER_API_KEY`). Typical time-to-revert: 1–3 minutes (uses a cached build artifact). Database migrations run via `release_command` do **not** roll back automatically — schema changes must be backward-compatible or handled separately.
- **Approval**: Agent may perform unattended: deploy, tail logs, update env vars, list services, query metrics. Agent must NOT: delete a service, change the service region, rotate the primary API key. These require human confirmation.
- **Logs**: `render logs -r <serviceID> --tail=true` streams runtime logs. The Render MCP server exposes a `getLogs` tool usable directly from Claude Code. Build logs available via `render deploys list <serviceID>` + Dashboard.

## Risk Register

| Risk | Source | Likelihood | Impact | Mitigation |
|------|--------|-----------|--------|------------|
| Cold start (60s) degrades first-user experience | Research finding | H (free tier) | M | Upgrade to Starter ($7/mth) before beta launch; keep free tier for solo dev only |
| No CLI rollback — agent must use REST API | Devil's advocate | M | M | Store `RENDER_API_KEY` in Claude Code env; use `curl -X POST` rollback script; document in AGENTS.md |
| Service region immutable — migration requires downtime | Pre-mortem | M | M | Choose Singapore at creation if APAC users expected; deploy in EU (Frankfurt) for European-first launch |
| Ephemeral filesystem — uploaded CSV lost on restart | Research finding | H | L | PRD guardrail already requires discarding raw CSV after processing — confirm no temp file writes in implementation |
| CLI API key rotation requires manual update everywhere | Unknown unknowns | L | M | Store key in a single `.env` file sourced by all tools; document rotation checklist in AGENTS.md |
| Render Workflows beta — migration pipeline unreliable | Unknown unknowns | L | L | Use `release_command` in `render.yaml` for DB migrations until Workflows reaches GA |

## Getting Started

1. **Install the Render CLI** and authenticate:
   ```
   npm install -g @render-oss/cli
   render login
   ```

2. **Create `render.yaml`** at the repo root to declare the service:
   ```yaml
   services:
     - type: web
       name: dna-matcher
       runtime: python
       buildCommand: pip install -r requirements.txt && cd frontend && npm ci && npm run build
       startCommand: uvicorn main:app --host 0.0.0.0 --port $PORT
       envVars:
         - key: DATABASE_URL
           sync: false
         - key: SECRET_KEY
           sync: false
   ```

3. **Add the Render MCP server to Claude Code** for agent-driven operations:
   ```
   claude mcp add render -- npx @render-oss/mcp-server-render
   ```
   Set `RENDER_API_KEY` in your environment first (Dashboard → Account → API Keys).

4. **Set `DATABASE_URL`** in Render → Environment to your Supabase connection string (use the pooler URL for serverless-friendly connection management).

5. **Push to GitHub and connect the repo** in Render Dashboard → New Web Service → Connect Repository. First deploy happens automatically.

## Out of Scope

The following were not evaluated in this research:
- Docker image configuration
- CI/CD pipeline setup (covered in a future lesson)
- Production-scale architecture (multi-region, HA, DR)
