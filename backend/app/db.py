from contextlib import contextmanager
from pathlib import Path
from typing import Iterator

import duckdb

from .config import DUCKDB_PATH


class WarehouseMissingError(RuntimeError):
    pass


def ensure_warehouse(path: Path = DUCKDB_PATH) -> None:
    if not path.exists():
        raise WarehouseMissingError(
            f"Warehouse not found at {path}. Run `python -m backend.etl.load_oecd` first."
        )


@contextmanager
def connect(read_only: bool = True) -> Iterator[duckdb.DuckDBPyConnection]:
    ensure_warehouse()
    con = duckdb.connect(str(DUCKDB_PATH), read_only=read_only)
    try:
        yield con
    finally:
        con.close()
