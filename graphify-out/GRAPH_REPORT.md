# Graph Report - campus-map  (2026-11-02)

## Corpus Check
- 330 files · ~362,348 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 19 file(s) not represented in the graph (top: (none) 8, .example 2, .po 2)

## Summary
- 4866 nodes · 13653 edges · 209 communities (168 shown, 41 thin omitted)
- Extraction: 90% EXTRACTED · 10% INFERRED · 0% AMBIGUOUS · INFERRED: 1357 edges (avg confidence: 0.94)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `70c24491`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- studentlife_service.py
- Hub
- TicketStatus
- geometry/types.ts
- App.tsx
- RoomStateKind
- test_import_service.py
- edupage_sync_service.py
- estimate_occupancy
- test_room_state.py
- Settings
- demo-campus.ts
- GameScene.tsx
- schedule_service.py
- parse_csv
- get_settings
- test_seed.py
- stream.py
- _slot
- test_state_api.py
- InProcessBroker
- test_crowds.py
- test_booking.py
- time.py
- import_service.py
- test_recurrence.py
- AmphitheaterHall.tsx
- sqlalchemy_ext_asyncio
- v1/studentlife.py
- state_service.py
- test_timetable_import.py
- v1/compat.py
- engines/studentlife.py
- CampusMap.tsx
- test_frontend_extract.py
- conftest.py
- api
- test_demo_schedule.py
- searchService.ts
- .from_default
- validate.py
- main.py
- domain/types.ts
- test_api.py
- campusService.ts
- Provenance
- env
- seed_demo_campus.py
- v1/campus.py
- EditorPage.tsx
- notification_service.py
- search_rooms
- pytest
- package.json
- security.py
- bookings.py
- cinematicStore.ts
- errors.py
- exportService.ts
- crowd_service.py
- attachmentStorage.ts
- config.py
- Room
- room_state.py
- Vegetation.tsx
- CampusFountain.tsx
- NotificationChannel
- expand_rule
- HistoryManager
- Содержание решений
- ResourceOccupancy
- ticket_service.py
- three
- v1/notifications.py
- DetailedBuilding.tsx
- base.py
- RecurrenceError
- campus_service.py
- compute_hourly_profile
- Campus Digital Twin Platform: Python Backend
- sqlalchemy_ext_asyncio
- propose_alternatives
- compat_service.py
- compilerOptions
- .from_json
- ColumnMapping
- v1/tickets.py
- storageService.ts
- js_literal.py
- env.py
- search_rooms
- fetch_edupage_timetable.py
- CampusAudioEngine
- GEOMETRY_SPEC — единая спецификация геометрии
- IMPLEMENTATION_PLAN — детальный план реализации
- json
- pathlib
- render_notification_template
- frontend
- backend-init
- react
- ContextLayer.tsx
- api
- db
- deploy-server.sh
- SportsComplexFacade.tsx
- capture_views.mjs
- engines/booking.py
- healthcheck
- now
- check_repo_safety.py
- SignalInput
- CinematicMode.tsx
- parse_xlsx
- services
- test_demo_schedule.py
- [0.2.0] — 2026-10-19 — Phase 2: Layer 0 core
- scheduled_session
- env_file
- build
- Runbooks
- _isolate_environment
- test_every_occurrence_keeps_its_local_wall_clock
- AGENTS.md — главный регламент работы AI-агентов
- ADR-0002: Python 3.13, with Docker as the canonical runtime
- ADR-0010: The timetable source is the university's public EduPage (aSc) export
- test_an_unbounded_rule_over_a_huge_window_hits_the_ceiling
- test_the_default_ceiling_is_documented_and_generous
- campus-backend
- settle_due_rooms
- Подробный перечень задач этапа C
- 2. Детальный аудит по корпусам
- TimetableRow
- ADR-0007: Seed by re-deriving the front end's room inventory, read-only
- Privacy
- 6. Contradictions and gaps found
- auth.py
- ImportReport
- Подробный перечень задач этапа B
- measure_state_performance.py
- MapProvider
- Performance: measured numbers for Layer 0
- CLAUDE.md
- .claude/CLAUDE.md
- StorageAdapter
- 2. Before & After Visual Comparison
- DECISIONS.md
- Role
- backend/CLAUDE.md — rules for agents working on the Campus Digital Twin backend
- 0. Start here: early steps, repository safety, database rules
- .parse
- 20. Layer 10: AI and intelligence
- PROPOSED_ROOT_CHANGES
- SpaceKind
- ADR-0006: The compatibility layer is a contract, not a convenience
- 21. Layer 11: Management analytics
- Timetable data and teachers' names
- Отчёт об импорте: Корпус A (1-й этаж, `bld-h-f1`)
- ADR-0001: Backend scope, and how it relates to ADR-013 ("no separate backend")
- loadCampus
- ImportDiff
- ADR-0004: SQLAlchemy 2.1 async + asyncpg + Alembic
- 13. Layer 3: Academic operations
- 14. Layer 4: Facilities
- 18. Layer 8: Outdoors and logistics
- 19. Layer 9: Events and admissions
- 2. Context
- confirmation_for
- 10. Layer 0: Core (timetable, room state, evidence, bookings, real time, history)
- Отчёт об импорте: Корпус D (1-й этаж, `bld-c-f1`)
- Отчёт об импорте: Корпус F (2-й этаж, `bld-d-f2`)
- Отчёт об импорте: Корпус B (1-й этаж, `bld-g-f1`)
- Отчёт об импорте: Корпус A (2-й этаж, `bld-h-f2`)
- ADR-0003: PostgreSQL 18, the `campus` schema, two roles, and explicit grants
- inventory
- ADR-0004: SQLAlchemy 2.1 async + asyncpg + Alembic
- dataclasses
- Отчёт об импорте: Корпус E (1-й этаж, `bld-b-f1`)
- 6. Architecture
- LocalDiskStorageAdapter
- tools/README.md
- CinematicRecorderEngine
- sniff_format
- current_principal
- CampusGeometry
- ExportReferenceScope
- ADR-0008: The front end's identifiers are the contract; aliases are many-to-many
- 3. Exact data shapes consumed
- adr/README.md
- test_submit_crowd_report_and_rate_limit
- test_generated_lessons_match_the_front_ends_picks
- test_the_compat_window_default_comes_from_settings
- test_ticket_blocks_use_overlays_room_out_of_service
- test_utc_conversion_is_lossless
- 5. Идентификаторы и метаданные (proposed)
- computeSemanticChanges
- ChannelAdapter

## God Nodes (most connected - your core abstractions)
1. `Settings` - 77 edges
2. `react` - 77 edges
3. `get_settings()` - 65 edges
4. `RoomStateKind` - 64 edges
5. `Base` - 63 edges
6. `Room` - 62 edges
7. `ValidationError` - 59 edges
8. `Resource` - 57 edges
9. `Meeting` - 53 edges
10. `parse_csv()` - 53 edges

## Surprising Connections (you probably didn't know these)
- `2. Фактический стек и ключевые точки входа` --references--> `CampusMap()`  [INFERRED]
  AGENTS.md → src/components/3d/CampusMap.tsx
- `3.5 Editor document (browser-local today) — `src/editor/domain/types.ts`` --references--> `EditorBuilding`  [INFERRED]
  backend/docs/FRONTEND_CONTRACT.md → src/editor/domain/types.ts
