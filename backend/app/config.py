from pathlib import Path


PROJECT_DIR = Path(__file__).resolve().parents[2]
DATA_DIR = PROJECT_DIR / "data"
RAW_WORKBOOK_PATH = DATA_DIR / "raw" / "OECD Dataset.xlsx"
WAREHOUSE_DIR = DATA_DIR / "warehouse"
DUCKDB_PATH = WAREHOUSE_DIR / "oecd.duckdb"

PRIMARY_METRIC = "usd_disbursements_defl"
SECONDARY_METRIC = "usd_commitment_defl"
