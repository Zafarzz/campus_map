"""Shared engines (brief section 6.2).

Build once, reuse everywhere. Before adding a layer-specific module, check
whether one of these already covers the need:

* :mod:`app.engines.recurrence` - expand a master recurrence rule into instants.
* :mod:`app.engines.room_state` - the state of a room as of any instant.
* :mod:`app.engines.evidence` - fuse signals into an occupancy estimate.
* :mod:`app.engines.booking` - conflict-proof reservation of any resource.
* :mod:`app.engines.timetable` - ingest a timetable from CSV, XLSX or ICS.

Everything here is **pure where it can be**: no module in this package opens a
database session. Orchestration that needs I/O lives in ``app.services``, which
loads the rows and hands them to these functions. That split is what makes the
state engine testable at an arbitrary instant and the estimator testable without
a database at all.
"""
