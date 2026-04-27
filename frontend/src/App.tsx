import { lazy, Suspense, useDeferredValue, useMemo, useReducer, useState, useTransition } from "react";
import { AlertCircle, Database, Filter, RotateCcw } from "lucide-react";

import { emptyFilters } from "./api/client";
import { useDashboardData, useMetadata } from "./api/hooks";
import type { DashboardFilters, Metric, RankingItem } from "./api/types";
import { FilterRail } from "./components/layout/FilterRail";
import { KpiCard } from "./components/layout/KpiCard";
import { RankingList } from "./components/charts/RankingList";
import { ProjectsTable } from "./components/tables/ProjectsTable";
import { PromptLab } from "./features/PromptLab";
import { activeFilterCount, filterReducer } from "./lib/filters";
import { formatCount, formatMoney } from "./lib/formatters";
import { questionShortcuts } from "./lib/shortcuts";

const TrendChart = lazy(() => import("./components/charts/TrendChart"));
const WorldFundingMap = lazy(() => import("./components/maps/WorldFundingMap"));

const tabs = ["Overview", "Geography", "Sectors", "Donors", "Projects", "Custom", "Methodology"] as const;
type Tab = (typeof tabs)[number];

function BrandLogo() {
  return (
    <svg viewBox="0 0 128 128" role="img" aria-label="Global Funding Explorer logo">
      <defs>
        <linearGradient id="globeGradient" x1="0%" y1="100%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="#1cc0aa" />
          <stop offset="100%" stopColor="#4a90e2" />
        </linearGradient>
        <linearGradient id="barGradientA" x1="0%" y1="100%" x2="0%" y2="0%">
          <stop offset="0%" stopColor="#13b99f" />
          <stop offset="100%" stopColor="#1d9ed9" />
        </linearGradient>
        <linearGradient id="barGradientB" x1="0%" y1="100%" x2="0%" y2="0%">
          <stop offset="0%" stopColor="#0f7ccf" />
          <stop offset="100%" stopColor="#1656b6" />
        </linearGradient>
        <linearGradient id="barGradientC" x1="0%" y1="100%" x2="0%" y2="0%">
          <stop offset="0%" stopColor="#5b3db6" />
          <stop offset="100%" stopColor="#6937c8" />
        </linearGradient>
      </defs>
      <path
        d="M29 63a36 36 0 0 1 58-28"
        fill="none"
        stroke="#0a2f6f"
        strokeWidth="3"
        strokeLinecap="round"
      />
      <circle cx="54" cy="57" r="29" fill="url(#globeGradient)" />
      <path
        d="M44 35c3-3 7-5 11-6-2 3-4 4-3 7 5-3 7-1 12-2-2 3-4 4-3 7 4 0 7 2 10 4-4 1-7 0-9 2 2 2 6 3 7 6-2 0-3 1-5 2 2 4 5 8 5 13-2-2-4-5-6-5-2 0-3 3-5 4-2 6-2 12-3 18-2-4-3-8-3-13-2-2-4-5-7-6-3 2-3 7-5 10-1-4-1-8 0-12-2-3-5-4-7-6 3-2 7-2 8-6-2-1-5-2-6-5 3-1 5-3 7-6-2-2-5-3-6-6z"
        fill="#ffffff"
        opacity="0.95"
      />
      <rect x="74" y="60" width="8" height="18" rx="1" fill="url(#barGradientA)" />
      <rect x="85" y="53" width="8" height="25" rx="1" fill="url(#barGradientB)" />
      <rect x="96" y="42" width="8" height="36" rx="1" fill="url(#barGradientC)" />
      <path
        d="M84 83c0-4-3-7-7-7s-7 3-7 7v3h14zm-20 0c0-5-4-9-9-9s-9 4-9 9v3h18zm-24 0c0-4-3-7-7-7s-7 3-7 7v3h14z"
        fill="#ffffff"
      />
      <circle cx="77" cy="71" r="4.5" fill="#5c3db4" />
      <circle cx="55" cy="68" r="5.4" fill="#173f86" />
      <circle cx="33" cy="73" r="4.5" fill="#17b39f" />
      <path
        d="M28 87c6-5 16-7 29-7 15 0 28 4 37 11 5 4 10 3 16-2-3 9-9 15-18 17-13 3-36 1-50-2-12-2-24-8-31-17 6 2 11 2 17 0z"
        fill="#09275f"
      />
      <path
        d="M73 24c15 0 29 6 39 17"
        fill="none"
        stroke="#0f7ccf"
        strokeWidth="2.2"
        strokeDasharray="2.2 4.2"
        strokeLinecap="round"
      />
      <circle cx="72" cy="24" r="2.3" fill="#18b6a4" />
      <circle cx="84" cy="29" r="2.3" fill="#1656b6" />
      <circle cx="97" cy="36" r="2.3" fill="#5c3db4" />
      <circle cx="108" cy="46" r="2.3" fill="#4838aa" />
    </svg>
  );
}

