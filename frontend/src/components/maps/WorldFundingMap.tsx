import { MapChart } from "echarts/charts";
import { TooltipComponent, VisualMapComponent } from "echarts/components";
import * as echarts from "echarts/core";
import { CanvasRenderer } from "echarts/renderers";
import ReactEChartsCore from "echarts-for-react/lib/core";
import { useMemo } from "react";

import type { GeographyItem } from "../../api/types";
import worldGeoJson from "../../assets/world-countries.geo.json";
import { formatMoney } from "../../lib/formatters";

echarts.use([MapChart, TooltipComponent, VisualMapComponent, CanvasRenderer]);

const MAP_NAME = "recipient-funding-world";
const WORLD_FEATURES = worldGeoJson.features as Array<{ properties: { name: string; ["country-abbrev"]?: string } }>;
const WORLD_NAMES = WORLD_FEATURES.map((feature) => feature.properties.name);

echarts.registerMap(MAP_NAME, worldGeoJson as Parameters<typeof echarts.registerMap>[1]);

const countryAliases: Record<string, string> = {
  "bahamas": "The Bahamas",
  "bolivia": "Bolivia",
  "china people's republic of": "China",
  "china peoples republic of": "China",
  "congo democratic republic of the": "Democratic Republic of the Congo",
  "cote d ivoire": "Ivory Coast",
  "cote divoire": "Ivory Coast",
  "czechia": "Czech Republic",
  "egypt": "Egypt",
  "gambia": "The Gambia",
  "iran": "Iran",
  "korea": "South Korea",
  "korea republic of": "South Korea",
  "lao people's democratic republic": "Laos",
  "lao peoples democratic republic": "Laos",
  "micronesia federated states of": "Federated States of Micronesia",
  "palestinian authority": "Palestine",
  "russian federation": "Russia",
  "syrian arab republic": "Syria",
  "tanzania": "United Republic of Tanzania",
  "tanzania united republic of": "United Republic of Tanzania",
  "turkiye": "Turkey",
  "united states": "United States of America",
  "venezuela": "Venezuela",
  "viet nam": "Vietnam",
};

function normalizeCountry(value: string) {
  return value
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/\([^)]*\)/g, "")
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function isAggregateRecipient(item: GeographyItem) {
  const country = item.country.toLowerCase();
  return (
    country.includes("regional") ||
    country.includes("unspecified") ||
    item.region_macro === "GLOBAL or unspecified"
  );
}

const geoNameByNormalizedName = new Map<string, string>(
  WORLD_FEATURES.flatMap((feature) => {
    const names = [feature.properties.name, feature.properties["country-abbrev"]].filter(Boolean) as string[];
    return names.map((name) => [normalizeCountry(name), feature.properties.name] as const);
  }),
);

function geoNameForCountry(country: string) {
  const normalized = normalizeCountry(country);
  return countryAliases[normalized] ?? geoNameByNormalizedName.get(normalized) ?? null;
}

type MapDataPoint = {
  name: string;
  value: number;
  amount: number;
  country: string;
  region: string;
  projectCount: number;
  selected: boolean;
  itemStyle?: {
    borderColor: string;
    borderWidth: number;
    shadowBlur: number;
    shadowColor: string;
  };
};

