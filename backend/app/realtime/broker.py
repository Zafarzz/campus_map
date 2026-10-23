"""Publish/subscribe across workers, with an in-process fallback.

The problem this solves (brief section 8): the API runs behind several workers,
and a client connected to worker A must receive an event published by worker B.
A per-process connection manager cannot do that, so every publish goes through
a broker that all workers share.

Two implementations behind one interface:

* :class:`RedisBroker` - real fan-out via Redis pub/sub. Used when
  ``REDIS_URL`` is set.
* :class:`InProcessBroker` - a local bus. Correct for a single worker, and
  **honest about its limits**: it logs once, at startup, that cross-worker
  fan-out is unavailable. Silently behaving like a working broker is how a
  staging deployment ends up with half its clients missing events.

Neither implementation lets a slow subscriber block a publisher: each
subscription owns a bounded queue, and a queue that fills drops its oldest
message and counts the loss. A client that cannot keep up should fall behind and
know it, rather than stalling the worker for everyone else.
"""

from __future__ import annotations

import asyncio
import contextlib
from abc import ABC, abstractmethod
from collections.abc import AsyncIterator
from dataclasses import dataclass, field

from app.core.config import Settings, get_settings
from app.core.logging import get_logger

log = get_logger(__name__)

__all__ = [
    "SUBSCRIBER_QUEUE_SIZE",
    "Broker",
    "InProcessBroker",
    "RedisBroker",
    "Subscription",
    "get_broker",
    "reset_broker",
]

#: Messages a single subscriber may lag behind before the oldest are dropped.
#: Sized for a few seconds of a busy class-change wave; past that the client is
#: not keeping up and dropping is better than unbounded memory growth.
SUBSCRIBER_QUEUE_SIZE = 256


# ``eq=False`` keeps the default identity hash: subscriptions are mutable and
# live in a set, and two subscribers watching the same channels are still two
# distinct subscribers. Value equality would silently collapse them into one.
@dataclass(eq=False)
class Subscription:
    """One subscriber's bounded inbox."""

    channels: set[str]
    queue: asyncio.Queue[tuple[str, str]] = field(
        default_factory=lambda: asyncio.Queue(maxsize=SUBSCRIBER_QUEUE_SIZE)
    )
    #: Messages dropped because this subscriber was too far behind. Reported to
    #: the client so it knows its view may have gaps.
    dropped: int = 0

    def offer(self, channel: str, message: str) -> None:
        """Enqueue without ever blocking the publisher.

        When the queue is full the **oldest** message is discarded rather than
        the newest: for a state stream the latest value is the one that matters,
        and dropping the newest would leave the client permanently stale.
        """
        try:
            self.queue.put_nowait((channel, message))
        except asyncio.QueueFull:
            with contextlib.suppress(asyncio.QueueEmpty):
                self.queue.get_nowait()
            self.dropped += 1
            with contextlib.suppress(asyncio.QueueFull):
                self.queue.put_nowait((channel, message))

    async def listen(self) -> AsyncIterator[tuple[str, str]]:
        while True:
            yield await self.queue.get()


class Broker(ABC):
    """Interface both implementations satisfy."""

    @abstractmethod
    async def start(self) -> None: ...

    @abstractmethod
    async def stop(self) -> None: ...

    @abstractmethod
    async def publish(self, channel: str, message: str) -> None: ...

    @abstractmethod
    async def subscribe(self, channels: set[str]) -> Subscription: ...

    @abstractmethod
    async def unsubscribe(self, subscription: Subscription) -> None: ...

    @property
    @abstractmethod
    def supports_fan_out(self) -> bool:
        """True when a second worker would also receive published messages.

        Exposed so ``/readyz`` and the welcome frame can state it rather than
        leaving an operator to discover the difference in production.
        """


class InProcessBroker(Broker):
    """A local bus. One worker only."""

    def __init__(self) -> None:
        self._subscriptions: set[Subscription] = set()
        self._warned = False

    async def start(self) -> None:
        if not self._warned:
            log.warning(
                "realtime_fan_out_unavailable",
                reason="REDIS_URL is not set, so events reach only this worker",
                hint="set REDIS_URL to fan out across workers",
            )
            self._warned = True

    async def stop(self) -> None:
        self._subscriptions.clear()

    async def publish(self, channel: str, message: str) -> None:
        for subscription in list(self._subscriptions):
            if channel in subscription.channels:
                subscription.offer(channel, message)

    async def subscribe(self, channels: set[str]) -> Subscription:
        subscription = Subscription(channels=set(channels))
        self._subscriptions.add(subscription)
        return subscription

    async def unsubscribe(self, subscription: Subscription) -> None:
        self._subscriptions.discard(subscription)

    @property
    def supports_fan_out(self) -> bool:
        return False


