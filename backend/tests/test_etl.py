from backend.app.db import connect


def test_fact_table_preserves_source_rows() -> None:
    with connect() as con:
        count = con.execute("SELECT COUNT(*) FROM fact_activity_sector").fetchone()[0]
    assert count == 116_558


def test_aggregate_year_rows_are_excluded() -> None:
    with connect() as con:
        count = con.execute("SELECT COUNT(*) FROM fact_activity_sector WHERE year = '2020-2023'").fetchone()[0]
    assert count == 0


def test_row_id_is_not_primary_key() -> None:
    with connect() as con:
        duplicate_count = con.execute(
            """
            SELECT COUNT(*)
            FROM (
                SELECT row_id
                FROM fact_activity_sector
                WHERE row_id IS NOT NULL
                GROUP BY row_id
                HAVING COUNT(*) > 1
            )
            """
        ).fetchone()[0]
    assert duplicate_count > 0


def test_project_view_has_one_row_per_project_key() -> None:
    with connect() as con:
        project_rows, project_keys = con.execute(
            """
            SELECT
                (SELECT COUNT(*) FROM v_project_amounts),
                (SELECT COUNT(DISTINCT project_key) FROM fact_activity_sector)
            """
        ).fetchone()
    assert project_rows == project_keys