export default function WorldFundingMap({
  items,
  selectedCountries = [],
  onSelectCountry,
}: {
  items: GeographyItem[] | Array<{ country: string; amount: number; region_macro: string; region?: string; project_count?: number }>;
  selectedCountries?: string[];
  onSelectCountry?: (country: string) => void;
}) {
  const selectedCountrySet = useMemo(() => new Set(selectedCountries), [selectedCountries]);
  const selectedCaption = useMemo(() => {
    if (selectedCountries.length === 0) {
      return {
        title: "All recipient countries",
        detail: "Click countries to compare multiple recipients",
      };
    }

    if (selectedCountries.length === 1) {
      return {
        title: selectedCountries[0],
        detail: "Selected recipient country",
      };
    }

    const visibleCountries = selectedCountries.slice(0, 3).join(", ");
    const overflow = selectedCountries.length > 3 ? ` +${selectedCountries.length - 3} more` : "";
    return {
      title: `${selectedCountries.length} selected countries`,
      detail: `${visibleCountries}${overflow}`,
    };
  }, [selectedCountries]);

  const { mapped, unmatchedAmount, unmatchedCount, maxAmount } = useMemo(() => {
    const byGeoName = new Map<string, MapDataPoint>();
    let aggregateAmount = 0;
    let aggregateCount = 0;

    for (const item of items) {
      const amount = Number(item.amount ?? 0);
      const geographyItem = item as GeographyItem;
      const geoName = isAggregateRecipient(geographyItem) ? null : geoNameForCountry(item.country);

      if (!geoName) {
        aggregateAmount += amount;
        aggregateCount += 1;
        continue;
      }

      const current = byGeoName.get(geoName);
      const selected = selectedCountrySet.has(item.country) || (current?.selected ?? false);
      byGeoName.set(geoName, {
        name: geoName,
        value: amount + (current?.amount ?? 0),
        amount: amount + (current?.amount ?? 0),
        country: item.country,
        region: item.region ?? item.region_macro,
        projectCount: Number(item.project_count ?? 0) + (current?.projectCount ?? 0),
        selected,
        itemStyle: selected
          ? {
              borderColor: "#f8fff7",
              borderWidth: 2,
              shadowBlur: 16,
              shadowColor: "rgba(242, 197, 114, 0.42)",
            }
          : undefined,
      });
    }

    const mappedItems = Array.from(byGeoName.values()).sort((a, b) => b.amount - a.amount);
    return {
      mapped: mappedItems,
      unmatchedAmount: aggregateAmount,
      unmatchedCount: aggregateCount,
      maxAmount: Math.max(1, ...mappedItems.map((item) => item.amount)),
    };
  }, [items, selectedCountrySet]);

  const mappedNames = useMemo(() => new Set(mapped.map((item) => item.name)), [mapped]);
  const mapData = useMemo(
    () => [
      ...mapped,
      ...WORLD_NAMES.filter((name) => !mappedNames.has(name)).map((name) => ({ name, value: null })),
    ],
    [mapped, mappedNames],
  );

  const option = useMemo(
    () => ({
      backgroundColor: "transparent",
      tooltip: {
        trigger: "item",
        borderWidth: 0,
        backgroundColor: "rgba(5, 22, 26, 0.94)",
        textStyle: { color: "#f2fbfa", fontFamily: "Inter, sans-serif" },
        extraCssText: "box-shadow: 0 14px 32px rgba(0,0,0,.28); border-radius: 8px;",
        formatter: (params: { data?: MapDataPoint; name: string }) => {
          if (!params.data || typeof params.data.amount !== "number") {
            return `<strong>${params.name}</strong><br/><span style="color:#a9c8cb">No recipient funding in this view</span>`;
          }

          return [
            `<strong>${params.data.country}</strong>`,
            `<br/><span style="color:#a9c8cb">${params.data.region}</span>`,
            `<br/>Funding: <strong>${formatMoney(params.data.amount)}</strong>`,
            `<br/>Projects: <strong>${new Intl.NumberFormat("en-US").format(params.data.projectCount)}</strong>`,
          ].join("");
        },
      },
      visualMap: {
        min: 0,
        max: maxAmount,
        calculable: false,
        orient: "horizontal",
        left: 18,
        bottom: 14,
        itemWidth: 14,
        itemHeight: 160,
        text: ["High", "Low"],
        textStyle: { color: "#a9c8cb" },
        formatter: (value: number) => formatMoney(value),
        inRange: { color: ["#1d464b", "#247565", "#35d6a4", "#d4f58a"] },
        outOfRange: { color: "#15333a" },
      },
      series: [
        {
          name: "Recipient funding",
          type: "map",
          map: MAP_NAME,
          data: mapData,
          left: 0,
          right: 0,
          top: 0,
          bottom: 24,
          roam: true,
          selectedMode: false,
          emphasis: {
            label: { show: false },
            itemStyle: { areaColor: "#f2c572", borderColor: "#f8fff7", borderWidth: 1.2 },
          },
          label: { show: false },
          itemStyle: {
            borderColor: "rgba(197, 239, 234, 0.18)",
            borderWidth: 0.55,
            areaColor: "#15333a",
          },
        },
      ],
    }),
    [mapData, maxAmount],
  );

  return (
    <div className="map-wrap">
      <div className="geo-map-shell">
        <ReactEChartsCore
          echarts={echarts}
          option={option}
          style={{ height: "100%", width: "100%" }}
          notMerge
          lazyUpdate
          onEvents={{
            click: (params: { data?: MapDataPoint }) => {
              if (params.data?.country) onSelectCountry?.(params.data.country);
            },
          }}
        />
        <div className="map-caption">
          <strong>{selectedCaption.title}</strong>
          <span>{mapped.length > 0 ? selectedCaption.detail : "Funding appears as data loads"}</span>
        </div>
      </div>
      <div className="map-meta">
        <span>{mapped.length} mapped recipients</span>
        <span>
          {formatMoney(unmatchedAmount)} in {unmatchedCount} regional or unspecified rows
        </span>
      </div>
      <div className="map-fallback-list">
        {mapped.slice(0, 8).map((item) => (
          <button
            key={item.country}
            className={selectedCountrySet.has(item.country) ? "active" : ""}
            onClick={() => onSelectCountry?.(item.country)}
          >
            <span>{item.country}</span>
            <strong>{formatMoney(item.amount)}</strong>
          </button>
        ))}
      </div>
    </div>
  );
}
