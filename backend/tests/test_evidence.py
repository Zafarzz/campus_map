"""Occupancy estimator.

The brief (section 10.3) asks for: the estimator with no signals (prior only),
one signal, conflicting signals, and expired signals; decay behaving
monotonically; and a property test that the estimate stays in ``[0, 1]`` of
capacity and that confidence never decreases when a consistent fresh signal is
added.

The tests that matter most are the honesty ones. This module cannot measure
anything, so the two claims it must never make are "the room is empty" when it
simply has no evidence, and "we are certain" about an inference built from
indirect signals.
"""

from __future__ import annotations

import math
from datetime import UTC, datetime, timedelta

import pytest
from hypothesis import given
from hypothesis import settings as hyp_settings
from hypothesis import strategies as st

from app.domain.base import ConfirmationState, CrowdLevel, Provenance, SignalType
from app.engines.evidence import (
    DEFAULT_CROWD_FRACTIONS,
    DEFAULT_PRIOR_MEAN,
    AttendancePrior,
    EstimatorConfig,
    SignalInput,
    confirmation_for,
    crowd_level_for_fraction,
    estimate_occupancy,
    fraction_for_crowd_level,
    schedule_prior,
    update_attendance_prior,
)

NOW = datetime(2026, 10, 19, 10, 45, tzinfo=UTC)
CONFIG = EstimatorConfig()


def _signal(
    kind: SignalType,
    value: float,
    *,
    age_minutes: float = 0,
    reliability: float | None = None,
    expires_in_minutes: float | None = None,
) -> SignalInput:
    observed = NOW - timedelta(minutes=age_minutes)
    return SignalInput(
        signal_type=kind,
        value=value,
        observed_at=observed,
        reliability=reliability,
        expires_at=(
            observed + timedelta(minutes=expires_in_minutes) if expires_in_minutes is not None else None
        ),
    )


# ===================================================================== attendance


class TestAttendancePrior:
    def test_the_default_prior_mean_is_the_documented_assumption(self) -> None:
        """0.6, and called an assumption rather than a finding.

        The brief is explicit that attendance must be learned, not assumed; this
        value only applies before anything has been observed.
        """
        assert DEFAULT_PRIOR_MEAN == 0.6
        assert AttendancePrior.from_default().mean == pytest.approx(0.6)

    def test_a_weak_prior_yields_quickly_to_evidence(self) -> None:
        """The assumption should lose to data, and fast.

        Five sessions of 10%-attended classes must pull the estimate well below
        the 0.6 starting point, not hover near it.
        """
        prior = AttendancePrior.from_default(strength=5.0)
        for _ in range(5):
            prior = update_attendance_prior(prior, attended=3, enrolled=30)
        assert prior.mean < 0.25

    def test_the_posterior_converges_on_the_observed_rate(self) -> None:
        prior = AttendancePrior.from_default()
        for _ in range(50):
            prior = update_attendance_prior(prior, attended=12, enrolled=40)  # 30%
        assert prior.mean == pytest.approx(0.30, abs=0.02)

    def test_observations_are_counted(self) -> None:
        prior = AttendancePrior.from_default()
        for _ in range(3):
            prior = update_attendance_prior(prior, attended=5, enrolled=10)
        assert prior.observations == 3

    def test_strength_grows_with_evidence(self) -> None:
        """More evidence behind the mean means a more confident prior."""
        prior = AttendancePrior.from_default(strength=5.0)
        after = update_attendance_prior(prior, attended=10, enrolled=40)
        assert after.strength == pytest.approx(45.0)

    def test_variance_shrinks_as_evidence_accumulates(self) -> None:
        prior = AttendancePrior.from_default()
        start = prior.variance
        for _ in range(30):
            prior = update_attendance_prior(prior, attended=20, enrolled=40)
        assert prior.variance < start

    def test_full_attendance_pushes_the_mean_up_but_never_to_one(self) -> None:
        prior = AttendancePrior.from_default()
        for _ in range(20):
            prior = update_attendance_prior(prior, attended=40, enrolled=40)
        assert 0.9 < prior.mean < 1.0

    def test_zero_attendance_pushes_the_mean_down_but_never_to_zero(self) -> None:
        prior = AttendancePrior.from_default()
        for _ in range(20):
            prior = update_attendance_prior(prior, attended=0, enrolled=40)
        assert 0.0 < prior.mean < 0.05

    def test_more_attendees_than_enrolled_is_rejected(self) -> None:
        """A guest attendee belongs in a separate count, not in this one."""
        with pytest.raises(ValueError, match="cannot exceed enrolled"):
            update_attendance_prior(AttendancePrior.from_default(), attended=41, enrolled=40)

    def test_negative_counts_are_rejected(self) -> None:
        with pytest.raises(ValueError, match="must not be negative"):
            update_attendance_prior(AttendancePrior.from_default(), attended=-1, enrolled=40)

    def test_non_positive_beta_parameters_are_rejected(self) -> None:
        with pytest.raises(ValueError, match="must be positive"):
            AttendancePrior(alpha=0.0, beta=1.0)

    def test_a_degenerate_prior_mean_is_rejected(self) -> None:
        """A mean of 0 or 1 cannot be updated away from, so it is not a prior."""
        with pytest.raises(ValueError, match="strictly between 0 and 1"):
            AttendancePrior.from_default(mean=1.0)

    def test_an_empty_session_still_updates_the_posterior(self) -> None:
        """Nobody attending is real evidence and must be learned from."""
        prior = AttendancePrior.from_default()
        after = update_attendance_prior(prior, attended=0, enrolled=30)
        assert after.mean < prior.mean


