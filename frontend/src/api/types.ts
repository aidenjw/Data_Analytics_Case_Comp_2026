export type Metric = "disbursements" | "commitments";

export type MarkerFilters = {
  climate?: boolean | null;
  gender?: boolean | null;
  environment?: boolean | null;
  nutrition?: boolean | null;
};

export type DashboardFilters = {
  years: string[];
  donorCountries: string[];
  recipientCountries: string[];
  regions: string[];
  macroRegions: string[];
  organizations: string[];
  sectors: string[];
  subsectors: string[];
  flowTypes: string[];
  markers: MarkerFilters;
  metric: Metric;
  searchText?: string | null;
};

export type Metadata = {
  years: string[];
  donorCountries: string[];
  recipientCountries: string[];
  regions: string[];
  macroRegions: string[];
  organizations: string[];
  sectors: string[];
  subsectors: string[];
  flowTypes: string[];
  metrics: Array<{ id: Metric; label: string; unit: string; note?: string }>;
  stats: Record<string, number>;
  dataNotes: string[];
};

export type Summary = {
  total_amount: number;
  project_count: number;
  sector_row_count: number;
  donor_count: number;
  recipient_count: number;
  sector_count: number;
  deduped_project_count: number;
  summed_project_count: number;
  metric: Metric;
  unit: string;
  yearSeries: Array<{ year: string; amount: number }>;
};

export type RankingItem = {
  label: string;
  amount: number;
  project_count?: number;
  row_count?: number;
};

export type RankingResponse = {
  grain: "project" | "sector";
  groupBy: string;
  metric: Metric;
  items: RankingItem[];
};

export type GeographyItem = {
  country: string;
  region: string;
  region_macro: string;
  amount: number;
  project_count: number;
};

export type ProjectRow = {
  project_key: string;
  year: string;
  organization_name: string;
  donor_country: string;
  country: string;
  region: string;
  region_macro: string;
  grant_recipient_project_title: string;
  project_description: string;
  sector_description_primary: string;
  subsector_description_primary: string;
  amount: number;
  sector_row_count: number;
  amount_rule: string;
};

export type ProjectSearchResponse = {
  items: ProjectRow[];
  total: number;
  limit: number;
  offset: number;
};

export type AskResponse = {
  question: string;
  answer: string;
  chartType: "bar" | "line" | "map" | "table";
  plan: {
    intent: "ranking" | "trend" | "geography" | "project_search";
    metric: Metric;
    groupBy: string;
    grain: "project" | "sector";
    filters: DashboardFilters;
    confidence: number;
    planner: "openai";
  };
  interpretation: string[];
  context: Array<{ title: string; body: string }>;
  items: Array<RankingItem | GeographyItem | ProjectRow | { label: string; amount: number; project_count: number }>;
};
