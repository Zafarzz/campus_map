"""Occupancy estimation from software signals only.

There are no sensors and there never will be (brief section 3.1), so this module
cannot *measure* how many people are in a room. It combines four kinds of
evidence - the schedule, human confirmations, crowd reports, and history - and
every number it returns carries its provenance and a confidence.

The arithmetic (brief section 10.3), precision-weighted fusion with exponential
decay::

    estimate = (p0 * x0 + sum(w_i * x_i)) / (p0 + sum(w_i))
    w_i      = reliability_i * exp(-(now - observed_at_i) / tau)

``x0`` is the prior as a fraction of capacity, ``x_i`` are signals converted to
the same scale, ``p0`` is the prior's weight, and ``tau`` is the decay constant.
A signal's influence falls off smoothly with age rather than vanishing at a
cliff, so a six-minute-old report still counts for something.

**The attendance rate is learned, never hard-coded.** ``expected = enrolled x
attendance_rate``, and the rate comes from a Beta-Binomial posterior per section,
weekday and hour (:class:`AttendancePrior`). A single global rate would be
fiction: published measurements at one university ranged from about 22% on
Fridays to about 65% on Mondays. The *default prior mean* of 0.6 is an
assumption, documented as one, and it is what the estimator falls back to before
any attendance has been observed.

**Absence of evidence is not evidence of absence.** A scheduled meeting whose
grace period has passed with no check-in, confirmation or report is
``unconfirmed`` - never "empty" (:func:`confirmation_for`). The distinction
matters: "we don't know" and "nobody came" are different claims, and only one of
them is true.

Nothing here does I/O. :mod:`app.services.evidence_service` loads signals and
persists estimates.
"""

from __future__ import annotations

import math
from dataclasses import dataclass, field
from datetime import datetime, timedelta

from app.domain.base import ConfirmationState, CrowdLevel, Provenance, SignalType

__all__ = [
    "DEFAULT_CROWD_FRACTIONS",
    "DEFAULT_PRIOR_MEAN",
    "AttendancePrior",
    "Estimate",
    "EstimatorConfig",
    "SignalInput",
    "confirmation_for",
    "crowd_level_for_fraction",
    "estimate_occupancy",
    "schedule_prior",
    "update_attendance_prior",
]

#: Default prior mean attendance rate. **An assumption**, not a measurement, and
#: documented as one in ``docs/privacy/`` and in the API. It is the starting
#: point of the Beta-Binomial update, not a fixed value: once a section has
#: observed attendance, the posterior replaces it.
DEFAULT_PRIOR_MEAN = 0.6

#: Crowd levels mapped to fractions of capacity. Configurable per place type -
#: "busy" means something different in a library and in a corridor.
DEFAULT_CROWD_FRACTIONS: dict[CrowdLevel, float] = {
    CrowdLevel.empty: 0.02,
    CrowdLevel.quiet: 0.20,
    CrowdLevel.moderate: 0.50,
    CrowdLevel.busy: 0.80,
    CrowdLevel.full: 1.00,
}

#: Per-signal-type reliability. A counted check-in is strong evidence; one
#: person's impression of "busy" is weak; the schedule is a plan, not an
#: observation. These are the weights the fusion formula multiplies by decay.
DEFAULT_RELIABILITY: dict[SignalType, float] = {
    SignalType.checkin: 0.95,
    SignalType.teacher_confirmation: 0.85,
    SignalType.booking: 0.40,
    SignalType.crowd_report: 0.35,
    SignalType.history_profile: 0.30,
    SignalType.schedule: 0.25,
    SignalType.ticket: 0.20,
}


@dataclass(frozen=True, slots=True)
class EstimatorConfig:
    """Tunables. Passed in, never read from globals, so tests can pin them."""

    #: Weight of the prior in the fusion. Higher means fresh signals move the
    #: estimate less.
    prior_weight: float = 1.0
    #: Decay constant. A signal's weight falls to 1/e after this long. The brief
    #: suggests reports expire after about 10 minutes, so the default half-life
    #: is in that neighbourhood.
    tau: timedelta = timedelta(minutes=10)
    #: Fresh crowd reports needed before provenance may become ``reported``.
    min_reports_for_reported: int = 3
    #: Total fused weight at which confidence reaches ~0.63 of its ceiling.
    confidence_scale: float = 2.0
    #: Confidence ceiling. Never 1.0: this is an estimate built from indirect
    #: evidence, and claiming certainty would be the dishonesty the brief
    #: forbids (section 3.5).
    max_confidence: float = 0.95
    #: Default prior mean when a section has no observed attendance.
    default_prior_mean: float = DEFAULT_PRIOR_MEAN
    crowd_fractions: dict[CrowdLevel, float] = field(default_factory=lambda: dict(DEFAULT_CROWD_FRACTIONS))

    def __post_init__(self) -> None:
        if self.prior_weight < 0:
            raise ValueError(f"prior_weight must not be negative, got {self.prior_weight}")
        if self.tau <= timedelta(0):
            raise ValueError(f"tau must be positive, got {self.tau}")
        if not 0 < self.max_confidence <= 1:
            raise ValueError(f"max_confidence must be in (0, 1], got {self.max_confidence}")
        if not 0 <= self.default_prior_mean <= 1:
            raise ValueError(f"default_prior_mean must be a fraction, got {self.default_prior_mean}")