class TestSchedulePrior:
    def test_the_prior_is_enrolled_times_attendance_rate(self) -> None:
        fraction, headcount = schedule_prior(
            enrolled=40, capacity=50, attendance_prior=AttendancePrior.from_default()
        )
        # 40 * 0.6 = 24 expected, in a room for 50.
        assert headcount == 24
        assert fraction == pytest.approx(24 / 50)

    def test_a_learned_rate_replaces_the_default(self) -> None:
        learned = AttendancePrior.from_default()
        for _ in range(50):
            learned = update_attendance_prior(learned, attended=10, enrolled=40)  # 25%
        _, headcount = schedule_prior(enrolled=40, capacity=50, attendance_prior=learned)
        assert headcount is not None and 9 <= headcount <= 12

    def test_an_unknown_enrolled_count_returns_nothing(self) -> None:
        """The deliberate refusal.

        Inventing a headcount would feed the estimator a fabricated prior that
        looks exactly as confident as a real one. The demo timetable has no
        enrolled counts, so this path is the normal one today.
        """
        assert schedule_prior(enrolled=None, capacity=50) == (None, None)

    def test_an_unknown_capacity_gives_a_headcount_but_no_fraction(self) -> None:
        """A fraction of an unknown capacity is meaningless; the count is not."""
        fraction, headcount = schedule_prior(enrolled=40, capacity=None)
        assert fraction is None
        assert headcount == 24

    def test_a_zero_capacity_gives_no_fraction(self) -> None:
        fraction, _ = schedule_prior(enrolled=40, capacity=0)
        assert fraction is None


# ===================================================================== fusion


