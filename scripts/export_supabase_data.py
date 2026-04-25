from __future__ import annotations

from pathlib import Path

from backend.app.config import PROJECT_DIR, RAW_WORKBOOK_PATH
from backend.etl.load_oecd import clean_dataframe


OUTPUT_DIR = PROJECT_DIR / "data" / "supabase"
OUTPUT_PATH = OUTPUT_DIR / "fact_activity_sector.csv"


def main() -> None:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    df = clean_dataframe(RAW_WORKBOOK_PATH)
    df.to_csv(OUTPUT_PATH, index=False)
    print({"csv_path": str(OUTPUT_PATH), "rows": len(df), "columns": len(df.columns)})


if __name__ == "__main__":
    main()
