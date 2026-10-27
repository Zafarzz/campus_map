"""History capture, replay, and the transition scheduler.

The two things worth testing hardest here:

1. **Append-only means append-only.** A state event is never updated, and a
   recomputation that finds nothing changed must not write a row - otherwise
   the history becomes a log of queries and replay is dominated by rows saying
   nothing happened.
2. **``effective_at`` and ``recorded_at`` are different questions.**
   ``as_known_at`` filters on the second, and a replay that ignored the
   distinction would make the past look tidier than it was.
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from zoneinfo import ZoneInfo

import pytest
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.errors import ValidationError
from app.domain.base import ConfirmationState, Provenance, RoomStateKind
from app.domain.history import RoomStateEvent, StateSnapshot
from app.engines.room_state import Interval, RoomContext, RoomState, StateOptions, state_at
from app.services import history_service

TASHKENT = ZoneInfo("Asia/Tashkent")
OPTIONS = StateOptions(starts_soon_minutes=15, timezone=TASHKENT)

AT = datetime(2026, 10, 19, 5, 45, tzinfo=UTC)  # 10:45 local


def _state(
    room_id: str,
    kind: RoomStateKind,
    *,
    at: datetime = AT,
    out_of_service: bool = False,
    confirmation: ConfirmationState = ConfirmationState.not_required,
) -> RoomState:
    return RoomState(
        room_id=room_id,
        at=at,
        state=kind,
        out_of_service=out_of_service,
        confirmation=confirmation,
        provenance=Provenance.scheduled,
        building_id="bld-h",
    )


# ===================================================================== capture


async def test_a_first_evaluation_records_every_room(seeded_session: AsyncSession) -> None:
    written = await history_service.record_transitions(
        seeded_session,
        [
            _state("bld-h-f1-a101", RoomStateKind.lesson_now),
            _state("bld-h-f1-a102", RoomStateKind.free),
        ],
    )
    assert sorted(written) == ["bld-h-f1-a101", "bld-h-f1-a102"]


async def test_re_recording_an_unchanged_state_writes_nothing(
    seeded_session: AsyncSession,
) -> None:
    """Otherwise the history becomes a log of queries rather than of changes."""
    states = [_state("bld-h-f1-a101", RoomStateKind.lesson_now)]

    assert await history_service.record_transitions(seeded_session, states) == ["bld-h-f1-a101"]
    assert await history_service.record_transitions(seeded_session, states) == []
    assert await history_service.record_transitions(seeded_session, states) == []

    total = await seeded_session.scalar(select(func.count(RoomStateEvent.id)))
    assert total == 1


async def test_a_real_change_is_recorded_with_its_predecessor(
    seeded_session: AsyncSession,
) -> None:
    await history_service.record_transitions(
        seeded_session, [_state("bld-h-f1-a101", RoomStateKind.lesson_now)]
    )
    await history_service.record_transitions(seeded_session, [_state("bld-h-f1-a101", RoomStateKind.free)])

    events = (
        (await seeded_session.execute(select(RoomStateEvent).order_by(RoomStateEvent.sequence)))
        .scalars()
        .all()
    )

    assert [item.state for item in events] == [
        RoomStateKind.lesson_now,
        RoomStateKind.free,
    ]
    assert events[0].previous_state is None
    assert events[1].previous_state is RoomStateKind.lesson_now


async def test_the_out_of_service_overlay_is_a_recordable_change(
    seeded_session: AsyncSession,
) -> None:
    """A broken projector changes nothing about the lesson but is still news."""
    await history_service.record_transitions(seeded_session, [_state("bld-h-f1-a101", RoomStateKind.free)])
    written = await history_service.record_transitions(
        seeded_session,
        [_state("bld-h-f1-a101", RoomStateKind.free, out_of_service=True)],
    )
    assert written == ["bld-h-f1-a101"]


async def test_a_confirmation_change_is_recorded(seeded_session: AsyncSession) -> None:
    """A teacher confirming a lesson is a state change clients care about."""
    await history_service.record_transitions(
        seeded_session,
        [
            _state(
                "bld-h-f1-a101",
                RoomStateKind.lesson_now,
                confirmation=ConfirmationState.unconfirmed,
            )
        ],
    )
    written = await history_service.record_transitions(
        seeded_session,
        [
            _state(
                "bld-h-f1-a101",
                RoomStateKind.lesson_now,
                confirmation=ConfirmationState.confirmed,
            )
        ],
    )
    assert written == ["bld-h-f1-a101"]


async def test_the_sequence_is_shared_across_rooms_and_strictly_increasing(
    seeded_session: AsyncSession,
) -> None:
    """One sequence for the whole campus.

    A reconnecting client asks "everything after N" once, not once per room. A
    timestamp could not serve: two events in the same microsecond must still
    have a strict order.
    """
    # Real seeded room ids: ``room_state_event.room_id`` is a foreign key, and
    # inventing ids would test the constraint rather than the sequence.
    from app.domain.spatial import Room

    room_ids = (await seeded_session.execute(select(Room.id).order_by(Room.id).limit(10))).scalars().all()
    assert len(room_ids) == 10

    await history_service.record_transitions(
        seeded_session,
        [_state(room_id, RoomStateKind.lesson_now) for room_id in room_ids],
    )
    sequences = (
        (await seeded_session.execute(select(RoomStateEvent.sequence).order_by(RoomStateEvent.sequence)))
        .scalars()
        .all()
    )

    assert len(set(sequences)) == len(sequences)
    assert sequences == sorted(sequences)


async def test_both_timestamps_are_stored_and_can_differ(
    seeded_session: AsyncSession,
) -> None:
    """``effective_at`` is when it became true; ``recorded_at`` when we learned it.

    A teacher confirming at 10:30 that a 09:00 lesson happened produces exactly
    this shape, and replay needs both to answer its two different questions.
    """
    effective = datetime(2026, 10, 19, 4, 0, tzinfo=UTC)
    learned = datetime(2026, 10, 19, 5, 30, tzinfo=UTC)

    await history_service.record_transitions(
        seeded_session,
        [_state("bld-h-f1-a101", RoomStateKind.lesson_now, at=effective)],
        recorded_at=learned,
    )
    event = (await seeded_session.execute(select(RoomStateEvent))).scalar_one()

    assert event.effective_at == effective
    assert event.recorded_at == learned


async def test_recording_nothing_is_a_no_op(seeded_session: AsyncSession) -> None:
    assert await history_service.record_transitions(seeded_session, []) == []


async def test_the_cause_is_recorded(seeded_session: AsyncSession) -> None:
    """So an operator can tell a scheduled recompute from a booking's effect."""
    await history_service.record_transitions(
        seeded_session,
        [_state("bld-h-f1-a101", RoomStateKind.free)],
        cause_ref="transition_scheduler",
    )
    event = (await seeded_session.execute(select(RoomStateEvent))).scalar_one()
    assert event.cause_ref == "transition_scheduler"


