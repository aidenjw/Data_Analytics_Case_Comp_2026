from pathlib import Path
import os

try:
    from dotenv import load_dotenv
except ImportError:  # pragma: no cover
    load_dotenv = None


PROJECT_DIR = Path(__file__).resolve().parents[2]
if load_dotenv:
    load_dotenv(PROJECT_DIR / ".env")

DATA_DIR = PROJECT_DIR / "data"
RAW_WORKBOOK_PATH = DATA_DIR / "raw" / "OECD Dataset.xlsx"
WAREHOUSE_DIR = DATA_DIR / "warehouse"
DUCKDB_PATH = WAREHOUSE_DIR / "oecd.duckdb"

PRIMARY_METRIC = "usd_disbursements_defl"
SECONDARY_METRIC = "usd_commitment_defl"

OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")
OPENAI_MODEL = os.getenv("OPENAI_MODEL", "gpt-5-mini")
