# Data Analytics Case Competition 2026

Local full-stack dashboard for exploring OECD private philanthropy funding patterns across geography, sectors, donors, recipients, and timing.

## What is included

- `backend/`: FastAPI API, DuckDB warehouse queries, ETL, and backend tests.
- `frontend/`: Vite + React + TypeScript dashboard with SWR, ECharts, TanStack Table, and map exploration.
- `data/raw/OECD Dataset.xlsx`: local source workbook used by the ETL.
- `data/warehouse/oecd.duckdb`: generated local warehouse after running the ETL.

## Local setup

```bash
npm run setup
npm run etl
```

Then start the backend and frontend in separate terminals:

```bash
npm run dev:backend
npm run dev:frontend
```

Open `http://127.0.0.1:5173`.

## Tests

```bash
npm run test:backend
npm run test:frontend
npm run build:frontend
```

## Data notes

- Primary metric: `usd_disbursements_defl`, shown as USD millions in 2023 constant dollars.
- Secondary metric: `usd_commitment_defl`, which has substantial missingness in the source workbook.
- The workbook row grain is sector-level activity. Some projects repeat across sector rows, so headline KPIs use project-safe estimates while sector panels preserve source row detail.
- `row_id` is not treated as a primary key by itself; project-level grouping uses a composite hash of row id, organization, and year, with source-row fallback for missing row ids.