- `3. Поток данных: от источника геометрии до 3D [факт]` --references--> `CampusGeometry`  [INFERRED]
  docs/ARCHITECTURE.md → src/domain/geometry/types.ts
- `3.1 Иерархия` --references--> `CampusGeometry`  [INFERRED]
  docs/GEOMETRY_SPEC.md → src/domain/geometry/types.ts
- `9.1 Миграция v0 → v1 (текущий TS → документ)` --references--> `CampusGeometry`  [INFERRED]
  docs/GEOMETRY_SPEC.md → src/domain/geometry/types.ts

## Import Cycles
- None detected.

## Communities (209 total, 41 thin omitted)

### Community 0 - "studentlife_service.py"
Cohesion: 0.05
Nodes (52): has_exif_metadata(), InvalidImageError, strip_image_exif(), NotFoundError, LostFoundKind, LostFoundStatus, StudyGroupStatus, TeacherVisibilityMode (+44 more)

### Community 1 - "Hub"
Cohesion: 0.09
Nodes (8): _publish_changes(), InProcessBroker, Connection, Hub, Verification, Recorder, TestHub, TestInProcessBroker

### Community 2 - "TicketStatus"
Cohesion: 0.10
Nodes (8): TicketStatus, CandidateExistingTicket, compute_sla_due_at(), find_duplicate_ticket(), InvalidTicketTransitionError, is_ticket_blocking_room(), validate_ticket_transition(), TestTicketStateMachine

### Community 3 - "geometry/types.ts"
Cohesion: 0.05
Nodes (66): 3.4 Render contract (read-only reference) — `src/domain/geometry/types.ts`, 4. 3D-сцена [факт], 6. Ограничения и технический долг [факт], ADR-007: Аддитивное расширение render-модели для планировок этажей, 1.1 Единицы и оси, 1.3 Здания, 1.4 Этажи, 1.5 Помещения (+58 more)

### Community 4 - "App.tsx"
Cohesion: 0.12
Nodes (34): App(), AppLayout(), isEditorRoute(), LazyEditorPage, LazyGameScene, Breadcrumbs(), BuildingList(), FloorRoomList() (+26 more)

### Community 5 - "RoomStateKind"
Cohesion: 0.06
Nodes (42): RoomStateKind, RoomStateEvent, StateSnapshot, _details(), _differs(), events_since(), latest_sequence(), _latest_states() (+34 more)

### Community 6 - "test_import_service.py"
Cohesion: 0.07
Nodes (34): ImportBatch, MeetingRule, ImportStatus, rollback_import(), _apply(), campus_with_term(), test_a_conflicting_occupancy_is_skipped_and_reported_not_a_crash(), test_a_dry_run_records_its_report_for_audit() (+26 more)

### Community 7 - "edupage_sync_service.py"
Cohesion: 0.09
Nodes (18): extract_edupage_catalog(), _extract_tables(), parse_edupage(), _parse_hhmm(), _parse_weeks_mask(), pseudonymise_teacher(), resolve_edupage_room_code(), _safe_short_code() (+10 more)

### Community 8 - "estimate_occupancy"
Cohesion: 0.07
Nodes (13): SignalType, estimate_occupancy(), EstimatorConfig, _provenance_for(), _signal(), test_an_older_signal_never_pulls_harder_than_a_younger_one(), test_confidence_never_decreases_when_a_consistent_signal_is_added(), test_every_fraction_maps_to_some_crowd_level() (+5 more)

### Community 9 - "test_room_state.py"
Cohesion: 0.08
Nodes (40): state_at(), _context(), _lesson(), _local(), test_a_cancelled_slot_is_free_until_the_next_lesson(), test_a_days_walk_covers_the_day_in_fixed_steps(), test_a_free_room_in_service_is_bookable(), test_a_lesson_tomorrow_morning_does_not_make_tonight_starts_soon() (+32 more)

### Community 10 - "Settings"
Cohesion: 0.09
Nodes (3): Settings, settings_timezone(), Decision

### Community 11 - "demo-campus.ts"
Cohesion: 0.06
Nodes (55): 1.6 Идентификаторы (фактический формат), vitest, BuildingStructure, campusInfo, knownBuildings, buildBuilding(), buildFloor(), buildRoomsForFloor() (+47 more)

### Community 12 - "GameScene.tsx"
Cohesion: 0.08
Nodes (53): ADR-0001, react, @react-three/rapier, FOUNTAIN_DIMENSIONS, AMPHITHEATER_BUILDING, AmphitheaterHallSpec, ADR-0029, sortedFloors() (+45 more)

### Community 13 - "schedule_service.py"
Cohesion: 0.12
Nodes (14): Meeting, day_is_demo(), lessons_between(), lessons_by_room_for_day(), lessons_for_day(), lessons_for_room(), timetable_catalog(), res1_monday() (+6 more)

### Community 14 - "parse_csv"
Cohesion: 0.05
Nodes (6): parse_csv(), TestBrokenFile, TestCsvParsing, TestDiff, TestValidation, _validate()

### Community 15 - "get_settings"
Cohesion: 0.08
Nodes (20): _db(), healthz(), metrics(), readyz(), get_settings(), Database, get_database(), init_database() (+12 more)

### Community 16 - "test_seed.py"
Cohesion: 0.11
Nodes (14): Connector, test_block_letters_are_stored_not_derived(), test_buildings_without_any_plan_are_marked_demo(), test_campus_timezone_is_stored_on_the_row(), test_connectors_link_known_buildings_only(), test_demo_flag_mirrors_the_front_ends_provenance(), test_legacy_aliases_are_seeded(), test_room_order_within_a_floor_is_preserved() (+6 more)

### Community 17 - "stream.py"
Cohesion: 0.07
Nodes (16): _beat(), _current_sequence(), _error(), _send_catch_up(), _serve(), stream(), stream_changes(), _try_subscribe() (+8 more)

### Community 18 - "_slot"
Cohesion: 0.16
Nodes (3): BookingPolicy, validate_request(), TestValidation

### Community 19 - "test_state_api.py"
Cohesion: 0.05
Nodes (32): test_a_legacy_room_id_resolves_for_state_too(), test_a_naive_at_is_rejected_by_the_clean_api(), test_a_scheduled_lesson_is_unconfirmed_not_empty(), test_a_single_room_state_matches_the_bulk_answer(), test_a_utc_z_suffix_is_accepted(), test_an_out_of_range_window_is_rejected(), test_an_unknown_building_is_404(), test_an_unknown_room_state_is_404() (+24 more)

### Community 20 - "InProcessBroker"
Cohesion: 0.08
Nodes (5): Broker, get_broker(), RedisBroker, Subscription, TestBackpressure

### Community 21 - "test_crowds.py"
Cohesion: 0.06
Nodes (19): Provenance, building_distance_m(), calibrate_arrival_multiplier(), canteen_arrival_rate(), CanteenQueueConfig, CanteenQueueEstimate, ClassChangeFlowResult, compute_class_change_flows() (+11 more)

### Community 22 - "test_booking.py"
Cohesion: 0.06
Nodes (55): ConflictError, ValidationError, OccupancyStatus, Booking, Resource, free_windows(), _merge(), Slot (+47 more)

### Community 23 - "time.py"
Cohesion: 0.08
Nodes (24): campus_date(), campus_day_bounds(), campus_instant_at_minutes(), campus_local_naive(), ensure_aware(), minutes_since_campus_midnight(), parse_campus_local_naive(), to_campus() (+16 more)

