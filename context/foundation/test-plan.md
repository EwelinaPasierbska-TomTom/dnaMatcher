# Test Plan

> Phased test rollout for this project. Strategy is frozen at the top
> (§1–§5); cookbook patterns at the bottom (§6) fill in as phases ship.
> Read before writing any new test.
>
> Refresh: re-run `/10x-test-plan --refresh` when stale (see §8).
>
> Last updated: 2026-06-08 (Phase 1 → complete; Phase 2 → change opened)

---

## 1. Strategy

Tests follow three non-negotiable principles for this project:

1. **Cost × signal.** The cheapest test that gives a real signal for the
   risk wins. Do not promote to e2e because e2e "feels safer." Do not put a
   vision model on top of a deterministic assertion that already catches the
   regression.
2. **User concerns are first-class evidence.** Risks anchored in "the
   developer is worried about X, and the failure would surface somewhere in
   area Y" carry the same weight as PRD lines or hot-spot data.
3. **Risks are scenarios, not code locations.** This plan documents *what
   could fail* and *why we believe it is likely* — drawn from the PRD,
   roadmap, archived slices, interview, and codebase *signal* (churn,
   structure, test base). It does NOT claim to know which line owns the
   failure. That knowledge is produced by `/10x-research` during each
   rollout phase. If the plan and research disagree about where the failure
   lives, research is the ground truth.

Hot-spot scope used for likelihood weighting: `src/`, `frontend/src/`,
`tests/` — excluding `node_modules`, `dist`, `__pycache__`, and genetic
map `.txt` files.

---

## 2. Risk Map

The top failure scenarios this project must protect against, ordered by
risk = impact × likelihood. Risks are failure scenarios in user / business
terms, not test names. The Source column cites the *evidence that surfaced
this risk* — never a specific file as "where the failure lives."

| # | Risk (failure scenario) | Impact | Likelihood | Source (evidence — not anchor) |
|---|-------------------------|--------|------------|-------------------------------|
| 1 | User receives FULL match classification where alleles are actually incompatible (e.g., AA vs GG) and makes genealogy decisions on that result | High | High | PRD §Guardrails ("błędna klasyfikacja dyskwalifikuje wynik"); interview Q1+Q4; hot-spot dir `src/dna/` (16 commits/30d) |
| 2 | Future refactor silently changes segment boundaries, cM values, or SNP counts — existing tests pass because they only assert match type, not quantitative output | High | Medium | Interview Q2 (DNAPhaser replacement with unverified behavioral subtleties); hot-spot dir `src/dna/` (6 commits on algorithm alone/30d); DNAPhaser-specific behaviors not fully pinned (cM filter, double-count rule, bridge removal) |
| 6 | Algorithm processes a large realistic CSV and exhausts Render's 512 MB memory limit, crashing the production service | High | Medium | Interview Q2 ("burned before" — two OOM fixes landed within 30d); roadmap baseline (Render free tier: 512 MB); hot-spot dir `src/dna/` (OOM-related commits in last 30d) |
| 3 | Authenticated user A reads or modifies user B's comparisons or annotations via API (IDOR at route layer) | High | Low | AGENTS.md hard rule ("Enforce user data isolation at the data layer"); PRD §Access Control; existing tests cover DELETE wrong-user but not GET or POST cross-user access |
| 4 | A processing error or future route change accidentally persists raw CSV bytes or allele data to the database | High | Low | AGENTS.md hard rule ("Never persist raw DNA CSV data"); PRD §NFR privacy guardrail; current tests assert response shape but never assert what DB write calls contain |
| 5 | User clicks a phasing track and annotation is assigned to the wrong position — canvas hit-target coordinate math is wrong | Medium | High | Interview Q3 (canvas hit-testing "feels fragile"); hot-spot dir `frontend/src/components/` (34 commits/30d); zero frontend tests exist |

### Risk Response Guidance