class TestEstimator:
    def test_with_no_evidence_at_all_it_says_so(self) -> None:
        """The single most important honesty test.

        No prior and no signals must not produce "the room is empty". It
        produces zero *confidence* and a note that says the absence is of
        information, not of people.
        """
        estimate = estimate_occupancy(at=NOW, capacity=30, prior_fraction=None)

        assert estimate.confidence == 0.0
        assert estimate.provenance is Provenance.estimated
        assert estimate.headcount_likely is None
        assert estimate.note is not None
        assert "absence of information" in estimate.note
        assert estimate.is_measurement is False

    def test_the_prior_alone_gives_a_scheduled_estimate(self) -> None:
        estimate = estimate_occupancy(at=NOW, capacity=50, prior_fraction=0.48)

        assert estimate.fraction == pytest.approx(0.48)
        assert estimate.provenance is Provenance.scheduled
        assert estimate.headcount_likely == 24
        assert 0 < estimate.confidence < 1

    def test_one_fresh_signal_moves_the_estimate_towards_itself(self) -> None:
        prior_only = estimate_occupancy(at=NOW, capacity=30, prior_fraction=0.3)
        with_signal = estimate_occupancy(
            at=NOW,
            capacity=30,
            prior_fraction=0.3,
            signals=[_signal(SignalType.crowd_report, 0.9)],
        )
        assert prior_only.fraction < with_signal.fraction < 0.9

    def test_a_counted_check_in_dominates_a_weak_prior(self) -> None:
        """Reliability 0.95 against a prior weight of 1.0, so it moves a lot."""
        estimate = estimate_occupancy(
            at=NOW,
            capacity=30,
            prior_fraction=0.2,
            signals=[_signal(SignalType.checkin, 0.9)],
        )
        assert estimate.fraction > 0.5
        assert estimate.provenance is Provenance.confirmed

    def test_conflicting_signals_land_between_them(self) -> None:
        """Two equally reliable, equally fresh, opposite reports average out."""
        estimate = estimate_occupancy(
            at=NOW,
            capacity=30,
            prior_fraction=None,
            signals=[
                _signal(SignalType.crowd_report, 0.1, reliability=0.5),
                _signal(SignalType.crowd_report, 0.9, reliability=0.5),
            ],
        )
        assert estimate.fraction == pytest.approx(0.5)

    def test_a_more_reliable_signal_pulls_harder(self) -> None:
        estimate = estimate_occupancy(
            at=NOW,
            capacity=30,
            prior_fraction=None,
            signals=[
                _signal(SignalType.crowd_report, 0.0, reliability=0.1),
                _signal(SignalType.crowd_report, 1.0, reliability=0.9),
            ],
        )
        assert estimate.fraction == pytest.approx(0.9)

    def test_an_expired_signal_is_ignored(self) -> None:
        estimate = estimate_occupancy(
            at=NOW,
            capacity=30,
            prior_fraction=0.3,
            signals=[_signal(SignalType.crowd_report, 1.0, age_minutes=20, expires_in_minutes=10)],
        )
        assert estimate.fraction == pytest.approx(0.3)
        assert estimate.provenance is Provenance.scheduled

    def test_a_signal_from_the_future_is_ignored(self) -> None:
        """Replaying the past must not use evidence that did not exist yet.

        Asked "how busy was it at 10:45?", a report made at 11:15 is not
        available information, and admitting it would make a replay disagree
        with what the system actually knew at the time.
        """
        estimate = estimate_occupancy(
            at=NOW,
            capacity=30,
            prior_fraction=0.3,
            signals=[_signal(SignalType.crowd_report, 1.0, age_minutes=-30)],
        )
        assert estimate.fraction == pytest.approx(0.3)

    def test_decay_weakens_an_older_signal_monotonically(self) -> None:
        """Weight falls smoothly with age, with no cliff."""
        fractions = [
            estimate_occupancy(
                at=NOW,
                capacity=30,
                prior_fraction=0.2,
                signals=[_signal(SignalType.crowd_report, 1.0, age_minutes=age)],
            ).fraction
            for age in (0, 5, 10, 20, 40, 80)
        ]
        # Each older signal pulls the estimate less far from the 0.2 prior.
        assert fractions == sorted(fractions, reverse=True)
        assert fractions[-1] == pytest.approx(0.2, abs=0.01)

    def test_the_decay_constant_matches_the_formula(self) -> None:
        """``w = reliability * exp(-age/tau)``, checked against the arithmetic."""
        config = EstimatorConfig(tau=timedelta(minutes=10), prior_weight=1.0)
        estimate = estimate_occupancy(
            at=NOW,
            capacity=30,
            prior_fraction=0.0,
            signals=[_signal(SignalType.crowd_report, 1.0, age_minutes=10, reliability=1.0)],
            config=config,
        )
        expected_weight = math.exp(-1.0)  # one tau of age
        expected = expected_weight / (1.0 + expected_weight)
        assert estimate.fraction == pytest.approx(expected)

    def test_an_over_capacity_observation_is_not_clipped(self) -> None:
        """A room with more people than seats is real, and worth surfacing."""
        estimate = estimate_occupancy(
            at=NOW,
            capacity=30,
            prior_fraction=None,
            signals=[_signal(SignalType.checkin, 1.4, reliability=1.0)],
        )
        assert estimate.fraction == pytest.approx(1.4)
        assert estimate.headcount_likely == 42

    def test_a_naive_instant_is_rejected(self) -> None:
        with pytest.raises(ValueError, match="timezone-aware"):
            estimate_occupancy(
                at=datetime(2026, 10, 19, 10, 45),  # noqa: DTZ001
                capacity=30,
                prior_fraction=0.3,
            )

    def test_a_naive_signal_is_rejected(self) -> None:
        with pytest.raises(ValueError, match="timezone-aware"):
            SignalInput(
                signal_type=SignalType.crowd_report,
                value=0.5,
                observed_at=datetime(2026, 10, 19, 10, 45),  # noqa: DTZ001
            )

    def test_a_negative_signal_value_is_rejected(self) -> None:
        with pytest.raises(ValueError, match="must not be negative"):
            SignalInput(signal_type=SignalType.crowd_report, value=-0.1, observed_at=NOW)

    def test_an_out_of_range_reliability_is_rejected(self) -> None:
        with pytest.raises(ValueError, match="reliability must be in"):
            SignalInput(
                signal_type=SignalType.crowd_report,
                value=0.5,
                observed_at=NOW,
                reliability=1.5,
            )


