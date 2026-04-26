import { lazy, Suspense, useMemo, useState, useTransition } from "react";
import { BarChart3, Columns3, LayoutDashboard, Sparkles, Trash2 } from "lucide-react";

import type {
  DashboardFilters,
  GeneratedChart,
  GeographyItem,
  ProjectSearchResponse,
  RankingResponse,
  Summary,
} from "../api/types";
import { generatePromptChart, generatePromptDashboard } from "../api/hooks";
import { RankingList } from "../components/charts/RankingList";
import { ProjectsTable } from "../components/tables/ProjectsTable";
import { formatCount, formatMoney } from "../lib/formatters";

const TrendChart = lazy(() => import("../components/charts/TrendChart"));
const WorldFundingMap = lazy(() => import("../components/maps/WorldFundingMap"));

const promptExamples = [
  "Show top 10 donors for infectious disease funding in India",
  "How has global funding for climate changed over time?",
  "Which 5 countries receive the most funding for maternal health?",
  "Create a one page dashboard about climate funding since 2021",
];

export function PromptLab({ baseFilters }: { baseFilters: DashboardFilters }) {
  const [prompt, setPrompt] = useState(promptExamples[0]);
  const [preview, setPreview] = useState<GeneratedChart | null>(null);
  const [cards, setCards] = useState<GeneratedChart[]>([]);
  const [dashboardTitle, setDashboardTitle] = useState("Custom one-page dashboard");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  async function createChart() {
    setError(null);
    try {
      const response = await generatePromptChart(prompt, baseFilters);
      setPreview({ spec: response.spec, data: response.data });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not generate chart.");
    }
  }

  async function createDashboard() {
    setError(null);
    try {
      const response = await generatePromptDashboard(prompt, baseFilters);
      setDashboardTitle(response.dashboard.title);
      setCards(response.dashboard.cards);
      setPreview(response.dashboard.cards[0] ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not generate dashboard.");
    }
  }

  function addPreview() {
    if (!preview) return;
    setCards((existing) => {
      const next = { ...preview, spec: { ...preview.spec, id: `${preview.spec.id}-${Date.now()}` } };
      return [...existing, next];
    });
  }

  return (
    <section className="prompt-lab">
      <div className="prompt-hero">
        <div>
          <p className="eyebrow">Prompt-built analysis</p>
          <h2>Ask for a chart or compose a one-page dashboard</h2>
          <p>
            Prompts are translated into a local chart spec, then executed through the same validated dashboard APIs.
          </p>
        </div>
        <Sparkles size={34} />
      </div>

      <div className="prompt-controls">
        <label>
          <span>Prompt</span>
          <textarea value={prompt} onChange={(event) => setPrompt(event.target.value)} rows={3} />
        </label>
        <div className="prompt-actions">
          <button onClick={() => startTransition(() => void createChart())} disabled={isPending}>
            <BarChart3 size={17} /> Generate chart
          </button>
          <button onClick={() => startTransition(() => void createDashboard())} disabled={isPending}>
            <LayoutDashboard size={17} /> Build dashboard
          </button>
          <button onClick={() => setCards([])} disabled={cards.length === 0}>
            <Trash2 size={17} /> Clear
          </button>
        </div>
        <div className="prompt-examples">
          {promptExamples.map((example) => (
            <button key={example} onClick={() => setPrompt(example)}>
              {example}
            </button>
          ))}
        </div>
        {error ? <div className="prompt-error">{error}</div> : null}
      </div>

      <section className="panel-grid two-col">
        <article className="panel">
          <div className="panel-header">
            <h2>Generated chart preview</h2>
            <button className="mini-action" onClick={addPreview} disabled={!preview}>
              <Columns3 size={15} /> Add to page
            </button>
          </div>
          {preview ? <GeneratedChartCard chart={preview} compact={false} /> : <EmptyPromptState />}
        </article>

        <article className="panel prompt-spec-panel">
          <div className="panel-header">
            <h2>Validated chart spec</h2>
          </div>
          <pre>{preview ? JSON.stringify(preview.spec, null, 2) : "Generate a chart to inspect its spec."}</pre>
        </article>
      </section>

      <section className="custom-page" aria-label="Custom generated dashboard">
        <div className="custom-page-header">
          <div>
            <p className="eyebrow">One page</p>
            <h2>{dashboardTitle}</h2>
          </div>
          <span>{cards.length} cards</span>
        </div>
        {cards.length === 0 ? (
          <EmptyPromptState message="Generate a dashboard or add previewed charts to design this page." />
        ) : (
          <div className="custom-card-grid">
            {cards.map((card, index) => (
              <GeneratedChartCard
                key={card.spec.id}
                chart={card}
                onRemove={() => setCards((existing) => existing.filter((_, cardIndex) => cardIndex !== index))}
              />
            ))}
          </div>
        )}
      </section>
    </section>
  );
}

function GeneratedChartCard({
  chart,
  compact = true,
  onRemove,
}: {
  chart: GeneratedChart;
  compact?: boolean;
  onRemove?: () => void;
}) {
  return (
    <article className={`generated-card ${compact ? "compact" : ""}`}>
      <div className="generated-card-header">
        <div>
          <h3>{chart.spec.title}</h3>
          <p>{chart.spec.description}</p>
        </div>
        {onRemove ? (
          <button className="icon-button small" onClick={onRemove} title="Remove chart">
            <Trash2 size={15} />
          </button>
        ) : null}
      </div>
      <GeneratedChartBody chart={chart} />
    </article>
  );
}

function GeneratedChartBody({ chart }: { chart: GeneratedChart }) {
  const data = chart.data as Record<string, unknown>;
  if (chart.spec.chartType === "kpi") {
    const summary = data as unknown as Summary;
    return (
      <div className="generated-kpis">
        <MiniKpi label="Funding" value={formatMoney(summary.total_amount)} />
        <MiniKpi label="Projects" value={formatCount(summary.project_count)} />
        <MiniKpi label="Recipients" value={formatCount(summary.recipient_count)} />
      </div>
    );
  }

  if (chart.spec.chartType === "line") {
    const items = ((data.items as Array<{ label: string; amount: number }> | undefined) ?? []).map((item) => ({
      year: item.label,
      amount: item.amount,
    }));
    return (
      <Suspense fallback={<div className="panel-skeleton" />}>
        <TrendChart data={items} />
      </Suspense>
    );
  }

  if (chart.spec.chartType === "map") {
    const items = ((data.items as GeographyItem[] | undefined) ?? []);
    return (
      <Suspense fallback={<div className="panel-skeleton" />}>
        <WorldFundingMap items={items} />
      </Suspense>
    );
  }

  if (chart.spec.chartType === "table") {
    const items = ((data as ProjectSearchResponse).items ?? []).slice(0, 8);
    return <ProjectsTable items={items} />;
  }

  const ranking = data as RankingResponse;
  return <RankingList items={ranking.items ?? []} />;
}

function MiniKpi({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function EmptyPromptState({ message = "Describe the chart you want, then generate it." }: { message?: string }) {
  return <div className="empty-prompt-state">{message}</div>;
}

export function usePromptSummary(cards: GeneratedChart[]) {
  return useMemo(() => cards.map((card) => card.spec.title).join(", "), [cards]);
}
