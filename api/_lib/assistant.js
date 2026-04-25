const { HttpError } = require("./http");

const KNOWLEDGE_BASE = [
  {
    title: "Disbursements and commitments",
    body: "Disbursements are funds actually paid out. Commitments are pledged or approved funds that may not have been paid yet. Disbursements are the default metric because commitments are missing in many source rows.",
  },
  {
    title: "Project-safe funding",
    body: "Headline totals use v_project_amounts so repeated sector rows do not inflate project-level funding. Sector breakdowns use source sector rows to preserve multi-sector project detail.",
  },
  {
    title: "Recipient geography",
    body: "Recipient country, region, and macro region fields describe where funding is directed. Regional, global, bilateral, and unspecified recipients cannot always be placed on a country map.",
  },
  {
    title: "Priority markers",
    body: "Climate combines climate mitigation and climate adaptation markers. Environment combines environment, biodiversity, and desertification markers. Gender and nutrition use their own marker columns.",
  },
  {
    title: "Search fields",
    body: "Project search checks organization name, project title, project description, and reported channel name. It is useful for topics such as maternal health, infectious disease, or education.",
  },
];

const GROUP_BY = [
  "year",
  "organization_name",
  "donor_country",
  "country",
  "region",
  "region_macro",
  "sector_description",
  "subsector_description",
  "type_of_flow",
];

const COUNTRY_ALIASES = {
  uk: "United Kingdom",
  "u.k.": "United Kingdom",
  britain: "United Kingdom",
  "united kingdom": "United Kingdom",
  us: "United States",
  "u.s.": "United States",
  usa: "United States",
  "u.s.a.": "United States",
  america: "United States",
  china: "China (People's Republic of)",
};

function normalize(value) {
  return String(value ?? "").toLowerCase().replaceAll("_", " ").replace(/\s+/g, " ").trim();
}

function retrieveContext(question, limit = 3) {
  const tokens = new Set(normalize(question).split(" ").filter(Boolean));
  return KNOWLEDGE_BASE.map((doc) => {
    const docTokens = new Set(normalize(`${doc.title} ${doc.body}`).split(" ").filter(Boolean));
    return { score: [...tokens].filter((token) => docTokens.has(token)).length, doc };
  })
    .sort((a, b) => b.score - a.score)
    .filter((item) => item.score > 0)
    .slice(0, limit)
    .map((item) => item.doc);
}

function metadataPrompt(metadata) {
  return {
    years: metadata.years ?? [],
    donorCountries: (metadata.donorCountries ?? []).slice(0, 150),
    recipientCountries: (metadata.recipientCountries ?? []).slice(0, 220),
    organizations: (metadata.organizations ?? []).slice(0, 120),
    sectors: (metadata.sectors ?? []).slice(0, 120),
    flowTypes: metadata.flowTypes ?? [],
    markers: ["climate", "gender", "environment", "nutrition"],
    metrics: ["disbursements", "commitments"],
    groupBy: GROUP_BY,
    aliases: COUNTRY_ALIASES,
  };
}

async function buildPlan(question, metadata) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new HttpError(503, "OPENAI_API_KEY is required for Ask Data.");

  const context = retrieveContext(question);
  const payload = {
    model: process.env.OPENAI_MODEL || "gpt-5-mini",
    input: [
      {
        role: "developer",
        content: [
          {
            type: "input_text",
            text:
              "You convert philanthropy dashboard questions into a strict query plan. Use only allowed fields and values. Do not invent data. Prefer disbursements unless the user asks for commitments. Use project grain for headline, donor, recipient, geography, and trend questions. Use sector grain only when grouping by sector or subsector. Use searchText only for project-search/topic-search questions, not for marker words alone. If the question is ambiguous, choose the safest broad plan with no invented filters.",
          },
        ],
      },
      {
        role: "user",
        content: [
          {
            type: "input_text",
            text: JSON.stringify({
              question,
              retrieved_context: context,
              allowed_values: metadataPrompt(metadata),
            }),
          },
        ],
      },
    ],
    text: {
      format: {
        type: "json_schema",
        name: "dashboard_query_plan",
        strict: true,
        schema: {
          type: "object",
          additionalProperties: false,
          properties: {
            intent: { type: "string", enum: ["ranking", "trend", "geography", "project_search"] },
            chartType: { type: "string", enum: ["bar", "line", "map", "table"] },
            groupBy: { type: "string", enum: GROUP_BY },
            grain: { type: "string", enum: ["project", "sector"] },
            metric: { type: "string", enum: ["disbursements", "commitments"] },
            years: { type: "array", items: { type: "string" } },
            donorCountries: { type: "array", items: { type: "string" } },
            recipientCountries: { type: "array", items: { type: "string" } },
            organizations: { type: "array", items: { type: "string" } },
            sectors: { type: "array", items: { type: "string" } },
            flowTypes: { type: "array", items: { type: "string" } },
            markers: {
              type: "object",
              additionalProperties: false,
              properties: {
                climate: { type: ["boolean", "null"] },
                gender: { type: ["boolean", "null"] },
                environment: { type: ["boolean", "null"] },
                nutrition: { type: ["boolean", "null"] },
              },
              required: ["climate", "gender", "environment", "nutrition"],
            },
            searchText: { type: ["string", "null"] },
            confidence: { type: "number" },
          },
          required: [
            "intent",
            "chartType",
            "groupBy",
            "grain",
            "metric",
            "years",
            "donorCountries",
            "recipientCountries",
            "organizations",
            "sectors",
            "flowTypes",
            "markers",
            "searchText",
            "confidence",
          ],
        },
      },
    },
    max_output_tokens: 900,
  };

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!response.ok) throw new HttpError(503, `OpenAI planner failed: ${await response.text()}`);
  const json = await response.json();
  return validatePlan(JSON.parse(responseText(json)), metadata, context);
}