### Community 24 - "import_service.py"
Cohesion: 0.10
Nodes (22): new_uuid(), parse_edupage(), apply_import(), ApplyResult, _build_rule(), _clear_term_rules(), count_batch_rows(), dry_run_import() (+14 more)

### Community 25 - "test_recurrence.py"
Cohesion: 0.10
Nodes (36): RecurrenceSpec, weekly_rrule(), _local_starts(), test_a_bare_yyyymmdd_exdate_is_accepted(), test_a_biweekly_rule_skips_the_odd_week(), test_a_date_only_exdate_removes_the_whole_local_day(), test_a_lesson_already_running_when_the_window_opens_is_included(), test_a_lesson_in_the_skipped_hour_of_a_spring_transition_still_resolves() (+28 more)

### Community 26 - "AmphitheaterHall.tsx"
Cohesion: 0.29
Nodes (14): AmphitheaterHall(), createAmphitheaterHipRoofGeometry(), createOctagonShape(), createTierRingGeometry(), StaircaseFlight(), ADR-0029, getAmphitheaterFloorLogoTexture(), getAmphitheaterScreenTexture() (+6 more)

### Community 28 - "v1/studentlife.py"
Cohesion: 0.08
Nodes (46): CrowdReportIn, ensure_principal_user(), get_best_time(), get_busyness(), get_canteen_queue(), get_display_view(), get_flows(), get_walking_check() (+38 more)

### Community 29 - "state_service.py"
Cohesion: 0.07
Nodes (26): StateOptions, _booking_confirmation(), _evaluate(), invalidate_state_cache(), _load_booking_intervals(), _load_meeting_intervals(), load_room_contexts(), _load_rooms() (+18 more)

### Community 30 - "test_timetable_import.py"
Cohesion: 0.07
Nodes (13): _coerce_date(), _coerce_int(), _coerce_time(), _coerce_week_pattern(), _ics_datetime(), _ics_exdates(), _ics_text(), _ics_until() (+5 more)

### Community 31 - "v1/compat.py"
Cohesion: 0.18
Nodes (10): compat_campus(), compat_campus_bare(), compat_catalog(), compat_lessons(), compat_live_counts(), compat_room_states(), _parse_compat_at(), _provenance_headers() (+2 more)

### Community 32 - "engines/studentlife.py"
Cohesion: 0.09
Nodes (11): compute_free_windows(), intersect_windows(), match_study_groups(), resolve_teacher_status(), score_study_pair(), StudyCandidate, StudyGroupMatchProposal, TimeWindow (+3 more)

### Community 33 - "CampusMap.tsx"
Cohesion: 0.11
Nodes (24): 1.2 Начало координат кампуса, dependencies, leva@^0.10.1, react@^19.3.0, @react-three/drei@^10.7.9, @react-three/fiber@^9.8.1, @react-three/rapier@^2.2.0, three@^0.186.1 (+16 more)

### Community 34 - "test_frontend_extract.py"
Cohesion: 0.07
Nodes (24): JsLiteralError, parse_js_literal(), strip_comments(), test_booleans_and_null(), test_building_id_to_block_letter_mapping(), test_committed_snapshot_matches_the_front_end(), test_confirmed_cad_rooms_keep_their_stable_ids(), test_connectors_are_extracted() (+16 more)

### Community 35 - "conftest.py"
Cohesion: 0.06
Nodes (24): create_engine(), text(), anyio_backend(), clean_database(), client(), database(), frontend_src(), _maintenance_url() (+16 more)

### Community 36 - "api"
Cohesion: 0.05
Nodes (42): build, command, depends_on, env_file, environment, ports, restart, volumes (+34 more)

### Community 37 - "test_demo_schedule.py"
Cohesion: 0.11
Nodes (8): DemoLesson, fnv1a_unit(), _pick(), _slot_instants(), _utf16_code_units(), test_a_character_outside_the_bmp_counts_as_two_code_units(), test_the_empty_seed_hashes_to_the_offset_basis(), test_the_hash_stays_in_the_unit_interval()

### Community 38 - "searchService.ts"
Cohesion: 0.10
Nodes (34): createDemoSchedule(), groups, pick(), professors, rand(), subjects, Lesson, EMPTY_TIMETABLE_CATALOG (+26 more)

### Community 39 - ".from_default"
Cohesion: 0.09
Nodes (6): AttendancePrior, schedule_prior(), update_attendance_prior(), test_the_attendance_posterior_is_always_a_valid_rate(), TestAttendancePrior, TestSchedulePrior

### Community 40 - "validate.py"
Cohesion: 0.06
Nodes (17): _build_diff(), _build_lookup(), _dates_overlap(), _find_double_bookings(), _find_walking_transition_warnings(), Issue, IssueCode, _local_time_exists() (+9 more)

### Community 41 - "main.py"
Cohesion: 0.05
Nodes (13): dispose_database(), configure_logging(), get_logger(), _header(), _inject_request_id(), RequestContextMiddleware, MetricsMiddleware, _route_template() (+5 more)

### Community 42 - "domain/types.ts"
Cohesion: 0.12
Nodes (39): ADR-0023, 10. Архитектура 2D Visual Editor (`src/editor/`) [факт], Vec2, CHANGE_CATEGORY_LABELS, AlignmentGuide, DragState, EditorCanvasProps, HandleType (+31 more)

### Community 43 - "test_api.py"
Cohesion: 0.09
Nodes (26): test_a_current_id_wins_over_an_alias(), test_a_legacy_room_id_resolves_to_its_current_room(), test_an_ambiguous_legacy_id_is_a_409_not_a_guess(), test_an_inbound_request_id_is_honoured(), test_building_detail_reports_room_counts_per_floor(), test_building_rooms_are_ordered_by_floor(), test_clean_campus_endpoint(), test_compat_block_a_rooms_come_from_the_cad_drawings() (+18 more)

### Community 44 - "campusService.ts"
Cohesion: 0.12
Nodes (22): BackendLivePanel(), fmtClock(), LEVEL_COLOR, pad(), BackendLive, BusynessPlace, markAutoReloaded(), pad() (+14 more)

### Community 45 - "Provenance"
Cohesion: 0.12
Nodes (16): BuildingSummaryOut, OccurrenceOut, RoomStateOut, StateModel, StateResponse, TransitionOut, TransitionsResponse, get_room_state() (+8 more)

### Community 46 - "env"
Cohesion: 0.06
Nodes (35): concurrency, cancel-in-progress, group, if, name, needs, runs-on, steps (+27 more)

### Community 47 - "seed_demo_campus.py"
Cohesion: 0.12
Nodes (16): extract_inventory(), ExtractedBuilding, ExtractedConnector, ExtractedFloor, ExtractedRoom, _opt_int(), _opt_str(), _read() (+8 more)

### Community 48 - "v1/campus.py"
Cohesion: 0.17
Nodes (16): ApiModel, BuildingDetailOut, BuildingOut, CampusDetailOut, CampusOut, Computed, ConnectorOut, FloorDetailOut (+8 more)

### Community 49 - "EditorPage.tsx"
Cohesion: 0.20
Nodes (32): revertIndividualChange(), EditorCanvas(), EditorLeftPanel(), EditorPage(), EditorTopBar(), VersionHistoryModal(), addBuildingToDoc(), addFloorToDoc() (+24 more)

