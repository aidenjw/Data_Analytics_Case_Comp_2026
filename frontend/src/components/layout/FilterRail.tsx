import type { DashboardFilters, Metadata } from "../../api/types";

type ListKey =
  | "years"
  | "donorCountries"
  | "recipientCountries"
  | "macroRegions"
  | "organizations"
  | "sectors"
  | "flowTypes";

const filterSections: Array<{ key: ListKey; label: string; limit: number }> = [
  { key: "years", label: "Timing", limit: 8 },
  { key: "macroRegions", label: "Macro region", limit: 8 },
  { key: "donorCountries", label: "Donor country", limit: 8 },
  { key: "recipientCountries", label: "Recipient", limit: 9 },
  { key: "organizations", label: "Foundations", limit: 8 },
  { key: "sectors", label: "Sectors", limit: 8 },
  { key: "flowTypes", label: "Flow type", limit: 4 },
];

export function FilterRail({
  filters,
  metadata,
  isLoading,
  onToggle,
  onMarker,
  onSearch,
}: {
  filters: DashboardFilters;
  metadata?: Metadata;
  isLoading: boolean;
  onToggle: (key: ListKey, value: string) => void;
  onMarker: (marker: keyof DashboardFilters["markers"], value: boolean | null) => void;
  onSearch: (value: string) => void;
}) {
  return (
    <aside className="filter-rail">
      <div className="filter-heading">
        <h2>Explore funding</h2>
        <p>{isLoading ? "Loading filters" : "Cross-filter every panel"}</p>
      </div>

      <label className="search-box">
        <span>Search projects</span>
        <input
          defaultValue={filters.searchText ?? ""}
          placeholder="health, climate, India..."
          onChange={(event) => onSearch(event.target.value)}
        />
      </label>

      <section className="filter-section">
        <h3>Focus markers</h3>
        <div className="toggle-stack">
          {(["climate", "gender", "environment", "nutrition"] as const).map((marker) => (
            <button
              key={marker}
              className={filters.markers[marker] === true ? "active" : ""}
              onClick={() => onMarker(marker, filters.markers[marker] === true ? null : true)}
            >
              {marker}
            </button>
          ))}
        </div>
      </section>

      {filterSections.map((section) => {
        const options = metadata?.[section.key]?.slice(0, section.limit) ?? [];
        const selected = filters[section.key] as string[];
        return (
          <section className="filter-section" key={section.key}>
            <h3>{section.label}</h3>
            <div className="chip-stack">
              {options.map((option) => (
                <button
                  key={option}
                  className={selected.includes(option) ? "active" : ""}
                  onClick={() => onToggle(section.key, option)}
                >
                  {option}
                </button>
              ))}
            </div>
          </section>
        );
      })}
    </aside>
  );
}
