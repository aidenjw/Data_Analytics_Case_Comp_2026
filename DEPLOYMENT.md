# Deploying to Supabase + Vercel

This deployment path uses:

- Vercel for the React frontend and `/api/*` serverless functions.
- Supabase Postgres for the OECD data warehouse.
- OpenAI from Vercel serverless functions only. The browser never receives the API key.

## 1. Create Supabase Project

Create a Supabase project, then open the SQL Editor and run:

```sql
-- paste supabase/schema.sql
```

This creates:

- `fact_activity_sector`
- `v_project_amounts`
- `v_sdg_bridge`
- `dim_sector`
- `dim_geo`
- RPC functions used by the Vercel API routes

## 2. Export The CSV

From the repo root:

```bash
npm run export:supabase
```

This writes:

```text
data/supabase/fact_activity_sector.csv
```

The CSV is ignored by git because it is generated data.

## 3. Load The CSV Into Supabase

In Supabase Table Editor:

1. Open `fact_activity_sector`.
2. Choose **Insert > Import data from CSV**.
3. Upload `data/supabase/fact_activity_sector.csv`.
4. Keep the CSV header row enabled.
5. Import.

Then verify in SQL Editor:

```sql
select count(*) from fact_activity_sector;
select count(*) from v_project_amounts;
select dashboard_metadata();
```

Expected source rows: `116561`.

## 4. Configure Vercel Environment Variables

Set these in Vercel Project Settings:

```text
OPENAI_API_KEY=...
OPENAI_MODEL=gpt-5-mini
SUPABASE_URL=...
SUPABASE_SERVICE_ROLE_KEY=...
```

Use the Supabase **service role key** only as a Vercel server-side environment variable. Do not expose it in frontend code.

## 5. Deploy To Vercel

Connect the GitHub repository to Vercel. The included `vercel.json` uses:

```text
Build command: npm install --prefix frontend && npm run build --prefix frontend
Output directory: frontend/dist
```

The frontend calls `/api/*`; in production those requests are handled by Vercel functions in the repo `api/` directory.

## Local Development

Local development can still use the existing FastAPI + DuckDB setup:

```bash
npm run dev:backend
npm run dev:frontend
```

Vite proxies `/api/*` to FastAPI locally. Vercel functions are for deployed production.
