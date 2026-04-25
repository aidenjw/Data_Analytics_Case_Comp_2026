-- Supabase/Postgres schema for the OECD philanthropy dashboard.
-- Run this in Supabase SQL Editor, then load data/supabase/fact_activity_sector.csv.

DROP FUNCTION IF EXISTS dashboard_project_search(jsonb);
DROP FUNCTION IF EXISTS dashboard_trends(jsonb);
DROP FUNCTION IF EXISTS dashboard_rankings(jsonb);
DROP FUNCTION IF EXISTS dashboard_geography(jsonb);
DROP FUNCTION IF EXISTS dashboard_summary(jsonb);
DROP FUNCTION IF EXISTS filtered_project_keys(jsonb);
DROP FUNCTION IF EXISTS dashboard_metadata();
DROP FUNCTION IF EXISTS dashboard_fact_matches(fact_activity_sector, jsonb);
DROP FUNCTION IF EXISTS marker_matches(jsonb, integer, integer, integer, integer, integer, integer, integer);
DROP FUNCTION IF EXISTS filter_text_values(jsonb, text);
DROP VIEW IF EXISTS dim_geo;
DROP VIEW IF EXISTS dim_sector;
DROP VIEW IF EXISTS v_sdg_bridge;
DROP VIEW IF EXISTS v_project_amounts;
DROP TABLE IF EXISTS fact_activity_sector;

CREATE TABLE fact_activity_sector (
  activity_sector_id integer PRIMARY KEY,
  source_row_number integer NOT NULL,
  project_key text NOT NULL,
  row_id text,
  year text,
  organization_name text,
  region text,
  country text,
  region_macro text,
  usd_disbursements_defl double precision,
  usd_commitment_defl double precision,
  grant_recipient_project_title text,
  project_description text,
  expected_duration text,
  type_of_flow text,
  donor_country text,
  financial_instrument text,
  modality_of_giving text,
  gender_dimension text,
  additional_info text,
  gender_marker integer,
  climate_change_mitigation integer,
  climate_change_adaptation integer,
  subsector text,
  subsector_description text,
  sector text,
  sector_description text,
  sdg_focus text,
  channel_code text,
  channel_name text,
  channel_reported_name text,
  environment integer,
  biodiversity integer,
  desertification integer,
  nutrition integer
);

ALTER TABLE fact_activity_sector ENABLE ROW LEVEL SECURITY;

CREATE INDEX fact_project_key_idx ON fact_activity_sector (project_key);
CREATE INDEX fact_year_idx ON fact_activity_sector (year);
CREATE INDEX fact_country_idx ON fact_activity_sector (country);
CREATE INDEX fact_donor_country_idx ON fact_activity_sector (donor_country);
CREATE INDEX fact_org_idx ON fact_activity_sector (organization_name);
CREATE INDEX fact_sector_idx ON fact_activity_sector (sector_description);