class TestConfidence:
    def test_confidence_rises_with_more_evidence(self) -> None:
        one = estimate_occupancy(
            at=NOW,
            capacity=30,
            prior_fraction=0.5,
            signals=[_signal(SignalType.crowd_report, 0.5)],
        )
        three = estimate_occupancy(
            at=NOW,
            capacity=30,
            prior_fraction=0.5,
            signals=[_signal(SignalType.crowd_report, 0.5) for _ in range(3)],
        )
        assert three.confidence > one.confidence

    def test_confidence_never_reaches_certainty(self) -> None:
        """This is inference from indirect evidence, not measurement.

        Claiming 1.0 would be exactly the dishonesty the brief forbids.
        """
        estimate = estimate_occupancy(
            at=NOW,
            capacity=30,
            prior_fraction=0.5,
            signals=[_signal(SignalType.checkin, 0.5, reliability=1.0) for _ in range(50)],
        )
        assert estimate.confidence <= CONFIG.max_confidence < 1.0

    def test_the_headcount_band_widens_as_confidence_falls(self) -> None:
        confident = estimate_occupancy(
            at=NOW,
            capacity=100,
            prior_fraction=0.5,
            signals=[_signal(SignalType.checkin, 0.5, reliability=1.0) for _ in range(10)],
        )
        unsure = estimate_occupancy(at=NOW, capacity=100, prior_fraction=0.5)

        confident_span = (confident.headcount_high or 0) - (confident.headcount_low or 0)
        unsure_span = (unsure.headcount_high or 0) - (unsure.headcount_low or 0)
        assert unsure_span > confident_span

    def test_an_invalid_config_is_rejected(self) -> None:
        with pytest.raises(ValueError, match="tau must be positive"):
            EstimatorConfig(tau=timedelta(0))
        with pytest.raises(ValueError, match="max_confidence"):
            EstimatorConfig(max_confidence=0.0)
        with pytest.raises(ValueError, match="prior_weight"):
            EstimatorConfig(prior_weight=-1.0)


