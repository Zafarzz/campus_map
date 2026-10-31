"""QR attendance pure engine (brief section 13.3).

Implements:
1. Rotating HMAC-SHA256 QR token generation and verification:
   ``token = HMAC-SHA256(server_secret, session_id || floor(now / step))``
   truncated, with current and previous window accepted to tolerate clock skew.
   Pre-generated future tokens and expired old tokens are strictly rejected.
2. Scan classification:
   * Punctual vs ``late`` after configurable ``late_after_minutes`` (default 30 min).
   * Enrolment check (enrolled student vs ``guest``).
   * Soft device binding: first device registers; a mismatch routes the scan to
     ``pending_review`` for the teacher instead of blocking the student.
   * Optional Haversine geofence (default 50 m, off by default): a weak signal
     that raises ``pending_review``, never a hard gate.
3. ISO-18004 QR code rendering (SVG and PNG) via ``segno``.

Nothing in this module performs database or network I/O.
"""

from __future__ import annotations

import hashlib
import hmac
import io
import math
import uuid
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta

import segno

__all__ = [
    "DEFAULT_GEOFENCE_RADIUS_M",
    "DEFAULT_LATE_AFTER_MINUTES",
    "DEFAULT_TOKEN_STEP_SECONDS",
    "RotatingQrToken",
    "ScanClassification",
    "TokenVerificationResult",
    "classify_attendance_scan",
    "generate_rotating_qr_token",
    "hash_device_identifier",
    "haversine_distance_metres",
    "render_qr_png",
    "render_qr_svg",
    "verify_rotating_qr_token",
]

#: Default QR rotation step in seconds (brief section 13.3: 20s, configurable 15..30).
DEFAULT_TOKEN_STEP_SECONDS = 20

#: Default late threshold in minutes after session start (brief section 13.3: 30 min).
DEFAULT_LATE_AFTER_MINUTES = 30

#: Default Haversine geofence radius in metres when geofencing is enabled (brief section 13.3: 50 m).
DEFAULT_GEOFENCE_RADIUS_M = 50.0

_TOKEN_HEX_LENGTH = 24
_EARTH_RADIUS_M = 6_371_000.0


@dataclass(frozen=True, slots=True)
class RotatingQrToken:
    """A time-stepped QR token for an active attendance session."""

    session_id: str
    token: str
    window: int
    step_seconds: int
    valid_from: datetime
    expires_at: datetime
    qr_payload: str


@dataclass(frozen=True, slots=True)
class TokenVerificationResult:
    """Outcome of checking a scanned QR token at instant ``at``."""

    valid: bool
    matched_window: int | None = None
    window_offset: int | None = None
    reason: str | None = None


@dataclass(frozen=True, slots=True)
class ScanClassification:
    """Computed attendance record state and review metadata for a valid scan."""

    #: "present" | "late" | "pending_review" | "guest"
    state: str
    is_late: bool
    is_enrolled: bool
    device_mismatch: bool
    geofence_flagged: bool
    distance_m: float | None
    review_reason: str | None
    device_To_register: str | None


def _compute_window_token(secret: str, session_id: str, window: int) -> str:
    if not secret:
        raise ValueError("secret must not be empty")
    msg = f"{session_id}:{window}".encode()
    digest = hmac.new(secret.encode("utf-8"), msg, hashlib.sha256).hexdigest()
    return digest[:_TOKEN_HEX_LENGTH]