@dataclass(frozen=True, slots=True)
class AttendancePrior:
    """Beta-Binomial posterior for one section, weekday and hour.

    ``alpha`` counts attendees, ``beta`` counts enrolled students who did not
    attend. The posterior mean ``alpha / (alpha + beta)`` is the learned
    attendance rate, and it starts from the configured default rather than from
    a flat prior so that a section with two observations is not swung wildly by
    them.
    """

    alpha: float
    beta: float
    observations: int = 0

    def __post_init__(self) -> None:
        if self.alpha <= 0 or self.beta <= 0:
            raise ValueError(f"Beta parameters must be positive, got a={self.alpha}, b={self.beta}")

    @classmethod
    def from_default(cls, *, mean: float = DEFAULT_PRIOR_MEAN, strength: float = 5.0) -> AttendancePrior:
        """The starting prior: ``mean`` with the weight of ``strength`` students.

        A weak prior (small ``strength``) lets real observations take over
        quickly, which is what we want - the default is an assumption and should
        yield to evidence.
        """
        if not 0 < mean < 1:
            raise ValueError(f"prior mean must be strictly between 0 and 1, got {mean}")
        if strength <= 0:
            raise ValueError(f"prior strength must be positive, got {strength}")
        return cls(alpha=mean * strength, beta=(1 - mean) * strength)

    @property
    def mean(self) -> float:
        return self.alpha / (self.alpha + self.beta)

    @property
    def strength(self) -> float:
        """Total pseudo-count. Higher means more evidence behind the mean."""
        return self.alpha + self.beta

    @property
    def variance(self) -> float:
        total = self.strength
        return (self.alpha * self.beta) / (total * total * (total + 1))


def update_attendance_prior(
    prior: AttendancePrior,
    *,
    attended: int,
    enrolled: int,
) -> AttendancePrior:
    """Fold one observed session into the posterior.

    The conjugate update: successes add to ``alpha``, failures to ``beta``. That
    is the whole of the learning - no gradient, no retraining, and the result is
    inspectable, which matters because the brief requires every number to be
    explainable (section 2.4).
    """
    if enrolled < 0 or attended < 0:
        raise ValueError(f"counts must not be negative, got attended={attended}, enrolled={enrolled}")
    if attended > enrolled:
        raise ValueError(
            f"attended ({attended}) cannot exceed enrolled ({enrolled}); "
            "a guest attendee belongs in a separate count"
        )
    return AttendancePrior(
        alpha=prior.alpha + attended,
        beta=prior.beta + (enrolled - attended),
        observations=prior.observations + 1,
    )


def schedule_prior(
    *,
    enrolled: int | None,
    capacity: int | None,
    attendance_prior: AttendancePrior | None = None,
    config: EstimatorConfig | None = None,
) -> tuple[float | None, int | None]:
    """The schedule-based prior: ``(fraction_of_capacity, expected_headcount)``.

    Returns ``(None, None)`` when the enrolled count is unknown. That is a
    deliberate refusal: inventing a headcount for a section whose enrolment
    nobody recorded would feed the estimator a fabricated prior and the result
    would look just as confident as a real one. The demo timetable has no
    enrolled counts for exactly this reason, and the caller must handle the
    absence rather than be handed a number.
    """
    cfg = config or EstimatorConfig()
    if enrolled is None or enrolled < 0:
        return None, None

    prior = attendance_prior or AttendancePrior.from_default(mean=cfg.default_prior_mean)
    expected = enrolled * prior.mean

    if capacity is None or capacity <= 0:
        return None, round(expected)
    return expected / capacity, round(expected)


