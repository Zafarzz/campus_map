"""API behaviour, including the compatibility contract.

The compat tests are the important ones: they assert the response *shape* the
3D front end's TypeScript types require. If one of them fails, the map breaks.
"""

from __future__ import annotations

import pytest
from httpx import AsyncClient

pytestmark = pytest.mark.db

PREFIX = "/api/v1"

# Mirrors src/domain/campus/types.ts. Required keys must always be present;
# optional ones may be absent but must never carry an unexpected name.
CAMPUS_KEYS = {"id", "name", "buildings"}
BUILDING_REQUIRED = {"id", "name", "shortName", "floors", "provenance"}
BUILDING_OPTIONAL = {"description", "appearancePreset", "appearance"}
FLOOR_KEYS = {"id", "level", "name", "rooms"}
ROOM_REQUIRED = {"id", "number", "kind", "provenance"}
ROOM_OPTIONAL = {"name", "capacity"}


async def test_healthz_does_not_need_the_database(client: AsyncClient) -> None:
    response = await client.get("/healthz")
    assert response.status_code == 200
    assert response.json()["status"] == "ok"


async def test_readyz_reports_the_database_and_timezone(client: AsyncClient) -> None:
    response = await client.get("/readyz")
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "ready"
    assert body["checks"]["database"] == "ok"
    assert body["campus_timezone"] == "Asia/Tashkent"


async def test_every_response_carries_a_request_id(client: AsyncClient) -> None:
    response = await client.get("/healthz")
    assert response.headers.get("x-request-id")


async def test_an_inbound_request_id_is_honoured(client: AsyncClient) -> None:
    response = await client.get("/healthz", headers={"x-request-id": "abc123"})
    assert response.headers["x-request-id"] == "abc123"


async def test_openapi_is_published(client: AsyncClient) -> None:
    response = await client.get("/openapi.json")
    assert response.status_code == 200
    spec = response.json()
    paths = spec["paths"]
    for path in (
        f"{PREFIX}/campus",
        f"{PREFIX}/buildings",
        f"{PREFIX}/buildings/{{building_id}}/rooms",
        f"{PREFIX}/compat/campus",
        f"{PREFIX}/compat/campus/bare",
        f"{PREFIX}/compat/lessons",
    ):
        assert path in paths, f"{path} missing from OpenAPI"


async def test_metrics_endpoint_exposes_prometheus_text(client: AsyncClient) -> None:
    await client.get("/healthz")
    response = await client.get("/metrics")
    assert response.status_code == 200
    assert "campus_http_requests_total" in response.text


# --------------------------------------------------------------- compat contract


async def test_compat_campus_bare_matches_the_front_ends_campus_type(
    seeded_client: AsyncClient,
) -> None:
    response = await seeded_client.get(f"{PREFIX}/compat/campus/bare")
    assert response.status_code == 200
    campus = response.json()

    assert set(campus) == CAMPUS_KEYS
    assert campus["id"] == "ajou-tashkent"
    assert campus["name"] == "Ajou University in Tashkent"
    assert len(campus["buildings"]) == 8

    for building in campus["buildings"]:
        keys = set(building)
        assert keys >= BUILDING_REQUIRED, f"{building['id']} missing {BUILDING_REQUIRED - keys}"
        assert keys <= BUILDING_REQUIRED | BUILDING_OPTIONAL, (
            f"unexpected keys {keys - BUILDING_REQUIRED - BUILDING_OPTIONAL}"
        )
        assert building["provenance"] in {"confirmed", "demo"}

        for floor in building["floors"]:
            assert set(floor) == FLOOR_KEYS
            assert isinstance(floor["level"], int)
            for room in floor["rooms"]:
                room_keys = set(room)
                assert room_keys >= ROOM_REQUIRED
                assert room_keys <= ROOM_REQUIRED | ROOM_OPTIONAL
                assert room["kind"] in {"classroom", "lab", "office", "hall", "other"}
                assert room["provenance"] in {"confirmed", "demo"}


