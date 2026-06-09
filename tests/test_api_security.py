"""API security guard tests — test-plan rollout Phase 2.

Covers two risks from context/foundation/test-plan.md:

  Risk #3 — IDOR at route layer.
    Every comparison/annotation route that checks user_id ownership has a
    test that asserts 404/403 when the DB filter produces no results.
    Pattern: mock the relevant table to return an empty list (simulating
    .eq("user_id", ...) filtering out another user's row), then assert 4xx.
    Reference: tests/test_ancestors_api.py:134-142.

  Risk #4 — Raw DNA persistence.
    After a successful upload, the exact column keys passed to each Supabase
    insert() call are asserted against the expected schema — catching any
    change that adds raw bytes or allele strings to a write dict.
    After a parse-error upload, Supabase insert() is asserted to never be
    called.
"""
from __future__ import annotations

from unittest.mock import MagicMock
from uuid import UUID

from fastapi.testclient import TestClient

from main import app
from src.auth.client import get_supabase_client
from src.auth.dependencies import get_current_user
from src.auth.models import CurrentUser

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

FAKE_USER = CurrentUser(
    id=UUID("00000000-0000-0000-0000-000000000001"),
    email="test@example.com",
    access_token="fake-token",
)

COMPARISON_ID = "cccccccc-0000-0000-0000-000000000003"
PROFILE_ID = "aaaaaaaa-0000-0000-0000-000000000001"
PROFILE_ID_B = "bbbbbbbb-0000-0000-0000-000000000002"
ANNOTATION_ID = "dddddddd-0000-0000-0000-000000000004"

# Valid MyHeritage-format CSV: chr1, positions 50M–63M bp (real cM region).
# 14 SNPs with AA genotype so DNAPhaser segments survive the cM length filter.
# Identical to the pattern in tests/test_comparisons_api.py:23-25.
_VALID_CSV = b"\n".join(
    f"rs{i};1;{50_000_000 + i * 1_000_000};AA;;;".encode() for i in range(1, 15)
)

# Invalid CSV: positions below the chr1 genetic-map range, alleles "--".
# parse_myheritage_csv raises ValueError → route returns 400 before any DB write.
_INVALID_CSV = b"\n".join(
    f"rs{i};1;{i * 1000};--;;;".encode() for i in range(1, 5)
)

# Expected column sets for Supabase insert() call assertions (Risk #4).
_EXPECTED_PROFILES_COLUMNS: frozenset[str] = frozenset(
    {"user_id", "name", "original_filename"}
)
_EXPECTED_RESULT_COLUMNS: frozenset[str] = frozenset(
    {
        "comparison_id",
        "chromosome",
        "start_position",
        "end_position",
        "snp_count",
        "classification",
        "start_cm",
        "end_cm",
        "length_bp",
        "length_cm",
        "density",
        "pair_profile_ids",
    }
)

ANNOTATION_ROW: dict[str, object] = {
    "id": ANNOTATION_ID,
    "user_id": str(FAKE_USER.id),
    "profile_id": PROFILE_ID,
    "chromosome": "1",
    "start_position": 1_000_000,
    "end_position": 5_000_000,
    "strand": "maternal",
    "ancestor_label": "Babcia Maria",
    "created_at": "2026-06-02T00:00:00+00:00",
}

# ---------------------------------------------------------------------------
# Shared mock builders
# ---------------------------------------------------------------------------


def _make_db_mock(**table_overrides: MagicMock) -> MagicMock:
    """Return a Supabase client mock with per-table overrides.

    Copied verbatim from tests/test_ancestors_api.py:28-37.
    """
    mock = MagicMock()
    db = MagicMock()

    def from_(table_name: str) -> MagicMock:
        return table_overrides.get(table_name, MagicMock())

    db.from_.side_effect = from_
    mock.postgrest.auth.return_value = db
    return mock


