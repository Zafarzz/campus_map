"""``WS /ws/v1/stream`` and its REST fallback.

The rules the brief sets for this endpoint (section 8):

* **Authenticate with a short-lived JWT before accepting the connection.** The
  token arrives as a query parameter because the browser WebSocket API cannot
  set headers; it is verified *before* ``accept()``, so an unauthenticated
  client is closed without ever being served.
* A JSON envelope with a ``type`` field, in both directions.
* A per-instance connection manager, with Redis pub/sub fanning messages out
  across workers.
* Heartbeats, and client reconnection with ``last_event_id`` so a client can
  catch up.
* Message-size and per-client rate limits.
* **A REST polling fallback for every stream** - see
  ``GET /api/v1/stream/changes``.

A note on the token in the URL: query strings end up in access logs, which is
why these tokens are short-lived and carry only a pseudonymous subject. The
alternative - a subprotocol header - is not reachable from the browser API, so
this is the available trade rather than the ideal one.
"""

from __future__ import annotations

import asyncio
import contextlib
from typing import Annotated, Any

from fastapi import APIRouter, Depends, Query, WebSocket, WebSocketDisconnect, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import Settings, get_settings
from app.core.db import get_database, get_session
from app.core.errors import AuthenticationError
from app.core.logging import get_logger
from app.core.security import decode_access_token
from app.realtime.events import MAX_MESSAGE_BYTES, Envelope, EventType, Topic
from app.realtime.hub import Connection, get_hub
from app.services import history_service

log = get_logger(__name__)

#: Mounted at the **root** in ``app.main``, not under ``/api/v1``, so the path is
#: ``/ws/v1/stream`` exactly as the brief specifies (section 8). The REST
#: fallback below is a normal versioned endpoint and goes under the API prefix.
ws_router = APIRouter(tags=["stream"])
router = APIRouter(tags=["stream"])

SessionDep = Annotated[AsyncSession, Depends(get_session)]
SettingsDep = Annotated[Settings, Depends(get_settings)]

#: Seconds between server heartbeats.
HEARTBEAT_SECONDS = 25

#: Inbound control frames allowed per client per minute. Subscribing is cheap
#: but not free - each change re-syncs this worker's broker subscription - so a
#: client that churns subscriptions is throttled rather than allowed to spin the
#: worker.
RATE_LIMIT_PER_MINUTE = 120

#: Topics a client may hold at once. A client that wants more than this should
#: subscribe to a building or the campus rather than to every room by name.
MAX_TOPICS_PER_CLIENT = 200

#: Largest catch-up replay sent on reconnect. Past this the client is too far
#: behind to patch up and is told to refetch from `/state` instead.
MAX_CATCH_UP = 200


@ws_router.websocket("/ws/v1/stream")
async def stream(
    websocket: WebSocket,
    token: Annotated[str | None, Query(description="Short-lived access token.")] = None,
    topics: Annotated[
        str | None,
        Query(description="Comma-separated topics to subscribe to on connect."),
    ] = None,
    last_event_id: Annotated[
        int | None,
        Query(ge=0, description="Resume from this sequence; the gap is replayed."),
    ] = None,
) -> None:
    settings = get_settings()

    # Authenticate BEFORE accepting. A rejected client is closed during the
    # handshake and never reaches the hub.
    try:
        if not token:
            raise AuthenticationError("A token is required to open the stream.")
        principal = decode_access_token(token, settings=settings)
    except AuthenticationError as exc:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION, reason=exc.code[:120])
        return

    await websocket.accept()

    hub = get_hub()
    await hub.start()
    connection = Connection(send=websocket.send_text, principal=principal.subject)
    await hub.add(connection)

    heartbeat: asyncio.Task[None] | None = None
    try:
        sequence = await _current_sequence()
        connection.last_event_id = sequence

        await websocket.send_text(
            Envelope(
                type=EventType.welcome,
                sequence=sequence,
                payload={
                    "subject": principal.subject,
                    "heartbeat_seconds": HEARTBEAT_SECONDS,
                    "max_topics": MAX_TOPICS_PER_CLIENT,
                    # Stated rather than assumed: with no Redis configured this
                    # worker's events do not reach clients on another worker,
                    # and a client deserves to know its view may be partial.
                    "cross_worker_fan_out": hub.supports_fan_out,
                    "rest_fallback": "/api/v1/stream/changes",
                },
            ).to_json()
        )

        for raw in (topics or "").split(","):
            if raw.strip():
                await _try_subscribe(websocket, hub, connection, raw.strip())

        if last_event_id is not None:
            await _send_catch_up(websocket, last_event_id)

        heartbeat = asyncio.create_task(_beat(websocket, connection))
        await _serve(websocket, hub, connection)

    except WebSocketDisconnect:
        pass
    except Exception as exc:  # pragma: no cover - defensive
        log.warning("stream_error", error=str(exc), subject=principal.subject)
    finally:
        if heartbeat is not None:
            heartbeat.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await heartbeat
        await hub.remove(connection)


