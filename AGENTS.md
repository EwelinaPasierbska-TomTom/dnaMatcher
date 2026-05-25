# Repository Guidelines

`dnaMatcher` is a Python 3.13 / FastAPI web app that parses MyHeritage DNA CSV exports, compares alleles across chromosome segments, and classifies each segment as `no match`, `half match`, or `full match`. Users assign segments to ancestors (phasing) to infer inheritance lines.

## Hard Rules

- **Never persist raw DNA CSV data.** Only computed segment results (chromosome, position, classification) may be written to the database. Raw file bytes must be discarded after processing — this is a non-negotiable privacy guardrail defined in `@context/foundation/prd.md`.
- **Segment classification must be deterministic.** Identical input files must always produce identical segment output. Any ordering instability or stateful randomness in the comparison logic is a correctness failure.
- **Enforce user data isolation at the data layer.** A user must never read or modify another user's profiles, comparisons, or segment results. Route-layer checks alone are insufficient.

## Project Structure

`main.py` is the app entry point (currently a stub). Tests live in `tests/` (pytest, named `test_*.py`). Context docs in `@context/foundation/` (PRD, tech stack, health check) are read-only references — do not modify them. Always commit `uv.lock` changes alongside dependency changes.

`src/` layout is now active. Subdirectories: `src/auth/` (JWT dependency, client, models), `src/routers/` (route handlers), `src/services/` (domain logic, added as needed), `src/models/` (DB models, added as needed).

## Commands

| Purpose | Command |
|---------|---------|
| Run tests | `uv run pytest` |
| Lint | `uv run ruff check .` |
| Format | `uv run ruff format .` |
| Type-check | `uv run mypy .` |
| Security scan | `uv run pip-audit` |
| Dev server | `uv run uvicorn main:app --reload` |

Run `uv run pytest` and `uv run mypy .` before every commit — both must exit clean.

## Coding Style & Naming

Python 3.13, strict mypy (`strict = true` — see `@pyproject.toml`). Every function requires a return type annotation; mypy will reject code without one. Ruff enforces E/F/I/UP rules at line-length 88. Run `uv run ruff format .` before pushing.

## Testing

Framework: pytest. Tests in `tests/`, named `test_*.py`. Use `httpx.AsyncClient` or `fastapi.testclient.TestClient` for route tests. Run a single file with `uv run pytest tests/test_smoke.py`.

## Commits

No convention established yet (one commit in history). Adopt Conventional Commits when the first feature lands: `feat:`, `fix:`, `test:`, `chore:`.