async def test_the_details_explain_the_state(seeded_session: AsyncSession) -> None:
    """So "why did it say busy?" has an answer later."""
    lesson = Interval(
        starts_at=datetime(2026, 10, 19, 5, 30, tzinfo=UTC),
        ends_at=datetime(2026, 10, 19, 6, 50, tzinfo=UTC),
        ref="lesson-1",
        subject="Discrete Mathematics",
    )
    context = RoomContext(room_id="bld-h-f1-a101", intervals=(lesson,), building_id="bld-h")
    state = state_at(context, AT, OPTIONS)

    await history_service.record_transitions(seeded_session, [state])
    event = (await seeded_session.execute(select(RoomStateEvent))).scalar_one()

    assert event.details is not None
    assert event.details["subject"] == "Discrete Mathematics"
    assert event.details["ref"] == "lesson-1"


# ===================================================================== catch-up


async def test_events_since_returns_only_what_came_after(
    seeded_session: AsyncSession,
) -> None:
    await history_service.record_transitions(seeded_session, [_state("bld-h-f1-a101", RoomStateKind.free)])
    first = await history_service.latest_sequence(seeded_session)

    await history_service.record_transitions(
        seeded_session, [_state("bld-h-f1-a101", RoomStateKind.lesson_now)]
    )

    missed = await history_service.events_since(seeded_session, last_event_id=first)
    assert [item.state for item in missed] == [RoomStateKind.lesson_now]


