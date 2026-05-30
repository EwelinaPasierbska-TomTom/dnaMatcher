from fastapi.testclient import TestClient

from main import app


def test_cors_preflight_for_vite_origin() -> None:
    client = TestClient(app)
    response = client.options(
        "/api/me",
        headers={
            "Origin": "http://localhost:5173",
            "Access-Control-Request-Method": "GET",
        },
    )
    assert response.status_code == 200
    assert (
        response.headers.get("access-control-allow-origin") == "http://localhost:5173"
    )
