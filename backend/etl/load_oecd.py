from __future__ import annotations

import hashlib
from pathlib import Path

import duckdb
import pandas as pd

from backend.app.config import DUCKDB_PATH, RAW_WORKBOOK_PATH, WAREHOUSE_DIR

SHEET_NAME = "complete_p4d3_df"

COLUMN_RENAMES = {
    "Donor_country": "donor_country",
    "Sector": "sector",
}

MARKER_COLUMNS = [
    "gender_marker",
    "climate_change_mitigation",
    "climate_change_adaptation",
    "environment",
    "biodiversity",
    "desertification",
    "nutrition",
]

TEXT_COLUMNS = [
    "year",
    "organization_name",
    "region",
    "country",
    "grant_recipient_project_title",
    "project_description",
    "expected_duration",
    "type_of_flow",
    "donor_country",
    "financial_instrument",
    "modality_of_giving",
    "gender_dimension",
    "additional_info",
    "subsector",
    "sdg_focus",
    "row_id",
    "subsector_description",
    "sector",
    "sector_description",
    "channel_code",
    "channel_name",
    "channel_reported_name",
    "region_macro",
]

NUMERIC_COLUMNS = ["usd_disbursements_defl", "usd_commitment_defl"]
EXCLUDED_YEAR_VALUES = {"2020-2023"}


def stable_project_key(row: pd.Series) -> str:
    row_id = row.get("row_id")
    project_id = row_id if pd.notna(row_id) and str(row_id).strip() else f"missing:{row['source_row_number']}"
    raw = "|".join(
        [
            str(project_id),
            str(row.get("organization_name") or ""),
            str(row.get("year") or ""),
        ]
    )
    return hashlib.sha1(raw.encode("utf-8")).hexdigest()[:16]


def clean_dataframe(workbook_path: Path) -> pd.DataFrame:
    df = pd.read_excel(workbook_path, sheet_name=SHEET_NAME, dtype=object, engine="openpyxl")
    df = df.rename(columns=COLUMN_RENAMES)
    df.insert(0, "source_row_number", range(2, len(df) + 2))
    df.insert(0, "activity_sector_id", range(1, len(df) + 1))

    for column in TEXT_COLUMNS:
        if column in df.columns:
            df[column] = df[column].astype("string").str.strip()
            df[column] = df[column].where(df[column].notna(), None)

    df = df[~df["year"].isin(EXCLUDED_YEAR_VALUES)].copy()

    for column in NUMERIC_COLUMNS:
        df[column] = pd.to_numeric(df[column], errors="coerce")

    for column in MARKER_COLUMNS:
        df[column] = pd.to_numeric(df[column], errors="coerce").astype("Int64")

    df["project_key"] = df.apply(stable_project_key, axis=1)

    column_order = [
        "activity_sector_id",
        "source_row_number",
        "project_key",
        "row_id",
        "year",
        "organization_name",
        "region",
        "country",
        "region_macro",
        "usd_disbursements_defl",
        "usd_commitment_defl",
        "grant_recipient_project_title",
        "project_description",
        "expected_duration",
        "type_of_flow",
        "donor_country",
        "financial_instrument",
        "modality_of_giving",
        "gender_dimension",
        "additional_info",
        "gender_marker",
        "climate_change_mitigation",
        "climate_change_adaptation",
        "subsector",
        "subsector_description",
        "sector",
        "sector_description",
        "sdg_focus",
        "channel_code",
        "channel_name",
        "channel_reported_name",
        "environment",
        "biodiversity",
        "desertification",
        "nutrition",
    ]
    return df[column_order]


