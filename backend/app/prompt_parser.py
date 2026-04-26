from __future__ import annotations

import re
from hashlib import sha1
from typing import Any

from .schemas import ChartSpec, FilterRequest


GROUP_BY = {
    "donor_country": "donor_country",
    "donor countries": "donor_country",
    "foundation": "organization_name",
    "foundations": "organization_name",
    "donor": "organization_name",
    "donors": "organization_name",
    "recipient": "country",
    "recipients": "country",
    "countries": "country",
    "country": "country",
    "region": "region_macro",
    "regions": "region_macro",
    "sector": "sector_description",
    "sectors": "sector_description",
    "subsector": "subsector_description",
    "subsectors": "subsector_description",
}

COUNTRY_ALIASES = {
    "uk": "United Kingdom",
    "u.k.": "United Kingdom",
    "britain": "United Kingdom",
    "united kingdom": "United Kingdom",
    "usa": "United States",
    "u.s.": "United States",
    "us": "United States",
    "united states": "United States",
    "china": "China (People's Republic of)",
    "india": "India",
    "mexico": "Mexico",
    "kenya": "Kenya",
    "nigeria": "Nigeria",
    "brazil": "Brazil",
    "peru": "Peru",
    "colombia": "Colombia",
}


def _clone_filters(filters: FilterRequest) -> FilterRequest:
    return FilterRequest.model_validate(filters.model_dump())


def _clean_prompt(prompt: str) -> str:
    return re.sub(r"\s+", " ", prompt.strip())


def _slug(value: str) -> str:
    return sha1(value.encode("utf-8")).hexdigest()[:10]


def _limit(prompt_lower: str, default: int = 10) -> int:
    match = re.search(r"\btop\s+(\d{1,2})\b", prompt_lower)
    if not match:
        return default
    return max(1, min(50, int(match.group(1))))


def _metric(prompt_lower: str) -> str:
    return "commitments" if "commit" in prompt_lower else "disbursements"


def _years(prompt_lower: str, catalog: dict[str, list[str]]) -> list[str]:
    years = set(re.findall(r"\b20(?:20|21|22|23)\b", prompt_lower))
    since = re.search(r"\bsince\s+(20(?:20|21|22|23))\b", prompt_lower)
    if since:
        start = since.group(1)
        years.update(year for year in catalog.get("years", []) if year.isdigit() and year >= start)
    if "past 5" in prompt_lower or "all years" in prompt_lower:
        years.update(year for year in catalog.get("years", []) if year.isdigit())
    return sorted(years)


def _match_catalog(prompt_lower: str, values: list[str], max_items: int = 2) -> list[str]:
    matches: list[str] = []
    for value in values:
        lowered = value.lower()
        if len(lowered) >= 4 and lowered in prompt_lower:
            matches.append(value)
        if len(matches) >= max_items:
            break
    return matches


def _apply_topic_filters(prompt_lower: str, filters: FilterRequest) -> None:
    if "climate" in prompt_lower or "climatetech" in prompt_lower:
        filters.markers.climate = True
    if "gender" in prompt_lower or "women" in prompt_lower or "girls" in prompt_lower:
        filters.markers.gender = True
    if "environment" in prompt_lower or "biodiversity" in prompt_lower:
        filters.markers.environment = True
    if "nutrition" in prompt_lower or "malnutrition" in prompt_lower:
        filters.markers.nutrition = True
    if "maternal" in prompt_lower:
        filters.sectors = _append_unique(filters.sectors, "Population Policies/Programmes & Reproductive Health")
        filters.searchText = "maternal health"
    elif "infectious" in prompt_lower:
        filters.searchText = "infectious disease"
    elif "healthcare" in prompt_lower or "health care" in prompt_lower or re.search(r"\bhealth\b", prompt_lower):
        filters.sectors = _append_unique(filters.sectors, "Health")


def _append_unique(values: list[str], value: str) -> list[str]:
    return values if value in values else [*values, value]


def _apply_catalog_filters(prompt_lower: str, filters: FilterRequest, catalog: dict[str, list[str]]) -> None:
    prompt_has_donor_context = any(term in prompt_lower for term in ["donor country", "based out of", "from donors", "from donor"])
    for alias, country in COUNTRY_ALIASES.items():
        if re.search(rf"\b{re.escape(alias)}\b", prompt_lower):
            if prompt_has_donor_context or "based out of" in prompt_lower:
                filters.donorCountries = _append_unique(filters.donorCountries, country)
            else:
                filters.recipientCountries = _append_unique(filters.recipientCountries, country)

    for value in _match_catalog(prompt_lower, catalog.get("organizations", []), 1):
        filters.organizations = _append_unique(filters.organizations, value)
    for value in _match_catalog(prompt_lower, catalog.get("sectors", []), 1):
        filters.sectors = _append_unique(filters.sectors, value)
    for value in _match_catalog(prompt_lower, catalog.get("macroRegions", []), 1):
        filters.macroRegions = _append_unique(filters.macroRegions, value)


def _group_by(prompt_lower: str) -> str:
    for key, value in GROUP_BY.items():
        if re.search(rf"\b{re.escape(key)}\b", prompt_lower):
            return value
    return "organization_name"


def _chart_type(prompt_lower: str, group_by: str) -> tuple[str, str]:
    if any(term in prompt_lower for term in ["over time", "trend", "changed", "change over", "by year"]):
        return "line", "trends"
    if any(term in prompt_lower for term in ["map", "geography", "where"]):
        return "map", "geography"
    if any(term in prompt_lower for term in ["table", "projects", "records"]):
        return "table", "projects"
    if any(term in prompt_lower for term in ["summary", "kpi", "total"]):
        return "kpi", "summary"
    if group_by in {"country", "region_macro"} and "receive" in prompt_lower:
        return "bar", "rankings"
    return "bar", "rankings"


