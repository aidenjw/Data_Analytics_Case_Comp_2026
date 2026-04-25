from __future__ import annotations

import re
import json
from dataclasses import dataclass
from typing import Literal

import httpx

from .config import OPENAI_API_KEY, OPENAI_MODEL
from .schemas import FilterRequest, MarkerFilters

Intent = Literal["ranking", "trend", "geography", "project_search"]
ChartType = Literal["bar", "line", "map", "table"]
GroupBy = Literal[
    "year",
    "organization_name",
    "donor_country",
    "country",
    "region",
    "region_macro",
    "sector_description",
    "subsector_description",
    "type_of_flow",
]


KNOWLEDGE_BASE = [
    {
        "title": "Disbursements and commitments",
        "body": "Disbursements are funds actually paid out. Commitments are pledged or approved funds that may not have been paid yet. Disbursements are the default metric because commitments are missing in many source rows.",
    },
    {
        "title": "Project-safe funding",
        "body": "Headline totals use v_project_amounts so repeated sector rows do not inflate project-level funding. Sector breakdowns use source sector rows to preserve multi-sector project detail.",
    },
    {
        "title": "Recipient geography",
        "body": "Recipient country, region, and macro region fields describe where funding is directed. Regional, global, bilateral, and unspecified recipients cannot always be placed on a country map.",
    },
    {
        "title": "Priority markers",
        "body": "Climate combines climate mitigation and climate adaptation markers. Environment combines environment, biodiversity, and desertification markers. Gender and nutrition use their own marker columns.",
    },
    {
        "title": "Search fields",
        "body": "Project search checks organization name, project title, project description, and reported channel name. It is useful for topics such as maternal health, infectious disease, or education.",
    },
]

COUNTRY_ALIASES = {
    "uk": "United Kingdom",
    "u.k.": "United Kingdom",
    "britain": "United Kingdom",
    "united kingdom": "United Kingdom",
    "us": "United States",
    "u.s.": "United States",
    "usa": "United States",
    "u.s.a.": "United States",
    "america": "United States",
    "china": "China (People's Republic of)",
}

class OpenAIPlannerError(RuntimeError):
    pass


@dataclass
class AskPlan:
    intent: Intent
    chart_type: ChartType
    group_by: GroupBy
    grain: Literal["project", "sector"]
    filters: FilterRequest
    limit: int
    confidence: float
    interpretation: list[str]
    context: list[dict[str, str]]
    planner: Literal["openai"] = "openai"


def build_plan(question: str, metadata: dict[str, list[str]]) -> AskPlan:
    if not OPENAI_API_KEY:
        raise OpenAIPlannerError("OPENAI_API_KEY is required for Ask Data.")
    try:
        return build_openai_plan(question, metadata)
    except (httpx.HTTPError, KeyError, TypeError, ValueError, json.JSONDecodeError) as exc:
        raise OpenAIPlannerError(f"OpenAI planner failed: {exc}") from exc


