from fastapi.testclient import TestClient

from backend.app.main import app


client = TestClient(app)


def test_health() -> None:
    response = client.get("/health")
    assert response.status_code == 200
    assert "status" in response.json()


def test_summary_filter_by_year() -> None:
    response = client.post("/summary", json={"years": ["2023"], "metric": "disbursements"})
    assert response.status_code == 200
    payload = response.json()
    assert payload["metric"] == "disbursements"
    assert payload["project_count"] > 0


def test_project_search_empty_result() -> None:
    response = client.post(
        "/projects/search",
        json={"searchText": "definitely-not-a-real-oecd-project-token", "limit": 5},
    )
    assert response.status_code == 200
    assert response.json()["items"] == []
