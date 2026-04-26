from typing import Literal

from pydantic import BaseModel, Field


Metric = Literal["disbursements", "commitments"]
Grain = Literal["project", "sector"]
ChartType = Literal["bar", "line", "map", "kpi", "table"]
ChartEndpoint = Literal["rankings", "trends", "geography", "summary", "projects"]


class MarkerFilters(BaseModel):
    climate: bool | None = None
    gender: bool | None = None
    environment: bool | None = None
    nutrition: bool | None = None


class FilterRequest(BaseModel):
    years: list[str] = Field(default_factory=list)
    donorCountries: list[str] = Field(default_factory=list)
    recipientCountries: list[str] = Field(default_factory=list)
    regions: list[str] = Field(default_factory=list)
    macroRegions: list[str] = Field(default_factory=list)
    organizations: list[str] = Field(default_factory=list)
    sectors: list[str] = Field(default_factory=list)
    subsectors: list[str] = Field(default_factory=list)
    flowTypes: list[str] = Field(default_factory=list)
    markers: MarkerFilters = Field(default_factory=MarkerFilters)
    metric: Metric = "disbursements"
    searchText: str | None = None


class GroupedRequest(FilterRequest):
    groupBy: Literal[
        "year",
        "organization_name",
        "donor_country",
        "country",
        "region",
        "region_macro",
        "sector_description",
        "subsector_description",
        "type_of_flow",
    ] = "year"
    grain: Grain = "project"
    limit: int = Field(default=15, ge=1, le=100)


class ProjectSearchRequest(FilterRequest):
    limit: int = Field(default=25, ge=1, le=100)
    offset: int = Field(default=0, ge=0)


class ChartSpec(BaseModel):
    id: str
    title: str
    description: str
    chartType: ChartType
    endpoint: ChartEndpoint
    filters: FilterRequest = Field(default_factory=FilterRequest)
    groupBy: GroupedRequest.model_fields["groupBy"].annotation | None = None
    grain: Grain = "project"
    limit: int = Field(default=10, ge=1, le=100)


class PromptRequest(BaseModel):
    prompt: str = Field(min_length=3, max_length=500)
    baseFilters: FilterRequest = Field(default_factory=FilterRequest)