async def test_the_latest_sequence_is_zero_on_an_empty_history(
    seeded_session: AsyncSession,
) -> None:
    """Zero, not an error: "no history yet" is a legitimate starting point."""
    assert await history_service.latest_sequence(seeded_session) == 0


async def test_catch_up_is_ordered_by_sequence(seeded_session: AsyncSession) -> None:
    for kind in (RoomStateKind.free, RoomStateKind.starts_soon, RoomStateKind.lesson_now):
        await history_service.record_transitions(seeded_session, [_state("bld-h-f1-a101", kind)])

    events = await history_service.events_since(seeded_session, last_event_id=0)
    assert [item.sequence for item in events] == sorted(item.sequence for item in events)


# ===================================================================== snapshots


async def test_a_snapshot_captures_every_room_and_the_live_counts(
    seeded_session: AsyncSession,
) -> None:
    snapshot = await history_service.take_snapshot(seeded_session, at=AT, timezone=TASHKENT, options=OPTIONS)

    assert snapshot.at == AT
    assert len(snapshot.states) == 101
    assert snapshot.live_counts is not None
    sample = next(iter(snapshot.states.values()))
    assert {"state", "kind", "confirmation", "provenance", "out_of_service"} <= set(sample)


async def test_snapshots_accumulate_rather_than_replacing(
    seeded_session: AsyncSession,
) -> None:
    """Append-only applies here too: a snapshot is a record, not a cache slot."""
    await history_service.take_snapshot(seeded_session, at=AT, timezone=TASHKENT, options=OPTIONS)
    await history_service.take_snapshot(
        seeded_session, at=AT + timedelta(minutes=15), timezone=TASHKENT, options=OPTIONS
    )
    total = await seeded_session.scalar(select(func.count(StateSnapshot.id)))
    assert total == 2


# ===================================================================== replay


async def test_replay_walks_the_window_in_steps(seeded_session: AsyncSession) -> None:
    frames = await history_service.replay(
        seeded_session,
        start=AT,
        end=AT + timedelta(hours=2),
        step=timedelta(minutes=30),
        timezone=TASHKENT,
        options=OPTIONS,
    )
    assert [frame.at for frame in frames] == [
        AT,
        AT + timedelta(minutes=30),
        AT + timedelta(minutes=60),
        AT + timedelta(minutes=90),
        AT + timedelta(minutes=120),
    ]


async def test_replay_without_history_is_labelled_reconstructed(
    seeded_session: AsyncSession,
) -> None:
    """The honesty requirement.

    A reconstruction is what the engine *would* have said. That is a legitimate
    answer, but it is not a recording, and letting a gap in capture pass for
    evidence would be exactly the dishonesty the brief forbids.
    """
    frames = await history_service.replay(
        seeded_session,
        start=AT,
        end=AT + timedelta(hours=1),
        step=timedelta(minutes=30),
        timezone=TASHKENT,
        options=OPTIONS,
    )
    assert frames
    assert all(frame.from_history is False for frame in frames)
    assert all(frame.as_dict()["source"] == "reconstructed" for frame in frames)


async def test_replay_with_history_is_labelled_recorded(
    seeded_session: AsyncSession,
) -> None:
    await history_service.record_transitions(
        seeded_session,
        [_state("bld-h-f1-a101", RoomStateKind.lesson_now, at=AT)],
    )
    frames = await history_service.replay(
        seeded_session,
        start=AT,
        end=AT + timedelta(minutes=30),
        step=timedelta(minutes=15),
        timezone=TASHKENT,
        options=OPTIONS,
    )
    assert all(frame.from_history for frame in frames)
    assert frames[0].states["bld-h-f1-a101"] == "lesson_now"


