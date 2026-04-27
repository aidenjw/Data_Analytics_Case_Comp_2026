import useSWR from "swr";

import { postApi } from "./client";
import type {
  DashboardFilters,
  GeographyItem,
  Metadata,
  PromptChartResponse,
  PromptDashboardResponse,
  ProjectSearchResponse,
  RankingResponse,
  Summary,
} from "./types";

function swrPostKey(path: string, body: unknown) {
  return [path, JSON.stringify(body)] as const;
}

function usePost<T>(path: string, body: unknown) {
  return useSWR(swrPostKey(path, body), ([url]) => postApi<T>(url, body), {
    keepPreviousData: true,
  });
}

export function useMetadata() {
  return useSWR<Metadata>("/metadata");
}

export function useDashboardData(filters: DashboardFilters) {
  const summary = usePost<Summary>("/summary", filters);
  const geography = usePost<{ items: GeographyItem[] }>("/geography", filters);
  const selectableGeography = usePost<{ items: GeographyItem[] }>("/geography", {
    ...filters,
    recipientCountries: [],
  });
  const donors = usePost<RankingResponse>("/rankings", {
    ...filters,
    groupBy: "organization_name",
    grain: "project",
    limit: 12,
  });
  const recipients = usePost<RankingResponse>("/rankings", {
    ...filters,
    groupBy: "country",
    grain: "project",
    limit: 12,
  });
  const sectors = usePost<RankingResponse>("/rankings", {
    ...filters,
    groupBy: "sector_description",
    grain: "sector",
    limit: 12,
  });
  const projects = usePost<ProjectSearchResponse>("/projects/search", {
    ...filters,
    limit: 20,
    offset: 0,
  });

  return { summary, geography, selectableGeography, donors, recipients, sectors, projects };
}

export function generatePromptChart(prompt: string, baseFilters: DashboardFilters) {
  return postApi<PromptChartResponse>("/prompt/chart", { prompt, baseFilters });
}

export function generatePromptDashboard(prompt: string, baseFilters: DashboardFilters) {
  return postApi<PromptDashboardResponse>("/prompt/dashboard", { prompt, baseFilters });
}