class TestProvenance:
    def test_the_schedule_alone_is_scheduled(self) -> None:
        estimate = estimate_occupancy(at=NOW, capacity=30, prior_fraction=0.5)
        assert estimate.provenance is Provenance.scheduled

    def test_a_check_in_makes_it_confirmed(self) -> None:
        estimate = estimate_occupancy(
            at=NOW, capacity=30, prior_fraction=0.5, signals=[_signal(SignalType.checkin, 0.6)]
        )
        assert estimate.provenance is Provenance.confirmed

    def test_a_teacher_confirmation_makes_it_confirmed(self) -> None:
        estimate = estimate_occupancy(
            at=NOW,
            capacity=30,
            prior_fraction=0.5,
            signals=[_signal(SignalType.teacher_confirmation, 0.6)],
        )
        assert estimate.provenance is Provenance.confirmed

    def test_enough_crowd_reports_make_it_reported(self) -> None:
        estimate = estimate_occupancy(
            at=NOW,
            capacity=30,
            prior_fraction=0.5,
            signals=[_signal(SignalType.crowd_report, 0.6) for _ in range(3)],
        )
        assert estimate.provenance is Provenance.reported

    def test_too_few_crowd_reports_stay_estimated(self) -> None:
        """One person's impression is not a report about the world yet."""
        estimate = estimate_occupancy(
            at=NOW,
            capacity=30,
            prior_fraction=0.5,
            signals=[_signal(SignalType.crowd_report, 0.6)],
        )
        assert estimate.provenance is Provenance.estimated

    def test_a_check_in_outranks_a_pile_of_reports(self) -> None:
        """One counted headcount beats any number of impressions."""
        estimate = estimate_occupancy(
            at=NOW,
            capacity=30,
            prior_fraction=0.5,
            signals=[
                *[_signal(SignalType.crowd_report, 0.9) for _ in range(10)],
                _signal(SignalType.checkin, 0.3),
            ],
        )
        assert estimate.provenance is Provenance.confirmed

    def test_the_report_threshold_is_configurable(self) -> None:
        config = EstimatorConfig(min_reports_for_reported=1)
        estimate = estimate_occupancy(
            at=NOW,
            capacity=30,
            prior_fraction=0.5,
            signals=[_signal(SignalType.crowd_report, 0.6)],
            config=config,
        )
        assert estimate.provenance is Provenance.reported


class TestConfirmation:
    def test_a_no_show_is_unconfirmed_never_empty(self) -> None:
        """The brief's rule, stated as plainly as the code can state it.

        A scheduled lesson, grace period elapsed, nobody checked in. The answer
        is "we don't know", not "nobody came".
        """
        state = confirmation_for([], meeting_scheduled=True, grace_elapsed=True)
        assert state is ConfirmationState.unconfirmed
        # And there is no way for this function to say "empty":
        assert set(ConfirmationState) == {
            ConfirmationState.confirmed,
            ConfirmationState.unconfirmed,
            ConfirmationState.not_required,
        }

    def test_a_check_in_confirms_it(self) -> None:
        state = confirmation_for(
            [_signal(SignalType.checkin, 0.5)], meeting_scheduled=True, grace_elapsed=True
        )
        assert state is ConfirmationState.confirmed

    def test_nothing_scheduled_needs_no_confirmation(self) -> None:
        state = confirmation_for([], meeting_scheduled=False, grace_elapsed=True)
        assert state is ConfirmationState.not_required

    def test_enough_reports_confirm_a_scheduled_meeting(self) -> None:
        """Enough people saying it is busy is human confirmation too."""
        state = confirmation_for(
            [_signal(SignalType.crowd_report, 0.8) for _ in range(3)],
            meeting_scheduled=True,
            grace_elapsed=True,
        )
        assert state is ConfirmationState.confirmed

    def test_an_estimate_for_a_scheduled_meeting_carries_the_confirmation(self) -> None:
        estimate = estimate_occupancy(
            at=NOW,
            capacity=30,
            prior_fraction=0.5,
            meeting_scheduled=True,
            grace_elapsed=True,
        )
        assert estimate.confirmation is ConfirmationState.unconfirmed