| Risk | What would prove protection | Must challenge | Context `/10x-research` must ground | Likely cheapest layer | Anti-pattern to avoid |
|------|-----------------------------|----------------|--------------------------------------|-----------------------|-----------------------|
| #1 | Feed profiles where every SNP has known-incompatible alleles (AA vs GG) and assert NONE; feed identical alleles and assert FULL. Expected values derived from the allele comparison rule, not from running the algorithm | "Algorithm returns X today, so X is correct" — the oracle must come from the spec, not current output | Exhaustive classification table: how does each allele-pair class (AA/GG, AA/AG, AA/AA, and mixed) map to NONE/HALF/FULL? Entry point: pairwise and three-way compare functions | Parameterized pytest (one row per allele-pair class) | Asserting expected output by first running the algorithm and recording its current output |
| #2 | Golden-file test: fixed synthetic SNP set → expected segment boundaries (start_bp, end_bp, match type, snp_count, length_cm) authored from DNAPhaser spec. Test fails when output changes | "Tests pass, so algorithm has not changed" — small synthetic inputs may not exercise cM filter or double-count rule | DNAPhaser-specific behaviors: cM filter threshold (0.01 cM), first-SNP double-count, single-SNP NONE bridge removal. Verify each has a dedicated test with an independently derived expected value | Parameterized pytest with fixed seed inputs and expected values from the DNAPhaser spec | Using the algorithm's current output to author the golden file |
| #3 | Call GET/POST/DELETE on user B's resource authenticated as user A; assert 403 or 404 at route layer | "DELETE is protected, so all routes are" — only DELETE was tested for wrong-user; GET and POST cross-user access untested | Which routes enforce user_id ownership? Is GET comparisons/{id} and GET comparisons/{id}/annotations protected at route layer (not only at RLS layer)? | Route integration tests with mocked Supabase returning another user's data | Relying solely on "RLS will protect it" without a single route-layer assertion for cross-user GET |
| #4 | After POST /api/comparisons succeeds, assert that Supabase mock insert calls contain only the expected column schema — no raw CSV bytes, no raw allele strings outside the segment result schema | "The code looks right, so it must be safe" — future refactors or error paths could change this | What DB write calls does the comparison upload path make? Does any error branch trigger a storage write with raw data? | Mock-assertion test on Supabase client call arguments after a successful comparison POST | Trusting code inspection alone without asserting mock call shape |
| #5 | Given known track dimensions and a known segment (start_bp, end_bp), assert the resulting hit-target bounding box (x, y, w, h) maps to the correct screen region; a click inside that box must resolve to the correct segment | "Canvas renders correctly, so hit-testing works" — rendering and hit-testing are separate code paths | How are hit-targets built? Is the coordinate-to-screen mapping extractable as a pure function independent of the canvas rendering lifecycle? | Vitest unit test on the extracted geometry function | Snapshot tests of rendered canvas output (explicitly excluded — see §7) |
| #6 | Process a synthetic CSV of ~100k SNPs across all 22 autosomes + X and assert peak RSS stays below 400 MB | "The OOM fix works, so we are fine" — two fixes in 30 days suggests a fragile memory boundary | Realistic MyHeritage file SNP count; memory profile by chromosome; peak RSS baseline before and after the chromosome-at-a-time fix | pytest integration test with `tracemalloc` or `resource.getrusage` and an explicit RSS assertion | Testing with 10-SNP synthetic inputs that would never OOM; naming a test "memory test" without a peak usage assertion |

---

## 3. Phased Rollout

Each row is a discrete rollout phase that will open its own change folder
via `/10x-new`. Status moves left-to-right through the values below; the
orchestrator updates Status as artifacts appear on disk.

| # | Phase name | Goal (one line) | Risks covered | Test types | Status | Change folder |
|---|-----------|----------------|---------------|------------|--------|---------------|
| 1 | Algorithm correctness hardening | Prove classification correct for all allele-pair combinations; pin DNAPhaser-specific behaviors with regression guards | #1, #2 | parameterized pytest, hypothesis (property-based) | complete | context/changes/testing-algorithm-correctness |
| 2 | API security and data integrity | Prove cross-user IDOR blocked at route layer; prove raw DNA bytes never reach a DB write call | #3, #4 | route integration tests (mocked Supabase + call assertions) | change opened | context/changes/testing-api-security |
| 3 | Canvas geometry unit tests | Prove hit-target coordinate math correct for known track layouts using extracted pure functions | #5 | vitest unit tests (no snapshots) | not started | — |
| 4 | Production resilience | Prove algorithm stays within 400 MB RSS on a realistic-scale synthetic CSV input | #6 | pytest integration test with tracemalloc / resource.getrusage | not started | — |
| 5 | Quality gates wiring | Require pytest + mypy + ruff green before merge; introduce vitest; add pytest-cov threshold | — | CI config (not new tests) | not started | — |

---

## 4. Stack

The classic test base for this project. AI-native tools are not included
in the current rollout — cost × signal did not justify them given the
available deterministic layers. Tool versions are from `pyproject.toml` as
of 2026-06-08.

