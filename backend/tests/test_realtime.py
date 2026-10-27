"""Real-time delivery: envelopes, topics, broker fan-out and the hub.

The brief (section 10.5) asks for proof that fan-out works **across instances**.
:func:`test_two_hubs_sharing_a_broker_both_receive_a_publish` is that proof in
the form the test suite can run: two independent :class:`Hub` objects over one
broker stand in for two workers, which is exactly the topology the hub/broker
split exists to support. A real two-process Redis run is recorded in
``docs/runbooks/performance.md``.

The other thing worth testing hard is backpressure. A slow client must fall
behind and *know* it, rather than stalling the worker for everyone else.
"""

from __future__ import annotations

import asyncio

import pytest

from app.realtime.broker import (
    SUBSCRIBER_QUEUE_SIZE,
    InProcessBroker,
    Subscription,
)
from app.realtime.events import (
    MAX_MESSAGE_BYTES,
    Envelope,
    EventType,
    Topic,
    TopicKind,
    state_changed,
)
from app.realtime.hub import Connection, Hub


class Recorder:
    """A fake socket that records what it was sent."""

    def __init__(self, *, fail: bool = False) -> None:
        self.sent: list[str] = []
        self.fail = fail

    async def __call__(self, message: str) -> None:
        if self.fail:
            raise ConnectionResetError("socket is gone")
        self.sent.append(message)

    def types(self) -> list[str]:
        import json

        return [json.loads(item)["type"] for item in self.sent]


# ===================================================================== topics


class TestTopicParsing:
    def test_a_scoped_topic_needs_an_id(self) -> None:
        with pytest.raises(ValueError, match="needs an id"):
            Topic.parse("room")

    def test_an_unscoped_topic_must_not_have_one(self) -> None:
        with pytest.raises(ValueError, match="does not take an id"):
            Topic.parse("alerts:everything")

    def test_a_room_topic_parses(self) -> None:
        topic = Topic.parse("room:bld-h-f1-a101")
        assert topic.kind is TopicKind.room
        assert topic.id == "bld-h-f1-a101"
        assert str(topic) == "room:bld-h-f1-a101"

    def test_an_unscoped_topic_parses(self) -> None:
        assert Topic.parse("alerts") == Topic(kind=TopicKind.alerts)

    def test_an_unknown_kind_lists_the_valid_ones(self) -> None:
        with pytest.raises(ValueError, match="unknown topic kind"):
            Topic.parse("everything:*")

    def test_an_empty_topic_is_refused(self) -> None:
        with pytest.raises(ValueError, match="cannot be empty"):
            Topic.parse("   ")

    @pytest.mark.parametrize(
        "hostile",
        [
            "room:a*",
            "room:a b",
            "room:../etc",
            "room:a\nb",
            "room:__keyspace@0__",
            "room:a;flushall",
        ],
    )
    def test_a_topic_id_cannot_smuggle_channel_syntax(self, hostile: str) -> None:
        """The id becomes a Redis channel name, so it is validated, not escaped.

        A client that could pick arbitrary channel names could subscribe to
        anything else sharing that Redis - including another application's
        keyspace notifications.
        """
        with pytest.raises(ValueError, match="not allowed"):
            Topic.parse(hostile)

    def test_an_overlong_topic_is_refused(self) -> None:
        with pytest.raises(ValueError, match="too long"):
            Topic.parse("room:" + "a" * 200)

    def test_the_channel_name_is_namespaced(self) -> None:
        """So this app cannot collide with anything else on the same Redis."""
        assert Topic.parse("room:a101").channel == "campus.rt.room:a101"


# ===================================================================== envelopes


class TestEnvelope:
    def test_a_message_always_carries_a_type_and_an_instant(self) -> None:
        import json

        body = json.loads(Envelope(type=EventType.heartbeat).to_json())
        assert body["type"] == "heartbeat"
        assert "at" in body

    def test_empty_optional_fields_are_omitted(self) -> None:
        import json

        body = json.loads(Envelope(type=EventType.heartbeat).to_json())
        assert "topic" not in body
        assert "payload" not in body
        assert "sequence" not in body, "a heartbeat is not replayable, so it has no sequence"

    def test_a_state_change_carries_its_sequence(self) -> None:
        import json

        envelope = state_changed(
            room_id="bld-h-f1-a101", building_id="bld-h", state="lesson_now", sequence=42
        )
        body = json.loads(envelope.to_json())
        assert body["sequence"] == 42
        assert body["topic"] == "room:bld-h-f1-a101"
        assert body["payload"]["state"] == "lesson_now"

    def test_an_inbound_frame_parses(self) -> None:
        envelope = Envelope.from_json('{"type":"subscribe","topic":"room:a101"}')
        assert envelope.type is EventType.subscribe
        assert envelope.topic == "room:a101"

    def test_a_client_cannot_assert_its_place_in_the_event_stream(self) -> None:
        """``sequence`` is ignored on the way in.

        Accepting it would let a client claim to be further ahead than it is and
        skip a catch-up it actually needed.
        """
        envelope = Envelope.from_json('{"type":"ping","sequence":99999}')
        assert envelope.sequence is None

    def test_malformed_json_is_rejected(self) -> None:
        with pytest.raises(ValueError, match="not valid JSON"):
            Envelope.from_json("{not json")

    def test_a_non_object_frame_is_rejected(self) -> None:
        with pytest.raises(ValueError, match="must be a JSON object"):
            Envelope.from_json("[1,2,3]")

    def test_an_unknown_type_is_rejected(self) -> None:
        with pytest.raises(ValueError, match="unknown message type"):
            Envelope.from_json('{"type":"drop_tables"}')

    def test_a_missing_type_is_rejected(self) -> None:
        with pytest.raises(ValueError, match="string 'type'"):
            Envelope.from_json('{"topic":"alerts"}')

    def test_a_non_object_payload_is_rejected(self) -> None:
        with pytest.raises(ValueError, match="payload must be"):
            Envelope.from_json('{"type":"ping","payload":"nope"}')

    def test_the_message_size_limit_is_documented_and_small(self) -> None:
        """Only small control frames are legitimate inbound traffic."""
        assert MAX_MESSAGE_BYTES <= 64 * 1024