def build_openai_plan(question: str, metadata: dict[str, list[str]]) -> AskPlan:
    context = retrieve_context(question, limit=3)
    prompt = {
        "question": question,
        "retrieved_context": context,
        "allowed_values": _metadata_prompt(metadata),
    }
    payload = {
        "model": OPENAI_MODEL,
        "input": [
            {
                "role": "developer",
                "content": [
                    {
                        "type": "input_text",
                        "text": (
                            "You convert philanthropy dashboard questions into a strict query plan. "
                            "Use only allowed fields and values. Do not invent data. "
                            "Prefer disbursements unless the user asks for commitments. "
                            "Use project grain for headline, donor, recipient, geography, and trend questions. "
                            "Use sector grain only when grouping by sector or subsector. "
                            "Use searchText only for project-search/topic-search questions, not for marker words alone. "
                            "If the question is ambiguous, choose the safest broad plan with no invented filters."
                        ),
                    }
                ],
            },
            {"role": "user", "content": [{"type": "input_text", "text": json.dumps(prompt)}]},
        ],
        "text": {
            "format": {
                "type": "json_schema",
                "name": "dashboard_query_plan",
                "strict": True,
                "schema": {
                    "type": "object",
                    "additionalProperties": False,
                    "properties": {
                        "intent": {"type": "string", "enum": ["ranking", "trend", "geography", "project_search"]},
                        "chartType": {"type": "string", "enum": ["bar", "line", "map", "table"]},
                        "groupBy": {
                            "type": "string",
                            "enum": [
                                "year",
                                "organization_name",
                                "donor_country",
                                "country",
                                "region",
                                "region_macro",
                                "sector_description",
                                "subsector_description",
                                "type_of_flow",
                            ],
                        },
                        "grain": {"type": "string", "enum": ["project", "sector"]},
                        "metric": {"type": "string", "enum": ["disbursements", "commitments"]},
                        "years": {"type": "array", "items": {"type": "string"}},
                        "donorCountries": {"type": "array", "items": {"type": "string"}},
                        "recipientCountries": {"type": "array", "items": {"type": "string"}},
                        "organizations": {"type": "array", "items": {"type": "string"}},
                        "sectors": {"type": "array", "items": {"type": "string"}},
                        "flowTypes": {"type": "array", "items": {"type": "string"}},
                        "markers": {
                            "type": "object",
                            "additionalProperties": False,
                            "properties": {
                                "climate": {"type": ["boolean", "null"]},
                                "gender": {"type": ["boolean", "null"]},
                                "environment": {"type": ["boolean", "null"]},
                                "nutrition": {"type": ["boolean", "null"]},
                            },
                            "required": ["climate", "gender", "environment", "nutrition"],
                        },
                        "searchText": {"type": ["string", "null"]},
                        "confidence": {"type": "number"},
                    },
                    "required": [
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
            }
        },
        "max_output_tokens": 900,
    }
    with httpx.Client(timeout=12) as client:
        response = client.post(
            "https://api.openai.com/v1/responses",
            headers={"Authorization": f"Bearer {OPENAI_API_KEY}", "Content-Type": "application/json"},
            json=payload,
        )
        response.raise_for_status()
    raw_plan = json.loads(_response_text(response.json()))
    return _validated_openai_plan(raw_plan, metadata, context)


def _validated_openai_plan(raw: dict, metadata: dict[str, list[str]], context: list[dict[str, str]]) -> AskPlan:
    intent = _expect(raw.get("intent"), ("ranking", "trend", "geography", "project_search"), "intent")
    chart_type = _expect(raw.get("chartType"), ("bar", "line", "map", "table"), "chartType")
    group_by = _expect(raw.get("groupBy"), GroupBy.__args__, "groupBy")
    grain = _expect(raw.get("grain"), ("project", "sector"), "grain")
    metric = _expect(raw.get("metric"), ("disbursements", "commitments"), "metric")

    filters = FilterRequest(
        years=_filter_allowed(raw.get("years", []), metadata.get("years", [])),
        donorCountries=_resolve_values(raw.get("donorCountries", []), metadata.get("donorCountries", []), COUNTRY_ALIASES),
        recipientCountries=_resolve_values(raw.get("recipientCountries", []), metadata.get("recipientCountries", []), COUNTRY_ALIASES),
        organizations=_resolve_values(raw.get("organizations", []), metadata.get("organizations", []), {}),
        sectors=_resolve_values(raw.get("sectors", []), metadata.get("sectors", []), {}),
        flowTypes=_resolve_values(raw.get("flowTypes", []), metadata.get("flowTypes", []), {}),
        markers=MarkerFilters(**{key: raw.get("markers", {}).get(key) for key in ("climate", "gender", "environment", "nutrition")}),
        metric=metric,
        searchText=(raw.get("searchText") or None),
    )
    if intent != "project_search":
        filters.searchText = None
    interpretation = _interpretation(intent, chart_type, group_by, grain, filters)
    confidence = max(0.0, min(float(raw.get("confidence", 0.75)), 0.95))
    return AskPlan(intent, chart_type, group_by, grain, filters, 10, confidence, interpretation, context, planner="openai")


def retrieve_context(question: str, limit: int = 2) -> list[dict[str, str]]:
    tokens = set(_normalize(question).split())
    scored = []
    for doc in KNOWLEDGE_BASE:
        doc_tokens = set(_normalize(f"{doc['title']} {doc['body']}").split())
        scored.append((len(tokens & doc_tokens), doc))
    return [doc for score, doc in sorted(scored, key=lambda item: item[0], reverse=True)[:limit] if score > 0]


def _metadata_prompt(metadata: dict[str, list[str]]) -> dict[str, list[str]]:
    return {
        "years": metadata.get("years", []),
        "donorCountries": metadata.get("donorCountries", [])[:150],
        "recipientCountries": metadata.get("recipientCountries", [])[:220],
        "organizations": metadata.get("organizations", [])[:120],
        "sectors": metadata.get("sectors", [])[:120],
        "flowTypes": metadata.get("flowTypes", []),
        "markers": ["climate", "gender", "environment", "nutrition"],
        "metrics": ["disbursements", "commitments"],
        "groupBy": list(GroupBy.__args__),
    }


def _expect(value: object, allowed: tuple[str, ...], field: str) -> str:
    if isinstance(value, str) and value in allowed:
        return value
    raise ValueError(f"OpenAI returned invalid {field}: {value}")


def _response_text(data: dict) -> str:
    if isinstance(data.get("output_text"), str):
        return data["output_text"]
    chunks: list[str] = []
    for item in data.get("output", []):
        for content in item.get("content", []):
            if content.get("type") in {"output_text", "text"} and isinstance(content.get("text"), str):
                chunks.append(content["text"])
    if not chunks:
        raise ValueError("OpenAI response did not include text output")
    return "".join(chunks)


def _filter_allowed(values: object, allowed: list[str]) -> list[str]:
    if not isinstance(values, list):
        return []
    allowed_set = set(allowed)
    return _dedupe([str(value) for value in values if str(value) in allowed_set])


def _resolve_values(values: object, allowed: list[str], aliases: dict[str, str]) -> list[str]:
    if not isinstance(values, list):
        return []
    allowed_by_normalized = {_normalize(value): value for value in allowed}
    resolved: list[str] = []
    for value in values:
        text = str(value).strip()
        canonical = aliases.get(_normalize(text), text)
        if canonical in allowed:
            resolved.append(canonical)
            continue
        normalized = _normalize(canonical)
        if normalized in allowed_by_normalized:
            resolved.append(allowed_by_normalized[normalized])
    return _dedupe(resolved)


def _interpretation(
    intent: Intent,
    chart_type: ChartType,
    group_by: GroupBy,
    grain: Literal["project", "sector"],
    filters: FilterRequest,
) -> list[str]:
    parts = [
        f"Intent: {intent.replace('_', ' ')}",
        f"Chart: {chart_type}",
        f"Metric: {filters.metric}",
        f"Grouped by: {group_by}",
        f"Grain: {grain}",
    ]
    active_filters = []
    for label, values in (
        ("years", filters.years),
        ("donor countries", filters.donorCountries),
        ("recipient countries", filters.recipientCountries),
        ("organizations", filters.organizations),
        ("sectors", filters.sectors),
        ("flow types", filters.flowTypes),
    ):
        if values:
            active_filters.append(f"{label} = {', '.join(values)}")
    markers = [name for name, value in filters.markers.model_dump().items() if value is True]
    if markers:
        active_filters.append(f"markers = {', '.join(markers)}")
    if filters.searchText:
        active_filters.append(f"search = {filters.searchText}")
    parts.append("Filters: " + ("; ".join(active_filters) if active_filters else "none"))
    return parts


def _normalize(value: str) -> str:
    return re.sub(r"\s+", " ", value.casefold().replace("_", " ")).strip()


def _dedupe(values: list[str]) -> list[str]:
    result = []
    seen = set()
    for value in values:
        if value not in seen:
            seen.add(value)
            result.append(value)
    return result
