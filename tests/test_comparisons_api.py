from unittest.mock import MagicMock
from uuid import UUID

from fastapi.testclient import TestClient

from main import app
from src.auth.client import get_supabase_client
from src.auth.dependencies import get_current_user
from src.auth.models import CurrentUser

FAKE_USER = CurrentUser(
    id=UUID("00000000-0000-0000-0000-000000000001"),
    email="test@example.com",
)

PROFILE_ID_A = "aaaaaaaa-0000-0000-0000-000000000001"
PROFILE_ID_B = "bbbbbbbb-0000-0000-0000-000000000002"
COMPARISON_ID = "cccccccc-0000-0000-0000-000000000003"

# Minimal valid MyHeritage CSV with enough SNPs to form a segment (min_snp_count=1)
_VALID_CSV = "\n".join(f"rs{i};1;{i * 1000};AA;;;" for i in range(1, 15)).encode()

_INVALID_CSV = "\n".join(f"rs{i};1;{i * 1000};--;;;" for i in range(1, 5)).encode()


def _make_supabase_mock() -> MagicMock:
    """Return a Supabase client mock that handles all table operations."""
    mock = MagicMock()

    profiles_insert_resp = MagicMock()
    profiles_insert_resp.data = [
        {
            "id": PROFILE_ID_A,
            "name": "Ewa",
            "original_filename": "ewa.csv",
        },
        {
            "id": PROFILE_ID_B,
            "name": "Jan",
            "original_filename": "jan.csv",
        },
    ]

    comparison_insert_resp = MagicMock()
    comparison_insert_resp.data = [
        {
            "id": COMPARISON_ID,
            "name": "Test",
            "created_at": "2026-05-31T00:00:00+00:00",
            "profile_ids": [PROFILE_ID_A, PROFILE_ID_B],
        }
    ]

    results_insert_resp = MagicMock()
    results_insert_resp.data = []

    list_comps_resp = MagicMock()
    list_comps_resp.data = [
        {
            "id": COMPARISON_ID,
            "name": "Test",
            "created_at": "2026-05-31T00:00:00+00:00",
            "profile_ids": [PROFILE_ID_A, PROFILE_ID_B],
        }
    ]

    list_profiles_resp = MagicMock()
    list_profiles_resp.data = [
        {"id": PROFILE_ID_A, "name": "Ewa"},
        {"id": PROFILE_ID_B, "name": "Jan"},
    ]

    def table_side_effect(table_name: str) -> MagicMock:
        t = MagicMock()
        if table_name == "dna_profiles":
            t.insert.return_value.execute.return_value = profiles_insert_resp
            t.select.return_value.in_.return_value.execute.return_value = (
                list_profiles_resp
            )
            t.delete.return_value.in_.return_value.execute.return_value = MagicMock()
        elif table_name == "comparisons":
            t.insert.return_value.execute.return_value = comparison_insert_resp
            list_chain = t.select.return_value.eq.return_value.order.return_value
            list_chain.execute.return_value = list_comps_resp
            t.delete.return_value.eq.return_value.execute.return_value = MagicMock()
        elif table_name == "comparison_results":
            t.insert.return_value.execute.return_value = results_insert_resp
        return t

    mock.table.side_effect = table_side_effect
    return mock


def test_post_comparison_with_valid_csv_returns_200() -> None:
    supabase_mock = _make_supabase_mock()
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
    body = response.json()
    assert body["id"] == COMPARISON_ID
    assert len(body["pairs"]) == 1
    assert len(body["pairs"][0]["segments"]) > 0


def test_post_comparison_with_invalid_csv_returns_400() -> None:
    app.dependency_overrides[get_current_user] = lambda: FAKE_USER
    app.dependency_overrides[get_supabase_client] = lambda: MagicMock()

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
    assert "prawidłowych" in response.json()["detail"]


def test_list_comparisons_returns_200() -> None:
    supabase_mock = _make_supabase_mock()
    app.dependency_overrides[get_current_user] = lambda: FAKE_USER
    app.dependency_overrides[get_supabase_client] = lambda: supabase_mock

    client = TestClient(app)
    response = client.get("/api/comparisons")

    assert response.status_code == 200
    body = response.json()
    assert isinstance(body, list)
    assert len(body) == 1
    assert body[0]["name"] == "Test"
    assert "Ewa" in body[0]["person_names"]
