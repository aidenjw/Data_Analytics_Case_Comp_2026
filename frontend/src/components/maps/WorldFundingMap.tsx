import { MapChart } from "echarts/charts";
import { GeoComponent, TooltipComponent, VisualMapComponent } from "echarts/components";
import * as echarts from "echarts/core";
import { CanvasRenderer } from "echarts/renderers";
import ReactEChartsCore from "echarts-for-react/lib/core";
import { useEffect, useMemo, useState } from "react";

import type { GeographyItem } from "../../api/types";
import { formatMoney } from "../../lib/formatters";

echarts.use([MapChart, GeoComponent, TooltipComponent, VisualMapComponent, CanvasRenderer]);

type MapFeatureCollection = {
  type: "FeatureCollection";
  features: Array<{
    type: "Feature";
    properties: { name: string };
    geometry: unknown;
  }>;
};

type MapDatum = {
  name: string;
  value: number;
  sourceCountry: string;
};

const COUNTRY_NAME_ALIASES: Record<string, string> = {
  "China (People's Republic of)": "China",
  "Congo, Dem. Rep.": "Democratic Republic of the Congo",
  "Congo, Rep.": "Republic of the Congo",
  "Cote d'Ivoire": "Ivory Coast",
  "Iran (Islamic Republic of)": "Iran",
  "Korea": "South Korea",
  "Korea, Republic of": "South Korea",
  "Lao People's Democratic Republic": "Laos",
  "Russian Federation": "Russia",
  "Syrian Arab Republic": "Syria",
  "Tanzania": "United Republic of Tanzania",
  "Türkiye": "Turkey",
  "United States": "United States of America",
  "Viet Nam": "Vietnam",
};

const NON_COUNTRY_PATTERN = /regional|unspecified|bilateral|global|south of sahara|america|asia|africa|europe/i;

export default function WorldFundingMap({
  items,
  onSelectCountry,
}: {
  items: GeographyItem[] | Array<{ country: string; amount: number; region_macro: string }>;
  onSelectCountry?: (country: string) => void;
}) {
  const [mapReady, setMapReady] = useState(false);
  const [hovered, setHovered] = useState<MapDatum | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadMap() {
      const response = await fetch("/maps/countries.geo.json");
      const geoJson = (await response.json()) as MapFeatureCollection;
      if (!cancelled) {
        echarts.registerMap("recipient-world", geoJson as Parameters<typeof echarts.registerMap>[1]);
        setMapReady(true);
      }
    }

    loadMap().catch(() => setMapReady(false));
    return () => {
      cancelled = true;
    };
  }, []);

  const mappedData = useMemo(() => {
    const byMapName = new Map<string, MapDatum>();
    for (const item of items) {
      const country = item.country;
      if (!country || NON_COUNTRY_PATTERN.test(country)) continue;
      const name = COUNTRY_NAME_ALIASES[country] ?? country;
      const current = byMapName.get(name);
      byMapName.set(name, {
        name,
        value: (current?.value ?? 0) + Number(item.amount ?? 0),
        sourceCountry: current?.sourceCountry ?? country,
      });
    }
    return [...byMapName.values()];
  }, [items]);

  const top = useMemo(
    () => [...items].sort((a, b) => Number(b.amount ?? 0) - Number(a.amount ?? 0)).slice(0, 8),
    [items],
  );
  const topMapped = useMemo(() => [...mappedData].sort((a, b) => b.value - a.value)[0], [mappedData]);
  const maxAmount = useMemo(() => Math.max(1, ...mappedData.map((item) => item.value)), [mappedData]);
  const regionalAmount = useMemo(
    () =>
      items
        .filter((item) => NON_COUNTRY_PATTERN.test(item.country))
        .reduce((sum, item) => sum + Number(item.amount ?? 0), 0),
    [items],
  );

  const option = useMemo(
    () => ({
      backgroundColor: "transparent",
      tooltip: {
        trigger: "item",
        formatter: (params: { data?: MapDatum; name: string }) => {
          const value = params.data?.value ?? 0;
          return `${params.name}<br/>${formatMoney(value)}`;
        },
      },
      visualMap: {
        min: 0,
        max: maxAmount,
        show: false,
        inRange: {
          color: ["#15393f", "#1e796d", "#35d6a4", "#b9f6df"],
        },
      },
      series: [
        {
          name: "Recipient funding",
          type: "map",
          map: "recipient-world",
          roam: true,
          zoom: 1.12,
          top: 12,
          bottom: 8,
          emphasis: {
            label: { color: "#f2fbfa" },
            itemStyle: { areaColor: "#6ec9f2" },
          },
          select: {
            itemStyle: { areaColor: "#6ec9f2" },
          },
          itemStyle: {
            areaColor: "#214249",
            borderColor: "rgba(215, 238, 242, 0.28)",
            borderWidth: 0.7,
          },
          data: mappedData,
        },
      ],
    }),
    [mappedData, maxAmount],
  );

  const captionName = hovered?.sourceCountry ?? topMapped?.sourceCountry ?? "Recipient countries";
  const captionAmount = hovered ? formatMoney(hovered.value) : `${formatMoney(regionalAmount)} regional or unspecified`;

  return (
    <div className="map-wrap">
      <div className="country-map" role="img" aria-label="Recipient country funding choropleth map">
        {mapReady ? (
          <ReactEChartsCore
            echarts={echarts}
            option={option}
            style={{ height: "100%", width: "100%" }}
            notMerge
            lazyUpdate
            onEvents={{
              click: (params: { data?: MapDatum }) => {
                if (params.data?.sourceCountry) onSelectCountry?.(params.data.sourceCountry);
              },
              mouseover: (params: { data?: MapDatum }) => setHovered(params.data ?? null),
              mouseout: () => setHovered(null),
            }}
          />
        ) : (
          <div className="map-loading">Loading map</div>
        )}
      </div>
      <div className="map-caption">
        <strong>{captionName}</strong>
        <span>{captionAmount}</span>
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