# ===================================================================== broker


class TestInProcessBroker:
    async def test_a_subscriber_receives_a_publish_on_its_channel(self) -> None:
        broker = InProcessBroker()
        await broker.start()
        subscription = await broker.subscribe({"campus.rt.alerts"})

        await broker.publish("campus.rt.alerts", "hello")
        channel, message = await asyncio.wait_for(subscription.queue.get(), timeout=1)

        assert channel == "campus.rt.alerts"
        assert message == "hello"

    async def test_a_publish_on_another_channel_is_not_delivered(self) -> None:
        broker = InProcessBroker()
        await broker.start()
        subscription = await broker.subscribe({"campus.rt.alerts"})

        await broker.publish("campus.rt.busyness", "not for you")
        assert subscription.queue.empty()

    async def test_unsubscribing_stops_delivery(self) -> None:
        broker = InProcessBroker()
        await broker.start()
        subscription = await broker.subscribe({"campus.rt.alerts"})
        await broker.unsubscribe(subscription)

        await broker.publish("campus.rt.alerts", "hello")
        assert subscription.queue.empty()

    async def test_it_admits_it_cannot_fan_out_across_workers(self) -> None:
        """Honesty over convenience.

        Behaving like a working broker while silently reaching only one worker
        is how a staging deployment ends up with half its clients missing
        events.
        """
        broker = InProcessBroker()
        assert broker.supports_fan_out is False


class TestBackpressure:
    def test_a_full_queue_drops_the_oldest_not_the_newest(self) -> None:
        """For a state stream the latest value is the one that matters.

        Dropping the newest would leave a slow client permanently stale, which
        is worse than leaving it with a gap it can detect.
        """
        subscription = Subscription(channels={"c"})
        for index in range(SUBSCRIBER_QUEUE_SIZE + 10):
            subscription.offer("c", str(index))

        assert subscription.dropped == 10
        assert subscription.queue.qsize() == SUBSCRIBER_QUEUE_SIZE

        # The most recent message survived.
        messages = []
        while not subscription.queue.empty():
            messages.append(subscription.queue.get_nowait()[1])
        assert messages[-1] == str(SUBSCRIBER_QUEUE_SIZE + 9)

    def test_offering_never_blocks_the_publisher(self) -> None:
        """A slow client must not stall the worker for everyone else."""
        subscription = Subscription(channels={"c"})
        for index in range(SUBSCRIBER_QUEUE_SIZE * 3):
            subscription.offer("c", str(index))  # would hang if it blocked
        assert subscription.dropped > 0

    def test_the_loss_is_counted_so_a_client_can_be_told(self) -> None:
        subscription = Subscription(channels={"c"})
        for index in range(SUBSCRIBER_QUEUE_SIZE + 5):
            subscription.offer("c", str(index))
        assert subscription.dropped == 5


# ===================================================================== hub