### Community 50 - "notification_service.py"
Cohesion: 0.20
Nodes (7): UserRole, Notification, acknowledge_notification(), broadcast_notification(), list_user_notifications(), register_push_subscription(), send_notification()

### Community 51 - "search_rooms"
Cohesion: 0.22
Nodes (4): rank_candidates(), _reason_for(), RoomCandidate, TestRanking

### Community 52 - "pytest"
Cohesion: 0.12
Nodes (19): AppEnv, build(), test_campus_timezone_is_required(), test_campus_timezone_must_be_a_real_iana_zone(), test_campus_timezone_rejects_an_empty_string(), test_compat_window_defaults_to_the_front_ends_value(), test_cors_origins_are_parsed_and_trimmed(), test_development_allows_the_conveniences() (+11 more)

### Community 53 - "package.json"
Cohesion: 0.09
Nodes (28): react-dom@^19.3.0, devDependencies, @types/react@^19.3.0, @types/react-dom@^19.3.0, @types/three@^0.186.0, typescript@^7.0.2, vite@^8.3.3, @vitejs/plugin-basic-ssl@^2.3.0 (+20 more)

### Community 54 - "security.py"
Cohesion: 0.12
Nodes (8): hash_password(), require_roles(), verify_password(), test_empty_password_is_refused(), test_hash_format_is_self_describing(), test_hashes_are_salted(), test_password_round_trip(), test_verify_rejects_malformed_input_without_raising()

### Community 55 - "bookings.py"
Cohesion: 0.16
Nodes (10): BookingCreate, BookingOut, cancel_booking(), check_in(), create_booking(), list_bookings(), _may_act_on(), _out() (+2 more)

### Community 56 - "cinematicStore.ts"
Cohesion: 0.06
Nodes (58): CameraTimeline(), fmt(), CinematicCameraController(), poseAt(), Controls, isTyping(), MAX_BANK, SavedCamera (+50 more)

### Community 57 - "errors.py"
Cohesion: 0.12
Nodes (13): AmbiguousAliasError, AppError, _code_for_status(), error_payload(), NotImplementedYetError, register_exception_handlers(), _app_error(), _http_error() (+5 more)

### Community 58 - "exportService.ts"
Cohesion: 0.14
Nodes (24): buildCampusEditZipPackage(), downloadCampusEditZip(), escapeXml(), EXPORT_SCHEMA_VERSION, ExportedObjectReferencesMetadata, ExportedReferencePhotoEntry, generateCampusOverviewSvg(), generateFloorPlanSvg() (+16 more)

### Community 59 - "crowd_service.py"
Cohesion: 0.10
Nodes (22): PlaceKind, ReporterReliability, BusynessSnapshot, Place, check_walking_transitions(), ScheduledTransitionSlot, WalkingCheckConfig, WalkingTransitionIssue (+14 more)

### Community 60 - "attachmentStorage.ts"
Cohesion: 0.16
Nodes (23): EditorRightPanel(), DIRECTION_PRESETS, formatBytes(), PhotoAttachmentsSection(), base64ToUint8(), clearAllAttachmentBlobs(), createPhotoAttachmentFromFile(), deleteAttachmentBlob() (+15 more)

### Community 61 - "config.py"
Cohesion: 0.14
Nodes (12): compose(), main(), main(), psql(), restore(), row_counts(), run(), self_test() (+4 more)

### Community 62 - "Room"
Cohesion: 0.14
Nodes (20): DataProvenance, SeedRun, Building, Campus, Floor, Room, RoomAlias, campus_counts() (+12 more)

### Community 63 - "room_state.py"
Cohesion: 0.08
Nodes (13): Interval, next_transition_at(), RoomContext, RoomState, states_for_day(), summarise(), _without_overlay(), test_a_days_walk_handles_a_long_dst_day() (+5 more)

### Community 64 - "Vegetation.tsx"
Cohesion: 0.08
Nodes (32): AJOU_ART_DIMENSIONS, AJOU_ART_MATERIALS, AjouArtObjectProps, BOOK_PALETTE, LIBRARY_LAYOUT, LIBRARY_ROOM_ID, Props, computeShrubPlacements() (+24 more)

### Community 65 - "CampusFountain.tsx"
Cohesion: 0.11
Nodes (20): ADR-027: Двусторонний пальмовый променад и высокодетализированные 3D-пальмы, AUT_EMBLEM_POLY_0, AUT_EMBLEM_POLY_1, CampusFountainProps, createMergedPalmCrownGeometry(), createPalmFrondGeometry(), FOUNTAIN_MATERIALS, createDropletTexture() (+12 more)

### Community 66 - "NotificationChannel"
Cohesion: 0.14
Nodes (9): default_channel_adapters(), DeliveryResult, EmailAdapter, InAppAdapter, SmsAdapter, TelegramAdapter, WebPushAdapter, NotificationChannel (+1 more)

### Community 67 - "expand_rule"
Cohesion: 0.15
Nodes (7): _build_rule(), expand_rule(), _extend_bare_until(), _is_excluded(), _normalise_exdates(), Occurrence, parse_local_naive()

### Community 69 - "Содержание решений"
Cohesion: 0.07
Nodes (28): 9. Архитектурное разделение слоёв и визуальная подсистема (Этап C) [факт], ADR-001: Система единиц и мировых осей, ADR-002: Фиксация мирового начала координат кампуса (datum), ADR-004: Фиксированная последовательность этапов A → B → C, ADR-005: Отдельная authoring-модель `CampusDocument` в формате JSON, ADR-006: Локальные системы координат зданий и конвенция `yaw`, ADR-008: Стабильные идентификаторы и таблица алиасов `legacyIds`, ADR-009: Разделение оболочки (shell) и интерьера помещений (+20 more)

### Community 70 - "ResourceOccupancy"
Cohesion: 0.19
Nodes (11): OccupancyKind, ResourceOccupancy, make_resource(), period(), test_a_booking_may_start_exactly_when_a_lesson_ends(), test_a_cancelled_occupancy_frees_its_slot(), test_an_empty_period_is_refused(), test_btree_gist_and_the_exclusion_constraint_exist() (+3 more)

### Community 71 - "ticket_service.py"
Cohesion: 0.20
Nodes (8): Ticket, TicketEvent, create_ticket(), get_ticket_with_events(), list_tickets(), rate_ticket(), sync_room_out_of_service(), transition_ticket()

### Community 72 - "three"
Cohesion: 0.15
Nodes (22): three, windowTexture, AjouLogoMedallion(), AjouLogoMedallionProps, BlockCFacade(), BlockCFacadeProps, BlockFFacade(), BlockFFacadeProps (+14 more)

### Community 73 - "v1/notifications.py"
Cohesion: 0.19
Nodes (7): ack_notification(), broadcast(), BroadcastIn, list_notifications(), PushSubscriptionIn, register_push(), _serialize_notification()

### Community 74 - "DetailedBuilding.tsx"
Cohesion: 0.08
Nodes (35): 1. Root-Cause Diagnosis, ClassicalPortico(), createTrueHipRoofGeometry(), DetailedBuilding(), EntrancePortal(), getFootprintMetrics(), HipRoof(), InstancedWindows() (+27 more)

### Community 75 - "base.py"
Cohesion: 0.05
Nodes (40): upgrade(), upgrade(), downgrade(), upgrade(), Base, Course, MeetingOverride, Section (+32 more)

