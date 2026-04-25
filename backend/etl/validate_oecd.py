from __future__ import annotations

from backend.app.db import connect


def validate() -> dict:
    with connect() as con:
        return con.execute(
            """
            SELECT
                (SELECT COUNT(*) FROM fact_activity_sector) AS fact_rows,
                (SELECT COUNT(DISTINCT row_id) FROM fact_activity_sector WHERE row_id IS NOT NULL) AS raw_row_ids,
                (SELECT COUNT(DISTINCT project_key) FROM fact_activity_sector) AS project_keys,
                (SELECT COUNT(*) FROM v_project_amounts) AS project_rows,
                (SELECT SUM(usd_disbursements_project_est) FROM v_project_amounts) AS project_safe_disbursements
            """
        ).fetchdf().to_dict("records")[0]


if __name__ == "__main__":
    print(validate())
