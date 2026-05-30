from fastapi.testclient import TestClient

from main import app


def test_cors_header_for_vite_origin() -> None:
    client = TestClient(app)
    response = client.get("/api/me", headers={"Origin": "http://localhost:5173"})
    assert (
        response.headers.get("access-control-allow-origin") == "http://localhost:5173"
    )
