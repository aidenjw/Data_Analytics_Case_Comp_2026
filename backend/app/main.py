from __future__ import annotations

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware

from .db import WarehouseMissingError, connect
from .query_builder import (
    METRIC_COLUMNS,
    SECTOR_METRIC_COLUMNS,
    build_fact_where,
    filtered_project_cte,
)
from .prompt_parser import parse_chart_prompt, parse_dashboard_prompt
from .schemas import ChartSpec, FilterRequest, GroupedRequest, ProjectSearchRequest, PromptRequest

app = FastAPI(title="OECD Philanthropy Dashboard API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def rows(query: str, params: list[object] | None = None) -> list[dict]:
    try:
        with connect() as con:
            return con.execute(query, params or []).fetchdf().to_dict("records")
    except WarehouseMissingError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc


def row(query: str, params: list[object] | None = None) -> dict:
    result = rows(query, params)
    return result[0] if result else {}


def metadata_catalog() -> dict[str, list[str]]:
    def distinct(column: str, limit: int = 500) -> list[str]:
        data = rows(
            f"""
            SELECT {column} AS value
            FROM fact_activity_sector
            WHERE {column} IS NOT NULL AND {column} <> ''
            GROUP BY 1
            ORDER BY count(*) DESC, value
            LIMIT ?
            """,
            [limit],
        )
        return [item["value"] for item in data]

    return {
        "years": distinct("year", 20),
        "donorCountries": distinct("donor_country"),
        "recipientCountries": distinct("country"),
        "regions": distinct("region"),
        "macroRegions": distinct("region_macro"),
        "organizations": distinct("organization_name"),
        "sectors": distinct("sector_description"),
        "subsectors": distinct("subsector_description"),
        "flowTypes": distinct("type_of_flow", 20),
    }


@app.get("/health")
def health() -> dict:
    try:
        stats = row("SELECT COUNT(*) AS rows FROM fact_activity_sector")
        return {"status": "ok", "warehouse": "ready", "factRows": int(stats["rows"])}
    except HTTPException:
        return {"status": "setup_required", "warehouse": "missing", "factRows": 0}


@app.get("/metadata")
def metadata() -> dict:
    catalog = metadata_catalog()
    stats = row(
        """
        SELECT
            (SELECT COUNT(*) FROM fact_activity_sector) AS sector_rows,
            (SELECT COUNT(*) FROM v_project_amounts) AS projects,
            (SELECT SUM(usd_disbursements_project_est) FROM v_project_amounts) AS project_disbursements,
            (SELECT SUM(usd_commitment_project_est) FROM v_project_amounts) AS project_commitments
        """
    )
    return {
        **catalog,
        "metrics": [
            {
                "id": "disbursements",
                "label": "Disbursements",
                "field": "usd_disbursements_defl",
                "unit": "USD millions, 2023 constant",
            },
            {
                "id": "commitments",
                "label": "Commitments",
                "field": "usd_commitment_defl",
                "unit": "USD millions, 2023 constant",
                "note": "Commitments are missing in about 62% of source rows.",
            },
        ],
        "stats": stats,
        "dataNotes": [
            "The dashboard excludes aggregate 2020-2023 rows and only shows discrete annual records.",
            "Global KPIs use project-safe estimates to reduce duplicate sector-split inflation.",
            "Sector breakdowns use the source sector-row grain so multi-sector projects remain visible.",
            "Marker fields include null values for non-screened projects.",
        ],
    }


@app.post("/summary")
def summary(filters: FilterRequest) -> dict:
    cte = filtered_project_cte(filters)
    metric = METRIC_COLUMNS[filters.metric]
    result = row(
        f"""
        {cte.sql}
        SELECT
            coalesce(SUM(p.{metric}), 0) AS total_amount,
            COUNT(*) AS project_count,
            SUM(p.sector_row_count) AS sector_row_count,
            COUNT(DISTINCT p.organization_name) AS donor_count,
            COUNT(DISTINCT p.country) AS recipient_count,
            COUNT(DISTINCT p.sector_description_primary) AS sector_count,
            SUM(CASE WHEN p.amount_rule = 'dedup_identical_sector_rows' THEN 1 ELSE 0 END) AS deduped_project_count,
            SUM(CASE WHEN p.amount_rule = 'sum_varied_sector_rows' THEN 1 ELSE 0 END) AS summed_project_count
        FROM v_project_amounts p
        JOIN filtered_project_keys k ON k.project_key = p.project_key
        """,
        cte.params,
    )
    years = rows(
        f"""
        {cte.sql}
        SELECT
            p.year,
            coalesce(SUM(p.{metric}), 0) AS amount
        FROM v_project_amounts p
        JOIN filtered_project_keys k ON k.project_key = p.project_key
        GROUP BY 1
        ORDER BY 1
        """,
        cte.params,
    )
    return {
        **result,
        "metric": filters.metric,
        "unit": "USD millions, 2023 constant",
        "yearSeries": years,
    }


@app.post("/trends")
def trends(filters: GroupedRequest) -> dict:
    cte = filtered_project_cte(filters)
    metric = METRIC_COLUMNS[filters.metric]
    group = filters.groupBy
    data = rows(
        f"""
        {cte.sql}
        SELECT
            p.{group} AS label,
            coalesce(SUM(p.{metric}), 0) AS amount,
            COUNT(*) AS project_count
        FROM v_project_amounts p
        JOIN filtered_project_keys k ON k.project_key = p.project_key
        GROUP BY 1
        ORDER BY label
        LIMIT ?
        """,
        [*cte.params, filters.limit],
    )
    return {"groupBy": group, "metric": filters.metric, "items": data}


@app.post("/rankings")
def rankings(filters: GroupedRequest) -> dict:
    if filters.grain == "sector" or filters.groupBy in {"sector_description", "subsector_description"}:
        where = build_fact_where(filters, "f")
        metric = SECTOR_METRIC_COLUMNS[filters.metric]
        data = rows(
            f"""
            SELECT
                f.{filters.groupBy} AS label,
                coalesce(SUM(f.{metric}), 0) AS amount,
                COUNT(*) AS row_count,
                COUNT(DISTINCT f.project_key) AS project_count
            FROM fact_activity_sector f
            WHERE {where.sql}
            GROUP BY 1
            HAVING label IS NOT NULL AND label <> ''
            ORDER BY amount DESC
            LIMIT ?
            """,
            [*where.params, filters.limit],
        )
        return {"grain": "sector", "groupBy": filters.groupBy, "metric": filters.metric, "items": data}

    cte = filtered_project_cte(filters)
    metric = METRIC_COLUMNS[filters.metric]
    data = rows(
        f"""
        {cte.sql}
        SELECT
            p.{filters.groupBy} AS label,
            coalesce(SUM(p.{metric}), 0) AS amount,
            COUNT(*) AS project_count
        FROM v_project_amounts p
        JOIN filtered_project_keys k ON k.project_key = p.project_key
        GROUP BY 1
        HAVING label IS NOT NULL AND label <> ''
        ORDER BY amount DESC
        LIMIT ?
        """,
        [*cte.params, filters.limit],
    )
    return {"grain": "project", "groupBy": filters.groupBy, "metric": filters.metric, "items": data}


@app.post("/geography")
def geography(filters: FilterRequest) -> dict:
    cte = filtered_project_cte(filters)
    metric = METRIC_COLUMNS[filters.metric]
    data = rows(
        f"""
        {cte.sql}
        SELECT
            p.country,
            p.region,
            p.region_macro,
            coalesce(SUM(p.{metric}), 0) AS amount,
            COUNT(*) AS project_count
        FROM v_project_amounts p
        JOIN filtered_project_keys k ON k.project_key = p.project_key
        GROUP BY 1, 2, 3
        HAVING p.country IS NOT NULL AND p.country <> ''
        ORDER BY amount DESC
        LIMIT 250
        """,
        cte.params,
    )
    return {"metric": filters.metric, "items": data}


@app.post("/projects/search")
def project_search(filters: ProjectSearchRequest) -> dict:
    cte = filtered_project_cte(filters)
    metric = METRIC_COLUMNS[filters.metric]
    data = rows(
        f"""
        {cte.sql}
        SELECT
            p.project_key,
            p.year,
            p.organization_name,
            p.donor_country,
            p.country,
            p.region,
            p.region_macro,
            p.grant_recipient_project_title,
            p.project_description,
            p.sector_description_primary,
            p.subsector_description_primary,
            p.{metric} AS amount,
            p.sector_row_count,
            p.amount_rule
        FROM v_project_amounts p
        JOIN filtered_project_keys k ON k.project_key = p.project_key
        ORDER BY amount DESC NULLS LAST
        LIMIT ? OFFSET ?
        """,
        [*cte.params, filters.limit, filters.offset],
    )
    total = row(
        f"""
        {cte.sql}
        SELECT COUNT(*) AS total
        FROM v_project_amounts p
        JOIN filtered_project_keys k ON k.project_key = p.project_key
        """,
        cte.params,
    )
    return {"items": data, "total": int(total.get("total", 0)), "limit": filters.limit, "offset": filters.offset}


@app.get("/projects/{project_key}")
def project_detail(project_key: str) -> dict:
    project = row("SELECT * FROM v_project_amounts WHERE project_key = ?", [project_key])
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    sectors = rows(
        """
        SELECT
            source_row_number,
            sector,
            sector_description,
            subsector,
            subsector_description,
            sdg_focus,
            usd_disbursements_defl,
            usd_commitment_defl
        FROM fact_activity_sector
        WHERE project_key = ?
        ORDER BY source_row_number
        """,
        [project_key],
    )
    return {"project": project, "sectorRows": sectors}


def execute_chart_spec(spec: ChartSpec) -> dict:
    if spec.endpoint == "summary":
        return summary(spec.filters)
    if spec.endpoint == "geography":
        return geography(spec.filters)
    if spec.endpoint == "projects":
        return project_search(
            ProjectSearchRequest.model_validate(
                {**spec.filters.model_dump(), "limit": spec.limit, "offset": 0}
            )
        )

    payload = {
        **spec.filters.model_dump(),
        "groupBy": spec.groupBy or "year",
        "grain": spec.grain,
        "limit": spec.limit,
    }
    request = GroupedRequest.model_validate(payload)
    if spec.endpoint == "trends":
        return trends(request)
    return rankings(request)


@app.post("/prompt/chart")
def prompt_chart(request: PromptRequest) -> dict:
    spec = parse_chart_prompt(request.prompt, request.baseFilters, metadata_catalog())
    return {
        "prompt": request.prompt,
        "spec": spec.model_dump(),
        "data": execute_chart_spec(spec),
    }


@app.post("/prompt/dashboard")
def prompt_dashboard(request: PromptRequest) -> dict:
    dashboard = parse_dashboard_prompt(request.prompt, request.baseFilters, metadata_catalog())
    cards = []
    for spec in dashboard["cards"]:
        cards.append({"spec": spec.model_dump(), "data": execute_chart_spec(spec)})
    return {
        "prompt": request.prompt,
        "dashboard": {
            "id": dashboard["id"],
            "title": dashboard["title"],
            "description": dashboard["description"],
            "cards": cards,
        },
    }
