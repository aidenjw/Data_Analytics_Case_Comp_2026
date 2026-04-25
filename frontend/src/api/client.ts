import type { DashboardFilters } from "./types";

const API_BASE = "/api";

export async function apiFetcher<T>(path: string): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`);
  if (!response.ok) {
    throw new Error(`Request failed: ${response.status}`);
  }
  return response.json() as Promise<T>;
}

export async function postApi<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Request failed: ${response.status} ${detail}`);
  }
  return response.json() as Promise<T>;
}

export const emptyFilters: DashboardFilters = {
  years: [],
  donorCountries: [],
  recipientCountries: [],
  regions: [],
  macroRegions: [],
  organizations: [],
  sectors: [],
  subsectors: [],
  flowTypes: [],
  markers: {},
  metric: "disbursements",
  searchText: null,
};