| Layer | Tool | Version | Notes |
|-------|------|---------|-------|
| Backend unit + integration | pytest | ≥9.0.3 | Configured in `pyproject.toml`; `testpaths = ["tests"]`; 9 files today, all backend |
| Backend route testing | httpx + FastAPI TestClient | ≥0.28.1 | Pattern established in existing test suite; use `dependency_overrides` for Supabase + auth mocks |
| Backend property-based | hypothesis | not yet installed | Phase 1 adds it for allele-pair exhaustion; see §3 Phase 1 |
| Backend memory profiling | tracemalloc / resource (stdlib) | stdlib | No install required; Phase 4 integration test uses it |
| Backend coverage | pytest-cov | ≥7.1.0 | Installed; threshold not yet enforced; Phase 5 wires it |
| Frontend unit | vitest | none yet — see §3 Phase 3 | Phase 3 introduces vitest for geometry unit tests; no snapshot tests |
| Frontend e2e | none | — | Not in current rollout scope; revisit at `--refresh` if S-09/S-10 ship |
| Type-check | mypy (strict) | ≥2.1.0 | Already wired; `strict = true` in `pyproject.toml` |
| Lint | ruff | ≥0.15.13 | Already wired; E/F/I/UP rules |

**Stack grounding tools (current session):**
- Docs: none — no Context7 or framework docs MCP available in current session; recommendations based on local `pyproject.toml` and `AGENTS.md`; checked: 2026-06-08
- Search: none — no Exa.ai or web search MCP available in current session; checked: 2026-06-08
- Runtime/browser: none — no Playwright MCP or browser tool available; not used in this rollout; checked: 2026-06-08
- Provider/platform: Atlassian, Slack, Microsoft 365 MCPs available — not relevant to test tooling; checked: 2026-06-08

---

## 5. Quality Gates

The full set of gates that must pass before a change reaches production.
"Required after §3 Phase N" means the gate is enforced once that rollout
phase lands; before that, the gate is planned.

| Gate | Where | Required? | Catches |
|------|-------|-----------|---------|
| lint (ruff check) | local + CI | required — already wired | style drift, import ordering |
| type-check (mypy strict) | local + CI | required — already wired | type regressions, missing annotations |
| backend unit + integration (pytest) | local + CI | required — already wired (no threshold yet) | logic and API regressions |
| pytest-cov threshold | local + CI | required after §3 Phase 5 | coverage floor on critical paths |
| frontend unit (vitest) | local + CI | required after §3 Phase 5 | geometry and pure-function regressions |
| pre-prod smoke | manual before prod deploy | optional | environment-specific failures on Render |

---

## 6. Cookbook Patterns

How to add new tests in this project. Each sub-section is filled in once
the relevant rollout phase ships; before that, the sub-section reads
"TBD — see §3 Phase N."

### 6.1 Adding a backend unit or parameterized test

Pattern established by Phase 1 (`tests/test_algorithm_correctness.py`):

- **Location**: `tests/test_<area>.py` at repo root level.
- **Fixtures**: real CSV samples in `tests/fixtures/<name>.csv`, loaded via `parse_myheritage_csv`.
- **Oracle rule**: expected values must come from the spec or the fixture file directly — never from running the algorithm and recording its output. Violating this turns the test into a mirror of the implementation, not a guard against it.
- **Parameterized spec tables**: use `@pytest.mark.parametrize` with one row per allele-pair class or behavior variant; comment each row with the rule it exercises.
- **Fixture scope**: use `scope="module"` for fixtures that load real CSV data so the parse overhead runs once per test module.
- **Reference test**: `tests/test_algorithm_correctness.py`.
- **Run locally**: `pytest tests/test_algorithm_correctness.py -v`

Phase 1 note: the mama fixture (200 SNPs, chr1, positions 72 526–1 619 541 bp) falls in a sub-telomeric low-recombination region (3.39 cM). Self-comparison produces `NONE`, not `FULL`, because `build_none_packages_between_anchors(threshold_cm=5.0)` downgrades any segment below 5 cM. New regression guards that use this fixture must account for that threshold.

### 6.2 Adding a route integration test

**Location**: `tests/test_api_security.py` for security-focused route tests (ownership guards, schema guards). Router-specific files (`test_comparisons_api.py`, `test_annotations_api.py`, etc.) for happy-path route tests.