def _comp_empty() -> MagicMock:
    """Comparisons table mock returning empty on the double-eq ownership chain.

    Models what the DB returns when .eq("user_id", ...) filters out another
    user's row for:
      GET /comparisons/{id}             — comparisons.py:326-337
      GET /comparisons/{id}/annotations — annotations.py:78-84
    Both routes raise HTTPException(404) when comp_res.data is empty.
    """
    t = MagicMock()
    t.select.return_value.eq.return_value.eq.return_value.execute.return_value.data = []
    return t


def _profiles_empty() -> MagicMock:
    """dna_profiles table mock returning empty on the profile-ownership chain.

    Models what the DB returns when .eq("user_id", ...) filters out a profile
    not owned by the requesting user for:
      POST /comparisons/{id}/annotations — annotations.py:113-121
    Route raises HTTPException(403) when profile_res.data is empty.
    """
    t = MagicMock()
    t.select.return_value.eq.return_value.eq.return_value.execute.return_value.data = []
    return t


def _profiles_found(profile_id: str = PROFILE_ID) -> MagicMock:
    """dna_profiles table mock returning one row (profile owned by FAKE_USER)."""
    t = MagicMock()
    t.select.return_value.eq.return_value.eq.return_value.execute.return_value.data = [
        {"id": profile_id}
    ]
    return t


def _ann_upsert() -> MagicMock:
    """ancestor_annotations table mock for a successful upsert."""
    t = MagicMock()
    t.upsert.return_value.execute.return_value.data = [ANNOTATION_ROW]
    return t


# ---------------------------------------------------------------------------
# Risk #3 — IDOR ownership guard tests
# ---------------------------------------------------------------------------


def test_get_comparison_wrong_user_returns_404() -> None:
    """GET /comparisons/{id} with a wrong-user comparison ID returns 404.

    The route filters .eq("user_id", current_user.id) on the comparisons table
    (comparisons.py:337). When the filter excludes the row (mock returns empty),
    the route raises 404. If this test fails (route returns 200 or 500), the
    ownership filter was removed.
    """
    supabase_mock = _make_db_mock(comparisons=_comp_empty())
    app.dependency_overrides[get_current_user] = lambda: FAKE_USER
    app.dependency_overrides[get_supabase_client] = lambda: supabase_mock

    client = TestClient(app)
    response = client.get(f"/api/comparisons/{COMPARISON_ID}")

    assert response.status_code == 404


def test_get_comparison_annotations_wrong_user_returns_404() -> None:
    """GET /comparisons/{id}/annotations with a wrong-user comparison returns 404.

    The route verifies comparison ownership before fetching annotations
    (annotations.py:82). When the comparison lookup returns empty (mock), the
    route raises 404 before ever touching the ancestor_annotations table.
    """
    supabase_mock = _make_db_mock(comparisons=_comp_empty())
    app.dependency_overrides[get_current_user] = lambda: FAKE_USER
    app.dependency_overrides[get_supabase_client] = lambda: supabase_mock

    client = TestClient(app)
    response = client.get(f"/api/comparisons/{COMPARISON_ID}/annotations")

    assert response.status_code == 404


def test_post_annotation_wrong_profile_returns_403() -> None:
    """POST /comparisons/{id}/annotations with an unowned profile returns 403.

    The route verifies that profile_id belongs to the requesting user
    (annotations.py:117). When the profile lookup returns empty (mock), the
    route raises 403.
    """
    supabase_mock = _make_db_mock(dna_profiles=_profiles_empty())
    app.dependency_overrides[get_current_user] = lambda: FAKE_USER
    app.dependency_overrides[get_supabase_client] = lambda: supabase_mock

    client = TestClient(app)
    response = client.post(
        f"/api/comparisons/{COMPARISON_ID}/annotations",
        json={
            "profile_id": PROFILE_ID,
            "chromosome": "1",
            "start_position": 1_000_000,
            "end_position": 5_000_000,
            "strand": "maternal",
            "ancestor_label": "Babcia Maria",
        },
    )

    assert response.status_code == 403


