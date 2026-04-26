from fastapi.testclient import TestClient

from backend.app.main import app


client = TestClient(app)


def test_prompt_chart_top_donors_in_india() -> None:
    response = client.post(
        "/prompt/chart",
        json={"prompt": "Show top 10 donors for infectious disease funding in India"},
    )
    assert response.status_code == 200
    payload = response.json()
    spec = payload["spec"]
    assert spec["endpoint"] == "rankings"
    assert spec["groupBy"] == "organization_name"
    assert spec["filters"]["recipientCountries"] == ["India"]
    assert spec["filters"]["searchText"] == "infectious disease"
    assert len(payload["data"]["items"]) <= 10


def test_prompt_chart_climate_over_time() -> None:
    response = client.post(
        "/prompt/chart",
        json={"prompt": "How has global funding for climate changed over time?"},
    )
    assert response.status_code == 200
    payload = response.json()
    spec = payload["spec"]
    assert spec["endpoint"] == "trends"
    assert spec["chartType"] == "line"
    assert spec["filters"]["markers"]["climate"] is True
    assert payload["data"]["groupBy"] == "year"


def test_prompt_dashboard_returns_cards() -> None:
    response = client.post(
        "/prompt/dashboard",
        json={"prompt": "Create a one page dashboard about climate funding since 2021"},
    )
    assert response.status_code == 200
    dashboard = response.json()["dashboard"]
    assert len(dashboard["cards"]) >= 4
    assert dashboard["cards"][0]["spec"]["endpoint"] == "summary"