function App() {
  const [filters, dispatch] = useReducer(filterReducer, emptyFilters);
  const [activeTab, setActiveTab] = useState<Tab>("Overview");
  const [, startTransition] = useTransition();
  const deferredFilters = useDeferredValue(filters);
  const filterCount = activeFilterCount(filters);

  const metadata = useMetadata();
  const dashboard = useDashboardData(deferredFilters);

  const summary = dashboard.summary.data;
  const mapItems = dashboard.geography.data?.items ?? [];
  const selectableMapItems = dashboard.selectableGeography.data?.items ?? mapItems;
  const donorItems = dashboard.donors.data?.items ?? [];
  const recipientItems = dashboard.recipients.data?.items ?? [];
  const sectorItems = dashboard.sectors.data?.items ?? [];
  const projectItems = dashboard.projects.data?.items ?? [];

  const isLoading =
    metadata.isLoading ||
    dashboard.summary.isLoading ||
    dashboard.selectableGeography.isLoading ||
    dashboard.donors.isLoading ||
    dashboard.recipients.isLoading ||
    dashboard.sectors.isLoading;
  const hasError =
    metadata.error ||
    dashboard.summary.error ||
    dashboard.geography.error ||
    dashboard.selectableGeography.error ||
    dashboard.donors.error ||
    dashboard.recipients.error ||
    dashboard.sectors.error ||
    dashboard.projects.error;

  const insightItems = useMemo(() => {
    const topDonor = donorItems[0];
    const topRecipient = recipientItems[0];
    const topSector = sectorItems[0];
    return [
      topDonor ? `${topDonor.label} is the largest foundation donor in this view.` : "Select filters to surface top donors.",
      topRecipient
        ? `${topRecipient.label} receives the most project-safe funding in the current scope.`
        : "Recipient concentration will appear after data loads.",
      topSector
        ? `${topSector.label} leads the sector-row funding view.`
        : "Sector mix will appear after data loads.",
      "Global KPIs use project-safe estimates; sector panels intentionally preserve sector-row detail.",
    ];
  }, [donorItems, recipientItems, sectorItems]);

  function setMetric(metric: Metric) {
    startTransition(() => dispatch({ type: "metric", metric }));
  }

  function applyShortcut(apply: (filters: DashboardFilters) => DashboardFilters) {
    startTransition(() => {
      const next = apply(filters);
      dispatch({ type: "reset" });
      for (const year of next.years) dispatch({ type: "toggle", key: "years", value: year });
      for (const donor of next.donorCountries) dispatch({ type: "toggle", key: "donorCountries", value: donor });
      for (const recipient of next.recipientCountries) {
        dispatch({ type: "toggle", key: "recipientCountries", value: recipient });
      }
      for (const sector of next.sectors) dispatch({ type: "toggle", key: "sectors", value: sector });
      if (next.searchText) dispatch({ type: "search", value: next.searchText });
      for (const [marker, value] of Object.entries(next.markers)) {
        dispatch({
          type: "marker",
          marker: marker as keyof DashboardFilters["markers"],
          value: value ?? null,
        });
      }
      dispatch({ type: "metric", metric: next.metric });
    });
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand-lockup">
          <div className="brand-mark" aria-hidden="true">
            <BrandLogo />
          </div>
          <div>
            <p className="eyebrow">OECD private philanthropy for development</p>
            <h1>Global Funding Explorer</h1>
          </div>
        </div>
        <div className="topbar-actions">
          <div className="metric-switch" aria-label="Funding metric">
            <button
              className={filters.metric === "disbursements" ? "active" : ""}
              onClick={() => setMetric("disbursements")}
            >
              Disbursements
            </button>
            <button
              className={filters.metric === "commitments" ? "active" : ""}
              onClick={() => setMetric("commitments")}
            >
              Commitments
            </button>
          </div>
          <button className="icon-button" onClick={() => dispatch({ type: "reset" })} title="Reset filters">
            <RotateCcw size={18} />
          </button>
        </div>
      </header>

      <main className="dashboard-frame">
        <FilterRail
          filters={filters}
          metadata={metadata.data}
          isLoading={metadata.isLoading}
          onToggle={(key, value) => startTransition(() => dispatch({ type: "toggle", key, value }))}
          onMarker={(marker, value) => startTransition(() => dispatch({ type: "marker", marker, value }))}
          onSearch={(value) => startTransition(() => dispatch({ type: "search", value }))}
        />

        <section className="workspace">
          <nav className="tabbar" aria-label="Dashboard views">
            {tabs.map((tab) => (
              <button key={tab} className={activeTab === tab ? "active" : ""} onClick={() => setActiveTab(tab)}>
                {tab}
              </button>
            ))}
          </nav>

          <div className="status-strip">
            <span>
              <Filter size={15} /> {filterCount} active filters
            </span>
            <span>
              <Database size={15} /> {metadata.data ? formatCount(metadata.data.stats.sector_rows) : "116,558"} source
              rows
            </span>
            {isLoading ? <span className="pulse">Refreshing panels</span> : null}
          </div>

          {hasError ? (
            <div className="error-banner" role="alert">
              <AlertCircle size={18} />
              The dashboard API is not ready. Run the ETL and start FastAPI, then refresh this page.
            </div>
          ) : null}

          {activeTab !== "Methodology" ? (
            <section className="kpi-grid" aria-label="Funding summary">
              <KpiCard label="Total funding" value={formatMoney(summary?.total_amount)} caption={summary?.unit ?? ""} />
              <KpiCard label="Projects" value={formatCount(summary?.project_count)} caption="project-safe count" />
              <KpiCard label="Recipients" value={formatCount(summary?.recipient_count)} caption="countries or regions" />
              <KpiCard label="Donors" value={formatCount(summary?.donor_count)} caption="foundations" />
            </section>
          ) : null}

          {activeTab === "Overview" ? (
            <Overview
              filters={filters}
              summary={summary}
              mapItems={selectableMapItems}
              selectedRecipientCountries={filters.recipientCountries}
              donorItems={donorItems}
              recipientItems={recipientItems}
              sectorItems={sectorItems}
              insightItems={insightItems}
              applyShortcut={applyShortcut}
              onRecipientClick={(country) =>
                startTransition(() => dispatch({ type: "toggle", key: "recipientCountries", value: country }))
              }
              onDonorClick={(label) =>
                startTransition(() => dispatch({ type: "toggle", key: "organizations", value: label }))
              }
              onSectorClick={(label) => startTransition(() => dispatch({ type: "toggle", key: "sectors", value: label }))}
            />
          ) : null}

          {activeTab === "Geography" ? (
            <section className="panel-grid two-col">
              <Panel title="Recipient funding map" wide>
                <Suspense fallback={<PanelSkeleton />}>
                  <WorldFundingMap
                    items={selectableMapItems}
                    selectedCountries={filters.recipientCountries}
                    onSelectCountry={(country) =>
                      startTransition(() => dispatch({ type: "toggle", key: "recipientCountries", value: country }))
                    }
                  />
                </Suspense>
              </Panel>
              <Panel title="Top recipient countries">
                <RankingList items={recipientItems} onSelect={(item) => dispatch({ type: "toggle", key: "recipientCountries", value: item.label })} />
              </Panel>
            </section>
          ) : null}

          {activeTab === "Sectors" ? (
            <section className="panel-grid two-col">
              <Panel title="Sector funding mix" wide>
                <RankingList items={sectorItems} onSelect={(item) => dispatch({ type: "toggle", key: "sectors", value: item.label })} />
              </Panel>
              <Panel title="Focus markers">
                <div className="marker-buttons">
                  {(["climate", "gender", "environment", "nutrition"] as const).map((marker) => (
                    <button
                      key={marker}
                      className={filters.markers[marker] === true ? "active" : ""}
                      onClick={() =>
                        dispatch({
                          type: "marker",
                          marker,
                          value: filters.markers[marker] === true ? null : true,
                        })
                      }
                    >
                      {marker}
                    </button>
                  ))}
                </div>
              </Panel>
            </section>
          ) : null}

          {activeTab === "Donors" ? (
            <section className="panel-grid two-col">
              <Panel title="Top foundation donors">
                <RankingList items={donorItems} onSelect={(item) => dispatch({ type: "toggle", key: "organizations", value: item.label })} />
              </Panel>
              <Panel title="Top recipient countries">
                <RankingList items={recipientItems} onSelect={(item) => dispatch({ type: "toggle", key: "recipientCountries", value: item.label })} />
              </Panel>
            </section>
          ) : null}

          {activeTab === "Projects" ? (
            <Panel title="Project-level funding records" wide>
              <ProjectsTable items={projectItems} />
            </Panel>
          ) : null}

          {activeTab === "Custom" ? <PromptLab baseFilters={filters} /> : null}

          {activeTab === "Methodology" ? <Methodology notes={metadata.data?.dataNotes ?? []} /> : null}
        </section>
      </main>
    </div>
  );
}