@dataclass(frozen=True, slots=True)
class SignalInput:
    """One piece of evidence, already normalised to a fraction of capacity.

    ``value`` may exceed 1.0: a room holding more people than its nominal
    capacity is a real and interesting observation, and clipping it here would
    hide a crowding problem.
    """

    signal_type: SignalType
    value: float
    observed_at: datetime
    #: Source weight in ``[0, 1]``. Defaults to the per-type reliability.
    reliability: float | None = None
    expires_at: datetime | None = None
    #: Raw count, when the source gave one.
    count: int | None = None
    ref: str | None = None

    def __post_init__(self) -> None:
        if self.observed_at.tzinfo is None:
            raise ValueError("signal observed_at must be timezone-aware")
        if self.value < 0:
            raise ValueError(f"signal value must not be negative, got {self.value}")
        if self.reliability is not None and not 0 <= self.reliability <= 1:
            raise ValueError(f"reliability must be in [0, 1], got {self.reliability}")

    @property
    def effective_reliability(self) -> float:
        if self.reliability is not None:
            return self.reliability
        return DEFAULT_RELIABILITY.get(self.signal_type, 0.3)

    def is_fresh(self, at: datetime) -> bool:
        """Not yet expired, and not from the future.

        A signal observed after ``at`` is excluded rather than used: when
        answering "how busy was it at 10:00?" evidence from 10:30 is not
        available information, and letting it in would make a replay of the past
        disagree with what the system actually knew then.
        """
        if self.observed_at > at:
            return False
        return self.expires_at is None or self.expires_at > at

    def weight(self, at: datetime, tau: timedelta) -> float:
        """``reliability * exp(-age / tau)``."""
        age = (at - self.observed_at).total_seconds()
        if age < 0:
            return 0.0
        return self.effective_reliability * math.exp(-age / tau.total_seconds())


@dataclass(frozen=True, slots=True)
class Estimate:
    """The answer, with everything needed to explain it.

    ``inputs`` records which signals contributed and with what weight, so a user
    who asks "why does it say busy?" gets a real answer instead of being told to
    trust the model.
    """

    fraction: float
    confidence: float
    provenance: Provenance
    confirmation: ConfirmationState
    at: datetime
    capacity: int | None = None
    headcount_likely: int | None = None
    headcount_low: int | None = None
    headcount_high: int | None = None
    level: CrowdLevel | None = None
    #: ``[{"type": ..., "value": ..., "weight": ..., "age_seconds": ...}]``
    inputs: tuple[dict[str, object], ...] = ()
    total_weight: float = 0.0
    note: str | None = None

    @property
    def is_measurement(self) -> bool:
        """Always False. There are no sensors; nothing here is measured.

        Present as an explicit, greppable statement rather than an omission, so
        that any future code tempted to render this as a measurement has to
        argue with it.
        """
        return False


def estimate_occupancy(
    *,
    at: datetime,
    capacity: int | None,
    prior_fraction: float | None,
    signals: list[SignalInput] | tuple[SignalInput, ...] = (),
    config: EstimatorConfig | None = None,
    meeting_scheduled: bool = False,
    grace_elapsed: bool = False,
) -> Estimate:
    """Fuse a prior and fresh signals into one estimate.

    With no prior and no signals the result is an honest "we don't know":
    fraction 0.0, confidence 0.0, provenance ``estimated``, and a note saying so.
    It is **not** reported as an empty room.
    """
    cfg = config or EstimatorConfig()
    if at.tzinfo is None:
        raise ValueError("'at' must be timezone-aware")

    fresh = [item for item in signals if item.is_fresh(at)]

    weighted_sum = 0.0
    total_weight = 0.0
    contributions: list[dict[str, object]] = []

    if prior_fraction is not None:
        weighted_sum += cfg.prior_weight * prior_fraction
        total_weight += cfg.prior_weight
        contributions.append(
            {
                "type": "prior",
                "value": round(prior_fraction, 4),
                "weight": round(cfg.prior_weight, 4),
                "age_seconds": None,
            }
        )

    for signal in fresh:
        weight = signal.weight(at, cfg.tau)
        if weight <= 0:
            continue
        weighted_sum += weight * signal.value
        total_weight += weight
        contributions.append(
            {
                "type": signal.signal_type.value,
                "value": round(signal.value, 4),
                "weight": round(weight, 4),
                "age_seconds": int((at - signal.observed_at).total_seconds()),
                "ref": signal.ref,
            }
        )

    if total_weight <= 0:
        return Estimate(
            fraction=0.0,
            confidence=0.0,
            provenance=Provenance.estimated,
            confirmation=confirmation_for(
                fresh, meeting_scheduled=meeting_scheduled, grace_elapsed=grace_elapsed, config=cfg
            ),
            at=at,
            capacity=capacity,
            inputs=tuple(contributions),
            total_weight=0.0,
            note=(
                "No evidence available, so this is not an estimate of emptiness - "
                "it is an absence of information."
            ),
        )

    fraction = weighted_sum / total_weight
    confidence = _confidence_from_weight(total_weight, cfg)
    provenance = _provenance_for(fresh, config=cfg)

    headcount = round(fraction * capacity) if capacity else None
    low, high = _headcount_band(fraction, capacity, confidence)

    return Estimate(
        fraction=fraction,
        confidence=confidence,
        provenance=provenance,
        confirmation=confirmation_for(
            fresh, meeting_scheduled=meeting_scheduled, grace_elapsed=grace_elapsed, config=cfg
        ),
        at=at,
        capacity=capacity,
        headcount_likely=headcount,
        headcount_low=low,
        headcount_high=high,
        level=crowd_level_for_fraction(fraction, cfg.crowd_fractions),
        inputs=tuple(contributions),
        total_weight=total_weight,
    )