def test_post_annotation_does_not_check_comparison_membership() -> None:
    """Documents that the route accepts any user-owned profile regardless of comparison.

    POST /comparisons/{id}/annotations verifies profile ownership (.eq("user_id"))
    but does NOT verify that profile_id belongs to the specified comparison
    (annotations.py:101-141 has no comparison table lookup).

    A user can annotate any comparison_id with any profile they own. This is a
    known logic gap (see research.md §Detailed Findings). The test documents the
    current behavior as a regression baseline. If this test fails (route returns
    4xx), a comparison-membership check was added — update the test accordingly.
    """
    # Profile ID intentionally NOT belonging to the COMPARISON_ID's profile set.
    # The route only checks dna_profiles ownership, not comparison membership.
    OTHER_PROFILE_ID = "11111111-0000-0000-0000-000000000099"

    supabase_mock = _make_db_mock(
        dna_profiles=_profiles_found(profile_id=OTHER_PROFILE_ID),
        ancestor_annotations=_ann_upsert(),
    )
    app.dependency_overrides[get_current_user] = lambda: FAKE_USER
    app.dependency_overrides[get_supabase_client] = lambda: supabase_mock

    client = TestClient(app)
    response = client.post(
        f"/api/comparisons/{COMPARISON_ID}/annotations",
        json={
            "profile_id": OTHER_PROFILE_ID,
            "chromosome": "1",
            "start_position": 1_000_000,
            "end_position": 5_000_000,
            "strand": "maternal",
            "ancestor_label": "Babcia Maria",
        },
    )

    assert response.status_code == 200, (
        "Route accepted annotation for a profile not in the comparison — "
        "documents the known logic gap. If 4xx, a membership check was added; "
        "update this test to reflect the new intended behavior."
    )


# ---------------------------------------------------------------------------
# Risk #4 — Raw DNA persistence schema guard tests
# ---------------------------------------------------------------------------


def _make_upload_db_mock() -> tuple[MagicMock, MagicMock, MagicMock]:
    """Return (supabase_mock, profiles_mock, results_mock) for upload tests.

    profiles_mock and results_mock are the same objects returned by
    db.from_("dna_profiles") and db.from_("comparison_results") respectively,
    so callers can inspect insert.call_args after the upload request.
    """
    profiles_mock = MagicMock()
    profiles_mock.insert.return_value.execute.return_value.data = [
        {"id": PROFILE_ID, "name": "Ewa", "original_filename": "ewa.csv"},
        {"id": PROFILE_ID_B, "name": "Jan", "original_filename": "jan.csv"},
    ]
    profiles_mock.select.return_value.in_.return_value.execute.return_value.data = [
        {"id": PROFILE_ID, "name": "Ewa"},
        {"id": PROFILE_ID_B, "name": "Jan"},
    ]
    profiles_mock.delete.return_value.in_.return_value.execute.return_value.data = []

    comparisons_mock = MagicMock()
    comparisons_mock.insert.return_value.execute.return_value.data = [
        {
            "id": COMPARISON_ID,
            "name": "Test",
            "created_at": "2026-06-09T00:00:00+00:00",
            "profile_ids": [PROFILE_ID, PROFILE_ID_B],
        }
    ]

    results_mock = MagicMock()
    results_mock.insert.return_value.execute.return_value.data = []

    supabase_mock = _make_db_mock(
        dna_profiles=profiles_mock,
        comparisons=comparisons_mock,
        comparison_results=results_mock,
    )
    return supabase_mock, profiles_mock, results_mock


