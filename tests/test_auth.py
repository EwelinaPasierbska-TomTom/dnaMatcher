from uuid import UUID

from fastapi.testclient import TestClient

from main import app
from src.auth.dependencies import get_current_user
from src.auth.models import CurrentUser

FAKE_USER = CurrentUser(
    id=UUID("00000000-0000-0000-0000-000000000001"),
    email="test@example.com",
)


def test_health_unprotected() -> None:
    client = TestClient(app)
    response = client.get("/health")
    assert response.status_code == 200


def test_me_without_token() -> None:
    client = TestClient(app)
    response = client.get("/api/me")
    assert response.status_code == 401


def test_me_with_mocked_user() -> None:
    app.dependency_overrides[get_current_user] = lambda: FAKE_USER
    client = TestClient(app)
    response = client.get("/api/me")
    assert response.status_code == 200
    data = response.json()
    assert data["email"] == "test@example.com"
