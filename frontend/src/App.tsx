import { lazy, Suspense, useDeferredValue, useMemo, useReducer, useState, useTransition } from "react";
import type { FormEvent } from "react";
import { AlertCircle, Database, Filter, Globe2, RotateCcw } from "lucide-react";

import { askDataQuestion, emptyFilters } from "./api/client";
import { useDashboardData, useMetadata } from "./api/hooks";
import type { AskResponse, DashboardFilters, GeographyItem, Metric, ProjectRow, RankingItem } from "./api/types";
import { FilterRail } from "./components/layout/FilterRail";
import { KpiCard } from "./components/layout/KpiCard";
import { RankingList } from "./components/charts/RankingList";
import { ProjectsTable } from "./components/tables/ProjectsTable";
import { activeFilterCount, filterReducer } from "./lib/filters";
import { formatCount, formatMoney } from "./lib/formatters";
import { questionShortcuts } from "./lib/shortcuts";

const TrendChart = lazy(() => import("./components/charts/TrendChart"));
const WorldFundingMap = lazy(() => import("./components/maps/WorldFundingMap"));

const tabs = ["Overview", "Geography", "Sectors", "Donors", "Projects", "Ask Data", "Methodology"] as const;
type Tab = (typeof tabs)[number];

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
  const donorItems = dashboard.donors.data?.items ?? [];
  const recipientItems = dashboard.recipients.data?.items ?? [];
  const sectorItems = dashboard.sectors.data?.items ?? [];
  const projectItems = dashboard.projects.data?.items ?? [];

  const isLoading =
    metadata.isLoading ||
    dashboard.summary.isLoading ||
    dashboard.donors.isLoading ||
    dashboard.recipients.isLoading ||
    dashboard.sectors.isLoading;
  const hasError =
    metadata.error ||
    dashboard.summary.error ||
    dashboard.geography.error ||
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
    applyFilters(apply(filters));
  }

  function applyFilters(next: DashboardFilters) {
    startTransition(() => {
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
            <Globe2 size={24} />
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
              <Database size={15} /> {metadata.data ? formatCount(metadata.data.stats.sector_rows) : "116,561"} source
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
              mapItems={mapItems}
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
                    items={mapItems}
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

          {activeTab === "Ask Data" ? <AskData onApplyFilters={applyFilters} /> : null}

          {activeTab === "Methodology" ? <Methodology notes={metadata.data?.dataNotes ?? []} /> : null}
        </section>
      </main>
    </div>
  );
}

function Overview({
  summary,
  mapItems,
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
            <WorldFundingMap items={mapItems} onSelectCountry={onRecipientClick} />
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

function AskData({ onApplyFilters }: { onApplyFilters: (filters: DashboardFilters) => void }) {
  const [question, setQuestion] = useState("Which countries got the most climate funding from UK donors?");
  const [result, setResult] = useState<AskResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isAsking, setIsAsking] = useState(false);

  async function submitQuestion(event: FormEvent) {
    event.preventDefault();
    if (!question.trim()) return;
    setIsAsking(true);
    setError(null);
    try {
      setResult(await askDataQuestion(question));
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Question failed");
    } finally {
      setIsAsking(false);
    }
  }

  const examples = [
    "Which countries got the most climate funding from UK donors?",
    "How did nutrition funding change over time?",
    "Show projects about maternal health in India",
    "What sectors received the most funding in 2023?",
  ];

  return (
    <section className="ask-grid">
      <Panel title="Ask a data question" wide>
        <form className="ask-form" onSubmit={submitQuestion}>
          <label>
            <span>Question</span>
            <input value={question} onChange={(event) => setQuestion(event.target.value)} />
          </label>
          <button type="submit" disabled={isAsking}>
            {isAsking ? "Thinking..." : "Generate answer"}
          </button>
        </form>
        <div className="ask-examples">
          {examples.map((example) => (
            <button key={example} onClick={() => setQuestion(example)}>
              {example}
            </button>
          ))}
        </div>
      </Panel>

      {error ? (
        <div className="error-banner" role="alert">
          <AlertCircle size={18} />
          {error}
        </div>
      ) : null}

      {result ? (
        <>
          <Panel title="Answer" wide>
            <div className="ask-answer">
              <p>{result.answer}</p>
              <button onClick={() => onApplyFilters(result.plan.filters)}>Apply interpreted filters</button>
            </div>
            <div className="interpretation-list">
              {result.interpretation.map((item) => (
                <span key={item}>{item}</span>
              ))}
              <span>Planner: OpenAI</span>
              <span>Confidence: {Math.round(result.plan.confidence * 100)}%</span>
            </div>
          </Panel>

          <Panel title="Generated view" wide>
            <GeneratedAskVisual result={result} />
          </Panel>

          <Panel title="Retrieved context" wide>
            <div className="context-list">
              {result.context.length === 0 ? <p>No methodology context was needed for this question.</p> : null}
              {result.context.map((item) => (
                <article key={item.title}>
                  <strong>{item.title}</strong>
                  <p>{item.body}</p>
                </article>
              ))}
            </div>
          </Panel>
        </>
      ) : null}
    </section>
  );
}

function GeneratedAskVisual({ result }: { result: AskResponse }) {
  if (result.chartType === "line") {
    const data = (result.items as Array<{ label: string; amount: number }>).map((item) => ({
      year: String(item.label),
      amount: Number(item.amount ?? 0),
    }));
    return (
      <Suspense fallback={<PanelSkeleton />}>
        <TrendChart data={data} />
      </Suspense>
    );
  }

  if (result.chartType === "map") {
    return (
      <Suspense fallback={<PanelSkeleton />}>
        <WorldFundingMap items={result.items as GeographyItem[]} />
      </Suspense>
    );
  }

  if (result.chartType === "table") {
    return <ProjectsTable items={result.items as ProjectRow[]} />;
  }

  return <RankingList items={result.items as RankingItem[]} />;
}

export default App;
