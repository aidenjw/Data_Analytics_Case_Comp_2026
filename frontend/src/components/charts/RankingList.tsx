import type { RankingItem } from "../../api/types";
import { formatMoney } from "../../lib/formatters";

export function RankingList({
  items,
  onSelect,
  horizontal = false,
}: {
  items: RankingItem[];
  onSelect?: (item: RankingItem) => void;
  horizontal?: boolean;
}) {
  const max = items.reduce((largest, item) => Math.max(largest, Number(item.amount ?? 0)), 0);
  return (
    <div className={`ranking-list ${horizontal ? "horizontal" : ""}`}>
      {items.length === 0 ? <p className="empty-state">No rows match the current filters.</p> : null}
      {items.map((item, index) => {
        const width = max > 0 ? `${Math.max(5, (Number(item.amount ?? 0) / max) * 100)}%` : "5%";
        return (
          <button key={`${item.label}-${index}`} className="ranking-row" onClick={() => onSelect?.(item)}>
            <span className="rank">{index + 1}</span>
            <span className="ranking-label">{item.label || "Unspecified"}</span>
            <span className="ranking-value">{formatMoney(item.amount)}</span>
            <span className="bar-track" aria-hidden="true">
              <span style={{ width }} />
            </span>
          </button>
        );
      })}
    </div>
  );
}