class TestHub:
    async def test_a_subscriber_receives_a_published_state_change(self) -> None:
        broker = InProcessBroker()
        hub = Hub(broker=broker)
        await hub.start()

        recorder = Recorder()
        connection = Connection(send=recorder)
        await hub.add(connection)
        await hub.subscribe(connection, Topic.parse("room:bld-h-f1-a101"))

        await hub.publish_state_changed(room_id="bld-h-f1-a101", building_id="bld-h", state="lesson_now")
        await asyncio.sleep(0.05)

        assert recorder.types() == ["state_changed"]
        await hub.stop()

    async def test_a_building_subscriber_receives_its_rooms_changes(self) -> None:
        """Topic widening: a client watching a building need not list its rooms.

        Done in the hub rather than at each call site, so a publisher cannot
        forget it and leave building-level subscribers quietly stale.
        """
        broker = InProcessBroker()
        hub = Hub(broker=broker)
        await hub.start()

        recorder = Recorder()
        connection = Connection(send=recorder)
        await hub.add(connection)
        await hub.subscribe(connection, Topic.parse("building:bld-h"))

        await hub.publish_state_changed(room_id="bld-h-f1-a101", building_id="bld-h", state="free")
        await asyncio.sleep(0.05)

        assert recorder.types() == ["state_changed"]
        await hub.stop()

    async def test_a_client_watching_another_building_receives_nothing(self) -> None:
        broker = InProcessBroker()
        hub = Hub(broker=broker)
        await hub.start()

        recorder = Recorder()
        connection = Connection(send=recorder)
        await hub.add(connection)
        await hub.subscribe(connection, Topic.parse("building:bld-g"))

        await hub.publish_state_changed(room_id="bld-h-f1-a101", building_id="bld-h", state="free")
        await asyncio.sleep(0.05)

        assert recorder.sent == []
        await hub.stop()

    async def test_two_hubs_sharing_a_broker_both_receive_a_publish(self) -> None:
        """The multi-worker requirement (brief section 10.5).

        Two independent hubs over one broker stand in for two workers. A client
        on hub B must receive an event published by hub A - which a per-process
        connection manager alone could never deliver, and which is the whole
        reason the broker exists.
        """
        broker = InProcessBroker()
        await broker.start()

        worker_a = Hub(broker=broker)
        worker_b = Hub(broker=broker)

        recorder_a, recorder_b = Recorder(), Recorder()
        connection_a = Connection(send=recorder_a)
        connection_b = Connection(send=recorder_b)

        await worker_a.add(connection_a)
        await worker_b.add(connection_b)
        await worker_a.subscribe(connection_a, Topic.parse("building:bld-h"))
        await worker_b.subscribe(connection_b, Topic.parse("building:bld-h"))

        # Published by worker A.
        await worker_a.publish_state_changed(room_id="bld-h-f1-a101", building_id="bld-h", state="lesson_now")
        await asyncio.sleep(0.05)

        assert recorder_a.types() == ["state_changed"], "the publishing worker"
        assert recorder_b.types() == ["state_changed"], "the *other* worker"

        await worker_a.stop()
        await worker_b.stop()

    async def test_unsubscribing_stops_delivery(self) -> None:
        broker = InProcessBroker()
        hub = Hub(broker=broker)
        await hub.start()

        recorder = Recorder()
        connection = Connection(send=recorder)
        await hub.add(connection)
        topic = Topic.parse("alerts")
        await hub.subscribe(connection, topic)
        await hub.unsubscribe(connection, topic)

        await hub.publish(Envelope(type=EventType.alert, topic="alerts"))
        await asyncio.sleep(0.05)

        assert recorder.sent == []
        await hub.stop()

    async def test_a_dead_socket_is_dropped_without_stopping_the_pump(self) -> None:
        """One dead client must not stop delivery for everyone else."""
        broker = InProcessBroker()
        hub = Hub(broker=broker)
        await hub.start()

        dead = Connection(send=Recorder(fail=True))
        alive_recorder = Recorder()
        alive = Connection(send=alive_recorder)

        for connection in (dead, alive):
            await hub.add(connection)
            await hub.subscribe(connection, Topic.parse("alerts"))

        await hub.publish(Envelope(type=EventType.alert, topic="alerts"))
        await asyncio.sleep(0.05)

        assert alive_recorder.types() == ["alert"]
        assert hub.connection_count == 1, "the dead connection was dropped"
        await hub.stop()

    async def test_a_heartbeat_reaches_every_connection(self) -> None:
        broker = InProcessBroker()
        hub = Hub(broker=broker)
        await hub.start()

        recorders = [Recorder() for _ in range(3)]
        for recorder in recorders:
            await hub.add(Connection(send=recorder))

        reached = await hub.broadcast_heartbeat(sequence=7)
        assert reached == 3
        for recorder in recorders:
            assert recorder.types() == ["heartbeat"]
        await hub.stop()

    async def test_a_heartbeat_drops_a_dead_connection(self) -> None:
        broker = InProcessBroker()
        hub = Hub(broker=broker)
        await hub.start()

        await hub.add(Connection(send=Recorder(fail=True)))
        reached = await hub.broadcast_heartbeat(sequence=1)

        assert reached == 0
        assert hub.connection_count == 0
        await hub.stop()

    async def test_publishing_without_a_topic_is_an_error(self) -> None:
        """Rather than broadcasting to everything by accident."""
        hub = Hub(broker=InProcessBroker())
        with pytest.raises(ValueError, match="must carry a topic"):
            await hub.publish(Envelope(type=EventType.alert))

    async def test_the_hub_reports_whether_fan_out_is_available(self) -> None:
        """Surfaced in the welcome frame, so a client knows if its view is partial."""
        hub = Hub(broker=InProcessBroker())
        assert hub.supports_fan_out is False

    async def test_stopping_clears_connections(self) -> None:
        hub = Hub(broker=InProcessBroker())
        await hub.start()
        await hub.add(Connection(send=Recorder()))
        await hub.stop()
        assert hub.connection_count == 0
