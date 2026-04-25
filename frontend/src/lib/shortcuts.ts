import type { DashboardFilters } from "../api/types";

export type Shortcut = {
  label: string;
  description: string;
  apply: (filters: DashboardFilters) => DashboardFilters;
};

export const questionShortcuts: Shortcut[] = [
  {
    label: "Top UK donors",
    description: "Donor country set to United Kingdom.",
    apply: (filters) => ({ ...filters, donorCountries: ["United Kingdom"] }),
  },
  {
    label: "Maternal health recipients",
    description: "Search reproductive and family health projects.",
    apply: (filters) => ({
      ...filters,
      searchText: "maternal health",
      sectors: ["Population Policies/Programmes & Reproductive Health"],
    }),
  },
  {
    label: "Climate funding over time",
    description: "Climate mitigation or adaptation markers enabled.",
    apply: (filters) => ({ ...filters, markers: { ...filters.markers, climate: true } }),
  },
  {
    label: "Infectious disease in India",
    description: "Recipient India with infectious disease search.",
    apply: (filters) => ({
      ...filters,
      recipientCountries: ["India"],
      searchText: "infectious disease",
    }),
  },
];