async def _serve(websocket: WebSocket, hub: Any, connection: Connection) -> None:
    """Read control frames until the client goes away."""
    window_started = asyncio.get_running_loop().time()
    seen = 0

    while True:
        raw = await websocket.receive_text()

        if len(raw.encode()) > MAX_MESSAGE_BYTES:
            await websocket.close(code=status.WS_1009_MESSAGE_TOO_BIG, reason="message too large")
            return

        # Fixed-window rate limit. Crude on purpose: the goal is to stop a
        # client spinning the worker, not to meter usage precisely.
        now = asyncio.get_running_loop().time()
        if now - window_started >= 60:
            window_started = now
            seen = 0
        seen += 1
        if seen > RATE_LIMIT_PER_MINUTE:
            await websocket.close(code=status.WS_1008_POLICY_VIOLATION, reason="rate limit exceeded")
            return

        try:
            envelope = Envelope.from_json(raw)
        except ValueError as exc:
            await _error(websocket, str(exc))
            continue

        if envelope.type is EventType.ping:
            await websocket.send_text(Envelope(type=EventType.heartbeat).to_json())
        elif envelope.type is EventType.subscribe:
            await _try_subscribe(websocket, hub, connection, envelope.topic or "")
        elif envelope.type is EventType.unsubscribe:
            await _try_unsubscribe(websocket, hub, connection, envelope.topic or "")
        else:
            await _error(websocket, f"{envelope.type.value!r} is not a message a client may send")


async def _try_subscribe(websocket: WebSocket, hub: Any, connection: Connection, raw: str) -> None:
    try:
        topic = Topic.parse(raw)
    except ValueError as exc:
        await _error(websocket, str(exc))
        return

    if len(connection.topics) >= MAX_TOPICS_PER_CLIENT and str(topic) not in connection.topics:
        await _error(
            websocket,
            f"a client may hold at most {MAX_TOPICS_PER_CLIENT} topics; "
            "subscribe to a building or the campus instead of individual rooms",
        )
        return

    await hub.subscribe(connection, topic)
    await websocket.send_text(Envelope(type=EventType.subscribed, topic=str(topic)).to_json())


async def _try_unsubscribe(websocket: WebSocket, hub: Any, connection: Connection, raw: str) -> None:
    try:
        topic = Topic.parse(raw)
    except ValueError as exc:
        await _error(websocket, str(exc))
        return

    await hub.unsubscribe(connection, topic)
    await websocket.send_text(Envelope(type=EventType.unsubscribed, topic=str(topic)).to_json())


async def _error(websocket: WebSocket, message: str) -> None:
    """A malformed frame is an error *frame*, not a disconnection.

    A bad subscribe is a client bug; dropping an otherwise working connection
    over it would turn a recoverable mistake into an outage for that client.
    """
    await websocket.send_text(Envelope(type=EventType.error, payload={"message": message}).to_json())


async def _beat(websocket: WebSocket, connection: Connection) -> None:
    """Send a heartbeat on a fixed interval.

    Also how a client detects a half-open connection: TCP will happily hold a
    socket open long after the peer has vanished, so silence is not evidence of
    health.
    """
    while True:
        await asyncio.sleep(HEARTBEAT_SECONDS)
        await websocket.send_text(
            Envelope(type=EventType.heartbeat, sequence=connection.last_event_id).to_json()
        )


async def _send_catch_up(websocket: WebSocket, last_event_id: int) -> None:
    """Replay what a reconnecting client missed."""
    database = get_database()
    async with database.sessionmaker() as session:
        events = await history_service.events_since(
            session, last_event_id=last_event_id, limit=MAX_CATCH_UP + 1
        )

    truncated = len(events) > MAX_CATCH_UP
    await websocket.send_text(
        Envelope(
            type=EventType.catch_up,
            sequence=events[-1].sequence if events else last_event_id,
            payload={
                "from_sequence": last_event_id,
                "truncated": truncated,
                # A client too far behind to patch up is told to refetch rather
                # than handed a partial history it would merge into a wrong view.
                "advice": (
                    "too far behind to replay; refetch GET /api/v1/state" if truncated else "caught up"
                ),
                "events": [
                    {
                        "sequence": event.sequence,
                        "room_id": event.room_id,
                        "state": event.state.value,
                        "effective_at": event.effective_at.isoformat(),
                    }
                    for event in events[:MAX_CATCH_UP]
                ],
            },
        ).to_json()
    )


async def _current_sequence() -> int:
    database = get_database()
    async with database.sessionmaker() as session:
        return await history_service.latest_sequence(session)


# --------------------------------------------------------------------- fallback


@router.get(
    "/stream/changes",
    tags=["stream"],
    summary="REST polling fallback for the WebSocket stream",
    description=(
        "The brief requires a polling fallback for every stream (section 8). Poll with the "
        "`sequence` from the previous response; the server returns everything after it.\n\n"
        "`sequence` is a single monotonically increasing number shared by every room, so "
        "catching up is one request rather than one per room."
    ),
)
async def stream_changes(
    session: SessionDep,
    since: Annotated[int, Query(ge=0, description="Return events after this sequence. Start with 0.")] = 0,
    limit: Annotated[int, Query(ge=1, le=1000)] = 200,
) -> dict[str, Any]:
    events = await history_service.events_since(session, last_event_id=since, limit=limit + 1)
    truncated = len(events) > limit
    page = events[:limit]
    latest = await history_service.latest_sequence(session)

    return {
        "since": since,
        "sequence": page[-1].sequence if page else since,
        "latest_sequence": latest,
        "truncated": truncated,
        "events": [
            {
                "sequence": event.sequence,
                "type": EventType.state_changed.value,
                "room_id": event.room_id,
                "state": event.state.value,
                "previous_state": (event.previous_state.value if event.previous_state else None),
                "confirmation": event.confirmation.value,
                "out_of_service": event.out_of_service,
                "source": event.provenance.value,
                # Both timestamps, because they answer different questions.
                "effective_at": event.effective_at.isoformat(),
                "recorded_at": event.recorded_at.isoformat(),
            }
            for event in page
        ],
    }