def test_upload_profiles_insert_has_no_raw_bytes() -> None:
    """dna_profiles insert contains only {user_id, name, original_filename}.

    Oracle: the column schema at src/routers/comparisons.py:187-197.
    No raw bytes or allele strings.
    If any new column is added to profile_rows (especially one that passes
    raw CSV bytes or allele data), this test fails.
    """
    supabase_mock, profiles_mock, _ = _make_upload_db_mock()
    app.dependency_overrides[get_current_user] = lambda: FAKE_USER
    app.dependency_overrides[get_supabase_client] = lambda: supabase_mock

    client = TestClient(app)
    response = client.post(
        "/api/comparisons",
        files=[
            ("name", (None, "Test")),
            ("min_snp_count", (None, "1")),
            ("person_names", (None, "Ewa")),
            ("person_names", (None, "Jan")),
            ("files", ("ewa.csv", _VALID_CSV, "text/csv")),
            ("files", ("jan.csv", _VALID_CSV, "text/csv")),
        ],
    )

    assert response.status_code == 200, response.text
    assert profiles_mock.insert.called, "dna_profiles.insert() was never called"

    inserted_rows: list[dict[str, object]] = profiles_mock.insert.call_args[0][0]
    for row in inserted_rows:
        assert set(row.keys()) == _EXPECTED_PROFILES_COLUMNS, (
            f"dna_profiles insert had unexpected columns: "
            f"{set(row.keys()) ^ _EXPECTED_PROFILES_COLUMNS}"
        )
        assert not any(isinstance(v, bytes) for v in row.values()), (
            f"dna_profiles insert contained raw bytes: {row}"
        )


def test_upload_results_insert_contains_only_segment_schema() -> None:
    """comparison_results insert contains only the segment result schema.

    No allele fields. Oracle: _segment_to_row() at src/routers/comparisons.py:78-94.
    Segment dataclass has no allele fields (src/dna/models.py:13-24).
    If a future change accidentally passes SNPRecord.allele1/allele2 to the
    insert dict, this test fails.
    """
    supabase_mock, _, results_mock = _make_upload_db_mock()
    app.dependency_overrides[get_current_user] = lambda: FAKE_USER
    app.dependency_overrides[get_supabase_client] = lambda: supabase_mock

    client = TestClient(app)
    response = client.post(
        "/api/comparisons",
        files=[
            ("name", (None, "Test")),
            ("min_snp_count", (None, "1")),
            ("person_names", (None, "Ewa")),
            ("person_names", (None, "Jan")),
            ("files", ("ewa.csv", _VALID_CSV, "text/csv")),
            ("files", ("jan.csv", _VALID_CSV, "text/csv")),
        ],
    )

    assert response.status_code == 200, response.text
    assert results_mock.insert.called, "comparison_results.insert() was never called"

    inserted_rows: list[dict[str, object]] = results_mock.insert.call_args[0][0]
    assert len(inserted_rows) > 0, "Expected at least one comparison result row"
    for row in inserted_rows:
        assert set(row.keys()) == _EXPECTED_RESULT_COLUMNS, (
            f"comparison_results insert had unexpected columns: "
            f"{set(row.keys()) ^ _EXPECTED_RESULT_COLUMNS}"
        )
        assert not any(isinstance(v, bytes) for v in row.values()), (
            f"comparison_results insert contained raw bytes: {row}"
        )


def test_upload_parse_error_does_not_write_to_database() -> None:
    """CSV parse failure returns 400 and Supabase insert() is never called.

    Oracle: parse_myheritage_csv raises ValueError for invalid alleles (--).
    The route raises HTTPException(400) at line 180-181 before any DB write
    (first insert at line 195). Nothing is persisted on parse failure.
    """
    supabase_mock = MagicMock()
    app.dependency_overrides[get_current_user] = lambda: FAKE_USER
    app.dependency_overrides[get_supabase_client] = lambda: supabase_mock

    client = TestClient(app)
    response = client.post(
        "/api/comparisons",
        files=[
            ("name", (None, "Test")),
            ("min_snp_count", (None, "1")),
            ("person_names", (None, "Ewa")),
            ("person_names", (None, "Jan")),
            ("files", ("ewa.csv", _INVALID_CSV, "text/csv")),
            ("files", ("jan.csv", _INVALID_CSV, "text/csv")),
        ],
    )

    assert response.status_code == 400
    db = supabase_mock.postgrest.auth.return_value
    db.from_.return_value.insert.assert_not_called()