class RedisBroker(Broker):
    """Redis pub/sub fan-out.

    One Redis connection per process, not per subscriber: a campus with a few
    thousand connected clients would otherwise open a few thousand Redis
    connections. A single ``PubSub`` is subscribed to the union of the channels
    anyone wants, and a reader task dispatches each message to the local
    subscribers that asked for it.
    """

    def __init__(self, url: str) -> None:
        self._url = url
        self._redis: object | None = None
        self._pubsub: object | None = None
        self._reader: asyncio.Task[None] | None = None
        self._subscriptions: set[Subscription] = set()
        self._lock = asyncio.Lock()

    async def start(self) -> None:
        import redis.asyncio as redis

        self._redis = redis.from_url(self._url, decode_responses=True)
        self._pubsub = self._redis.pubsub(ignore_subscribe_messages=True)
        log.info("realtime_broker_started", backend="redis")

    async def stop(self) -> None:
        if self._reader is not None:
            self._reader.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await self._reader
            self._reader = None
        if self._pubsub is not None:
            with contextlib.suppress(Exception):
                await self._pubsub.aclose()  # type: ignore[attr-defined]
            self._pubsub = None
        if self._redis is not None:
            with contextlib.suppress(Exception):
                await self._redis.aclose()  # type: ignore[attr-defined]
            self._redis = None
        self._subscriptions.clear()

    async def publish(self, channel: str, message: str) -> None:
        if self._redis is None:
            raise RuntimeError("broker is not started")
        await self._redis.publish(channel, message)  # type: ignore[attr-defined]

    async def subscribe(self, channels: set[str]) -> Subscription:
        if self._pubsub is None:
            raise RuntimeError("broker is not started")

        subscription = Subscription(channels=set(channels))
        async with self._lock:
            self._subscriptions.add(subscription)
            missing = channels - self._subscribed_channels(exclude=subscription)
            if missing:
                await self._pubsub.subscribe(*missing)  # type: ignore[attr-defined]
            if self._reader is None:
                self._reader = asyncio.create_task(self._read_forever())
        return subscription

    async def unsubscribe(self, subscription: Subscription) -> None:
        async with self._lock:
            self._subscriptions.discard(subscription)
            # Drop Redis subscriptions nobody wants any more, so a long-lived
            # worker does not accumulate channels for rooms no one is watching.
            orphaned = subscription.channels - self._subscribed_channels()
            if orphaned and self._pubsub is not None:
                with contextlib.suppress(Exception):
                    await self._pubsub.unsubscribe(*orphaned)  # type: ignore[attr-defined]

    def _subscribed_channels(self, *, exclude: Subscription | None = None) -> set[str]:
        channels: set[str] = set()
        for item in self._subscriptions:
            if item is exclude:
                continue
            channels |= item.channels
        return channels

    async def _read_forever(self) -> None:
        """Dispatch Redis messages to local subscribers."""
        assert self._pubsub is not None
        while True:
            try:
                message = await self._pubsub.get_message(  # type: ignore[attr-defined]
                    ignore_subscribe_messages=True, timeout=1.0
                )
            except asyncio.CancelledError:
                raise
            except Exception as exc:
                # A dropped Redis connection must not kill the reader: the
                # socket layer keeps working and reconnects on the next publish.
                log.warning("realtime_reader_error", error=str(exc))
                await asyncio.sleep(1.0)
                continue

            if not message:
                continue
            channel = str(message.get("channel", ""))
            data = str(message.get("data", ""))
            for subscription in list(self._subscriptions):
                if channel in subscription.channels:
                    subscription.offer(channel, data)

    @property
    def supports_fan_out(self) -> bool:
        return True


_broker: Broker | None = None


def get_broker(settings: Settings | None = None) -> Broker:
    """The process-wide broker, chosen from configuration on first use."""
    global _broker
    if _broker is None:
        cfg = settings or get_settings()
        url = cfg.redis_url.strip()
        _broker = RedisBroker(url) if url else InProcessBroker()
    return _broker


async def reset_broker() -> None:
    """Stop and discard the process-wide broker. For tests and shutdown."""
    global _broker
    if _broker is not None:
        await _broker.stop()
        _broker = None