class TestCrowdLevels:
    def test_the_five_level_scale_round_trips(self) -> None:
        for level in CrowdLevel:
            fraction = fraction_for_crowd_level(level)
            assert crowd_level_for_fraction(fraction) is level

    def test_levels_are_ordered_by_fraction(self) -> None:
        order = [
            CrowdLevel.empty,
            CrowdLevel.quiet,
            CrowdLevel.moderate,
            CrowdLevel.busy,
            CrowdLevel.full,
        ]
        fractions = [DEFAULT_CROWD_FRACTIONS[level] for level in order]
        assert fractions == sorted(fractions)

    def test_a_fraction_picks_the_nearest_level(self) -> None:
        assert crowd_level_for_fraction(0.0) is CrowdLevel.empty
        assert crowd_level_for_fraction(0.52) is CrowdLevel.moderate
        assert crowd_level_for_fraction(0.95) is CrowdLevel.full

    def test_an_over_capacity_fraction_is_full(self) -> None:
        assert crowd_level_for_fraction(1.8) is CrowdLevel.full

    def test_the_mapping_is_configurable(self) -> None:
        """ "Busy" means something different in a library and in a corridor."""
        corridor = {**DEFAULT_CROWD_FRACTIONS, CrowdLevel.busy: 0.35}
        assert crowd_level_for_fraction(0.35, corridor) is CrowdLevel.busy

    def test_an_estimate_reports_a_level(self) -> None:
        estimate = estimate_occupancy(at=NOW, capacity=30, prior_fraction=0.8)
        assert estimate.level is CrowdLevel.busy


class TestExplainability:
    def test_every_contribution_is_recorded(self) -> None:
        """A user who asks "why does it say busy?" must get a real answer."""
        estimate = estimate_occupancy(
            at=NOW,
            capacity=30,
            prior_fraction=0.4,
            signals=[
                _signal(SignalType.crowd_report, 0.9, age_minutes=2),
                _signal(SignalType.checkin, 0.7, age_minutes=5),
            ],
        )
        kinds = [item["type"] for item in estimate.inputs]
        assert kinds == ["prior", "crowd_report", "checkin"]

        for contribution in estimate.inputs:
            assert "value" in contribution and "weight" in contribution

        report = next(item for item in estimate.inputs if item["type"] == "crowd_report")
        assert report["age_seconds"] == 120

    def test_the_prior_is_recorded_with_no_age(self) -> None:
        """A plan has no observation time; recording one would be a fiction."""
        estimate = estimate_occupancy(at=NOW, capacity=30, prior_fraction=0.4)
        assert estimate.inputs[0]["age_seconds"] is None

    def test_an_expired_signal_is_not_listed_as_a_contribution(self) -> None:
        estimate = estimate_occupancy(
            at=NOW,
            capacity=30,
            prior_fraction=0.4,
            signals=[_signal(SignalType.crowd_report, 0.9, age_minutes=30, expires_in_minutes=10)],
        )
        assert [item["type"] for item in estimate.inputs] == ["prior"]

    def test_total_weight_is_reported(self) -> None:
        estimate = estimate_occupancy(
            at=NOW,
            capacity=30,
            prior_fraction=0.4,
            signals=[_signal(SignalType.checkin, 0.7, reliability=1.0)],
        )
        assert estimate.total_weight == pytest.approx(2.0, abs=0.01)


# ===================================================================== properties


