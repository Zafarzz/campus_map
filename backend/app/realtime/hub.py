"""The per-instance connection manager.

Holds the WebSockets this worker owns and routes broker messages to them. The
split from :mod:`app.realtime.broker` is what makes multi-worker delivery work:
the hub knows about sockets, the broker knows about workers, and a publish goes
hub -> broker -> every hub.

**Topic widening.** A ``state_changed`` event is published to ``room:{id}``, but
a client watching ``building:bld-h`` expects it too, and so does one watching
``campus:*``. Rather than making publishers fan out - and risk one of them
forgetting - :func:`publish_state_changed` derives the parent topics once, here.
"""

from __future__ import annotations

import asyncio
import contextlib
from collections.abc import Awaitable, Callable
from dataclasses import dataclass, field
from typing import Any

from app.core.logging import get_logger
from app.realtime.broker import Broker, Subscription, get_broker
from app.realtime.events import Envelope, EventType, Topic, TopicKind

log = get_logger(__name__)

__all__ = ["Connection", "Hub", "get_hub", "reset_hub"]


# ``eq=False`` keeps the default identity hash: connections are mutable, live in
# a set, and two clients watching the same topics are still two clients. Value
# equality would make them collide and one would stop receiving events.
@dataclass(eq=False)
class Connection:
    """One client socket and the topics it watches.

    ``send`` is a callable rather than a ``WebSocket`` so the hub can be tested
    without a socket, and so a future transport (server-sent events, long poll)
    needs no change here.
    """

    send: Callable[[str], Awaitable[None]]
    topics: set[str] = field(default_factory=set)
    principal: str | None = None
    #: Sequence the client last acknowledged, for catch-up on reconnect.
    last_event_id: int = 0

    def watches(self, topic: str) -> bool:
        return topic in self.topics


class Hub:
    """Connections owned by this worker."""

    def __init__(self, broker: Broker | None = None) -> None:
        self._broker = broker or get_broker()
        self._connections: set[Connection] = set()
        self._subscription: Subscription | None = None
        self._pump: asyncio.Task[None] | None = None
        self._lock = asyncio.Lock()

    # ----------------------------------------------------------------- lifecycle

    async def start(self) -> None:
        await self._broker.start()

    async def stop(self) -> None:
        if self._pump is not None:
            self._pump.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await self._pump
            self._pump = None
        if self._subscription is not None:
            await self._broker.unsubscribe(self._subscription)
            self._subscription = None
        self._connections.clear()

    @property
    def connection_count(self) -> int:
        return len(self._connections)

    @property
    def supports_fan_out(self) -> bool:
        return self._broker.supports_fan_out

    # ----------------------------------------------------------------- clients

    async def add(self, connection: Connection) -> None:
        async with self._lock:
            self._connections.add(connection)

    async def remove(self, connection: Connection) -> None:
        async with self._lock:
            self._connections.discard(connection)
        await self._resync()

    async def subscribe(self, connection: Connection, topic: Topic) -> None:
        connection.topics.add(str(topic))
        await self._resync()

    async def unsubscribe(self, connection: Connection, topic: Topic) -> None:
        connection.topics.discard(str(topic))
        await self._resync()

    async def _resync(self) -> None:
        """Re-subscribe the broker to the union of what this worker's clients want.

        Replaced wholesale rather than diffed: the set is small (a few hundred
        topics at most) and a diff that drifts out of step would silently stop
        delivering a topic someone is still watching.
        """
        wanted = {
            Topic.parse(topic).channel for connection in self._connections for topic in connection.topics
        }

        async with self._lock:
            if self._subscription is not None:
                await self._broker.unsubscribe(self._subscription)
                self._subscription = None
            if self._pump is not None:
                self._pump.cancel()
                with contextlib.suppress(asyncio.CancelledError):
                    await self._pump
                self._pump = None

            if not wanted:
                return

            self._subscription = await self._broker.subscribe(wanted)
            self._pump = asyncio.create_task(self._pump_forever())

    async def _pump_forever(self) -> None:
        """Deliver broker messages to the sockets that asked for them."""
        subscription = self._subscription
        if subscription is None:  # pragma: no cover - set by _resync
            return

        async for channel, message in subscription.listen():
            topic = channel.removeprefix("campus.rt.")
            for connection in list(self._connections):
                if not connection.watches(topic):
                    continue
                try:
                    await connection.send(message)
                except Exception:
                    # A send failure means the socket is gone. Drop it here
                    # rather than letting one dead client stop the pump for
                    # everyone else; the socket handler cleans up properly.
                    await self.remove(connection)

    # ----------------------------------------------------------------- publish

    async def publish(self, envelope: Envelope, *, topic: Topic | None = None) -> None:
        """Publish one envelope to one topic, via the broker."""
        target = topic or (Topic.parse(envelope.topic) if envelope.topic else None)
        if target is None:
            raise ValueError("an envelope must carry a topic, or one must be supplied")
        await self._broker.publish(target.channel, envelope.to_json())

    async def publish_state_changed(
        self,
        *,
        room_id: str,
        building_id: str | None,
        state: str,
        sequence: int | None = None,
        **extra: Any,
    ) -> None:
        """Publish a room's state change to the room, its building and the campus.

        Widening happens here, once, rather than at each call site - a publisher
        that forgot the building topic would leave building-level subscribers
        quietly stale, which is the kind of bug nobody notices until a demo.
        """
        from app.realtime.events import state_changed

        envelope = state_changed(
            room_id=room_id,
            building_id=building_id,
            state=state,
            sequence=sequence,
            **extra,
        )
        body = envelope.to_json()

        targets = [Topic(kind=TopicKind.room, id=room_id)]
        if building_id:
            targets.append(Topic(kind=TopicKind.building, id=building_id))

        for target in targets:
            await self._broker.publish(target.channel, body)

    async def broadcast_heartbeat(self, sequence: int) -> int:
        """Send a heartbeat to every connection. Returns how many were reached.

        Heartbeats go direct rather than through the broker: each worker beats
        its own sockets, and routing them through Redis would multiply the
        traffic by the number of workers for no gain.
        """
        envelope = Envelope(type=EventType.heartbeat, sequence=sequence)
        body = envelope.to_json()

        reached = 0
        for connection in list(self._connections):
            try:
                await connection.send(body)
                reached += 1
            except Exception:
                await self.remove(connection)
        return reached


_hub: Hub | None = None


def get_hub() -> Hub:
    global _hub
    if _hub is None:
        _hub = Hub()
    return _hub


async def reset_hub() -> None:
    """Stop and discard the process-wide hub. For tests and shutdown."""
    global _hub
    if _hub is not None:
        await _hub.stop()
        _hub = None