CREATE VIEW v_project_amounts AS
WITH grouped AS (
  SELECT
    project_key,
    (array_agg(row_id))[1] AS row_id,
    (array_agg(year))[1] AS year,
    (array_agg(organization_name))[1] AS organization_name,
    (array_agg(donor_country))[1] AS donor_country,
    (array_agg(country))[1] AS country,
    (array_agg(region))[1] AS region,
    (array_agg(region_macro))[1] AS region_macro,
    (array_agg(type_of_flow))[1] AS type_of_flow,
    (array_agg(grant_recipient_project_title))[1] AS grant_recipient_project_title,
    (array_agg(project_description))[1] AS project_description,
    (array_agg(channel_reported_name))[1] AS channel_reported_name,
    (array_agg(sector_description))[1] AS sector_description_primary,
    (array_agg(subsector_description))[1] AS subsector_description_primary,
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
FROM grouped;

CREATE VIEW v_sdg_bridge AS
SELECT
  activity_sector_id,
  project_key,
  trim(token) AS sdg_token
FROM fact_activity_sector,
LATERAL unnest(string_to_array(coalesce(sdg_focus, ''), ';')) AS token
WHERE trim(token) <> '';

CREATE VIEW dim_sector AS
SELECT sector, sector_description, COUNT(*) AS row_count
FROM fact_activity_sector
WHERE sector IS NOT NULL
GROUP BY 1, 2
ORDER BY row_count DESC;

CREATE VIEW dim_geo AS
SELECT country, region, region_macro, COUNT(*) AS row_count
FROM fact_activity_sector
GROUP BY 1, 2, 3
ORDER BY row_count DESC;

CREATE OR REPLACE FUNCTION filter_text_values(filters jsonb, key text)
RETURNS text[]
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT coalesce(array_agg(value), ARRAY[]::text[])
  FROM jsonb_array_elements_text(coalesce(filters -> key, '[]'::jsonb)) AS value;
$$;

CREATE OR REPLACE FUNCTION marker_matches(
  filters jsonb,
  climate_mitigation integer,
  climate_adaptation integer,
  gender integer,
  environment_value integer,
  biodiversity_value integer,
  desertification_value integer,
  nutrition_value integer
)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT
    CASE
      WHEN filters #>> '{markers,climate}' = 'true'
        THEN coalesce(climate_mitigation, 0) > 0 OR coalesce(climate_adaptation, 0) > 0
      WHEN filters #>> '{markers,climate}' = 'false'
        THEN coalesce(climate_mitigation, 0) = 0 AND coalesce(climate_adaptation, 0) = 0
      ELSE true
    END
    AND CASE
      WHEN filters #>> '{markers,gender}' = 'true' THEN coalesce(gender, 0) > 0
      WHEN filters #>> '{markers,gender}' = 'false' THEN coalesce(gender, 0) = 0
      ELSE true
    END
    AND CASE
      WHEN filters #>> '{markers,environment}' = 'true'
        THEN coalesce(environment_value, 0) > 0 OR coalesce(biodiversity_value, 0) > 0 OR coalesce(desertification_value, 0) > 0
      WHEN filters #>> '{markers,environment}' = 'false'
        THEN coalesce(environment_value, 0) = 0 AND coalesce(biodiversity_value, 0) = 0 AND coalesce(desertification_value, 0) = 0
      ELSE true
    END
    AND CASE
      WHEN filters #>> '{markers,nutrition}' = 'true' THEN coalesce(nutrition_value, 0) > 0
      WHEN filters #>> '{markers,nutrition}' = 'false' THEN coalesce(nutrition_value, 0) = 0
      ELSE true
    END;
$$;

CREATE OR REPLACE FUNCTION dashboard_fact_matches(f fact_activity_sector, filters jsonb)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT
    (cardinality(filter_text_values(filters, 'years')) = 0 OR f.year = ANY(filter_text_values(filters, 'years')))
    AND (cardinality(filter_text_values(filters, 'donorCountries')) = 0 OR f.donor_country = ANY(filter_text_values(filters, 'donorCountries')))
    AND (cardinality(filter_text_values(filters, 'recipientCountries')) = 0 OR f.country = ANY(filter_text_values(filters, 'recipientCountries')))
    AND (cardinality(filter_text_values(filters, 'regions')) = 0 OR f.region = ANY(filter_text_values(filters, 'regions')))
    AND (cardinality(filter_text_values(filters, 'macroRegions')) = 0 OR f.region_macro = ANY(filter_text_values(filters, 'macroRegions')))
    AND (cardinality(filter_text_values(filters, 'organizations')) = 0 OR f.organization_name = ANY(filter_text_values(filters, 'organizations')))
    AND (cardinality(filter_text_values(filters, 'sectors')) = 0 OR f.sector_description = ANY(filter_text_values(filters, 'sectors')))
    AND (cardinality(filter_text_values(filters, 'subsectors')) = 0 OR f.subsector_description = ANY(filter_text_values(filters, 'subsectors')))
    AND (cardinality(filter_text_values(filters, 'flowTypes')) = 0 OR f.type_of_flow = ANY(filter_text_values(filters, 'flowTypes')))
    AND marker_matches(filters, f.climate_change_mitigation, f.climate_change_adaptation, f.gender_marker, f.environment, f.biodiversity, f.desertification, f.nutrition)
    AND (
      nullif(filters ->> 'searchText', '') IS NULL
      OR f.organization_name ILIKE '%' || (filters ->> 'searchText') || '%'
      OR f.grant_recipient_project_title ILIKE '%' || (filters ->> 'searchText') || '%'
      OR f.project_description ILIKE '%' || (filters ->> 'searchText') || '%'
      OR f.channel_reported_name ILIKE '%' || (filters ->> 'searchText') || '%'
    );
$$;

CREATE OR REPLACE FUNCTION dashboard_metadata()
RETURNS jsonb
LANGUAGE sql
STABLE
AS $$
  SELECT jsonb_build_object(
    'years', (SELECT jsonb_agg(value) FROM (SELECT year AS value FROM fact_activity_sector WHERE year IS NOT NULL AND year <> '' GROUP BY 1 ORDER BY count(*) DESC, value LIMIT 20) s),
    'donorCountries', (SELECT jsonb_agg(value) FROM (SELECT donor_country AS value FROM fact_activity_sector WHERE donor_country IS NOT NULL AND donor_country <> '' GROUP BY 1 ORDER BY count(*) DESC, value LIMIT 500) s),
    'recipientCountries', (SELECT jsonb_agg(value) FROM (SELECT country AS value FROM fact_activity_sector WHERE country IS NOT NULL AND country <> '' GROUP BY 1 ORDER BY count(*) DESC, value LIMIT 500) s),
    'regions', (SELECT jsonb_agg(value) FROM (SELECT region AS value FROM fact_activity_sector WHERE region IS NOT NULL AND region <> '' GROUP BY 1 ORDER BY count(*) DESC, value LIMIT 500) s),
    'macroRegions', (SELECT jsonb_agg(value) FROM (SELECT region_macro AS value FROM fact_activity_sector WHERE region_macro IS NOT NULL AND region_macro <> '' GROUP BY 1 ORDER BY count(*) DESC, value LIMIT 500) s),
    'organizations', (SELECT jsonb_agg(value) FROM (SELECT organization_name AS value FROM fact_activity_sector WHERE organization_name IS NOT NULL AND organization_name <> '' GROUP BY 1 ORDER BY count(*) DESC, value LIMIT 500) s),
    'sectors', (SELECT jsonb_agg(value) FROM (SELECT sector_description AS value FROM fact_activity_sector WHERE sector_description IS NOT NULL AND sector_description <> '' GROUP BY 1 ORDER BY count(*) DESC, value LIMIT 500) s),
    'subsectors', (SELECT jsonb_agg(value) FROM (SELECT subsector_description AS value FROM fact_activity_sector WHERE subsector_description IS NOT NULL AND subsector_description <> '' GROUP BY 1 ORDER BY count(*) DESC, value LIMIT 500) s),
    'flowTypes', (SELECT jsonb_agg(value) FROM (SELECT type_of_flow AS value FROM fact_activity_sector WHERE type_of_flow IS NOT NULL AND type_of_flow <> '' GROUP BY 1 ORDER BY count(*) DESC, value LIMIT 20) s),
    'metrics', jsonb_build_array(
      jsonb_build_object('id', 'disbursements', 'label', 'Disbursements', 'field', 'usd_disbursements_defl', 'unit', 'USD millions, 2023 constant'),
      jsonb_build_object('id', 'commitments', 'label', 'Commitments', 'field', 'usd_commitment_defl', 'unit', 'USD millions, 2023 constant', 'note', 'Commitments are missing in about 62% of source rows.')
    ),
    'stats', (
      SELECT to_jsonb(stats) FROM (
        SELECT
          (SELECT COUNT(*) FROM fact_activity_sector) AS sector_rows,
          (SELECT COUNT(*) FROM v_project_amounts) AS projects,
          (SELECT SUM(usd_disbursements_project_est) FROM v_project_amounts) AS project_disbursements,
          (SELECT SUM(usd_commitment_project_est) FROM v_project_amounts) AS project_commitments
      ) stats
    ),
    'dataNotes', jsonb_build_array(
      'The workbook contains 2020, 2021, 2022, 2023, and a few aggregate 2020-2023 rows.',
      'Global KPIs use project-safe estimates to reduce duplicate sector-split inflation.',
      'Sector breakdowns use the source sector-row grain so multi-sector projects remain visible.',
      'Marker fields include null values for non-screened projects.'
    )
  );
$$;

CREATE OR REPLACE FUNCTION filtered_project_keys(filters jsonb)
RETURNS TABLE(project_key text)
LANGUAGE sql
STABLE
AS $$
  SELECT DISTINCT f.project_key
  FROM fact_activity_sector f
  WHERE dashboard_fact_matches(f, filters);
$$;

CREATE OR REPLACE FUNCTION dashboard_summary(filters jsonb)
RETURNS jsonb
LANGUAGE sql
STABLE
AS $$
  WITH metric AS (
    SELECT CASE WHEN filters ->> 'metric' = 'commitments' THEN 'commitments' ELSE 'disbursements' END AS id
  ),
  projects AS (
    SELECT p.*
    FROM v_project_amounts p
    JOIN filtered_project_keys(filters) k ON k.project_key = p.project_key
  ),
  summary AS (
    SELECT
      CASE WHEN (SELECT id FROM metric) = 'commitments'
        THEN coalesce(SUM(usd_commitment_project_est), 0)
        ELSE coalesce(SUM(usd_disbursements_project_est), 0)
      END AS total_amount,
      COUNT(*) AS project_count,
      coalesce(SUM(sector_row_count), 0) AS sector_row_count,
      COUNT(DISTINCT organization_name) AS donor_count,
      COUNT(DISTINCT country) AS recipient_count,
      COUNT(DISTINCT sector_description_primary) AS sector_count,
      SUM(CASE WHEN amount_rule = 'dedup_identical_sector_rows' THEN 1 ELSE 0 END) AS deduped_project_count,
      SUM(CASE WHEN amount_rule = 'sum_varied_sector_rows' THEN 1 ELSE 0 END) AS summed_project_count
    FROM projects
  ),
  year_series AS (
    SELECT coalesce(jsonb_agg(to_jsonb(row_data) ORDER BY row_data.year), '[]'::jsonb) AS rows
    FROM (
      SELECT
        year,
        CASE WHEN (SELECT id FROM metric) = 'commitments'
          THEN coalesce(SUM(usd_commitment_project_est), 0)
          ELSE coalesce(SUM(usd_disbursements_project_est), 0)
        END AS amount
      FROM projects
      GROUP BY 1
      ORDER BY 1
    ) row_data
  )
  SELECT to_jsonb(summary) || jsonb_build_object(
    'metric', (SELECT id FROM metric),
    'unit', 'USD millions, 2023 constant',
    'yearSeries', (SELECT rows FROM year_series)
  )
  FROM summary;
$$;

CREATE OR REPLACE FUNCTION dashboard_geography(filters jsonb)
RETURNS jsonb
LANGUAGE sql
STABLE
AS $$
  WITH metric AS (
    SELECT CASE WHEN filters ->> 'metric' = 'commitments' THEN 'commitments' ELSE 'disbursements' END AS id
  ),
  row_data AS (
    SELECT
      p.country,
      p.region,
      p.region_macro,
      CASE WHEN (SELECT id FROM metric) = 'commitments'
        THEN coalesce(SUM(p.usd_commitment_project_est), 0)
        ELSE coalesce(SUM(p.usd_disbursements_project_est), 0)
      END AS amount,
      COUNT(*) AS project_count
    FROM v_project_amounts p
    JOIN filtered_project_keys(filters) k ON k.project_key = p.project_key
    GROUP BY 1, 2, 3
    HAVING p.country IS NOT NULL AND p.country <> ''
    ORDER BY amount DESC
    LIMIT 250
  )
  SELECT jsonb_build_object('metric', (SELECT id FROM metric), 'items', coalesce(jsonb_agg(to_jsonb(row_data)), '[]'::jsonb))
  FROM row_data;
$$;

CREATE OR REPLACE FUNCTION dashboard_rankings(filters jsonb)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  group_by text := coalesce(filters ->> 'groupBy', 'year');
  grain text := coalesce(filters ->> 'grain', 'project');
  metric text := CASE WHEN filters ->> 'metric' = 'commitments' THEN 'commitments' ELSE 'disbursements' END;
  lim integer := least(greatest(coalesce((filters ->> 'limit')::integer, 15), 1), 100);
  metric_col text;
  sql text;
  result jsonb;
BEGIN
  IF group_by NOT IN ('year','organization_name','donor_country','country','region','region_macro','sector_description','subsector_description','type_of_flow') THEN
    RAISE EXCEPTION 'Invalid groupBy: %', group_by;
  END IF;

  IF grain = 'sector' OR group_by IN ('sector_description', 'subsector_description') THEN
    metric_col := CASE WHEN metric = 'commitments' THEN 'usd_commitment_defl' ELSE 'usd_disbursements_defl' END;
    sql := format(
      'WITH row_data AS (
        SELECT f.%1$I AS label, coalesce(SUM(f.%2$I), 0) AS amount, COUNT(*) AS row_count, COUNT(DISTINCT f.project_key) AS project_count
        FROM fact_activity_sector f
        WHERE dashboard_fact_matches(f, $1)
        GROUP BY 1
        HAVING f.%1$I IS NOT NULL AND f.%1$I <> ''''
        ORDER BY amount DESC
        LIMIT $2
      )
      SELECT jsonb_build_object(''grain'', ''sector'', ''groupBy'', %3$L, ''metric'', %4$L, ''items'', coalesce(jsonb_agg(to_jsonb(row_data)), ''[]''::jsonb))
      FROM row_data',
      group_by, metric_col, group_by, metric
    );
  ELSE
    metric_col := CASE WHEN metric = 'commitments' THEN 'usd_commitment_project_est' ELSE 'usd_disbursements_project_est' END;
    sql := format(
      'WITH row_data AS (
        SELECT p.%1$I AS label, coalesce(SUM(p.%2$I), 0) AS amount, COUNT(*) AS project_count
        FROM v_project_amounts p
        JOIN filtered_project_keys($1) k ON k.project_key = p.project_key
        GROUP BY 1
        HAVING p.%1$I IS NOT NULL AND p.%1$I <> ''''
        ORDER BY amount DESC
        LIMIT $2
      )
      SELECT jsonb_build_object(''grain'', ''project'', ''groupBy'', %3$L, ''metric'', %4$L, ''items'', coalesce(jsonb_agg(to_jsonb(row_data)), ''[]''::jsonb))
      FROM row_data',
      group_by, metric_col, group_by, metric
    );
  END IF;

  EXECUTE sql INTO result USING filters, lim;
  RETURN result;