### Community 76 - "RecurrenceError"
Cohesion: 0.13
Nodes (9): _apply_override(), OverrideSpec, RecurrenceError, test_a_cancelled_occurrence_stays_in_the_series_flagged(), test_a_dtstart_with_an_offset_is_rejected(), test_a_move_override_without_a_new_start_is_rejected(), test_an_exdate_matches_the_original_start_not_a_moved_one(), test_an_override_that_ends_before_it_starts_is_rejected() (+1 more)

### Community 77 - "campus_service.py"
Cohesion: 0.18
Nodes (10): CampusTree, count_rooms_per_floor(), get_building(), _get_campus_by_id(), get_default_campus(), get_room(), list_building_rooms(), list_buildings() (+2 more)

### Community 78 - "compute_hourly_profile"
Cohesion: 0.13
Nodes (6): BestTimeProfile, compute_hourly_profile(), compute_schedule_proxy_by_how(), HourlyBucketProfile, _time_to_seconds(), TestBestTimeToGo

### Community 79 - "Campus Digital Twin Platform: Python Backend"
Cohesion: 0.10
Nodes (20): 11. Layer 1: Crowds ("how busy is it right now?"), 12. Layer 2: Student life, 15. Layer 5: Energy and sustainability, 16. Layer 6: Safety and emergency, 17. Layer 7: Accessibility and routing, 1. Role and mission, 22. Phase plan, 23. Definition of done (every phase) (+12 more)

### Community 80 - "sqlalchemy_ext_asyncio"
Cohesion: 0.06
Nodes (16): get_import(), import_timetable(), list_imports(), _parse_column_map(), rollback_import(), get_session(), NotificationStatus, AppUser (+8 more)

### Community 82 - "compat_service.py"
Cohesion: 0.13
Nodes (10): CompatLesson, CompatRoomScheduleState, building_to_compat(), campus_to_compat(), interval_to_compat_lesson(), _lesson_id(), meeting_to_compat(), room_state_to_compat() (+2 more)

### Community 83 - "compilerOptions"
Cohesion: 0.12
Nodes (16): compilerOptions, allowJs, allowSyntheticDefaultImports, forceConsistentCasingInFileNames, isolatedModules, jsx, lib, module (+8 more)

### Community 85 - "ColumnMapping"
Cohesion: 0.18
Nodes (3): _normalise(), _squash(), TestColumnMapping

### Community 86 - "v1/tickets.py"
Cohesion: 0.18
Nodes (9): create_ticket(), get_ticket(), list_tickets(), rate_ticket(), _serialize_ticket(), TicketCreateIn, TicketRatingIn, TicketTransitionIn (+1 more)

### Community 87 - "storageService.ts"
Cohesion: 0.33
Nodes (16): createInitialDocument(), createInitialOutdoorElements(), pxRectToMeters(), VersionType, createNamedVersion(), deleteVersion(), initStorage(), isIDBAvailable() (+8 more)

### Community 88 - "js_literal.py"
Cohesion: 0.27
Nodes (12): _Cursor, _find_declaration(), find_export(), _parse_array(), _parse_key(), _parse_keyword(), _parse_number(), _parse_object() (+4 more)

### Community 89 - "env.py"
Cohesion: 0.23
Nodes (5): _configure(), do_run_migrations(), run_migrations_offline(), run_migrations_online(), _set_search_path()

### Community 90 - "search_rooms"
Cohesion: 0.18
Nodes (4): _feature_keys(), _free_minutes(), _has_features(), search_rooms()

### Community 91 - "fetch_edupage_timetable.py"
Cohesion: 0.32
Nodes (8): fetch_timetable(), list_timetables(), main(), _post(), room_report(), run(), summarise(), tables_of()

### Community 93 - "GEOMETRY_SPEC — единая спецификация геометрии"
Cohesion: 0.11
Nodes (19): 10. Открытые вопросы, влияющие на эту спецификацию, 2. Принципы целевой модели (proposed), 3.1 Иерархия, 3.2 Campus datum, 3.3 Конвенция поворота `yaw`, 3.4 Высоты, 3.5 Ориентация полигонов, 3. Системы координат (proposed) (+11 more)

### Community 94 - "IMPLEMENTATION_PLAN — детальный план реализации"
Cohesion: 0.18
Nodes (11): IMPLEMENTATION_PLAN — детальный план реализации, Входные зависимости, Входные зависимости, Общая дорожная карта, Открытые вопросы, блокирующие этапы, Условия перехода к Этапу B (Gate A → B), Условия перехода к Этапу C (Gate B → C), Цель этапа (+3 more)

### Community 95 - "json"
Cohesion: 0.22
Nodes (5): FrontendInventory, _validate(), build_snapshot(), main(), summarise()

### Community 96 - "pathlib"
Cohesion: 0.18
Nodes (4): clear_cache(), negotiate_locale(), ngettext(), _translation()

### Community 97 - "render_notification_template"
Cohesion: 0.19
Nodes (4): render_notification_template(), RenderedNotification, _SafeFormatDict, TestNotificationTemplates

### Community 98 - "frontend"
Cohesion: 0.18
Nodes (11): condition, api, VITE_BACKEND_PROXY_TARGET, VITE_WATCH_POLLING, depends_on, environment, image, ports (+3 more)

### Community 99 - "backend-init"
Cohesion: 0.18
Nodes (11): depends_on, command, condition, depends_on, image, restart, volumes, condition (+3 more)

### Community 100 - "react"
Cohesion: 0.18
Nodes (15): ADR-020: Межкорпусные переходы (Connectors) как отдельная сущность геометрии, CampusConnectors(), createConnectorHipRoofGeometry(), GlazedConnectorMesh(), Props, ADR-0020, ADR-0029, BirchTreesGroup() (+7 more)

### Community 101 - "ContextLayer.tsx"
Cohesion: 0.10
Nodes (34): AjouArtObject(), CampusFountain(), CampusWalkways(), createPaverTexture(), WalkwaySegment, contextColors, ContextLayer(), ContextTuning (+26 more)

### Community 102 - "api"
Cohesion: 0.20
Nodes (10): command, environment, image, ports, pull_policy, restart, volumes, environment (+2 more)

### Community 103 - "db"
Cohesion: 0.20
Nodes (10): entrypoint, environment, image, ports, restart, volumes, POSTGRES_DB, POSTGRES_INITDB_ARGS (+2 more)

### Community 104 - "deploy-server.sh"
Cohesion: 0.51
Nodes (9): backup_db_if_migrations_changed(), compose(), detect_docker(), log(), main(), rollback(), deploy-server.sh script, sync_demo_inventory_if_needed() (+1 more)

### Community 105 - "SportsComplexFacade.tsx"
Cohesion: 0.23
Nodes (12): getSportsMeshTexture(), CommemorativeStela(), createGableRoofGeometry(), EntranceVestibule(), SportsComplexFrontFacade(), SportsComplexFrontFacadeProps, SportsComplexRoof(), SportsComplexRoofProps (+4 more)

### Community 107 - "engines/booking.py"
Cohesion: 0.19
Nodes (4): _opening_hours_violations(), violation(), PolicyViolation, ViolationCode

### Community 108 - "healthcheck"
Cohesion: 0.54
Nodes (8): healthcheck, healthcheck, healthcheck, interval, retries, start_period, test, timeout

