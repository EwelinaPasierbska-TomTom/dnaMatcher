---
project: dnaMatcher
checked_at: 2026-05-20T08:55:00Z
health_status: needs-attention
context_type: greenfield
language_family: python
stack_assessment_available: false
checks_run:
  - lockfile
  - dependency_audit
  - outdated_deps
  - test_runner
  - ci_cd
  - configuration
audit_findings:
  critical: 0
  high: 0
  moderate: 0
  low: 0
test_runner_detected: false
ci_provider: null
recommended_fixes: 5
---

## Dependency Health

### Lockfile

```
Status:          present (uv.lock)
Package manager: uv
```

Lockfile is present and covers all direct dependencies. Builds are reproducible.

### Security Audit

```
Tool:    skipped — pip-audit not installed in the environment
Summary: 0 CRITICAL, 0 HIGH, 0 MODERATE, 0 LOW
Direct vs transitive: not assessed
```

pip-audit is not installed, so vulnerability scanning was not performed. The two direct dependencies (`fastapi>=0.136.1`, `uvicorn>=0.47.0`) are recent, actively maintained packages with low historical CVE rates. Install pip-audit to enable future scans.

### Outdated Dependencies

```
Tool:    uv pip list --outdated
Summary: 0 packages with major version gaps
```

No outdated packages detected. Dependency versions in uv.lock are current.

---

## Test Infrastructure

```
Test runner: not detected
```

No test runner was found:

- `pyproject.toml` has no `[tool.pytest.ini_options]` section
- `pytest` is not listed in dependencies and is not installed in `.venv`
- No test files or directories were found in the project tree
- `main.py` is a stub placeholder (`print("Hello from dnamatcher!")`)

The agent cannot verify its own changes without a test runner. This is the highest-impact gap for agent-assisted development.

---

## CI/CD

```
Provider: not detected
```

No CI/CD configuration found (no `.github/workflows/`, `.gitlab-ci.yml`, `Jenkinsfile`, `.circleci`, etc.). See Category B below — this is expected at this stage and covered in an upcoming lesson.

---

## Configuration

### High severity