def _confidence_from_weight(total_weight: float, cfg: EstimatorConfig) -> float:
    """Confidence rises with total fused weight, saturating below 1.0.

    ``1 - exp(-w / scale)``, capped at ``max_confidence``. Monotonic in weight,
    which is the property the brief asks to be tested: adding a consistent fresh
    signal must never reduce confidence.
    """
    raw = 1.0 - math.exp(-total_weight / cfg.confidence_scale)
    return min(raw, cfg.max_confidence)


def _provenance_for(fresh: list[SignalInput], *, config: EstimatorConfig) -> Provenance:
    """Provenance rules, exactly as the brief states them (section 10.3).

    ``scheduled`` is the plan only. ``confirmed`` needs at least one fresh
    teacher confirmation or check-in count. ``reported`` needs enough fresh crowd
    reports. Otherwise ``estimated``.

    Order matters: a check-in outranks a pile of crowd reports, because one
    counted headcount is better evidence than any number of impressions.
    """
    kinds = [item.signal_type for item in fresh]

    if SignalType.checkin in kinds or SignalType.teacher_confirmation in kinds:
        return Provenance.confirmed

    reports = sum(1 for kind in kinds if kind is SignalType.crowd_report)
    if reports >= config.min_reports_for_reported:
        return Provenance.reported

    if not fresh:
        # Only the schedule's prior contributed, which is a plan.
        return Provenance.scheduled
    return Provenance.estimated


def confirmation_for(
    fresh: list[SignalInput],
    *,
    meeting_scheduled: bool,
    grace_elapsed: bool,
    config: EstimatorConfig | None = None,
) -> ConfirmationState:
    """Whether a human has confirmed the scheduled thing is happening.

    The no-show rule (brief section 10.3): a scheduled meeting whose grace
    period has passed with no check-in, confirmation or report is
    ``unconfirmed``. It is never "empty", and this function has no way to say
    "empty" - the only three answers are confirmed, unconfirmed, and
    not_required.
    """
    cfg = config or EstimatorConfig()
    kinds = [item.signal_type for item in fresh]

    if SignalType.checkin in kinds or SignalType.teacher_confirmation in kinds:
        return ConfirmationState.confirmed

    if not meeting_scheduled:
        return ConfirmationState.not_required

    reports = sum(1 for kind in kinds if kind is SignalType.crowd_report)
    if reports >= cfg.min_reports_for_reported:
        # Enough people say something is going on in there.
        return ConfirmationState.confirmed

    if grace_elapsed:
        return ConfirmationState.unconfirmed
    # Before the grace period there is nothing to confirm yet.
    return ConfirmationState.unconfirmed


def crowd_level_for_fraction(fraction: float, fractions: dict[CrowdLevel, float] | None = None) -> CrowdLevel:
    """Bucket a fraction of capacity into the five-level scale.

    Picks the level whose configured fraction is nearest, rather than using
    thresholds, so that re-tuning one level's fraction does not silently shift
    the boundaries of its neighbours.
    """
    table = fractions or DEFAULT_CROWD_FRACTIONS
    return min(table, key=lambda level: abs(table[level] - fraction))


def fraction_for_crowd_level(level: CrowdLevel, fractions: dict[CrowdLevel, float] | None = None) -> float:
    """Inverse of :func:`crowd_level_for_fraction`, for converting a report."""
    table = fractions or DEFAULT_CROWD_FRACTIONS
    return table[level]


def _headcount_band(
    fraction: float, capacity: int | None, confidence: float
) -> tuple[int | None, int | None]:
    """A plausible range, widening as confidence falls.

    The brief requires estimates to be presented honestly; a single number
    implies precision this evidence cannot support. The band is deliberately
    crude - half the remaining uncertainty either side - and is labelled an
    estimate wherever it is shown.
    """
    if not capacity or capacity <= 0:
        return None, None
    spread = (1.0 - confidence) * 0.5
    low = max(0.0, fraction - spread)
    high = min(1.0, fraction + spread) if fraction <= 1.0 else fraction + spread
    return round(low * capacity), round(high * capacity)