**Two dependencies to always override** in every route integration test:
```python
app.dependency_overrides[get_current_user] = lambda: FAKE_USER
app.dependency_overrides[get_supabase_client] = lambda: supabase_mock
```
`conftest.py` clears `dependency_overrides` automatically after each test — no teardown needed.

**Mock builder** (`_make_db_mock`): copy from `tests/test_ancestors_api.py:28–37` into the target test file. Each Supabase table is a named kwarg; the mock object passed in is the same one returned by `db.from_(table_name)`, so it can be inspected after the request:
```python
def _make_db_mock(**table_overrides: MagicMock) -> MagicMock:
    mock = MagicMock(); db = MagicMock()
    def from_(table_name): return table_overrides.get(table_name, MagicMock())
    db.from_.side_effect = from_
    mock.postgrest.auth.return_value = db
    return mock
```

**Wrong-user (IDOR) pattern** — mock the ownership-checked table to return empty, assert 4xx:
```python
def _comp_empty() -> MagicMock:
    t = MagicMock()
    t.select.return_value.eq.return_value.eq.return_value.execute.return_value.data = []
    return t

supabase_mock = _make_db_mock(comparisons=_comp_empty())
response = client.get(f"/api/comparisons/{COMPARISON_ID}")
assert response.status_code == 404
```
Chain depth mirrors the real route query (double `.eq()` for `id` + `user_id`; no `.order()` for single-item GET). Reference test: `tests/test_api_security.py::test_get_comparison_wrong_user_returns_404`.

**Schema-guard (call-arg assertion) pattern** — inspect what was passed to `insert()`:
```python
supabase_mock, profiles_mock, results_mock = _make_upload_db_mock()
# ... send request ...
inserted_rows = results_mock.insert.call_args[0][0]  # list of row dicts
for row in inserted_rows:
    assert set(row.keys()) == _EXPECTED_RESULT_COLUMNS
    assert not any(isinstance(v, bytes) for v in row.values())
```
Use `_make_upload_db_mock()` (defined in `test_api_security.py`) for upload tests — it returns `(supabase_mock, profiles_mock, results_mock)` as a 3-tuple so each table mock is accessible for post-request inspection. Reference test: `tests/test_api_security.py::test_upload_results_insert_contains_only_segment_schema`.

**Run locally**: `pytest tests/test_api_security.py -v`

### 6.3 Adding a frontend geometry unit test

TBD — see §3 Phase 3 (canvas geometry — introduces vitest and establishes
the pattern for testing pure coordinate-math functions extracted from canvas components).

### 6.4 Adding a memory / resource-limit test

TBD — see §3 Phase 4 (production resilience — establishes the tracemalloc
pattern and synthetic large-CSV fixture for algorithm memory regression guards).

### 6.5 Per-rollout-phase notes

(Filled in by `/10x-implement` as each phase completes.)

---

## 7. What We Deliberately Don't Test

Exclusions agreed during the rollout (Phase 2 interview, Q5). Future
contributors should respect these unless the underlying assumption changes.

- **React UI component snapshots** — break on any visual change, catch nothing meaningful for this product's risks. Re-evaluate if the frontend ever adds a design system with tight visual contracts. (Source: Phase 2 interview Q5.)
- **Supabase RLS policies directly** — RLS is authored and managed in the Supabase dashboard, not in this repository; it is not part of the CI pipeline. Route-layer IDOR tests (§2 Risk #3) cover the application-layer ownership checks; the SQL policies are a separate concern. Re-evaluate if RLS policy SQL is ever migrated into version-controlled migration files. (Source: Phase 2 interview Q5.)
- **MyHeritage CSV format stability** — format changes surface immediately through real user uploads and parser `ValueError` responses; the parser is designed as a replaceable module (PRD §FR-002 note). Re-evaluate if additional MyHeritage export formats are introduced. (Source: Phase 2 interview Q5.)

---

## 8. Freshness Ledger

- Strategy (§1–§5) last reviewed: 2026-06-08
- Stack versions last verified: 2026-06-08
- AI-native tool references last verified: 2026-06-08 (none in current rollout)

Refresh (`/10x-test-plan --refresh`) when:

- a new top-3 risk surfaces from the roadmap or archive (S-09 external similarities or S-10 report export landing would warrant a refresh),
- a recommended tool's `checked:` date is older than three months,
- the project's tech stack changes (new test runner, new framework layer),
- §7 negative-space no longer matches what the team believes.