### Community 109 - "now"
Cohesion: 0.11
Nodes (11): CompatBuilding, CompatCampus, CompatCampusResponse, CompatCatalogResponse, CompatFloor, CompatLessonsResponse, CompatLiveCountsResponse, CompatMeta (+3 more)

### Community 110 - "check_repo_safety.py"
Cohesion: 0.23
Nodes (11): Baseline, CheckError, collect_findings(), find_repo_root(), Findings, git(), is_waived(), load_baseline() (+3 more)

### Community 112 - "CinematicMode.tsx"
Cohesion: 0.15
Nodes (30): CameraKeyframeList(), KeyframeInspector(), NumField(), CameraPresets(), CameraSettings(), CinematicButton(), CinematicOverlay(), PathStorage() (+22 more)

### Community 113 - "parse_xlsx"
Cohesion: 0.13
Nodes (4): parse_xlsx(), ParseResult, ColumnMapping, TestXlsxParsing

### Community 114 - "services"
Cohesion: 0.33
Nodes (5): name, name, services, volumes, pgdata

### Community 115 - "test_demo_schedule.py"
Cohesion: 0.11
Nodes (15): generate_demo_lessons(), _generate_one(), test_a_slot_crossing_midnight_rolls_to_the_next_day(), test_bulk_occupancy_matches_javascript_exactly(), test_classrooms_draw_from_the_subject_list(), test_different_dates_give_different_timetables(), test_every_generated_interval_is_non_empty_and_aware(), test_generation_is_deterministic() (+7 more)

### Community 116 - "[0.2.0] — 2026-10-19 — Phase 2: Layer 0 core"
Cohesion: 0.25
Nodes (7): [0.2.0] — 2026-10-19 — Phase 2: Layer 0 core, Added, Changed, Changelog, Fixed, Known limits, Measured

### Community 118 - "env_file"
Cohesion: 0.60
Nodes (5): env_file, env_file, env_file, path, required

### Community 119 - "build"
Cohesion: 0.60
Nodes (5): build, context, dockerfile, target, build

### Community 120 - "Runbooks"
Cohesion: 0.17
Nodes (11): Applying a schema change, Backup and restore, Local stack will not start, Proving nothing outside `backend/` changed, Refreshing the timetable snapshot, `relation "campus" does not exist` or `permission denied for schema campus`, Resetting the local database completely, Rolling back a migration (+3 more)

### Community 123 - "AGENTS.md — главный регламент работы AI-агентов"
Cohesion: 0.18
Nodes (11): 1. О проекте и его целях, 2. Фактический стек и ключевые точки входа, 3. Комплект архитектурной документации, 4. Золотые правила для AI-агентов (Gemini & Claude), 5. Инструкции по этапам работ, 6. Правила проверки и тестирования, AGENTS.md — главный регламент работы AI-агентов, Для агентов Этапа A (Точные планировки) (+3 more)

### Community 124 - "ADR-0002: Python 3.13, with Docker as the canonical runtime"
Cohesion: 0.33
Nodes (5): ADR-0002: Python 3.13, with Docker as the canonical runtime, Alternatives rejected, Consequences, Context, Decision

### Community 129 - "ADR-0010: The timetable source is the university's public EduPage (aSc) export"
Cohesion: 0.40
Nodes (4): ADR-0010: The timetable source is the university's public EduPage (aSc) export, Alternatives rejected, Consequences, Context

### Community 137 - "settle_due_rooms"
Cohesion: 0.06
Nodes (15): get_scheduler(), JobScheduler, settle_due_rooms(), SettleResult, TransitionRunner, ADR-0011: APScheduler for scheduled work, with the transition scheduler on its own timer, Context, Decision (+7 more)

### Community 138 - "Подробный перечень задач этапа C"
Cohesion: 0.20
Nodes (10): Входные зависимости, Задача C1: Локализация ассетов и отказ от внешних CDN, Задача C2: Конфигурация стилей фасадов и архитектурных деталей, Задача C3: Освещение, тени и глубина сцены, Задача C4: Детерминированное благоустройство и растительность, Задача C5: Оптимизация производительности и профилирование, Задача C6: Финальная приёмка качества, Подробный перечень задач этапа C (+2 more)

### Community 139 - "2. Детальный аудит по корпусам"
Cohesion: 0.20
Nodes (9): 1. Общий состав листов, 2.1 Корпус A (Главный учебный корпус, `bld-h` в репозитории), 2.2 Корпус B (`bld-g` в репозитории), 2.3 Корпус D (Инженерный корпус, `bld-c` в репозитории), 2.4 Корпус E (Архитектурный корпус, `bld-b` в репозитории), 2.5 Корпус F (Амфитеатры и мультимедиа, `bld-d` в репозитории), 2. Детальный аудит по корпусам, 3. Таблица сопоставления идентификаторов зданий (+1 more)

### Community 140 - "TimetableRow"
Cohesion: 0.14
Nodes (4): TimetableRow, test_a_single_well_formed_row_always_validates(), test_every_row_is_either_usable_or_has_a_reported_issue(), TestRowIdentity

### Community 141 - "ADR-0007: Seed by re-deriving the front end's room inventory, read-only"
Cohesion: 0.33
Nodes (5): ADR-0007: Seed by re-deriving the front end's room inventory, read-only, Alternatives rejected, Consequences, Context, Decision

### Community 142 - "Privacy"
Cohesion: 0.33
Nodes (5): Configurable assumptions, Open question for the owner, Privacy, Status after Phase 1, Still to document (later phases)

### Community 143 - "6. Contradictions and gaps found"
Cohesion: 0.12
Nodes (17): 1. Files read, in the order required by §0.1 step 2, 2.1 The project's own staged roadmap (not the backend's), 2. What the product is, in my own words, 5.1 The authoritative building ↔ block mapping (`PDF_INVENTORY.md` §3, Q3 resolved), 5. Decisions already made (so I do not re-decide them), 6. Contradictions and gaps found, 7. My open questions (backend-specific), 8. What the documents tell me to do, and to avoid (+9 more)

### Community 144 - "auth.py"
Cohesion: 0.15
Nodes (6): dev_token(), DevTokenRequest, me(), PrincipalResponse, TokenResponse, get_request_id()

### Community 146 - "Подробный перечень задач этапа B"
Cohesion: 0.22
Nodes (9): Задача B1: Централизованный DocumentStore и Command Pattern, Задача B2: Интерактивный векторный 2D-вьюпорт (SVG), Задача B3: Редактирование корпусов и привязка к сетке (Snapping), Задача B4: Инструменты редактирования стен и проёмов, Задача B5: Редактирование пространств и метаданных помещений, Задача B6: Валидация в реальном времени и панель ошибок, Задача B7: Синхронизация 2D ↔ 3D и экспорт документа, Задача B8: Контрольная точка #3 и сдача этапа B (+1 more)

### Community 147 - "measure_state_performance.py"
Cohesion: 0.22
Nodes (4): main(), _report(), _synthesise(), _time_calls()

### Community 148 - "MapProvider"
Cohesion: 0.09
Nodes (30): Context, 1.1 Constraints this places on the backend, 1. Framework and build setup, 2. How the front end gets its data today, 4.1 ID formats actually in use, 4.2 The building ID ↔ block letter trap, 4.3 Room inventory the seeder must reproduce, 4. Identifiers and naming (+22 more)

### Community 149 - "Performance: measured numbers for Layer 0"
Cohesion: 0.25
Nodes (7): How to reproduce, Other measured figures, Performance: measured numbers for Layer 0, Reading the target correctly, Results, The whole-campus number is a known limit, What the optimisation actually was