@hyp_settings(max_examples=250, deadline=None)
@given(
    prior=st.one_of(st.none(), st.floats(min_value=0.0, max_value=1.0)),
    values=st.lists(st.floats(min_value=0.0, max_value=1.0), max_size=6),
    ages=st.lists(st.floats(min_value=0.0, max_value=120.0), max_size=6),
)
def test_the_estimate_stays_within_the_range_of_its_inputs(
    prior: float | None, values: list[float], ages: list[float]
) -> None:
    """A weighted mean cannot escape the interval spanned by its inputs.

    This is the brief's "estimate stays in [0, 1] of capacity" property, stated
    in the stronger form that actually holds: with all inputs in [0, 1] the
    result is in [0, 1], and more precisely it lies between the smallest and
    largest input.
    """
    signals = [
        _signal(SignalType.crowd_report, value, age_minutes=age)
        for value, age in zip(values, ages, strict=False)
    ]
    estimate = estimate_occupancy(at=NOW, capacity=30, prior_fraction=prior, signals=signals)

    inputs = list(values[: len(signals)])
    if prior is not None:
        inputs.append(prior)

    assert 0.0 <= estimate.fraction <= 1.0
    if inputs:
        # Tolerance for float accumulation in the weighted sum.
        assert min(inputs) - 1e-9 <= estimate.fraction <= max(inputs) + 1e-9
    assert 0.0 <= estimate.confidence <= CONFIG.max_confidence


@hyp_settings(max_examples=200, deadline=None)
@given(
    prior=st.floats(min_value=0.0, max_value=1.0),
    value=st.floats(min_value=0.0, max_value=1.0),
    count=st.integers(min_value=1, max_value=8),
)
def test_confidence_never_decreases_when_a_consistent_signal_is_added(
    prior: float, value: float, count: int
) -> None:
    """The brief's named monotonicity property.

    Adding a fresh signal adds weight, and confidence is monotonic in weight,
    so more evidence can never make the system less sure.
    """
    previous = estimate_occupancy(at=NOW, capacity=30, prior_fraction=prior).confidence

    for extra in range(1, count + 1):
        current = estimate_occupancy(
            at=NOW,
            capacity=30,
            prior_fraction=prior,
            signals=[_signal(SignalType.crowd_report, value) for _ in range(extra)],
        ).confidence
        assert current >= previous - 1e-12
        previous = current


@hyp_settings(max_examples=150, deadline=None)
@given(
    value=st.floats(min_value=0.0, max_value=1.0),
    prior=st.floats(min_value=0.0, max_value=1.0),
    younger=st.floats(min_value=0.0, max_value=30.0),
    extra_age=st.floats(min_value=0.1, max_value=90.0),
)
def test_an_older_signal_never_pulls_harder_than_a_younger_one(
    value: float, prior: float, younger: float, extra_age: float
) -> None:
    """Decay is monotonic: age only ever reduces influence."""
    near = estimate_occupancy(
        at=NOW,
        capacity=30,
        prior_fraction=prior,
        signals=[_signal(SignalType.crowd_report, value, age_minutes=younger)],
    ).fraction
    far = estimate_occupancy(
        at=NOW,
        capacity=30,
        prior_fraction=prior,
        signals=[_signal(SignalType.crowd_report, value, age_minutes=younger + extra_age)],
    ).fraction

    # The older signal leaves the estimate closer to the prior.
    assert abs(far - prior) <= abs(near - prior) + 1e-9


@hyp_settings(max_examples=200, deadline=None)
@given(
    attended=st.integers(min_value=0, max_value=200),
    enrolled=st.integers(min_value=0, max_value=200),
)
def test_the_attendance_posterior_is_always_a_valid_rate(attended: int, enrolled: int) -> None:
    """However odd the observation, the learned rate stays a probability."""
    if attended > enrolled:
        attended, enrolled = enrolled, attended

    posterior = update_attendance_prior(AttendancePrior.from_default(), attended=attended, enrolled=enrolled)
    assert 0.0 < posterior.mean < 1.0
    assert posterior.variance >= 0.0
    assert posterior.strength > 0


@hyp_settings(max_examples=100, deadline=None)
@given(fraction=st.floats(min_value=0.0, max_value=3.0))
def test_every_fraction_maps_to_some_crowd_level(fraction: float) -> None:
    assert crowd_level_for_fraction(fraction) in set(CrowdLevel)