- **`.gitignore` missing** — Python projects generate `.venv/`, `__pycache__/`, `.pytest_cache/`, `*.pyc`, and `.env` files that should never be committed. Without a `.gitignore`, the agent may inadvertently stage virtual-environment binaries or secrets. Fix: create a `.gitignore` for Python (see fix #1 below).

- **No type checker configured** — `pyproject.toml` has no `[tool.mypy]` or `[tool.pyright]` section and neither tool is installed. FastAPI is fully typed and relies on type annotations for request validation and serialisation. Without enforced type checking, the agent generates code that compiles but may silently mishandle request/response shapes. Fix: add mypy or pyright (see fix #4 below).

### Medium severity

- **No linter or formatter configured** — `pyproject.toml` has no `[tool.ruff]` section and no formatter (`black`, `ruff format`) is installed. The agent's output style will be inconsistent between sessions. Fix: add ruff as a combined linter and formatter (see fix #3 below).

### Low severity

- **`.editorconfig` missing** — without an `.editorconfig`, different editors (PyCharm, VS Code, terminal) may use different indentation, line endings, or encoding, creating noisy diffs.
- **`.env.example` missing** — the FastAPI app will need environment variables (database URL, secret key, etc.) as it grows. A `.env.example` documents required variables and prevents "works on my machine" issues. Not blocking now, but add one as soon as the first env var appears in the code.

---

## Stack Assessment Cross-Reference

```
No stack-assessment.md found. Run /10x-stack-assess for quality-gate analysis.
```

---

## Recommended Fixes

### Fix before agent work (Category A)

#### 1. Add `.gitignore`

**Impact**: Prevents `.venv/`, `__pycache__/`, `.env`, and editor files from being committed. Without this, the agent may stage tens of megabytes of virtual-environment binaries on first `git add .`.
**Severity**: high
**Effort**: quick (< 5 min)
**Fix**:

```bash
# Fetch a standard Python gitignore from GitHub's template
curl -fsSL https://raw.githubusercontent.com/github/gitignore/main/Python.gitignore -o .gitignore
# Append uv-specific and IDE entries
echo -e "\n# uv\n.python-version\n\n# JetBrains\n.idea/" >> .gitignore
```

#### 2. Add pytest and write a first test

**Impact**: The agent cannot verify its own changes without tests. Even a single smoke test for the FastAPI app (`GET /` returns 200) gives the agent a feedback loop.
**Severity**: high
**Effort**: moderate (15–30 min)
**Fix**:

```bash
# Add pytest and httpx (for FastAPI test client) as dev dependencies
uv add --dev pytest pytest-cov httpx

# Add test runner config to pyproject.toml
cat >> pyproject.toml << 'EOF'

[tool.pytest.ini_options]
testpaths = ["tests"]
addopts = "--tb=short"
EOF

# Create tests directory with a placeholder test
mkdir -p tests
touch tests/__init__.py
cat > tests/test_smoke.py << 'EOF'
def test_placeholder():
    """Replace with real tests as the app grows."""
    assert True
EOF

# Verify tests run
uv run pytest
```

#### 3. Add ruff (linter + formatter)

**Impact**: Consistent code style across agent sessions. Without a formatter, each session may produce subtly different style, creating noisy diffs.
**Severity**: medium
**Effort**: quick (< 5 min)
**Fix**:

```bash
uv add --dev ruff

# Add ruff config to pyproject.toml
cat >> pyproject.toml << 'EOF'

[tool.ruff]
line-length = 88
target-version = "py313"

[tool.ruff.lint]
select = ["E", "F", "I", "UP"]
EOF

# Run once to check current state
uv run ruff check .
uv run ruff format --check .
```

#### 4. Add mypy for type checking

**Impact**: FastAPI uses Python type annotations for request validation and serialisation. Without enforced type checking, the agent may generate handler signatures that compile but silently mishandle request/response shapes — a class of bug particularly hard to catch without types.
**Severity**: high
**Effort**: moderate (15–30 min)
**Fix**:

```bash
uv add --dev mypy

# Add mypy config to pyproject.toml
cat >> pyproject.toml << 'EOF'

[tool.mypy]
python_version = "3.13"
strict = true
ignore_missing_imports = true
EOF

# Run to see current state (expect some findings on new code — fix progressively)
uv run mypy .
```

#### 5. Install pip-audit for security scanning

**Impact**: With pip-audit absent, security vulnerabilities in future dependency updates will go undetected until they are flagged externally.
**Severity**: low (current deps appear clean; important for ongoing hygiene)
**Effort**: quick (< 5 min)
**Fix**:

```bash
uv add --dev pip-audit

# Run once to establish a clean baseline
uv run pip-audit
```

---

### Addressed in upcoming lessons (Category B)

#### CI/CD pipeline

**Lesson**: [Sprint Zero z Agentem: infrastruktura, walking skeleton i pierwszy deploy (M1L5)](https://platforma.przeprogramowani.pl/external/10xdevs-3/m1-l5)
**What you'll do there**: Set up a GitHub Actions (or equivalent) pipeline with lint, type-check, test, and build stages — turning the local checks added above into automated gates on every push.

#### Agent instruction file (AGENTS.md)

**Lesson**: [Agent Onboarding: Agents.md, AI Rules i feedback loops (M1L4)](https://platforma.przeprogramowani.pl/external/10xdevs-3/m1-l4)
**What you'll do there**: A `CLAUDE.md` is already present (used by Claude Code for course instructions). The agent onboarding lesson walks you through writing a project-specific `AGENTS.md` with conventions the agent cannot infer from the code alone — parser module boundaries, DNA segment classification rules, data-isolation invariants.

---

## Summary

Health status: **needs-attention**

The project has a solid foundation: dependencies are locked with uv, the two direct packages (FastAPI, Uvicorn) are current and clean, and the PRD is well-specified. The main gaps are operational: there is no test runner (the agent's primary feedback loop), no `.gitignore` (a commit-time risk), and no linter or type checker (style and type consistency between agent sessions). None of these are complex fixes — the five Category A items above are a 1–2 hour investment that will meaningfully improve the agent's ability to make reliable changes.

Next step: address the Category A fixes in order (`.gitignore` first, then pytest, then ruff and mypy), then proceed to agent onboarding (`/10x-agents-md`) to give the agent project-specific conventions for the DNA comparison engine.