async def test_replay_folds_events_in_as_they_become_effective(
    seeded_session: AsyncSession,
) -> None:
    """A room that changes mid-window changes mid-replay, not at the start."""
    await history_service.record_transitions(
        seeded_session,
        [_state("bld-h-f1-a101", RoomStateKind.lesson_now, at=AT)],
    )
    await history_service.record_transitions(
        seeded_session,
        [_state("bld-h-f1-a101", RoomStateKind.free, at=AT + timedelta(minutes=40))],
    )

    frames = await history_service.replay(
        seeded_session,
        start=AT,
        end=AT + timedelta(hours=1),
        step=timedelta(minutes=20),
        timezone=TASHKENT,
        options=OPTIONS,
    )
    states = [frame.states.get("bld-h-f1-a101") for frame in frames]
    # 0, 20 minutes: in the lesson. 40, 60: free.
    assert states == ["lesson_now", "lesson_now", "free", "free"]


async def test_a_room_already_in_a_state_appears_in_the_first_frame(
    seeded_session: AsyncSession,
) -> None:
    """The baseline query.

    Without it the early frames would show only rooms that happen to change
    inside the window, and a room in a lesson since before it opened would look
    like it was missing.
    """
    await history_service.record_transitions(
        seeded_session,
        [_state("bld-h-f1-a101", RoomStateKind.lesson_now, at=AT - timedelta(hours=2))],
    )
    frames = await history_service.replay(
        seeded_session,
        start=AT,
        end=AT + timedelta(minutes=30),
        step=timedelta(minutes=15),
        timezone=TASHKENT,
        options=OPTIONS,
    )
    assert frames[0].states["bld-h-f1-a101"] == "lesson_now"


async def test_as_known_at_hides_what_was_learned_later(
    seeded_session: AsyncSession,
) -> None:
    """The time machine's second axis (brief section 10.6).

    A confirmation recorded at 10:30 about a 09:00 lesson must not appear in a
    replay of the morning as known at 09:15. Collapsing the two timestamps would
    make the past look tidier than it was.
    """
    effective = datetime(2026, 10, 19, 4, 0, tzinfo=UTC)  # 09:00 local
    learned_late = datetime(2026, 10, 19, 5, 30, tzinfo=UTC)  # 10:30 local

    await history_service.record_transitions(
        seeded_session,
        [_state("bld-h-f1-a101", RoomStateKind.lesson_now, at=effective)],
        recorded_at=learned_late,
    )

    # As known at 09:15: the event had not been recorded yet.
    early = await history_service.replay(
        seeded_session,
        start=effective,
        end=effective + timedelta(minutes=30),
        step=timedelta(minutes=15),
        timezone=TASHKENT,
        as_known_at=datetime(2026, 10, 19, 4, 15, tzinfo=UTC),
        options=OPTIONS,
    )
    assert all(frame.from_history is False for frame in early), (
        "with that event filtered out there is no history, so the frames are reconstructed and say so"
    )

    # As known now: the event is there.
    late = await history_service.replay(
        seeded_session,
        start=effective,
        end=effective + timedelta(minutes=30),
        step=timedelta(minutes=15),
        timezone=TASHKENT,
        options=OPTIONS,
    )
    assert late[0].states["bld-h-f1-a101"] == "lesson_now"


async def test_an_empty_replay_window_is_refused(seeded_session: AsyncSession) -> None:
    with pytest.raises(ValidationError) as caught:
        await history_service.replay(
            seeded_session,
            start=AT,
            end=AT,
            step=timedelta(minutes=15),
            timezone=TASHKENT,
        )
    assert caught.value.code == "empty_replay_window"


async def test_a_naive_replay_window_is_refused(seeded_session: AsyncSession) -> None:
    with pytest.raises(ValidationError) as caught:
        await history_service.replay(
            seeded_session,
            start=datetime(2026, 10, 19, 5, 45),  # noqa: DTZ001
            end=AT + timedelta(hours=1),
            step=timedelta(minutes=15),
            timezone=TASHKENT,
        )
    assert caught.value.code == "naive_replay_window"