function Overview({
  summary,
  mapItems,
  selectedRecipientCountries,
  donorItems,
  recipientItems,
  sectorItems,
  insightItems,
  applyShortcut,
  onRecipientClick,
  onDonorClick,
  onSectorClick,
}: {
  filters: DashboardFilters;
  summary?: { yearSeries: Array<{ year: string; amount: number }> };
  mapItems: Array<{ country: string; amount: number; region_macro: string }>;
  selectedRecipientCountries: string[];
  donorItems: RankingItem[];
  recipientItems: RankingItem[];
  sectorItems: RankingItem[];
  insightItems: string[];
  applyShortcut: (apply: (filters: DashboardFilters) => DashboardFilters) => void;
  onRecipientClick: (country: string) => void;
  onDonorClick: (label: string) => void;
  onSectorClick: (label: string) => void;
}) {
  return (
    <>
      <section className="panel-grid hero-grid">
        <Panel title="Funding trend" wide>
          <Suspense fallback={<PanelSkeleton />}>
            <TrendChart data={summary?.yearSeries ?? []} />
          </Suspense>
        </Panel>
        <Panel title="Insight brief">
          <ul className="insight-list">
            {insightItems.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
          <div className="shortcut-grid">
            {questionShortcuts.map((shortcut) => (
              <button key={shortcut.label} onClick={() => applyShortcut(shortcut.apply)}>
                <strong>{shortcut.label}</strong>
                <span>{shortcut.description}</span>
              </button>
            ))}
          </div>
        </Panel>
      </section>

      <section className="panel-grid three-col">
        <Panel title="Recipient geography">
          <Suspense fallback={<PanelSkeleton />}>
            <WorldFundingMap
              items={mapItems}
              selectedCountries={selectedRecipientCountries}
              onSelectCountry={onRecipientClick}
            />
          </Suspense>
        </Panel>
        <Panel title="Top donors">
          <RankingList items={donorItems} onSelect={(item) => onDonorClick(item.label)} />
        </Panel>
        <Panel title="Top sectors">
          <RankingList items={sectorItems} onSelect={(item) => onSectorClick(item.label)} />
        </Panel>
      </section>

      <Panel title="Top recipient countries" wide>
        <RankingList items={recipientItems} onSelect={(item) => onRecipientClick(item.label)} horizontal />
      </Panel>
    </>
  );
}

function Panel({
  title,
  children,
  wide = false,
}: {
  title: string;
  children: React.ReactNode;
  wide?: boolean;
}) {
  return (
    <article className={`panel ${wide ? "wide" : ""}`}>
      <div className="panel-header">
        <h2>{title}</h2>
      </div>
      {children}
    </article>
  );
}

function PanelSkeleton() {
  return <div className="panel-skeleton" aria-label="Loading panel" />;
}

function Methodology({ notes }: { notes: string[] }) {
  return (
    <section className="methodology">
      <h2>Methodology and data caveats</h2>
      <p>
        This dashboard treats the workbook as an analytical source system. It preserves sector-row detail while using
        project-safe estimates for headline funding totals.
      </p>
      <ul>
        {notes.map((note) => (
          <li key={note}>{note}</li>
        ))}
      </ul>
      <p>
        Amounts are shown in USD millions, 2023 constant dollars. The workbook includes marker fields for climate,
        gender, environment, biodiversity, desertification, and nutrition; null marker values represent projects that
        were not screened or not reported for that marker.
      </p>
    </section>
  );
}

export default App;
