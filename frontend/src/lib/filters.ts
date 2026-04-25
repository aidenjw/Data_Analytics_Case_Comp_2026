import type { DashboardFilters, Metric } from "../api/types";
import { emptyFilters } from "../api/client";

export type FilterAction =
  | { type: "reset" }
  | { type: "metric"; metric: Metric }
  | { type: "toggle"; key: keyof DashboardFilters; value: string }
  | { type: "search"; value: string }
  | { type: "marker"; marker: keyof DashboardFilters["markers"]; value: boolean | null };

function toggleValue(values: string[], value: string) {
  return values.includes(value) ? values.filter((item) => item !== value) : [...values, value];
}

export function filterReducer(state: DashboardFilters, action: FilterAction): DashboardFilters {
  switch (action.type) {
    case "reset":
      return emptyFilters;
    case "metric":
      return { ...state, metric: action.metric };
    case "search":
      return { ...state, searchText: action.value || null };
    case "marker":
      return { ...state, markers: { ...state.markers, [action.marker]: action.value } };
    case "toggle": {
      const current = state[action.key];
      if (!Array.isArray(current)) return state;
      return { ...state, [action.key]: toggleValue(current, action.value) };
    }
    default:
      return state;
  }
}

export function activeFilterCount(filters: DashboardFilters) {
  const listKeys: Array<keyof DashboardFilters> = [
    "years",
    "donorCountries",
    "recipientCountries",
    "regions",
    "macroRegions",
    "organizations",
    "sectors",
    "subsectors",
    "flowTypes",
  ];
  const listCount = listKeys.reduce((sum, key) => {
    const value = filters[key];
    return sum + (Array.isArray(value) ? value.length : 0);
  }, 0);
  return listCount + Object.values(filters.markers).filter((value) => value !== null && value !== undefined).length;
}