### Community 152 - "StorageAdapter"
Cohesion: 0.08
Nodes (14): S3CompatibleStorageAdapter, StorageAdapter, StoredObject, [0.3.0] — 2026-10-21 — Phase 3: Crowds, Student Life & Shared Platform Services, Added, 2. State-Machine Guarded Ticket Engine with Room Blocking Integration, 3. Privacy-First Storage Adapter with EXIF Stripping & PII Masking, 4. Mathematical Rigor in Crowds & Queues (+6 more)

### Community 153 - "2. Before & After Visual Comparison"
Cohesion: 0.25
Nodes (7): 2. Before & After Visual Comparison, 3. Performance & Quality Preset Telemetry, Phase 2: Visual Reconstruction Report, View 1: Campus Overview (`/?cam=115,92,165,10,0,18`), View 2: Academic Building Facade, Glazing & Courtyard Trees (`[45, 2.2, 48], yaw: 2.85`), View 3: Ground Paving, Plaza Props & Approach (`[65, 2.2, 11.5], yaw: 1.85`), View 4: Grand Fountain, Pinnate Palms & Water Basin (`[26, 2.2, 31], yaw: 0.72`)

### Community 155 - "Role"
Cohesion: 0.14
Nodes (16): AuthenticationError, create_access_token(), decode_access_token(), Principal, Role, Decisions already encoded in the schema, test_admin_implies_every_role(), test_expired_token_is_rejected_with_a_specific_code() (+8 more)

### Community 156 - "backend/CLAUDE.md — rules for agents working on the Campus Digital Twin backend"
Cohesion: 0.29
Nodes (6): backend/CLAUDE.md — rules for agents working on the Campus Digital Twin backend, Database rules, Hard rules (never break these), How to run (filled in as Phase 1 lands), Project facts that are easy to get wrong, Working style

### Community 157 - "0. Start here: early steps, repository safety, database rules"
Cohesion: 0.29
Nodes (7): 0.1 Order of operations (do these first, in this order, before any feature work), 0.2 Repository safety rules ("do no harm"), 0.3 Where things go, 0.4 Database: PostgreSQL only, 0.5 Precedence when instructions conflict, 0.6 What the Phase 0 report contains, 0. Start here: early steps, repository safety, database rules

### Community 158 - ".parse"
Cohesion: 0.09
Nodes (11): Topic, ADR-0012: WebSocket topics over a broker, with an in-process fallback, Alternatives rejected, Backpressure: drop the oldest, count the loss, Context, Decision, The token travels in the query string, Topic widening lives in the hub (+3 more)

### Community 159 - "20. Layer 10: AI and intelligence"
Cohesion: 0.29
Nodes (7): 20.1 LLM adapter, 20.2 Natural-language assistant, 20.3 Forecasting, 20.4 Anomalies and alerts, 20.5 What-if sandbox, 20.6 Time machine, 20. Layer 10: AI and intelligence

### Community 160 - "PROPOSED_ROOT_CHANGES"
Cohesion: 0.29
Nodes (6): P-1 — Vite dev proxy so the front end can reach the API over the same origin, P-2 — Refresh `docs/ARCHITECTURE.md`, which is stale in six places, P-3 — Untrack `node_modules/` and `dist/` (TD-14, only half fixed), P-4 — Fix the duplicate `legacyId` in `src/data/floor-plans/index.ts`, P-5 — A CI workflow for the backend, PROPOSED_ROOT_CHANGES

### Community 161 - "SpaceKind"
Cohesion: 0.40
Nodes (4): SpaceKind, 4.1 Spatial, 4.3 Process vocabulary, 4. Vocabulary (as the repository uses it)

### Community 162 - "ADR-0006: The compatibility layer is a contract, not a convenience"
Cohesion: 0.33
Nodes (5): ADR-0006: The compatibility layer is a contract, not a convenience, Alternatives rejected, Consequences, Context, Decision

### Community 163 - "21. Layer 11: Management analytics"
Cohesion: 0.33
Nodes (6): 21.1 Metric definitions (one engine, one definition), 21.2 Dashboards (APIs), 21.3 "Do we need more space?", 21.4 Cost allocation, 21.5 Reports, 21. Layer 11: Management analytics

### Community 164 - "Timetable data and teachers' names"
Cohesion: 0.33
Nodes (5): Retention, Rules, Timetable data and teachers' names, What the source contains, Why names are handled carefully even though they are public

### Community 165 - "Отчёт об импорте: Корпус A (1-й этаж, `bld-h-f1`)"
Cohesion: 0.33
Nodes (5): 1. Параметры калибровки и привязки, 2. Экспликация помещений, 3. Вспомогательные зоны, 4. Результаты проверки, Отчёт об импорте: Корпус A (1-й этаж, `bld-h-f1`)

### Community 166 - "ADR-0001: Backend scope, and how it relates to ADR-013 ("no separate backend")"
Cohesion: 0.40
Nodes (4): ADR-0001: Backend scope, and how it relates to ADR-013 ("no separate backend"), Alternatives rejected, Consequences, Context

### Community 167 - "loadCampus"
Cohesion: 0.10
Nodes (26): Decision, The seams, and how the front end switches, 7.1 Compatibility endpoints (shapes from §3, verbatim), 7.2 Identifier stability guarantees, 7.3 Known risks to flag before Phase 1, 7. Proposed integration shape, 4.2 Time and state, After changing a model (+18 more)

### Community 169 - "ADR-0004: SQLAlchemy 2.1 async + asyncpg + Alembic"
Cohesion: 0.40
Nodes (4): ADR-0004: SQLAlchemy 2.1 async + asyncpg + Alembic, Alternatives rejected, Consequences, Context

### Community 170 - "13. Layer 3: Academic operations"
Cohesion: 0.40
Nodes (5): 13.1 Lab and equipment booking, 13.2 Exam seat planner, 13.3 QR attendance, 13.4 Timetable optimiser and accessibility-aware scheduling, 13. Layer 3: Academic operations

### Community 171 - "14. Layer 4: Facilities"
Cohesion: 0.40
Nodes (5): 14.1 Ticket engine, 14.2 Room health score (0 to 100), 14.3 Smart cleaning plans, 14.4 Asset registry, 14. Layer 4: Facilities

### Community 172 - "18. Layer 8: Outdoors and logistics"
Cohesion: 0.40
Nodes (5): 18.1 Parking without sensors, 18.2 Facility booking, 18.3 Visitor management, 18.4 Shuttle (optional, last in the phase), 18. Layer 8: Outdoors and logistics

### Community 173 - "19. Layer 9: Events and admissions"
Cohesion: 0.40
Nodes (5): 19.1 Events, 19.2 Hall layout designer, 19.3 Virtual tour, 19.4 Admissions journeys, 19. Layer 9: Events and admissions

### Community 174 - "2. Context"
Cohesion: 0.40
Nodes (5): 2.1 What already exists, 2.2 What you are building, 2.3 The core idea, 2.4 The hard problem, stated plainly, 2. Context

### Community 176 - "10. Layer 0: Core (timetable, room state, evidence, bookings, real time, history)"
Cohesion: 0.29
Nodes (7): 10.1 Timetable ingestion, 10.2 Room state engine, 10.3 Evidence store and occupancy estimator, 10.4 Booking engine, 10.5 Real-time delivery, 10.6 History (foundation of the "time machine"), 10. Layer 0: Core (timetable, room state, evidence, bookings, real time, history)