def generate_rotating_qr_token(
    secret: str,
    session_id: uuid.UUID | str,
    at: datetime,
    *,
    step_seconds: int = DEFAULT_TOKEN_STEP_SECONDS,
) -> RotatingQrToken:
    """Derive the rotating QR token for ``session_id`` at ``at``.

    Pre-generating tokens for days ahead is deliberately unsupported: the token
    is a pure function of ``floor(at / step_seconds)``.
    """
    if at.tzinfo is None:
        raise ValueError("at must be timezone-aware")
    if not 10 <= step_seconds <= 120:
        raise ValueError(f"step_seconds must be between 10 and 120, got {step_seconds}")

    sid = str(session_id)
    epoch = int(at.timestamp())
    window = epoch // step_seconds
    token = _compute_window_token(secret, sid, window)
    valid_from = datetime.fromtimestamp(window * step_seconds, tz=UTC)
    expires_at = valid_from + timedelta(seconds=step_seconds)
    return RotatingQrToken(
        session_id=sid,
        token=token,
        window=window,
        step_seconds=step_seconds,
        valid_from=valid_from,
        expires_at=expires_at,
        qr_payload=f"aut-att:{sid}:{token}",
    )


def verify_rotating_qr_token(
    secret: str,
    session_id: uuid.UUID | str,
    candidate_token: str,
    at: datetime,
    *,
    step_seconds: int = DEFAULT_TOKEN_STEP_SECONDS,
    skew_windows: int = 1,
) -> TokenVerificationResult:
    """Verify ``candidate_token`` against the current and previous time windows.

    Accepts ``window`` (offset 0) and ``window - 1`` (up to ``skew_windows``) to
    tolerate projector latency and phone clock skew. Tokens from older windows
    or future windows are rejected with a specific reason.
    """
    if at.tzinfo is None:
        raise ValueError("at must be timezone-aware")
    if not 10 <= step_seconds <= 120:
        raise ValueError(f"step_seconds must be between 10 and 120, got {step_seconds}")
    if skew_windows < 0:
        raise ValueError("skew_windows must be non-negative")

    raw = candidate_token.strip()
    if raw.startswith("aut-att:"):
        parts = raw.split(":")
        if len(parts) == 3:
            raw = parts[2]

    sid = str(session_id)
    current_window = int(at.timestamp()) // step_seconds

    for offset in range(skew_windows + 1):
        target_window = current_window - offset
        expected = _compute_window_token(secret, sid, target_window)
        if hmac.compare_digest(raw, expected):
            return TokenVerificationResult(
                valid=True,
                matched_window=target_window,
                window_offset=offset,
                reason=None,
            )

    # Check whether the token was from a recently expired window (2..10 steps ago)
    # or a future window (1..5 steps ahead) so the error message is informative.
    for old_offset in range(skew_windows + 1, skew_windows + 10):
        expected_old = _compute_window_token(secret, sid, current_window - old_offset)
        if hmac.compare_digest(raw, expected_old):
            return TokenVerificationResult(
                valid=False,
                matched_window=current_window - old_offset,
                window_offset=old_offset,
                reason="token_expired",
            )

    for future_offset in range(1, 6):
        expected_future = _compute_window_token(secret, sid, current_window + future_offset)
        if hmac.compare_digest(raw, expected_future):
            return TokenVerificationResult(
                valid=False,
                matched_window=current_window + future_offset,
                window_offset=-future_offset,
                reason="future_token_rejected",
            )

    return TokenVerificationResult(
        valid=False,
        matched_window=None,
        window_offset=None,
        reason="invalid_token",
    )


def hash_device_identifier(raw_device_id: str, *, salt: str = "campus-attendance-device") -> str:
    """Hash a raw client device identifier so raw fingerprints are never stored."""
    cleaned = raw_device_id.strip()
    if not cleaned:
        raise ValueError("raw_device_id must not be empty")
    return hashlib.sha256(f"{salt}:{cleaned}".encode()).hexdigest()[:32]


def haversine_distance_metres(
    lat1: float,
    lon1: float,
    lat2: float,
    lon2: float,
) -> float:
    """Great-circle distance in metres between two WGS84 coordinates."""
    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    d_phi = math.radians(lat2 - lat1)
    d_lambda = math.radians(lon2 - lon1)

    a = math.sin(d_phi / 2.0) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(d_lambda / 2.0) ** 2
    c = 2.0 * math.atan2(math.sqrt(a), math.sqrt(max(0.0, 1.0 - a)))
    return _EARTH_RADIUS_M * c