async def test_a_non_positive_step_is_refused(seeded_session: AsyncSession) -> None:
    with pytest.raises(ValidationError) as caught:
        await history_service.replay(
            seeded_session,
            start=AT,
            end=AT + timedelta(hours=1),
            step=timedelta(0),
            timezone=TASHKENT,
        )
    assert caught.value.code == "invalid_replay_step"


async def test_an_oversized_replay_is_refused_with_the_numbers(
    seeded_session: AsyncSession,
) -> None:
    """A year at one-minute steps is half a million frames.

    Refusing with the count and the limit lets the caller pick a coarser step,
    which is more useful than a timeout.
    """
    with pytest.raises(ValidationError) as caught:
        await history_service.replay(
            seeded_session,
            start=AT,
            end=AT + timedelta(days=365),
            step=timedelta(minutes=1),
            timezone=TASHKENT,
        )
    assert caught.value.code == "replay_too_large"
    assert caught.value.details["limit"] == history_service.MAX_REPLAY_STEPS
    assert caught.value.details["frames"] > history_service.MAX_REPLAY_STEPS


# ===================================================================== scheduler


async def test_the_scheduler_settles_due_rooms_and_records_them(clean_database, seeded_client) -> None:
    """One pass of the transition scheduler, end to end.

    Uses a committing fixture because the job opens its own session - it runs
    from a timer, not a request, and must not inherit a transaction.
    """
    from app.jobs.transitions import settle_due_rooms
    from app.realtime.broker import InProcessBroker
    from app.realtime.hub import Hub

    hub = Hub(broker=InProcessBroker())
    await hub.start()

    result = await settle_due_rooms(
        clean_database,
        hub,
        get_settings(),
        at=AT,
        # Widen the window so rooms whose next transition is ahead of `at` are
        # settled too; the real timer passes zero and settles only what is due.
        horizon=timedelta(days=1),
    )

    assert result.evaluated == 101
    assert result.recorded == 101, "a first pass records every room"
    assert result.published == 101
    assert result.next_transition is None or result.next_transition > AT

    await hub.stop()


async def test_a_second_scheduler_pass_records_nothing_new(clean_database, seeded_client) -> None:
    """Idempotent: the same instant twice is not two transitions."""
    from app.jobs.transitions import settle_due_rooms
    from app.realtime.broker import InProcessBroker
    from app.realtime.hub import Hub

    hub = Hub(broker=InProcessBroker())
    await hub.start()
    options = {"at": AT, "horizon": timedelta(days=1)}

    first = await settle_due_rooms(clean_database, hub, get_settings(), **options)
    second = await settle_due_rooms(clean_database, hub, get_settings(), **options)

    assert first.recorded == 101
    assert second.recorded == 0
    assert second.published == 0

    await hub.stop()


async def test_the_scheduler_delay_is_clamped() -> None:
    """Never longer than MAX_SLEEP, never shorter than MIN_SLEEP."""
    from app.core.time import now as utc_now
    from app.jobs.transitions import MAX_SLEEP, MIN_SLEEP, TransitionRunner

    assert TransitionRunner._delay_until(None) == MAX_SLEEP
    far = TransitionRunner._delay_until(utc_now() + timedelta(hours=5))
    assert far == MAX_SLEEP
    near = TransitionRunner._delay_until(utc_now() - timedelta(hours=1))
    assert near == MIN_SLEEP


async def test_a_snapshot_job_does_not_duplicate_a_recent_snapshot(clean_database, seeded_client) -> None:
    """Idempotence matters: in-process jobs run once per worker.

    A two-worker deployment fires the same tick twice, so running twice must be
    harmless rather than merely unlikely.
    """
    from app.jobs.maintenance import snapshot_campus_state

    assert await snapshot_campus_state(clean_database, get_settings(), at=AT) is True
    assert await snapshot_campus_state(clean_database, get_settings(), at=AT) is False

    async with clean_database.sessionmaker() as session:
        total = await session.scalar(select(func.count(StateSnapshot.id)))
    assert total == 1