END;
$$;

CREATE OR REPLACE FUNCTION dashboard_trends(filters jsonb)
RETURNS jsonb
LANGUAGE sql
STABLE
AS $$
  SELECT dashboard_rankings(filters || jsonb_build_object('groupBy', 'year', 'grain', 'project'));
$$;

CREATE OR REPLACE FUNCTION dashboard_project_search(filters jsonb)
RETURNS jsonb
LANGUAGE sql
STABLE
AS $$
  WITH metric AS (
    SELECT CASE WHEN filters ->> 'metric' = 'commitments' THEN 'commitments' ELSE 'disbursements' END AS id
  ),
  limited AS (
    SELECT
      p.project_key,
      p.year,
      p.organization_name,
      p.donor_country,
      p.country,
      p.region,
      p.region_macro,
      p.grant_recipient_project_title,
      p.project_description,
      p.sector_description_primary,
      p.subsector_description_primary,
      CASE WHEN (SELECT id FROM metric) = 'commitments' THEN p.usd_commitment_project_est ELSE p.usd_disbursements_project_est END AS amount,
      p.sector_row_count,
      p.amount_rule
    FROM v_project_amounts p
    JOIN filtered_project_keys(filters) k ON k.project_key = p.project_key
    ORDER BY amount DESC NULLS LAST
    LIMIT least(greatest(coalesce((filters ->> 'limit')::integer, 25), 1), 100)
    OFFSET greatest(coalesce((filters ->> 'offset')::integer, 0), 0)
  ),
  total AS (
    SELECT COUNT(*) AS count
    FROM v_project_amounts p
    JOIN filtered_project_keys(filters) k ON k.project_key = p.project_key
  )
  SELECT jsonb_build_object(
    'items', coalesce((SELECT jsonb_agg(to_jsonb(limited)) FROM limited), '[]'::jsonb),
    'total', (SELECT count FROM total),
    'limit', least(greatest(coalesce((filters ->> 'limit')::integer, 25), 1), 100),
    'offset', greatest(coalesce((filters ->> 'offset')::integer, 0), 0)
  );
$$;