def classify_attendance_scan(
    *,
    opened_at: datetime,
    scanned_at: datetime,
    late_after_minutes: int = DEFAULT_LATE_AFTER_MINUTES,
    is_enrolled: bool = True,
    registered_device_ref: str | None = None,
    scanned_device_ref: str | None = None,
    geofence_enabled: bool = False,
    geofence_radius_m: float = DEFAULT_GEOFENCE_RADIUS_M,
    room_lat_lon: tuple[float, float] | None = None,
    scan_lat_lon: tuple[float, float] | None = None,
) -> ScanClassification:
    """Classify a verified attendance scan according to brief section 13.3.

    * Scans after ``opened_at + late_after_minutes`` are recorded as ``late``,
      never rejected.
    * Soft device binding: if ``registered_device_ref`` is None and
      ``scanned_device_ref`` is provided, the device is registered on first use.
      If ``registered_device_ref`` differs from ``scanned_device_ref``, the scan
      is routed to ``pending_review`` rather than blocked.
    * Optional geofence: if enabled and coordinates exceed ``geofence_radius_m``,
      routes to ``pending_review`` as a weak signal, never a hard gate.
    """
    if opened_at.tzinfo is None or scanned_at.tzinfo is None:
        raise ValueError("opened_at and scanned_at must be timezone-aware")

    elapsed = scanned_at - opened_at
    is_late = elapsed > timedelta(minutes=max(0, late_after_minutes))

    device_mismatch = False
    device_to_register: str | None = None
    if scanned_device_ref:
        if registered_device_ref is None:
            device_to_register = scanned_device_ref
        elif registered_device_ref != scanned_device_ref:
            device_mismatch = True

    distance_m: float | None = None
    geofence_flagged = False
    if geofence_enabled and room_lat_lon is not None and scan_lat_lon is not None:
        distance_m = haversine_distance_metres(
            room_lat_lon[0],
            room_lat_lon[1],
            scan_lat_lon[0],
            scan_lat_lon[1],
        )
        if distance_m > geofence_radius_m:
            geofence_flagged = True

    reasons: list[str] = []
    if device_mismatch:
        reasons.append("device_mismatch")
    if geofence_flagged and distance_m is not None:
        reasons.append(f"geofence_distance_exceeded ({distance_m:.1f}m > {geofence_radius_m:.1f}m)")
    if is_late and (device_mismatch or geofence_flagged):
        reasons.append("scanned_after_late_threshold")

    if reasons:
        state = "pending_review"
        review_reason = "; ".join(reasons)
    elif not is_enrolled:
        state = "guest"
        review_reason = None
    elif is_late:
        state = "late"
        review_reason = None
    else:
        state = "present"
        review_reason = None

    return ScanClassification(
        state=state,
        is_late=is_late,
        is_enrolled=is_enrolled,
        device_mismatch=device_mismatch,
        geofence_flagged=geofence_flagged,
        distance_m=round(distance_m, 2) if distance_m is not None else None,
        review_reason=review_reason,
        device_To_register=device_to_register,
    )


def render_qr_svg(payload: str, *, scale: int = 5) -> str:
    """Render ``payload`` as an inline SVG string using ``segno``."""
    qr = segno.make(payload, error="m")
    buf = io.BytesIO()
    qr.save(buf, kind="svg", scale=scale, xmldecl=False)
    return buf.getvalue().decode("utf-8")


def render_qr_png(payload: str, *, scale: int = 6) -> bytes:
    """Render ``payload`` as PNG image bytes using ``segno``."""
    qr = segno.make(payload, error="m")
    buf = io.BytesIO()
    qr.save(buf, kind="png", scale=scale)
    return buf.getvalue()
