import { describe, expect, it } from "vitest";

import type { GeneratedChart } from "../api/types";

function titles(cards: GeneratedChart[]) {
  return cards.map((card) => card.spec.title);
}

describe("generated prompt cards", () => {
  it("keeps card specs inspectable", () => {
    const cards: GeneratedChart[] = [
      {
        spec: {
          id: "a",
          title: "Top donors",
          description: "Generated chart",
          chartType: "bar",
          endpoint: "rankings",
          filters: {
            years: [],
            donorCountries: [],
            recipientCountries: ["India"],
            regions: [],
            macroRegions: [],
            organizations: [],
            sectors: [],
            subsectors: [],
            flowTypes: [],
            markers: {},
            metric: "disbursements",
            searchText: "infectious disease",
          },
          groupBy: "organization_name",
          grain: "project",
          limit: 10,
        },
        data: { items: [] },
      },
    ];
    expect(titles(cards)).toEqual(["Top donors"]);
  });
});
