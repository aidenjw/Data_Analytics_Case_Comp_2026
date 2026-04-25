from __future__ import annotations

from dataclasses import dataclass

from .schemas import FilterRequest


METRIC_COLUMNS = {
    "disbursements": "usd_disbursements_project_est",
    "commitments": "usd_commitment_project_est",
}

SECTOR_METRIC_COLUMNS = {
    "disbursements": "usd_disbursements_defl",
    "commitments": "usd_commitment_defl",
}


@dataclass
class WhereClause:
    sql: str
    params: list[object]


def _in_clause(column: str, values: list[str], params: list[object]) -> str | None:
    clean = [value for value in values if value]
    if not clean:
        return None
    placeholders = ", ".join(["?"] * len(clean))
    params.extend(clean)
    return f"{column} IN ({placeholders})"


def build_fact_where(filters: FilterRequest, alias: str = "f") -> WhereClause:
    params: list[object] = []
    prefix = f"{alias}." if alias else ""
    clauses: list[str] = []

    mappings = [
        (f"{prefix}year", filters.years),
        (f"{prefix}donor_country", filters.donorCountries),
        (f"{prefix}country", filters.recipientCountries),
        (f"{prefix}region", filters.regions),
        (f"{prefix}region_macro", filters.macroRegions),
        (f"{prefix}organization_name", filters.organizations),
        (f"{prefix}sector_description", filters.sectors),
        (f"{prefix}subsector_description", filters.subsectors),
        (f"{prefix}type_of_flow", filters.flowTypes),
    ]
    for column, values in mappings:
        clause = _in_clause(column, values, params)
        if clause:
            clauses.append(clause)

    markers = filters.markers
    if markers.climate is True:
        clauses.append(
            f"(coalesce({prefix}climate_change_mitigation, 0) > 0 "
            f"OR coalesce({prefix}climate_change_adaptation, 0) > 0)"
        )
    if markers.climate is False:
        clauses.append(
            f"(coalesce({prefix}climate_change_mitigation, 0) = 0 "
            f"AND coalesce({prefix}climate_change_adaptation, 0) = 0)"
        )
    if markers.gender is True:
        clauses.append(f"coalesce({prefix}gender_marker, 0) > 0")
    if markers.gender is False:
        clauses.append(f"coalesce({prefix}gender_marker, 0) = 0")
    if markers.environment is True:
        clauses.append(
            f"(coalesce({prefix}environment, 0) > 0 "
            f"OR coalesce({prefix}biodiversity, 0) > 0 "
            f"OR coalesce({prefix}desertification, 0) > 0)"
        )
    if markers.environment is False:
        clauses.append(
            f"(coalesce({prefix}environment, 0) = 0 "
            f"AND coalesce({prefix}biodiversity, 0) = 0 "
            f"AND coalesce({prefix}desertification, 0) = 0)"
        )
    if markers.nutrition is True:
        clauses.append(f"coalesce({prefix}nutrition, 0) > 0")
    if markers.nutrition is False:
        clauses.append(f"coalesce({prefix}nutrition, 0) = 0")

    if filters.searchText:
        params.extend([f"%{filters.searchText}%"] * 4)
        clauses.append(
            "("
            f"{prefix}organization_name ILIKE ? OR "
            f"{prefix}grant_recipient_project_title ILIKE ? OR "
            f"{prefix}project_description ILIKE ? OR "
            f"{prefix}channel_reported_name ILIKE ?"
            ")"
        )

    return WhereClause(" AND ".join(clauses) if clauses else "TRUE", params)


def filtered_project_cte(filters: FilterRequest) -> WhereClause:
    where = build_fact_where(filters, "f")
    sql = f"""
        WITH filtered_project_keys AS (
            SELECT DISTINCT f.project_key
            FROM fact_activity_sector f
            WHERE {where.sql}
        )
    """
    return WhereClause(sql, where.params)
