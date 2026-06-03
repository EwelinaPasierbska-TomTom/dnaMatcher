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

ANCESTOR_ID = "eeeeeeee-0000-0000-0000-000000000005"

ANCESTOR_ROW: dict[str, object] = {
    "id": ANCESTOR_ID,
    "user_id": str(FAKE_USER.id),
    "name": "Babcia Maria",
    "color": "#f97316",
    "created_at": "2026-06-03T00:00:00+00:00",
}


def _make_db_mock(**table_overrides: MagicMock) -> MagicMock:
    mock = MagicMock()
    db = MagicMock()

    def from_(table_name: str) -> MagicMock:
        return table_overrides.get(table_name, MagicMock())

    db.from_.side_effect = from_
    mock.postgrest.auth.return_value = db
    return mock


def _anc_list_table(rows: list[dict[str, object]]) -> MagicMock:
    t = MagicMock()
    rv = t.select.return_value.eq.return_value.order.return_value
    rv.execute.return_value.data = rows
    return t


def _anc_insert_table(returned_row: dict[str, object] | None) -> MagicMock:
    t = MagicMock()
    t.insert.return_value.execute.return_value.data = (
        [returned_row] if returned_row else []
    )
    return t


def _anc_update_table(returned_row: dict[str, object] | None) -> MagicMock:
    t = MagicMock()
    t.update.return_value.eq.return_value.eq.return_value.execute.return_value.data = (
        [returned_row] if returned_row else []
    )
    return t


def _anc_delete_table(found: bool = True) -> MagicMock:
    t = MagicMock()
    t.delete.return_value.eq.return_value.eq.return_value.execute.return_value.data = (
        [{"id": ANCESTOR_ID}] if found else []
    )
    return t


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------


def test_list_ancestors_returns_empty_list() -> None:
    supabase_mock = _make_db_mock(ancestors=_anc_list_table([]))
    app.dependency_overrides[get_current_user] = lambda: FAKE_USER
    app.dependency_overrides[get_supabase_client] = lambda: supabase_mock

    client = TestClient(app)
    response = client.get("/api/ancestors")

    assert response.status_code == 200
    assert response.json() == []


def test_create_ancestor_returns_201() -> None:
    supabase_mock = _make_db_mock(ancestors=_anc_insert_table(ANCESTOR_ROW))
    app.dependency_overrides[get_current_user] = lambda: FAKE_USER
    app.dependency_overrides[get_supabase_client] = lambda: supabase_mock

    client = TestClient(app)
    response = client.post(
        "/api/ancestors", json={"name": "Babcia Maria", "color": "#f97316"}
    )

    assert response.status_code == 201
    body = response.json()
    assert body["name"] == "Babcia Maria"
    assert body["color"] == "#f97316"
    assert body["id"] == ANCESTOR_ID


def test_update_ancestor_returns_updated_row() -> None:
    updated_row = {**ANCESTOR_ROW, "name": "Babcia Anna", "color": "#a855f7"}
    supabase_mock = _make_db_mock(ancestors=_anc_update_table(updated_row))
    app.dependency_overrides[get_current_user] = lambda: FAKE_USER
    app.dependency_overrides[get_supabase_client] = lambda: supabase_mock

    client = TestClient(app)
    response = client.put(
        f"/api/ancestors/{ANCESTOR_ID}",
        json={"name": "Babcia Anna", "color": "#a855f7"},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["name"] == "Babcia Anna"
    assert body["color"] == "#a855f7"


def test_delete_ancestor_returns_204() -> None:
    supabase_mock = _make_db_mock(ancestors=_anc_delete_table(found=True))
    app.dependency_overrides[get_current_user] = lambda: FAKE_USER
    app.dependency_overrides[get_supabase_client] = lambda: supabase_mock

    client = TestClient(app)
    response = client.delete(f"/api/ancestors/{ANCESTOR_ID}")

    assert response.status_code == 204


def test_delete_wrong_user_ancestor_returns_404() -> None:
    supabase_mock = _make_db_mock(ancestors=_anc_delete_table(found=False))
    app.dependency_overrides[get_current_user] = lambda: FAKE_USER
    app.dependency_overrides[get_supabase_client] = lambda: supabase_mock

    client = TestClient(app)
    response = client.delete(f"/api/ancestors/{ANCESTOR_ID}")

    assert response.status_code == 404
