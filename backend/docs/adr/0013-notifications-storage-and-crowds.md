# ADR-0013: Notifications, Ticket Engine, File Storage, Crowds, and Student Life Architecture

- **Status:** accepted
- **Date:** 2026-10-21
- **Phase:** 3 (Shared Platform Services, Layer 1 Crowds, Layer 2 Student Life)

## Context

`MASTER_PROMPT.md` §6.2, §11, and §12 define the scope for Phase 3:
1. **Shared Platform Services (§6.2)**: A shared notification engine (audience resolution, locale catalogues for `en`, `ru`, `uz`, multi-channel delivery across `in_app`, `web_push`, `telegram`, `email`, `sms`, acknowledgement tracking, and audit logging for broadcasts); a shared issue and maintenance ticket engine with an enforceable legal state machine, SLA timers, duplicate merge with upvotes, room blocking (`blocks_use=True` setting `Room.out_of_service=True`), and satisfaction ratings.
2. **File Storage & Privacy (§12.2)**: Uploaded photos for maintenance tickets and lost-and-found items require EXIF stripping (removing GPS coordinates and camera metadata) and automated masking of sensitive identity numbers (Uzbek passports, PINFL, student IDs, payment card numbers) before persistence.
3. **Layer 1: Crowds (§11)**: Place busyness estimation combining timetable occupancy proxy with crowd reports; "best time to go" hour-of-week median/p80 profiles; class-change pedestrian corridor and entrance flows with trip conservation and differential privacy small-cell suppression (< 10); walking-time transition validation with building centroids and floor penalties; M/M/c Erlang C canteen queue waiting-time estimation.
4. **Layer 2: Student Life (§12)**: Opt-in study-group matcher computing free windows without leaking timetable intervals to peers, using `scipy.optimize.linear_sum_assignment` and greedy expansion; Lost & Found hybrid matching (TF-IDF + RapidFuzz + spatial + temporal) with verification question/answer claim flow; Dorm services reusing ticket and booking engines with exponential-decay machine statuses; Teacher finder with teacher-controlled visibility modes (default `off`), showing current status only and appointment booking.
5. **Performance & Caching (§10.2)**: In-memory per-minute-bucket cache on `state_service.load_room_contexts` with automatic invalidation on database write flushes.

## Decisions

### 1. Unified Multilingual Notification Catalogue and Pluggable Channels

All notifications are rendered from a centralized catalog (`NOTIFICATION_CATALOGUE`) supporting `en`, `ru`, and `uz` with explicit English fallback. Notification channels adhere to a common `ChannelAdapter` protocol:
- `in_app`: Writes directly to `notification` table with unread/read state and caller acknowledgment.
- `web_push`: Implements standard Web Push VAPID protocol endpoints using `PushSubscription` keys.
- `telegram`, `email`, `sms`: Extensible delivery adapters with structured metadata payloads.
- Broadcasts to roles or entire campus audiences record an immutable `AuditLog` entry detailing `actor_id`, `reason`, and recipient count.

### 2. State-Machine Guarded Ticket Engine with Room Blocking Integration

Ticket status updates strictly follow the transition graph:
`new` → `triaged` → `assigned` → `in_progress` → `resolved` → `closed` (plus `reopened` from `resolved`).
When a ticket is created with `blocks_use=True` for a room, it immediately flips `Room.out_of_service = True`. The room state engine overlays `out_of_service` with highest priority, removing the room from free-room searches. Resolving or closing the ticket automatically clears the room's out-of-service flag if no other open blocking tickets exist. Duplicate tickets submitted for the same room/place and category within 24 hours are merged and converted to upvotes on the original open ticket.

### 3. Privacy-First Storage Adapter with EXIF Stripping & PII Masking

The `StorageAdapter` interface (`LocalDiskStorageAdapter` and `S3CompatibleStorageAdapter`) guarantees that all user uploads pass through `strip_image_exif(bytes)` using Pillow, purging all GPS latitude, longitude, and device metadata before byte storage. All text fields in Lost & Found descriptions are passed through `mask_sensitive_text()`, replacing passport series, 14-digit PINFLs, 16-digit card numbers, and student IDs with redacted masks (`[REDACTED_ID]`, `[REDACTED_CARD]`).

### 4. Mathematical Rigor in Crowds & Queues

- **Canteen Queue Modeling**: Implements standard Erlang C ($M/M/c$) queueing equations with state probability $P_0$, wait probability $C(c, a)$, and expected delay $W_q = \frac{C(c, a)}{c\mu - \lambda}$. If arrival rate exceeds service capacity ($\rho \ge 1$), the model gracefully saturates rather than raising division by zero.
- **Pedestrian Flow Conservation**: Class-change flows preserve origin-destination headcount across 5-minute bins, and suppress counts $< 10$ to prevent deanonymizing individual student movements.
- **Walking Transitions**: Uses Euclidean distances calculated from official building centroids in meters, adding 15 meters equivalent penalty per floor change at a default $1.2\text{ m/s}$ walking speed.

### 5. Timetable Privacy in Student Life Services

Peer matching algorithms calculate pairwise mutual availability without returning raw calendar intervals. A student's timetable is never exposed to another student; only calculated mutual free windows and the status `'available'` are visible. Teacher visibility defaults to `'off'`, exposing only current real-time room or status when enabled, never historical presence or past movement.

### 6. Per-Minute-Bucket Room Context Cache with SQLAlchemy Invalidation

To maintain sub-100ms response times for large building status queries, `state_service.load_room_contexts` keys results on `(minute_bucket, building_id, room_ids, include_bookings, timezone)`. Automatic SQLAlchemy event listeners on `Session.after_flush` and `Session.after_soft_rollback` evict the cache immediately whenever any database entity is modified or rolled back.

## Consequences

- All notifications, tickets, crowd statistics, and student life entities have robust relational integrity, verified migrations, and full test coverage.
- Sensitive personal data (location coordinates in EXIF, personal document numbers) cannot be leaked via user uploads.
- The system never claims to measure real-time room occupancy directly; all estimations declare their provenance (`scheduled`, `reported`, `estimated`) and confidence.
