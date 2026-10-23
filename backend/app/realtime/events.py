"""The WebSocket envelope and the topic grammar.

Every message, in both directions, is a JSON object with a ``type`` field
(brief section 8). Clients switch on it, so the set is closed and the spellings
are part of the contract.

Topics are strings with a ``kind:id`` shape - ``room:bld-h-f1-a101``,
``building:bld-h``, ``alerts``, ``busyness``. Parsed rather than accepted as
free text, because a topic goes into a Redis channel name and an unvalidated one
would let a client subscribe to arbitrary channels.
"""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from datetime import datetime
from enum import StrEnum
from typing import Any

from app.core.time import now as utc_now

__all__ = [
    "MAX_MESSAGE_BYTES",
    "Envelope",
    "EventType",
    "Topic",
    "TopicKind",
]

#: Largest inbound frame accepted. A client that sends more is closed rather
#: than served: the only legitimate inbound messages are small control frames
#: (subscribe, unsubscribe, ping), and an unbounded frame is either a bug or an
#: attempt to exhaust memory (brief section 8, "enforce message size limits").
MAX_MESSAGE_BYTES = 8 * 1024


class EventType(StrEnum):
    """Every message type. Closed set: clients switch on it."""

    # --- server to client
    #: Sent once on accept, carrying the current sequence so a client knows
    #: where it is starting from.
    welcome = "welcome"
    state_changed = "state_changed"
    booking_changed = "booking_changed"
    schedule_changed = "schedule_changed"
    override_changed = "override_changed"
    alert = "alert"
    busyness_changed = "busyness_changed"
    #: Periodic liveness. Also how a client detects a half-open connection.
    heartbeat = "heartbeat"
    #: Replay of what a reconnecting client missed.
    catch_up = "catch_up"
    subscribed = "subscribed"
    unsubscribed = "unsubscribed"
    error = "error"

    # --- client to server
    subscribe = "subscribe"
    unsubscribe = "unsubscribe"
    ping = "ping"


class TopicKind(StrEnum):
    """Topic families a client may subscribe to."""

    room = "room"
    building = "building"
    campus = "campus"
    alerts = "alerts"
    busyness = "busyness"


#: Topics that address a specific entity and therefore carry an id.
_SCOPED = {TopicKind.room, TopicKind.building, TopicKind.campus}

#: Identifier characters allowed in a topic. Deliberately tight: the value ends
#: up in a Redis channel name, so anything outside this set is refused rather
#: than escaped.
_ID_ALLOWED = set("abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-_.")


@dataclass(frozen=True, slots=True)
class Topic:
    """A parsed subscription target."""

    kind: TopicKind
    id: str | None = None

    def __str__(self) -> str:
        return f"{self.kind.value}:{self.id}" if self.id else self.kind.value

    @property
    def channel(self) -> str:
        """Redis pub/sub channel name for this topic."""
        return f"campus.rt.{self}"

    @classmethod
    def parse(cls, raw: str) -> Topic:
        """Parse ``kind`` or ``kind:id``, refusing anything else.

        Raises :class:`ValueError` with a usable message; the socket turns that
        into an ``error`` frame rather than closing, since a bad subscribe is a
        client bug and not a reason to drop a working connection.
        """
        text = (raw or "").strip()
        if not text:
            raise ValueError("a topic cannot be empty")
        if len(text) > 128:
            raise ValueError("topic is too long")

        head, _, tail = text.partition(":")
        try:
            kind = TopicKind(head)
        except ValueError:
            raise ValueError(
                f"unknown topic kind {head!r}; expected one of {sorted(item.value for item in TopicKind)}"
            ) from None

        if kind in _SCOPED:
            if not tail:
                raise ValueError(f"topic {kind.value!r} needs an id, e.g. {kind.value}:bld-h")
            if not set(tail) <= _ID_ALLOWED:
                raise ValueError(f"topic id {tail!r} contains characters that are not allowed")
            return cls(kind=kind, id=tail)

        if tail:
            raise ValueError(f"topic {kind.value!r} does not take an id")
        return cls(kind=kind)


@dataclass(frozen=True, slots=True)
class Envelope:
    """One message.

    ``sequence`` is present on anything derived from a recorded state event, so
    a client can reconnect with ``last_event_id`` and be sent exactly what it
    missed. Messages with no sequence (heartbeats, subscription acks) are not
    replayable and say so by omitting it.
    """

    type: EventType
    topic: str | None = None
    payload: dict[str, Any] = field(default_factory=dict)
    sequence: int | None = None
    at: datetime = field(default_factory=utc_now)

    def to_json(self) -> str:
        body: dict[str, Any] = {
            "type": self.type.value,
            "at": self.at.isoformat(),
        }
        if self.topic is not None:
            body["topic"] = self.topic
        if self.sequence is not None:
            body["sequence"] = self.sequence
        if self.payload:
            body["payload"] = self.payload
        return json.dumps(body, separators=(",", ":"), default=str)

    @classmethod
    def from_json(cls, raw: str) -> Envelope:
        """Parse an inbound frame.

        Only the fields a client is allowed to set are read. In particular
        ``sequence`` and ``at`` are ignored on the way in: a client must not be
        able to assert where it is in the server's event stream.
        """
        try:
            data = json.loads(raw)
        except json.JSONDecodeError as exc:
            raise ValueError(f"message is not valid JSON: {exc}") from exc
        if not isinstance(data, dict):
            raise ValueError("message must be a JSON object")

        raw_type = data.get("type")
        if not isinstance(raw_type, str):
            raise ValueError("message must carry a string 'type'")
        try:
            event_type = EventType(raw_type)
        except ValueError:
            raise ValueError(f"unknown message type {raw_type!r}") from None

        topic = data.get("topic")
        if topic is not None and not isinstance(topic, str):
            raise ValueError("topic must be a string")

        payload = data.get("payload") or {}
        if not isinstance(payload, dict):
            raise ValueError("payload must be a JSON object")

        return cls(type=event_type, topic=topic, payload=payload)


def state_changed(
    *,
    room_id: str,
    building_id: str | None,
    state: str,
    sequence: int | None = None,
    **extra: Any,
) -> Envelope:
    """Build a ``state_changed`` event for a room.

    Published to the room's own topic. The hub also delivers it to subscribers
    of the parent building and of the campus, so a client watching a building
    does not have to subscribe to each of its rooms.
    """
    return Envelope(
        type=EventType.state_changed,
        topic=str(Topic(kind=TopicKind.room, id=room_id)),
        sequence=sequence,
        payload={
            "room_id": room_id,
            "building_id": building_id,
            "state": state,
            **extra,
        },
    )