function responseText(json) {
  if (typeof json.output_text === "string") return json.output_text;
  const chunks = [];
  for (const item of json.output ?? []) {
    for (const content of item.content ?? []) {
      if ((content.type === "output_text" || content.type === "text") && typeof content.text === "string") {
        chunks.push(content.text);
      }
    }
  }
  if (!chunks.length) throw new HttpError(503, "OpenAI response did not include text output.");
  return chunks.join("");
}

function allowedList(values, allowed) {
  const allowedSet = new Set(allowed ?? []);
  return Array.isArray(values) ? [...new Set(values.map(String).filter((value) => allowedSet.has(value)))] : [];
}

function resolveList(values, allowed) {
  if (!Array.isArray(values)) return [];
  const exact = new Set(allowed ?? []);
  const byNormalized = new Map((allowed ?? []).map((value) => [normalize(value), value]));
  const result = [];
  for (const value of values) {
    const text = String(value).trim();
    const canonical = COUNTRY_ALIASES[normalize(text)] || text;
    if (exact.has(canonical)) result.push(canonical);
    else if (byNormalized.has(normalize(canonical))) result.push(byNormalized.get(normalize(canonical)));
  }
  return [...new Set(result)];
}

function validatePlan(raw, metadata, context) {
  const intent = expectOne(raw.intent, ["ranking", "trend", "geography", "project_search"], "intent");
  const chartType = expectOne(raw.chartType, ["bar", "line", "map", "table"], "chartType");
  const groupBy = expectOne(raw.groupBy, GROUP_BY, "groupBy");
  const grain = expectOne(raw.grain, ["project", "sector"], "grain");
  const metric = expectOne(raw.metric, ["disbursements", "commitments"], "metric");
  const filters = {
    years: allowedList(raw.years, metadata.years),
    donorCountries: resolveList(raw.donorCountries, metadata.donorCountries),
    recipientCountries: resolveList(raw.recipientCountries, metadata.recipientCountries),
    regions: [],
    macroRegions: [],
    organizations: resolveList(raw.organizations, metadata.organizations),
    sectors: resolveList(raw.sectors, metadata.sectors),
    subsectors: [],
    flowTypes: resolveList(raw.flowTypes, metadata.flowTypes),
    markers: raw.markers ?? {},
    metric,
    searchText: intent === "project_search" ? raw.searchText || null : null,
  };
  return {
    intent,
    chartType,
    groupBy,
    grain,
    filters,
    limit: 10,
    confidence: Math.max(0, Math.min(Number(raw.confidence ?? 0.75), 0.95)),
    interpretation: interpretation(intent, chartType, groupBy, grain, filters),
    context,
    planner: "openai",
  };
}

function expectOne(value, allowed, field) {
  if (typeof value === "string" && allowed.includes(value)) return value;
  throw new HttpError(503, `OpenAI returned invalid ${field}.`);
}

function interpretation(intent, chartType, groupBy, grain, filters) {
  const parts = [
    `Intent: ${intent.replaceAll("_", " ")}`,
    `Chart: ${chartType}`,
    `Metric: ${filters.metric}`,
    `Grouped by: ${groupBy}`,
    `Grain: ${grain}`,
  ];
  const active = [];
  for (const [label, key] of [
    ["years", "years"],
    ["donor countries", "donorCountries"],
    ["recipient countries", "recipientCountries"],
    ["organizations", "organizations"],
    ["sectors", "sectors"],
    ["flow types", "flowTypes"],
  ]) {
    if (filters[key]?.length) active.push(`${label} = ${filters[key].join(", ")}`);
  }
  const markers = Object.entries(filters.markers ?? [])
    .filter(([, value]) => value === true)
    .map(([key]) => key);
  if (markers.length) active.push(`markers = ${markers.join(", ")}`);
  if (filters.searchText) active.push(`search = ${filters.searchText}`);
  parts.push(`Filters: ${active.length ? active.join("; ") : "none"}`);
  return parts;
}

function summarizeAnswer(intent, metric, data) {
  if (!data?.length) return "I could not find matching rows for that question. Try broadening the filters or using a more general topic.";
  if (intent === "project_search") {
    const first = data[0];
    return `I found ${data.length} matching projects. The largest visible match is ${first.grant_recipient_project_title || "the top matching project"} for ${first.country || "an unspecified recipient"}.`;
  }
  if (intent === "trend") {
    const peak = data.reduce((best, item) => (Number(item.amount ?? 0) > Number(best.amount ?? 0) ? item : best), data[0]);
    const latest = data[data.length - 1];
    return `The ${metric} trend peaks in ${peak.label} at $${Number(peak.amount ?? 0).toLocaleString(undefined, { maximumFractionDigits: 1 })}M. The latest shown value is $${Number(latest.amount ?? 0).toLocaleString(undefined, { maximumFractionDigits: 1 })}M in ${latest.label}.`;
  }
  if (intent === "geography") {
    const first = data[0];
    return `The largest recipient geography is ${first.country} with $${Number(first.amount ?? 0).toLocaleString(undefined, { maximumFractionDigits: 1 })}M in ${metric}.`;
  }
  const first = data[0];
  return `The top result is ${first.label || "the top result"} with $${Number(first.amount ?? 0).toLocaleString(undefined, { maximumFractionDigits: 1 })}M in ${metric}.`;
}

module.exports = { buildPlan, summarizeAnswer };
