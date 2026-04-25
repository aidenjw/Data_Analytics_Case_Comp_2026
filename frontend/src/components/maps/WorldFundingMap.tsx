import { useMemo, useState } from "react";

import type { GeographyItem } from "../../api/types";
import { formatMoney } from "../../lib/formatters";

const regionLayout = [
  { id: "America", label: "America", x: 34, y: 92, width: 112, height: 116 },
  { id: "Europe", label: "Europe", x: 220, y: 74, width: 74, height: 66 },
  { id: "Africa", label: "Africa", x: 216, y: 150, width: 98, height: 112 },
  { id: "Middle East", label: "Middle East", x: 318, y: 142, width: 76, height: 64 },
  { id: "Asia", label: "Asia", x: 390, y: 86, width: 150, height: 132 },
  { id: "Oceania", label: "Oceania", x: 500, y: 232, width: 78, height: 48 },
  { id: "GLOBAL or unspecified", label: "Global", x: 260, y: 20, width: 118, height: 34 },
];

export default function WorldFundingMap({
  items,
  onSelectCountry,
}: {
  items: GeographyItem[] | Array<{ country: string; amount: number; region_macro: string }>;
  onSelectCountry?: (country: string) => void;
}) {
  const [hovered, setHovered] = useState<string | null>(null);
  const amountByRegion = useMemo(() => {
    const map = new Map<string, number>();
    for (const item of items) {
      const key = item.region_macro || "GLOBAL or unspecified";
      map.set(key, (map.get(key) ?? 0) + Number(item.amount ?? 0));
    }
    return map;
  }, [items]);
  const maxAmount = useMemo(() => Math.max(1, ...Array.from(amountByRegion.values())), [amountByRegion]);
  const top = [...items].sort((a, b) => Number(b.amount ?? 0) - Number(a.amount ?? 0)).slice(0, 8);
  const hoveredAmount = hovered ? amountByRegion.get(hovered) : null;

  return (
    <div className="map-wrap">
      <svg viewBox="0 0 620 310" role="img" aria-label="Regional funding intensity map">
        <rect x="0" y="0" width="620" height="310" rx="8" fill="#09272d" />
        <path
          d="M56 82 C118 52 176 66 220 94 C264 122 296 112 340 78 C396 36 480 44 554 78"
          fill="none"
          stroke="rgba(110,201,242,0.24)"
          strokeWidth="3"
        />
        {regionLayout.map((region) => {
          const amount = amountByRegion.get(region.id) ?? 0;
          const intensity = amount > 0 ? Math.max(0.15, amount / maxAmount) : 0;
          return (
            <g key={region.id}>
              <rect
                x={region.x}
                y={region.y}
                width={region.width}
                height={region.height}
                rx="8"
                fill={amount > 0 ? `rgba(53, 214, 164, ${0.18 + intensity * 0.76})` : "#29464c"}
                stroke={hovered === region.id ? "#d9fff5" : "#102f35"}
                strokeWidth={hovered === region.id ? 2 : 1}
                onMouseEnter={() => setHovered(region.id)}
                onMouseLeave={() => setHovered(null)}
              />
              <text x={region.x + 12} y={region.y + 24} fill="#f2fbfa" fontSize="15" fontWeight="700">
                {region.label}
              </text>
              <text x={region.x + 12} y={region.y + 46} fill="#d7eef2" fontSize="13">
                {formatMoney(amount)}
              </text>
            </g>
          );
        })}
      </svg>
      <div className="map-caption">
        <strong>{hovered ?? top[0]?.country ?? "Recipient geography"}</strong>
        <span>{hovered ? formatMoney(hoveredAmount ?? 0) : "Click a top country below to filter"}</span>
      </div>
      <div className="map-fallback-list">
        {top.map((item) => (
          <button key={item.country} onClick={() => onSelectCountry?.(item.country)}>
            <span>{item.country}</span>
            <strong>{formatMoney(item.amount)}</strong>
          </button>
        ))}
      </div>
    </div>
  );
}
