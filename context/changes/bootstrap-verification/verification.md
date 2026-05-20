---
bootstrapped_at: 2026-05-20T08:48:00Z
starter_id: fastapi
starter_name: FastAPI
project_name: dna-matcher
language_family: multi
package_manager: uv
cwd_strategy: native-cwd
bootstrapper_confidence: first-class
phase_3_status: ok
audit_command: "null"
---

## Hand-off

```yaml
starter_id: fastapi
package_manager: uv
project_name: dna-matcher
hints:
  language_family: multi
  team_size: solo
  deployment_target: render
  ci_provider: github-actions
  ci_default_flow: auto-deploy-on-merge
  bootstrapper_confidence: first-class
  path_taken: custom
  quality_override: false
  self_check_answers:
    typed: false
    from_official_starter: false
    conventions: false
    docs_current: true
    can_judge_agent: false
  has_auth: true
  has_payments: false
  has_realtime: false
  has_ai: false
  has_background_jobs: false
```

**Why this stack:**
Solo developer building a DNA segment comparison web app in 3 after-hours weeks with a beginner profile. Python anchors the backend: FastAPI + Pydantic handle CSV parsing, allele comparison, and segment classification — the domain engine passes all four agent-friendly quality gates within the Python family. React Router v7 (TypeScript) is the frontend starter, also clearing all four gates; its mainstream React ecosystem provides the best library coverage for the interactive chromosome visualization required by FR-007 (D3.js, Recharts, Visx). Both starters deploy as a single Render free-tier service — FastAPI serves the built React static bundle — keeping infrastructure to zero cost and one pipeline. Auth (FR-001, FR-002) and CSV file upload (FR-003) are the technology-forcing features; payments, realtime, and AI are out of scope per PRD non-goals. The self-check flagged can_judge_agent as false (beginner profile); CLAUDE.md compensation is required to encode stack conventions so the AI assistant provides guardrails instead of requiring the user to judge its output.

## Pre-scaffold verification

| Signal      | Value                              | Severity | Notes                                                          |
| ----------- | ---------------------------------- | -------- | -------------------------------------------------------------- |
| npm package | not run                            | —        | non-JS starter; npm check skipped                              |
| GitHub repo | not run                            | —        | docs_url (https://fastapi.tiangolo.com) is not a GitHub URL   |

No recency signal available. Proceeded without warning.

## Scaffold log

**Resolved invocation**: `uv init . && uv add fastapi uvicorn`
**Strategy**: native-cwd (scaffolded directly into the current directory)
**Exit code**: 0
**Pre-flight files-to-touch**: pyproject.toml, main.py, .python-version, uv.lock, README.md, .venv/
**Files written by CLI**: 5 files + .venv/ virtual environment
  - `pyproject.toml` — project manifest (dnamatcher, requires-python >=3.13, fastapi >=0.136.1, uvicorn >=0.47.0)
  - `main.py` — entry point stub (Hello from dnamatcher!)
  - `.python-version` — pins CPython 3.13.12
  - `uv.lock` — locked dependency tree (13 packages installed: fastapi 0.136.1, uvicorn 0.47.0, pydantic 2.13.4, starlette 1.0.0, and transitive deps)
  - `README.md` — empty placeholder
**Pre-existing files preserved**: context/, .claude/, CLAUDE.md, .git/, .idea/, .DS_Store

## Post-scaffold audit

**Tool**: skipped — no built-in audit tool for `multi`
**Recommended external tool**: No single audit tool covers this multi-language stack (Python backend + JS frontend). Recommended approach once the full stack is wired:
- Python side: `pip-audit` (install with `uv add --dev pip-audit`, run `pip-audit --format json`)
- JS/React side: `npm audit --json` (from the frontend directory after `npm install`)

## Hints recorded but not acted on

These hint fields were read from the hand-off but no automated action was taken in bootstrapper v1. A future M1L4 skill will act on them to generate CLAUDE.md / AGENTS.md and CI/CD files.

| Hint                    | Value                                                                     |
| ----------------------- | ------------------------------------------------------------------------- |
| bootstrapper_confidence | first-class                                                               |
| quality_override        | false                                                                     |
| path_taken              | custom                                                                    |
| self_check_answers      | typed: false, from_official_starter: false, conventions: false, docs_current: true, can_judge_agent: false |
| team_size               | solo                                                                      |
| deployment_target       | render                                                                    |
| ci_provider             | github-actions                                                            |
| ci_default_flow         | auto-deploy-on-merge                                                      |
| has_auth                | true                                                                      |
| has_payments            | false                                                                     |
| has_realtime            | false                                                                     |
| has_ai                  | false                                                                     |
| has_background_jobs     | false                                                                     |

**Note on `can_judge_agent: false`**: The self-check flagged the user as unable to independently judge AI-generated output. CLAUDE.md compensation (stack conventions encoded as guardrails) is required — deferred to the M1L4 skill.

## Next steps

Next: a future skill will set up agent context (CLAUDE.md, AGENTS.md). For now, your project is scaffolded and verified — happy hacking.

Useful manual steps in the meantime:
- Review `main.py` — it is a plain Python stub (`Hello from dnamatcher!`), not a FastAPI app yet. Replace with your FastAPI entrypoint.
- Run `uv run uvicorn main:app --reload` once you have a FastAPI `app` object in `main.py` to verify the server starts.
- The React Router v7 frontend is not scaffolded yet — bootstrapper v1 scaffolds the primary starter only. Set up the frontend in a subdirectory (e.g., `frontend/`) with `npm create react-router@latest frontend`.
- Run `git init` (if you have not already) to start your own repo history.
- Address audit findings per your project's risk tolerance — see the Post-scaffold audit section above for the recommended per-language tools.
