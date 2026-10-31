# ADR-0014: Phase 4 — OR-Tools Solvers, Rotating QR Attendance, Copy-on-Write Scenarios, and Facilities Intelligence

- **Status:** Accepted
- **Date:** 2026-10-31
- **Phase:** 4 (`MASTER_PROMPT.md` §6.2, §13, §14)

## Context

Phase 4 adds Layer 3 (Academic Operations: lab & equipment booking prerequisites, exam seat planner, QR attendance, and accessibility-aware timetable optimiser) and Layer 4 (Facilities: ticket SLA escalation & metrics, deterministic room health score 0..100, smart cleaning route planner, and QR-labelled asset registry), backed by the shared Scenario Engine (§6.2).

## Decisions

### 1. Two-Stage Exam Seat Planner (`app/engines/exam_seating.py`, §13.2)
- **Stage 1** performs a capacity-aware room split across candidate rooms, respecting effective capacity at `min_spacing`, accessibility (`room_accessible`), front-row seat counts, and locked room/seat assignments.
- **Stage 2** solves seat assignment via **OR-Tools CP-SAT** (`ortools.sat.python.cp_model`) using boolean variables `x[student, seat]`, row spacing constraints, orthogonal and optional diagonal same-course adjacency separation, and accommodation constraints (`needs_accessible`, `needs_front_row`) with a deterministic `random_seed`.
- For very large halls (`num_students * num_seats > 25,000`) or solver timeouts (`UNKNOWN`), a deterministic constructive **consecutive-divide** heuristic fallback interleaves courses across alternating rows and columns.
- When an instance is infeasible, `_diagnose_infeasibility` computes the exact seat or accommodation deficit and returns an actionable message (e.g., `"22 more seats needed at spacing 2: reduce spacing or add a room"`).
- Student names in exports and slips are privacy-gated: only exam officers (`admin`, `staff`, `teacher`) or the individual student querying their own slip receive `student_name`.

### 2. Copy-on-Write Scenario Engine & CB-CTT Optimiser (`app/engines/timetable_optimiser.py`, §6.2, §13.4)
- Timetable optimisation is formulated as Curriculum-Based Course Timetabling (CB-CTT) in **OR-Tools CP-SAT** with integer weights, warm-started from the current schedule via `model.add_hint`.
- `requires_step_free = True` on a section or lecture is enforced as a **hard constraint** restricting placement to rooms with `accessible = True`.
- Incremental mode fixes non-movable lectures at their baseline `(room, day, slot)` and moves only the requested subset (or lectures in blocked rooms).
- Every run creates a `Scenario` and `ScenarioChange` rows (`scenario`, `scenario_change` tables) and **never mutates** live `meeting` or `meeting_rule` rows.

### 3. Rotating HMAC-SHA256 QR Attendance (`app/engines/attendance.py`, §13.3)
- Rotating QR tokens are derived on demand (`HMAC-SHA256(secret, session_id || floor(now / step))`, default `step = 20s`) and **never stored** in the database.
- `verify_rotating_qr_token` accepts the current window (`offset = 0`) and previous window (`offset = 1`) for clock skew, while explicitly rejecting expired and pre-generated future tokens.
- Soft device binding (`UserDevice` storing only a SHA-256 hash) and optional Haversine geofencing (default 50 m, off by default) are **weak signals**: mismatches route the scan to `pending_review` for the teacher rather than locking a student out of class. Student coordinates are never persisted.
- Opening an `AttendanceSession` immediately upgrades the meeting's confirmation state in `state_service` to `ConfirmationState.confirmed`. Each valid scan emits a `Signal(checkin)` and `OccupancyEstimate`, and closing the session folds the headcount into `AttendanceRate(section_id, weekday, hour)` via Beta-Binomial conjugate update (`update_attendance_prior`).

### 4. Deterministic Room Health Score, OR-Tools Cleaning Routes & Asset Registry (`app/engines/facilities.py`, §14.1–§14.4)
- **Room Health Score (0..100)** is a transparent deterministic formula starting at `100.0`, subtracting severity- and age-weighted active ticket penalties (plus 30 points when `blocks_use=True`), subtracting 90-day repeat-category penalties, adjusting for satisfaction ratings (`[1..5]`), and subtracting optional environmental out-of-band penalties (`CO2 > 1200 ppm` or temperature outside `[18, 27] °C`), clamped to `[0.0, 100.0]`.
- **Smart Cleaning Planner** scores room dirtiness from daily usage + deep-clean intervals, computes post-usage time windows, and solves per-cleaner routes using **OR-Tools Routing Solver** (`ortools.constraint_solver.pywrapcp`) with a `Time` dimension and a deterministic nearest-neighbour fallback.
- **Asset Registry** (`asset`, `asset_loan`) generates printable A4 QR code label sheets using `segno` + `reportlab`, tracks loans with due dates, logs usage hours and return condition, and flags overdue loans and preventive-maintenance thresholds.