def create_views(con: duckdb.DuckDBPyConnection) -> None:
    con.execute(
        """
        CREATE OR REPLACE VIEW v_project_amounts AS
        WITH grouped AS (
            SELECT
                project_key,
                any_value(row_id) AS row_id,
                any_value(year) AS year,
                any_value(organization_name) AS organization_name,
                any_value(donor_country) AS donor_country,
                any_value(country) AS country,
                any_value(region) AS region,
                any_value(region_macro) AS region_macro,
                any_value(type_of_flow) AS type_of_flow,
                any_value(grant_recipient_project_title) AS grant_recipient_project_title,
                any_value(project_description) AS project_description,
                any_value(channel_reported_name) AS channel_reported_name,
                any_value(sector_description) AS sector_description_primary,
                any_value(subsector_description) AS subsector_description_primary,
                COUNT(*) AS sector_row_count,
                COUNT(DISTINCT sector_description) AS distinct_sector_count,
                COUNT(DISTINCT usd_disbursements_defl) FILTER (WHERE usd_disbursements_defl IS NOT NULL) AS disbursement_value_count,
                COUNT(DISTINCT usd_commitment_defl) FILTER (WHERE usd_commitment_defl IS NOT NULL) AS commitment_value_count,
                MAX(usd_disbursements_defl) AS max_disbursement,
                SUM(usd_disbursements_defl) AS sum_disbursement,
                MAX(usd_commitment_defl) AS max_commitment,
                SUM(usd_commitment_defl) AS sum_commitment
            FROM fact_activity_sector
            GROUP BY project_key
        )
        SELECT
            *,
            CASE
                WHEN disbursement_value_count <= 1 THEN coalesce(max_disbursement, 0)
                ELSE coalesce(sum_disbursement, 0)
            END AS usd_disbursements_project_est,
            CASE
                WHEN commitment_value_count <= 1 THEN coalesce(max_commitment, 0)
                ELSE coalesce(sum_commitment, 0)
            END AS usd_commitment_project_est,
            CASE
                WHEN disbursement_value_count <= 1 THEN 'dedup_identical_sector_rows'
                ELSE 'sum_varied_sector_rows'
            END AS amount_rule
        FROM grouped
        """
    )
    con.execute(
        """
        CREATE OR REPLACE VIEW v_sdg_bridge AS
        SELECT
            activity_sector_id,
            project_key,
            trim(token) AS sdg_token
        FROM fact_activity_sector,
        unnest(string_split(coalesce(sdg_focus, ''), ';')) AS t(token)
        WHERE trim(token) <> ''
        """
    )
    con.execute(
        """
        CREATE OR REPLACE VIEW dim_sector AS
        SELECT sector, sector_description, COUNT(*) AS row_count
        FROM fact_activity_sector
        WHERE sector IS NOT NULL
        GROUP BY 1, 2
        ORDER BY row_count DESC
        """
    )
    con.execute(
        """
        CREATE OR REPLACE VIEW dim_geo AS
        SELECT country, region, region_macro, COUNT(*) AS row_count
        FROM fact_activity_sector
        GROUP BY 1, 2, 3
        ORDER BY row_count DESC
        """
    )


def build_warehouse(workbook_path: Path = RAW_WORKBOOK_PATH, db_path: Path = DUCKDB_PATH) -> dict:
    if not workbook_path.exists():
        raise FileNotFoundError(f"Workbook not found at {workbook_path}")

    WAREHOUSE_DIR.mkdir(parents=True, exist_ok=True)
    if db_path.exists():
        db_path.unlink()

    df = clean_dataframe(workbook_path)
    con = duckdb.connect(str(db_path))
    try:
        con.register("source_df", df)
        con.execute("CREATE TABLE fact_activity_sector AS SELECT * FROM source_df")
        create_views(con)
        stats = con.execute(
            """
            SELECT
                (SELECT COUNT(*) FROM fact_activity_sector) AS fact_rows,
                (SELECT COUNT(DISTINCT project_key) FROM fact_activity_sector) AS project_keys,
                (SELECT SUM(usd_disbursements_project_est) FROM v_project_amounts) AS project_safe_disbursements
            """
        ).fetchone()
    finally:
        con.close()

    return {
        "db_path": str(db_path),
        "fact_rows": int(stats[0]),
        "project_keys": int(stats[1]),
        "project_safe_disbursements": float(stats[2] or 0),
    }


if __name__ == "__main__":
    print(build_warehouse())