async def test_compat_omits_unset_optional_fields_rather_than_sending_null(
    seeded_client: AsyncClient,
) -> None:
    """The front end's types are `name?: string`, not `name: string | null`.

    A literal null would type-check but render as the text "null" in the UI.
    """
    campus = (await seeded_client.get(f"{PREFIX}/compat/campus/bare")).json()
    rooms = [r for b in campus["buildings"] for f in b["floors"] for r in f["rooms"]]

    unnamed = [r for r in rooms if "name" not in r]
    named = [r for r in rooms if "name" in r]
    assert unnamed, "expected some rooms without a name (the generated placeholders)"
    assert named, "expected some rooms with a name (the CAD-derived ones)"
    assert all(r["name"] is not None for r in named)

    # And no key anywhere is explicitly null.
    for room in rooms:
        assert all(value is not None for value in room.values())


async def test_compat_preserves_the_front_ends_building_order(seeded_client: AsyncClient) -> None:
    """The Buildings panel renders the array as it comes, so order is contract."""
    campus = (await seeded_client.get(f"{PREFIX}/compat/campus/bare")).json()
    assert [b["id"] for b in campus["buildings"]] == [
        "bld-a",
        "bld-b",
        "bld-c",
        "bld-d",
        "bld-g",
        "bld-h",
        "bld-i",
        "bld-j",
    ]


async def test_compat_block_a_rooms_come_from_the_cad_drawings(seeded_client: AsyncClient) -> None:
    campus = (await seeded_client.get(f"{PREFIX}/compat/campus/bare")).json()
    block_a = next(b for b in campus["buildings"] if b["id"] == "bld-h")
    assert block_a["shortName"] == "A"  # NOT bld-a
    assert block_a["name"] == "Block A"

    ground = next(f for f in block_a["floors"] if f["level"] == 1)
    numbers = {r["number"] for r in ground["rooms"]}
    assert {"A-101", "A-102", "A-105", "A-110"} <= numbers

    a102 = next(r for r in ground["rooms"] if r["number"] == "A-102")
    assert a102["id"] == "bld-h-f1-a102"
    assert a102["capacity"] == 36
    assert a102["kind"] == "classroom"


async def test_compat_wrapper_carries_provenance(seeded_client: AsyncClient) -> None:
    response = await seeded_client.get(f"{PREFIX}/compat/campus")
    assert response.status_code == 200
    body = response.json()
    assert set(body) == {"campus", "meta"}
    assert body["meta"]["source"] == "confirmed"
    # 18 of 101 rooms are generated placeholders, so the flag must be true.
    assert body["meta"]["is_demo"] is True
    assert "18 of 101 rooms" in body["meta"]["note"]


async def test_provenance_headers_are_present_on_the_bare_response(
    seeded_client: AsyncClient,
) -> None:
    """The body's shape is fixed by the front end, so provenance rides in headers."""
    response = await seeded_client.get(f"{PREFIX}/compat/campus/bare")
    assert response.headers["x-campus-source"] == "confirmed"
    assert response.headers["x-campus-is-demo"] == "true"


@pytest.mark.parametrize(
    "path",
    [
        f"{PREFIX}/compat/lessons?date=2026-10-19",
        f"{PREFIX}/compat/room-states",
        f"{PREFIX}/compat/live-counts",
    ],
)
async def test_the_schedule_compat_endpoints_are_implemented(
    seeded_client: AsyncClient, path: str
) -> None:
    """Built in Phase 2 (Layer 0). These returned 501 in Phase 1.

    Kept as a route-level smoke test rather than deleted: it runs against a
    campus with **no timetable seeded**, which is the case most likely to be got
    wrong. The honest answer there is 200 with an empty result - "there are no
    lessons" is a real answer about the world, whereas 501 would have claimed
    the feature does not exist and an error would have claimed something broke.

    The behavioural assertions live in ``tests/test_state_api.py``, against a
    database that actually has a timetable.
    """
    response = await seeded_client.get(path)
    assert response.status_code == 200

    body = response.json()
    assert body["meta"]["source"] in {"confirmed", "demo"}

    if "lessons" in body:
        assert body["lessons"] == []
    if "counts" in body:
        # Every building present, all zero: no timetable means nothing is live.
        assert body["counts"] and set(body["counts"].values()) == {0}
    if "states" in body:
        assert body["states"], "rooms exist even when no lessons do"
        assert {item["status"] for item in body["states"].values()} == {"AVAILABLE"}


# --------------------------------------------------------------- clean api


async def test_clean_campus_endpoint(seeded_client: AsyncClient) -> None:
    response = await seeded_client.get(f"{PREFIX}/campus")
    assert response.status_code == 200
    body = response.json()
    assert body["id"] == "ajou-tashkent"
    assert body["timezone"] == "Asia/Tashkent"
    assert body["building_count"] == 8
    assert len(body["connectors"]) == 2
    assert {c["id"] for c in body["connectors"]} == {"conn-bld-g-bld-i", "conn-bld-h-bld-i"}


