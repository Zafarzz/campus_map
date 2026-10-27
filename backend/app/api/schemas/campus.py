"""Clean-API schemas for spatial data.

Free to evolve, unlike ``compat``. Field names are snake_case, enums use the
brief's spellings, and anything computed carries ``source`` and ``confidence``.
"""

from __future__ import annotations

from datetime import datetime
from typing import Annotated, Any

from pydantic import BaseModel, ConfigDict, Field

from app.domain.base import DataProvenance, RoomKind


class ApiModel(BaseModel):
    # populate_by_name lets these models be built either from an ORM object
    # (via the validation aliases below) or by keyword in a test.
    model_config = ConfigDict(from_attributes=True, extra="forbid", populate_by_name=True)


class Computed(ApiModel):
    """Provenance envelope attached to every computed value (brief section 8)."""

    source: str = Field(description="scheduled | confirmed | reported | estimated | forecast | demo")
    confidence: Annotated[float, Field(ge=0.0, le=1.0)]
    as_of: datetime


class RoomOut(ApiModel):
    id: str
    number: str
    name: str | None
    #: The ORM column is ``room_kind`` (``kind`` alone would read oddly next to
    #: ``SpaceKind`` in the domain), but the API says ``kind``. The alias is what
    #: makes ``model_validate(room_orm_object)`` find the attribute.
    kind: RoomKind = Field(validation_alias="room_kind")
    capacity: int | None
    provenance: DataProvenance
    is_demo: bool
    #: NULL means "not assessed", which is not the same as "not accessible".
    accessible: bool | None = None
    features: dict[str, Any] | None = None
    out_of_service: bool = False
    needs_review: str | None = None


class FloorOut(ApiModel):
    id: str
    level: int
    name: str
    is_demo: bool
    room_count: int


class FloorDetailOut(FloorOut):
    rooms: list[RoomOut]


class BuildingOut(ApiModel):
    id: str
    name: str
    #: The block letter on the map. Never derived from ``id``: ``bld-a`` is the
    #: North Building, not Block A (``docs/PDF_INVENTORY.md`` section 3).
    short_name: str
    description: str | None
    floor_count: int
    provenance: DataProvenance
    is_demo: bool
    appearance_preset: str | None = None


class BuildingDetailOut(BuildingOut):
    floors: list[FloorOut]


class ConnectorOut(ApiModel):
    """Enclosed passage between two buildings (ADR-020). Not a building."""

    id: str
    kind: str
    building_ids: list[str]


class CampusOut(ApiModel):
    id: str
    name: str
    #: IANA timezone of this campus. The API renders local times in it.
    timezone: str
    is_demo: bool
    building_count: int


class CampusDetailOut(CampusOut):
    buildings: list[BuildingOut]
    connectors: list[ConnectorOut]


class RoomListOut(ApiModel):
    building_id: str
    rooms: list[RoomOut]
    total: int
