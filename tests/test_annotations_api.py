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
    access_token="fake-token",
)

COMPARISON_ID = "cccccccc-0000-0000-0000-000000000003"
PROFILE_ID = "aaaaaaaa-0000-0000-0000-000000000001"
ANNOTATION_ID = "dddddddd-0000-0000-0000-000000000004"

ANNOTATION_ROW = {
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

COMP_ROW = {
    "id": COMPARISON_ID,
    "profile_ids": [PROFILE_ID],
    "user_id": str(FAKE_USER.id),
}


def _make_db_mock(**table_overrides: MagicMock) -> MagicMock:
    """Return a Supabase client mock with per-table overrides."""
    mock = MagicMock()
    db = MagicMock()

    def from_(table_name: str) -> MagicMock:
        return table_overrides.get(table_name, MagicMock())

    db.from_.side_effect = from_
    mock.postgrest.auth.return_value = db
    return mock


def _comp_table(profile_ids: list[str] | None = None) -> MagicMock:
    t = MagicMock()
    data = [{**COMP_ROW, "profile_ids": profile_ids or [PROFILE_ID]}]
    t.select.return_value.eq.return_value.eq.return_value.execute.return_value.data = (
        data
    )
    return t


def _profile_table(found: bool = True) -> MagicMock:
    t = MagicMock()
    t.select.return_value.eq.return_value.eq.return_value.execute.return_value.data = (
        [{"id": PROFILE_ID}] if found else []
    )
    return t


def _ann_table_for_get(rows: list[dict[str, object]]) -> MagicMock:
    t = MagicMock()
    t.select.return_value.in_.return_value.execute.return_value.data = rows
    return t


def _ann_table_for_upsert(returned_row: dict[str, object]) -> MagicMock:
    t = MagicMock()
    t.upsert.return_value.execute.return_value.data = [returned_row]
    return t


def _ann_table_for_delete(found: bool = True) -> MagicMock:
    t = MagicMock()
    t.select.return_value.eq.return_value.eq.return_value.execute.return_value.data = (
        [{"id": ANNOTATION_ID}] if found else []
    )
    t.delete.return_value.eq.return_value.execute.return_value.data = []
    return t


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------


def test_get_annotations_returns_200_with_list() -> None:
    supabase_mock = _make_db_mock(
        comparisons=_comp_table(),
        ancestor_annotations=_ann_table_for_get([ANNOTATION_ROW]),
    )
    app.dependency_overrides[get_current_user] = lambda: FAKE_USER
    app.dependency_overrides[get_supabase_client] = lambda: supabase_mock

    client = TestClient(app)
    response = client.get(f"/api/comparisons/{COMPARISON_ID}/annotations")

    assert response.status_code == 200
    body = response.json()
    assert isinstance(body, list)
    assert len(body) == 1
    assert body[0]["ancestor_label"] == "Babcia Maria"
    assert body[0]["strand"] == "maternal"


def test_post_annotation_creates_and_returns_annotation() -> None:
    supabase_mock = _make_db_mock(
        dna_profiles=_profile_table(found=True),
        ancestor_annotations=_ann_table_for_upsert(ANNOTATION_ROW),
    )
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

    assert response.status_code == 200, response.text
    body = response.json()
    assert body["ancestor_label"] == "Babcia Maria"
    assert body["strand"] == "maternal"
    assert body["id"] == ANNOTATION_ID


def test_post_annotation_upsert_returns_updated_label() -> None:
    updated_row = {**ANNOTATION_ROW, "ancestor_label": "Babcia Anna"}
    supabase_mock = _make_db_mock(
        dna_profiles=_profile_table(found=True),
        ancestor_annotations=_ann_table_for_upsert(updated_row),
    )
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
            "ancestor_label": "Babcia Anna",
        },
    )

    assert response.status_code == 200, response.text
    assert response.json()["ancestor_label"] == "Babcia Anna"


def test_delete_annotation_returns_204() -> None:
    supabase_mock = _make_db_mock(
        ancestor_annotations=_ann_table_for_delete(found=True),
    )
    app.dependency_overrides[get_current_user] = lambda: FAKE_USER
    app.dependency_overrides[get_supabase_client] = lambda: supabase_mock

    client = TestClient(app)
    response = client.delete(f"/api/annotations/{ANNOTATION_ID}")

    assert response.status_code == 204


def test_get_annotations_returns_empty_list_when_none_exist() -> None:
    supabase_mock = _make_db_mock(
        comparisons=_comp_table(),
        ancestor_annotations=_ann_table_for_get([]),
    )
    app.dependency_overrides[get_current_user] = lambda: FAKE_USER
    app.dependency_overrides[get_supabase_client] = lambda: supabase_mock

    client = TestClient(app)
    response = client.get(f"/api/comparisons/{COMPARISON_ID}/annotations")

    assert response.status_code == 200
    assert response.json() == []