def parse_chart_prompt(prompt: str, base_filters: FilterRequest, catalog: dict[str, list[str]]) -> ChartSpec:
    clean = _clean_prompt(prompt)
    prompt_lower = clean.lower()
    filters = _clone_filters(base_filters)
    filters.metric = _metric(prompt_lower)
    parsed_years = _years(prompt_lower, catalog)
    if parsed_years:
        filters.years = parsed_years
    _apply_topic_filters(prompt_lower, filters)
    _apply_catalog_filters(prompt_lower, filters, catalog)

    group_by = _group_by(prompt_lower)
    chart_type, endpoint = _chart_type(prompt_lower, group_by)
    if endpoint == "trends":
        group_by = "year"
    if endpoint == "geography":
        group_by = "country"

    grain = "sector" if group_by in {"sector_description", "subsector_description"} else "project"
    limit = _limit(prompt_lower)

    title = title_for_spec(clean, chart_type, group_by, filters)
    description = description_for_spec(endpoint, group_by, filters)
    return ChartSpec(
        id=f"chart-{_slug(clean)}",
        title=title,
        description=description,
        chartType=chart_type,
        endpoint=endpoint,
        filters=filters,
        groupBy=group_by if endpoint in {"rankings", "trends"} else None,
        grain=grain,
        limit=limit,
    )


def parse_dashboard_prompt(prompt: str, base_filters: FilterRequest, catalog: dict[str, list[str]]) -> dict[str, Any]:
    clean = _clean_prompt(prompt)
    prompt_lower = clean.lower()
    filters = _clone_filters(base_filters)
    filters.metric = _metric(prompt_lower)
    parsed_years = _years(prompt_lower, catalog)
    if parsed_years:
        filters.years = parsed_years
    _apply_topic_filters(prompt_lower, filters)
    _apply_catalog_filters(prompt_lower, filters, catalog)

    cards = [
        ChartSpec(
            id=f"chart-{_slug(clean + ' summary')}",
            title="Funding summary",
            description="Headline project-safe funding totals.",
            chartType="kpi",
            endpoint="summary",
            filters=filters,
            limit=1,
        ),
        ChartSpec(
            id=f"chart-{_slug(clean + ' trend')}",
            title="Funding trend",
            description="Project-safe funding by year.",
            chartType="line",
            endpoint="trends",
            filters=filters,
            groupBy="year",
            grain="project",
            limit=10,
        ),
        ChartSpec(
            id=f"chart-{_slug(clean + ' recipients')}",
            title="Top recipient countries",
            description="Project-safe recipient ranking.",
            chartType="bar",
            endpoint="rankings",
            filters=filters,
            groupBy="country",
            grain="project",
            limit=8,
        ),
        ChartSpec(
            id=f"chart-{_slug(clean + ' donors')}",
            title="Top foundation donors",
            description="Project-safe foundation donor ranking.",
            chartType="bar",
            endpoint="rankings",
            filters=filters,
            groupBy="organization_name",
            grain="project",
            limit=8,
        ),
    ]
    if "sector" in prompt_lower or "health" in prompt_lower or "climate" in prompt_lower:
        cards.append(
            ChartSpec(
                id=f"chart-{_slug(clean + ' sectors')}",
                title="Sector funding mix",
                description="Sector-row distribution for the generated topic.",
                chartType="bar",
                endpoint="rankings",
                filters=filters,
                groupBy="sector_description",
                grain="sector",
                limit=8,
            )
        )
    return {
        "id": f"dashboard-{_slug(clean)}",
        "title": dashboard_title(clean),
        "description": "Generated from a local prompt parser. Cards can be regenerated or exported as chart specs.",
        "cards": cards,
    }


def dashboard_title(prompt: str) -> str:
    cleaned = prompt.rstrip(".?!")
    if cleaned.lower().startswith("create"):
        cleaned = re.sub(r"^create\s+(a\s+)?", "", cleaned, flags=re.IGNORECASE)
    return cleaned[:90].capitalize()


def title_for_spec(prompt: str, chart_type: str, group_by: str, filters: FilterRequest) -> str:
    if chart_type == "line":
        return "Funding over time"
    if chart_type == "map":
        return "Recipient geography"
    if chart_type == "kpi":
        return "Funding summary"
    labels = {
        "organization_name": "Top foundation donors",
        "donor_country": "Top donor countries",
        "country": "Top recipient countries",
        "sector_description": "Top sectors",
        "subsector_description": "Top subsectors",
        "region_macro": "Top regions",
    }
    topic = filters.searchText or ""
    base = labels.get(group_by, "Generated chart")
    return f"{base}: {topic}" if topic else base


def description_for_spec(endpoint: str, group_by: str, filters: FilterRequest) -> str:
    scope = []
    if filters.years:
        scope.append(f"years {', '.join(filters.years)}")
    if filters.donorCountries:
        scope.append(f"donors based in {', '.join(filters.donorCountries)}")
    if filters.recipientCountries:
        scope.append(f"recipients in {', '.join(filters.recipientCountries)}")
    if filters.sectors:
        scope.append(f"sector {', '.join(filters.sectors)}")
    if filters.searchText:
        scope.append(f"matching \"{filters.searchText}\"")
    scope_text = "; ".join(scope) if scope else "all records"
    return f"{endpoint.title()} view grouped by {group_by}; scope: {scope_text}."