async def test_building_detail_reports_room_counts_per_floor(seeded_client: AsyncClient) -> None:
    response = await seeded_client.get(f"{PREFIX}/buildings/bld-h")
    assert response.status_code == 200
    body = response.json()
    assert body["short_name"] == "A"
    counts = {f["level"]: f["room_count"] for f in body["floors"]}
    assert counts == {1: 9, 2: 11}


async def test_unknown_building_is_404(seeded_client: AsyncClient) -> None:
    response = await seeded_client.get(f"{PREFIX}/buildings/bld-nope")
    assert response.status_code == 404
    assert response.json()["error"]["code"] == "building_not_found"


async def test_building_rooms_are_ordered_by_floor(seeded_client: AsyncClient) -> None:
    response = await seeded_client.get(f"{PREFIX}/buildings/bld-c/rooms")
    assert response.status_code == 200
    body = response.json()
    assert body["total"] == 14
    assert len(body["rooms"]) == 14


async def test_a_legacy_room_id_resolves_to_its_current_room(seeded_client: AsyncClient) -> None:
    """`bld-h-f1-r1` was A-102's id before ADR-008's stable ids."""
    response = await seeded_client.get(f"{PREFIX}/rooms/bld-h-f1-r1")
    assert response.status_code == 200
    body = response.json()
    assert body["id"] == "bld-h-f1-a102"
    assert body["number"] == "A-102"


async def test_an_ambiguous_legacy_id_is_a_409_not_a_guess(seeded_client: AsyncClient) -> None:
    """`bld-h-f2-r7` belongs to both A-207 and A-208 in the real front-end data.

    Returning either one would silently be wrong half the time.
    """
    response = await seeded_client.get(f"{PREFIX}/rooms/bld-h-f2-r7")
    assert response.status_code == 409
    error = response.json()["error"]
    assert error["code"] == "ambiguous_alias"
    assert set(error["details"]["candidates"]) == {"bld-h-f2-a207", "bld-h-f2-a208"}


async def test_a_current_id_wins_over_an_alias(seeded_client: AsyncClient) -> None:
    """An alias must never shadow a real room."""
    response = await seeded_client.get(f"{PREFIX}/rooms/bld-h-f2-a207")
    assert response.status_code == 200
    assert response.json()["number"] == "A-207"


async def test_unknown_room_is_404(seeded_client: AsyncClient) -> None:
    response = await seeded_client.get(f"{PREFIX}/rooms/nope")
    assert response.status_code == 404
    assert response.json()["error"]["code"] == "room_not_found"


async def test_errors_use_one_envelope_with_a_request_id(seeded_client: AsyncClient) -> None:
    response = await seeded_client.get(f"{PREFIX}/rooms/nope")
    error = response.json()["error"]
    assert {"code", "message"} <= set(error)
    assert error["request_id"] == response.headers["x-request-id"]


async def test_error_messages_are_localised(seeded_client: AsyncClient) -> None:
    """User-facing text goes through the catalogues (brief section 9)."""
    response = await seeded_client.get(f"{PREFIX}/rooms/bld-h-f2-r7", headers={"accept-language": "ru"})
    assert response.status_code == 409
    # Falls back to English if no compiled catalogue is present, so assert only
    # that a message is returned, not which language.
    assert response.json()["error"]["message"]


# --------------------------------------------------------------- auth


async def test_me_requires_a_token(client: AsyncClient) -> None:
    response = await client.get(f"{PREFIX}/auth/me")
    assert response.status_code == 401
    assert response.json()["error"]["code"] == "not_authenticated"


async def test_me_rejects_a_junk_token(client: AsyncClient) -> None:
    response = await client.get(f"{PREFIX}/auth/me", headers={"authorization": "Bearer not-a-jwt"})
    assert response.status_code == 401
    assert response.json()["error"]["code"] == "token_invalid"


async def test_dev_token_is_refused_outside_development(client: AsyncClient) -> None:
    """The test environment is not development, so this path must be closed."""
    response = await client.post(
        f"{PREFIX}/auth/dev-token",
        json={"email": "admin@dev.local", "password": "devpassword"},
    )
    assert response.status_code == 403
    assert response.json()["error"]["code"] == "local_accounts_disabled"