### Community 177 - "Отчёт об импорте: Корпус D (1-й этаж, `bld-c-f1`)"
Cohesion: 0.40
Nodes (4): 1. Параметры калибровки и привязки, 2. Экспликация помещений, 3. Вспомогательные зоны, Отчёт об импорте: Корпус D (1-й этаж, `bld-c-f1`)

### Community 178 - "Отчёт об импорте: Корпус F (2-й этаж, `bld-d-f2`)"
Cohesion: 0.40
Nodes (4): 1. Параметры калибровки, 2. Экспликация помещений, 3. Архитектурные особенности, Отчёт об импорте: Корпус F (2-й этаж, `bld-d-f2`)

### Community 179 - "Отчёт об импорте: Корпус B (1-й этаж, `bld-g-f1`)"
Cohesion: 0.40
Nodes (4): 1. Параметры калибровки, 2. Экспликация помещений, 3. Особенности планировки, Отчёт об импорте: Корпус B (1-й этаж, `bld-g-f1`)

### Community 180 - "Отчёт об импорте: Корпус A (2-й этаж, `bld-h-f2`)"
Cohesion: 0.40
Nodes (4): 1. Параметры калибровки, 2. Экспликация помещений, 3. Особенности планировки, Отчёт об импорте: Корпус A (2-й этаж, `bld-h-f2`)

### Community 181 - "ADR-0003: PostgreSQL 18, the `campus` schema, two roles, and explicit grants"
Cohesion: 0.40
Nodes (4): ADR-0003: PostgreSQL 18, the `campus` schema, two roles, and explicit grants, Alternatives rejected, Consequences, Context

### Community 183 - "ADR-0004: SQLAlchemy 2.1 async + asyncpg + Alembic"
Cohesion: 0.25
Nodes (7): include_object(), [0.1.0] — 2026-10-17 — Phase 1: Foundation, Added, Discovered, Fixed during development, Known limits, Decision

### Community 184 - "dataclasses"
Cohesion: 0.11
Nodes (7): CrowdLevel, _confidence_from_weight(), crowd_level_for_fraction(), Estimate, fraction_for_crowd_level(), _headcount_band(), TestCrowdLevels

### Community 185 - "Отчёт об импорте: Корпус E (1-й этаж, `bld-b-f1`)"
Cohesion: 0.50
Nodes (3): 1. Параметры калибровки, 2. Экспликация помещений, Отчёт об импорте: Корпус E (1-й этаж, `bld-b-f1`)

### Community 186 - "6. Architecture"
Cohesion: 0.67
Nodes (3): 6.1 Shape, 6.2 Shared engines (build once, reuse everywhere), 6. Architecture

### Community 189 - "CinematicRecorderEngine"
Cohesion: 0.21
Nodes (6): CinematicRecorderEngine, isRecordingSupported(), MIME_CANDIDATES, pickMimeType(), recorderEngine, RecorderOptions

### Community 192 - "CampusGeometry"
Cohesion: 0.06
Nodes (41): 2.1 Geometry is **not** a backend concern, 3.1 Hard architectural rules I must respect, 3.2 The golden rules for agents (`AGENTS.md` §4), 3.3 The target architecture the docs describe, 3. Architecture and implementation guidance given in the repo's docs, ADR-003: Сохранение публичного интерфейса `CampusGeometry` как render-контракта, 4.1 Расположение файлов, 4.2 Схема (TypeScript-нотация; будущий файл `src/domain/document/types.ts`) (+33 more)

### Community 193 - "ExportReferenceScope"
Cohesion: 0.43
Nodes (6): EditorTopBarProps, CanvasViewport, EditorTool, ExportReferenceScope, ExportManifest, ExportOptions

### Community 195 - "ADR-0008: The front end's identifiers are the contract; aliases are many-to-many"
Cohesion: 0.40
Nodes (4): ADR-0008: The front end's identifiers are the contract; aliases are many-to-many, Alternatives rejected, Consequences, Context

### Community 196 - "3. Exact data shapes consumed"
Cohesion: 0.33
Nodes (6): 3.1 Campus tree — `src/domain/campus/types.ts`, 3.2 Schedule — `src/domain/schedule/types.ts`, 3.3 Search — `src/services/search/searchService.ts`, 3.5 Editor document (browser-local today) — `src/editor/domain/types.ts`, 3.6 Configuration the backend must mirror — `src/config/mapConfig.ts`, 3. Exact data shapes consumed

### Community 197 - "adr/README.md"
Cohesion: 0.17
Nodes (9): ADR-0005: Modular monolith layout, Alternatives rejected, Decision, ADR-0009: UTC in the database, campus timezone in the API, no assumed default, Alternatives rejected, Consequences, Backend ADR index, Planned (+1 more)

### Community 198 - "test_submit_crowd_report_and_rate_limit"
Cohesion: 0.40
Nodes (3): test_busyness_api_endpoints(), test_ensure_default_places_and_list_busyness(), test_submit_crowd_report_and_rate_limit()

### Community 204 - "5. Идентификаторы и метаданные (proposed)"
Cohesion: 0.40
Nodes (5): 5.1 Общие правила, 5.2 Форматы новых ID, 5.3 Совместимость со старыми ID, 5.4 Метаданные, 5. Идентификаторы и метаданные (proposed)

### Community 205 - "computeSemanticChanges"
Cohesion: 0.50
Nodes (5): computeSemanticChanges(), numDiff(), photosDiff(), pickPrimaryCategory(), pointsDiff()

## Knowledge Gaps
- **23 isolated node(s):** `ADR-0020`, `ADR-0029`, `ADR-0029`, `ADR-0020`, `ADR-0029` (+18 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 1851 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **41 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `now()` connect `get_settings` to `RoomStateKind`, `test_import_service.py`, `edupage_sync_service.py`, `settle_due_rooms`, `fetch_edupage_timetable.py`, `Provenance`, `sqlalchemy_ext_asyncio`, `auth.py`, `stream.py`, `compat_service.py`, `MapProvider`, `security.py`, `time.py`, `test_booking.py`, `import_service.py`, `Role`, `v1/studentlife.py`, `v1/compat.py`?**
  _High betweenness centrality (0.346) - this node is a cross-community bridge._
- **Are the 31 inferred relationships involving `Settings` (e.g. with `healthz()` and `readyz()`) actually correct?**
  _`Settings` has 31 INFERRED edges - model-reasoned connections that need verification._
- **What connects `ADR-0020`, `ADR-0029`, `ADR-0029` to the rest of the system?**
  _23 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `studentlife_service.py` be split into smaller, more focused modules?**
  _Cohesion score 0.04685942173479561 - nodes in this community are weakly interconnected._
- **Why does `5. Live and Simulate time` connect `MapProvider` to `App.tsx`, `get_settings`?**
  _High betweenness centrality (0.338) - this node is a cross-community bridge._
- **Are the 48 inferred relationships involving `RoomStateKind` (e.g. with `BuildingSummaryOut` and `RoomStateOut`) actually correct?**
  _`RoomStateKind` has 48 INFERRED edges - model-reasoned connections that need verification._
- **Should `Hub` be split into smaller, more focused modules?**
  _Cohesion score 0.08701923076923077 - nodes in this community are weakly interconnected._