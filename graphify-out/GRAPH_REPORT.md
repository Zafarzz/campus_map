# Graph Report - campus-map  (2026-10-31)

## Corpus Check
- 318 files · ~336,940 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 19 file(s) not represented in the graph (top: (none) 8, .example 2, .po 2)

## Summary
- 4347 nodes · 12824 edges · 154 communities (109 shown, 45 thin omitted)
- Extraction: 91% EXTRACTED · 9% INFERRED · 0% AMBIGUOUS · INFERRED: 1131 edges (avg confidence: 0.93)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `c8a161d2`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- studentlife_service.py
- Hub
- ticket_service.py
- DetailedBuilding.tsx
- MapProvider.tsx
- RoomStateKind
- TestChannelAdapters
- base.py
- estimate_occupancy
- test_room_state.py
- get_settings
- adapter.ts
- GameScene.tsx
- v1/compat.py
- parse_csv
- Role
- ContextLayer.tsx
- main.py
- _slot
- test_state_api.py
- Subscription
- crowd_service.py
- test_booking.py
- time.py
- import_service.py
- test_recurrence.py
- sqlalchemy_ext_asyncio
- v1/studentlife.py
- state_service.py
- test_edupage_sync.py
- Room
- parsers.py
- Settings
- test_frontend_extract.py
- conftest.py
- api
- test_demo_schedule.py
- searchService.ts
- .from_default
- validate.py
- CampusMap.tsx
- domain/types.ts
- test_api.py
- Vegetation.tsx
- get_state
- env
- seed_demo_campus.py
- v1/campus.py
- EditorPage.tsx
- booking_service.py
- search_rooms
- pytest
- package.json
- CampusFountain.tsx
- bookings.py
- errors.py
- errors.py
- exportService.ts
- room_state.py
- attachmentStorage.ts
- argparse
- seed_demo_schedule
- CinematicMode.tsx
- schedule_service.py
- crowd_level_for_fraction
- scheduleService.ts
- expand_rule
- HistoryManager
- LocalDiskStorageAdapter
- engines/studentlife.py
- FrontendInventory
- Slot
- check_repo_safety.py
- js_literal.py
- test_seed.py
- RecurrenceError
- TimetableRow
- cinematicStore.ts
- engines/evidence.py
- import_timetable
- .infer
- AmphitheaterHall.tsx
- compilerOptions
- .from_json
- security.py
- stream.py
- storageService.ts
- free_windows
- env.py
- fetch_edupage_timetable.py
- settle_due_rooms
- CampusAudioEngine
- CinematicRecorderEngine
- AttendancePrior
- parse_xlsx
- metrics.py
- test_timetable_import.py
- frontend
- backend-init
- pathMath.ts
- cinematic/presets.ts
- api
- db
- deploy-server.sh
- ImportReport
- capture_views.mjs
- b46274d842de_initial_schema.py
- healthcheck
- compat_service.py
- test_evidence.py
- .weight
- icons.tsx
- Principal
- services
- _generate_one
- ImportDiff
- AsyncSession
- env_file
- build
- CinematicCameraController.tsx
- _isolate_environment
- test_every_occurrence_keeps_its_local_wall_clock
- confirmation_for
- current_principal
- CameraTimeline.tsx
- test_an_unbounded_rule_over_a_huge_window_hits_the_ceiling
- test_the_default_ceiling_is_documented_and_generous
- campus-backend
- fetch_active_edupage_payload
- _guard
- CanteenQueueConfig
- render_notification_template
- test_the_starts_soon_window_can_be_overridden
- test_the_compat_window_default_comes_from_settings
- auth.py
- _is_exclusion_violation
- CLAUDE.md
- .claude/CLAUDE.md

## God Nodes (most connected - your core abstractions)
1. `Settings` - 71 edges
2. `get_settings()` - 65 edges
3. `react` - 65 edges
4. `RoomStateKind` - 64 edges
5. `Base` - 63 edges
6. `Room` - 60 edges
7. `ValidationError` - 59 edges
8. `Resource` - 56 edges
9. `parse_csv()` - 53 edges
10. `_slot()` - 53 edges

## Surprising Connections (you probably didn't know these)
- `3. Поток данных: от источника геометрии до 3D [факт]` --references--> `CampusGeometry`  [INFERRED]
  docs/ARCHITECTURE.md → src/domain/geometry/types.ts
- `Cinematic Mode (`src/cinematic/`)` --references--> `CinematicCameraController()`  [INFERRED]
  docs/ARCHITECTURE.md → src/cinematic/CinematicCameraController.tsx
- `6. Ограничения и технический долг [факт]` --references--> `DataNotice()`  [INFERRED]
  docs/ARCHITECTURE.md → src/components/ui/MapControls.tsx
- `8.2 Требуют согласованного изменения (ADR + обновление документов)` --references--> `RoomDetails()`  [INFERRED]
  docs/ARCHITECTURE.md → src/components/ui/RoomDetails.tsx
- `5. Выбор, этажи, поиск, навигация [факт]` --references--> `search()`  [INFERRED]
  docs/ARCHITECTURE.md → src/services/search/searchService.ts

## Import Cycles
- None detected.

## Communities (154 total, 45 thin omitted)

### Community 0 - "studentlife_service.py"
Cohesion: 0.06
Nodes (45): NotFoundError, LostFoundKind, LostFoundStatus, StudyGroupStatus, TeacherVisibilityMode, TeacherProfile, LostFoundItem, StudyGroupMember (+37 more)

### Community 1 - "Hub"
Cohesion: 0.09
Nodes (7): _publish_changes(), InProcessBroker, Connection, Hub, Recorder, TestHub, TestInProcessBroker

### Community 2 - "ticket_service.py"
Cohesion: 0.06
Nodes (21): StorageAdapter, TicketPriority, TicketStatus, Ticket, TicketEvent, CandidateExistingTicket, compute_sla_due_at(), find_duplicate_ticket() (+13 more)

### Community 3 - "DetailedBuilding.tsx"
Cohesion: 0.05
Nodes (69): 4. 3D-сцена [факт], 9. Архитектурное разделение слоёв и визуальная подсистема (Этап C) [факт], @react-three/fiber, three, BlockFLibraryInterior(), BuildingMass(), windowTexture, ClassicalPortico() (+61 more)

### Community 4 - "MapProvider.tsx"
Cohesion: 0.07
Nodes (66): 5. Выбор, этажи, поиск, навигация [факт], App(), AppLayout(), isEditorRoute(), LazyEditorPage, LazyGameScene, BuildingInterior(), Props (+58 more)

### Community 5 - "RoomStateKind"
Cohesion: 0.07
Nodes (41): ConfirmationState, RoomStateKind, RoomStateEvent, _differs(), events_since(), latest_sequence(), _latest_states(), _load_baseline() (+33 more)

### Community 6 - "TestChannelAdapters"
Cohesion: 0.14
Nodes (7): DeliveryResult, EmailAdapter, InAppAdapter, SmsAdapter, TelegramAdapter, WebPushAdapter, TestChannelAdapters

### Community 7 - "base.py"
Cohesion: 0.04
Nodes (41): upgrade(), ChannelAdapter, default_channel_adapters(), Base, Course, MeetingOverride, IsDemoMixin, NotificationChannel (+33 more)

### Community 8 - "estimate_occupancy"
Cohesion: 0.09
Nodes (5): estimate_occupancy(), _signal(), TestEstimator, TestExplainability, TestProvenance

### Community 9 - "test_room_state.py"
Cohesion: 0.07
Nodes (47): Interval, next_transition_at(), RoomContext, state_at(), _context(), _lesson(), _local(), test_a_cancelled_slot_is_free_until_the_next_lesson() (+39 more)

### Community 10 - "get_settings"
Cohesion: 0.06
Nodes (28): _db(), healthz(), metrics(), readyz(), get_settings(), Database, get_database(), init_database() (+20 more)

### Community 11 - "adapter.ts"
Cohesion: 0.06
Nodes (62): ADR-0023, vitest, Props, BuildingStructure, campusInfo, knownBuildings, buildBuilding(), buildFloor() (+54 more)

### Community 12 - "GameScene.tsx"
Cohesion: 0.07
Nodes (63): ADR-0001, @react-three/rapier, BenchSpec, CampusEnvironmentDetail, CampusEnvironmentDetailProps, computeCampusBenchesAndBins(), computeCampusStreetLamps(), computeCampusTotems() (+55 more)

### Community 13 - "v1/compat.py"
Cohesion: 0.16
Nodes (11): CompatLiveCountsResponse, compat_campus(), compat_campus_bare(), compat_catalog(), compat_lessons(), compat_live_counts(), compat_room_states(), _parse_compat_at() (+3 more)

### Community 14 - "parse_csv"
Cohesion: 0.05
Nodes (6): parse_csv(), TestBrokenFile, TestCsvParsing, TestDiff, TestValidation, _validate()

### Community 15 - "Role"
Cohesion: 0.15
Nodes (13): AuthenticationError, create_access_token(), decode_access_token(), Role, test_busyness_api_endpoints(), test_notifications_api_lifecycle(), test_expired_token_is_rejected_with_a_specific_code(), test_extra_claims_cannot_override_identity() (+5 more)

### Community 16 - "ContextLayer.tsx"
Cohesion: 0.07
Nodes (45): CampusWalkways(), createPaverTexture(), WalkwaySegment, contextColors, ContextLayer(), ContextTuning, DirectedFence(), FenceSegment() (+37 more)

### Community 17 - "main.py"
Cohesion: 0.05
Nodes (16): dispose_database(), register_exception_handlers(), configure_logging(), get_logger(), _header(), _inject_request_id(), RequestContextMiddleware, get_scheduler() (+8 more)

### Community 18 - "_slot"
Cohesion: 0.09
Nodes (10): BookingPolicy, _merge(), _opening_hours_violations(), violation(), PolicyViolation, validate_request(), ViolationCode, _load_blackouts() (+2 more)

### Community 19 - "test_state_api.py"
Cohesion: 0.06
Nodes (31): test_a_legacy_room_id_resolves_for_state_too(), test_a_naive_at_is_rejected_by_the_clean_api(), test_a_scheduled_lesson_is_unconfirmed_not_empty(), test_a_single_room_state_matches_the_bulk_answer(), test_a_utc_z_suffix_is_accepted(), test_an_out_of_range_window_is_rejected(), test_an_unknown_building_is_404(), test_an_unknown_room_state_is_404() (+23 more)

### Community 20 - "Subscription"
Cohesion: 0.08
Nodes (4): Broker, RedisBroker, Subscription, TestBackpressure

### Community 21 - "crowd_service.py"
Cohesion: 0.04
Nodes (50): Section, CrowdLevel, PlaceKind, Provenance, BusynessSnapshot, Place, BestTimeProfile, building_distance_m() (+42 more)

### Community 22 - "test_booking.py"
Cohesion: 0.14
Nodes (32): ConflictError, Resource, BookingRequest, create_booking(), resource(), _slot(), test_a_blackout_blocks_a_booking(), test_a_booking_cannot_land_on_top_of_a_lesson() (+24 more)

### Community 23 - "time.py"
Cohesion: 0.07
Nodes (24): campus_date(), campus_day_bounds(), campus_instant_at_minutes(), campus_local_naive(), ensure_aware(), minutes_since_campus_midnight(), parse_campus_local_naive(), to_campus() (+16 more)

### Community 24 - "import_service.py"
Cohesion: 0.05
Nodes (58): ValidationError, ImportBatch, Meeting, MeetingRule, Term, ImportStatus, new_uuid(), apply_import() (+50 more)

### Community 25 - "test_recurrence.py"
Cohesion: 0.10
Nodes (36): RecurrenceSpec, weekly_rrule(), _local_starts(), test_a_bare_yyyymmdd_exdate_is_accepted(), test_a_biweekly_rule_skips_the_odd_week(), test_a_date_only_exdate_removes_the_whole_local_day(), test_a_lesson_already_running_when_the_window_opens_is_included(), test_a_lesson_in_the_skipped_hour_of_a_spring_transition_still_resolves() (+28 more)

### Community 27 - "sqlalchemy_ext_asyncio"
Cohesion: 0.12
Nodes (3): _aware(), get_replay(), require_roles()

### Community 28 - "v1/studentlife.py"
Cohesion: 0.06
Nodes (48): ensure_principal_user(), ack_notification(), broadcast(), BroadcastIn, list_notifications(), PushSubscriptionIn, register_push(), _serialize_notification() (+40 more)

### Community 29 - "state_service.py"
Cohesion: 0.07
Nodes (28): StateOptions, _booking_confirmation(), _evaluate(), invalidate_state_cache(), _load_booking_intervals(), _load_meeting_intervals(), load_room_contexts(), _load_rooms() (+20 more)

### Community 30 - "test_edupage_sync.py"
Cohesion: 0.11
Nodes (13): extract_edupage_catalog(), _extract_tables(), parse_edupage(), _parse_hhmm(), _parse_weeks_mask(), pseudonymise_teacher(), resolve_edupage_room_code(), _safe_short_code() (+5 more)

### Community 31 - "Room"
Cohesion: 0.05
Nodes (47): AmbiguousAliasError, DataProvenance, OccupancyKind, RoomKind, ResourceOccupancy, Building, Campus, Connector (+39 more)

### Community 32 - "parsers.py"
Cohesion: 0.09
Nodes (11): _coerce_date(), _coerce_int(), _coerce_time(), _coerce_week_pattern(), _ics_datetime(), _ics_exdates(), _ics_text(), _ics_until() (+3 more)

### Community 34 - "test_frontend_extract.py"
Cohesion: 0.06
Nodes (26): JsLiteralError, parse_js_literal(), strip_comments(), inventory(), test_booleans_and_null(), test_building_id_to_block_letter_mapping(), test_committed_snapshot_matches_the_front_end(), test_confirmed_cad_rooms_keep_their_stable_ids() (+18 more)

### Community 35 - "conftest.py"
Cohesion: 0.06
Nodes (24): create_engine(), text(), anyio_backend(), clean_database(), client(), database(), frontend_src(), _maintenance_url() (+16 more)

### Community 36 - "api"
Cohesion: 0.05
Nodes (42): build, command, depends_on, env_file, environment, ports, restart, volumes (+34 more)

### Community 37 - "test_demo_schedule.py"
Cohesion: 0.08
Nodes (19): DemoLesson, fnv1a_unit(), generate_demo_lessons(), _pick(), _slot_instants(), _utf16_code_units(), test_a_character_outside_the_bmp_counts_as_two_code_units(), test_a_slot_crossing_midnight_rolls_to_the_next_day() (+11 more)

### Community 38 - "searchService.ts"
Cohesion: 0.13
Nodes (26): loadTimetableCatalog(), TimetableCatalog, compactCode(), diagnoseEmptySearch(), EmptySearchDiagnosis, EmptySearchEntityKind, extractTargetWords(), foldText() (+18 more)

### Community 40 - "validate.py"
Cohesion: 0.06
Nodes (17): _build_diff(), _build_lookup(), _dates_overlap(), _find_double_bookings(), _find_walking_transition_warnings(), Issue, IssueCode, _local_time_exists() (+9 more)

### Community 41 - "CampusMap.tsx"
Cohesion: 0.06
Nodes (39): 1. Стек и точки входа [факт], 2.1 Зависимости модулей, 2. Модули [факт], 3. Поток данных: от источника геометрии до 3D [факт], 6. Ограничения и технический долг [факт], 7. Целевая архитектура после этапов A–C [предложение], 8.1 Можно менять независимо (в рамках своей задачи, без ADR), 8.2 Требуют согласованного изменения (ADR + обновление документов) (+31 more)

### Community 42 - "domain/types.ts"
Cohesion: 0.12
Nodes (39): 10. Архитектура 2D Visual Editor (`src/editor/`) [факт], react, Vec2, CHANGE_CATEGORY_LABELS, AlignmentGuide, DragState, EditorCanvasProps, HandleType (+31 more)

### Community 43 - "test_api.py"
Cohesion: 0.09
Nodes (26): test_a_current_id_wins_over_an_alias(), test_a_legacy_room_id_resolves_to_its_current_room(), test_an_ambiguous_legacy_id_is_a_409_not_a_guess(), test_an_inbound_request_id_is_honoured(), test_building_detail_reports_room_counts_per_floor(), test_building_rooms_are_ordered_by_floor(), test_clean_campus_endpoint(), test_compat_block_a_rooms_come_from_the_cad_drawings() (+18 more)

### Community 44 - "Vegetation.tsx"
Cohesion: 0.08
Nodes (34): AJOU_ART_DIMENSIONS, AJOU_ART_MATERIALS, AjouArtObject(), AjouArtObjectProps, BOOK_PALETTE, LIBRARY_LAYOUT, LIBRARY_ROOM_ID, Props (+26 more)

### Community 45 - "get_state"
Cohesion: 0.23
Nodes (7): BuildingSummaryOut, get_room_state(), get_state(), get_transitions(), _room_out(), _summary_out(), resolve_options()

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

### Community 50 - "booking_service.py"
Cohesion: 0.17
Nodes (13): OccupancyStatus, Booking, BookingResult, cancel_booking(), check_in(), _conflict_error(), _count_active_bookings(), _find_conflicts() (+5 more)

### Community 51 - "search_rooms"
Cohesion: 0.10
Nodes (8): _feature_keys(), _free_minutes(), _has_features(), search_rooms(), rank_candidates(), _reason_for(), RoomCandidate, TestRanking

### Community 52 - "pytest"
Cohesion: 0.12
Nodes (19): AppEnv, build(), test_campus_timezone_is_required(), test_campus_timezone_must_be_a_real_iana_zone(), test_campus_timezone_rejects_an_empty_string(), test_compat_window_defaults_to_the_front_ends_value(), test_cors_origins_are_parsed_and_trimmed(), test_development_allows_the_conveniences() (+11 more)

### Community 53 - "package.json"
Cohesion: 0.10
Nodes (26): devDependencies, @types/react@^19.3.0, @types/react-dom@^19.3.0, @types/three@^0.186.0, typescript@^7.0.2, vite@^8.3.3, @vitejs/plugin-basic-ssl@^2.3.0, @vitejs/plugin-react@^6.1.2 (+18 more)

### Community 54 - "CampusFountain.tsx"
Cohesion: 0.11
Nodes (21): AUT_EMBLEM_POLY_0, AUT_EMBLEM_POLY_1, CampusFountain(), CampusFountainProps, createMergedPalmCrownGeometry(), createPalmFrondGeometry(), FOUNTAIN_DIMENSIONS, FOUNTAIN_MATERIALS (+13 more)

### Community 55 - "bookings.py"
Cohesion: 0.17
Nodes (9): BookingCreate, BookingOut, cancel_booking(), check_in(), create_booking(), list_bookings(), _may_act_on(), _out() (+1 more)

### Community 56 - "errors.py"
Cohesion: 0.05
Nodes (25): OccurrenceOut, RoomStateOut, StateModel, StateResponse, TransitionOut, TransitionsResponse, CrowdReportIn, get_best_time() (+17 more)

### Community 57 - "errors.py"
Cohesion: 0.10
Nodes (12): _code_for_status(), error_payload(), _app_error(), _http_error(), _unhandled(), _validation_error(), _safe_error(), clear_cache() (+4 more)

### Community 58 - "exportService.ts"
Cohesion: 0.11
Nodes (30): computeSemanticChanges(), numDiff(), photosDiff(), pickPrimaryCategory(), pointsDiff(), editorDocToCampusAndGeom(), buildCampusEditZipPackage(), downloadCampusEditZip() (+22 more)

### Community 59 - "room_state.py"
Cohesion: 0.08
Nodes (8): BuildingSummary, RoomState, states_for_day(), summarise(), _without_overlay(), _details(), test_a_days_walk_handles_a_long_dst_day(), test_a_days_walk_handles_a_short_dst_day()

### Community 60 - "attachmentStorage.ts"
Cohesion: 0.14
Nodes (25): EditorRightPanel(), DIRECTION_PRESETS, formatBytes(), PhotoAttachmentsSection(), PhotoAttachmentsSectionProps, PhotoTargetSpec, base64ToUint8(), clearAllAttachmentBlobs() (+17 more)

### Community 61 - "argparse"
Cohesion: 0.14
Nodes (12): compose(), main(), main(), psql(), restore(), row_counts(), run(), self_test() (+4 more)

### Community 62 - "seed_demo_schedule"
Cohesion: 0.15
Nodes (10): _bump(), clear_demo_schedule(), _course_code(), DemoScheduleResult, _ensure_room_resources(), _ensure_section(), _range(), seed_demo_schedule() (+2 more)

### Community 63 - "CinematicMode.tsx"
Cohesion: 0.19
Nodes (19): CameraPresets(), CameraSettings(), CinematicButton(), CinematicOverlay(), PathStorage(), Section(), Slider(), useCinematicClean() (+11 more)

### Community 64 - "schedule_service.py"
Cohesion: 0.17
Nodes (8): day_is_demo(), lessons_between(), lessons_by_room_for_day(), lessons_for_day(), lessons_for_room(), timetable_catalog(), res1_monday(), test_sync_edupage_purges_demo_schedule_and_switches_versions()

### Community 66 - "scheduleService.ts"
Cohesion: 0.15
Nodes (18): BackendLive, BusynessPlace, markAutoReloaded(), pad(), reconcileBuildVersion(), shouldDeferAutoReload(), toCampusIsoMinute(), useBackendLive() (+10 more)

### Community 67 - "expand_rule"
Cohesion: 0.15
Nodes (7): _build_rule(), expand_rule(), _extend_bare_until(), _is_excluded(), _normalise_exdates(), Occurrence, parse_local_naive()

### Community 69 - "LocalDiskStorageAdapter"
Cohesion: 0.16
Nodes (3): LocalDiskStorageAdapter, S3CompatibleStorageAdapter, StoredObject

### Community 70 - "engines/studentlife.py"
Cohesion: 0.06
Nodes (17): has_exif_metadata(), InvalidImageError, strip_image_exif(), compute_free_windows(), intersect_windows(), LostFoundCandidate, match_lost_found(), match_study_groups() (+9 more)

### Community 71 - "FrontendInventory"
Cohesion: 0.22
Nodes (5): FrontendInventory, _validate(), build_snapshot(), main(), summarise()

### Community 72 - "Slot"
Cohesion: 0.11
Nodes (4): propose_alternatives(), Slot, TestAlternatives, TestSlot

### Community 73 - "check_repo_safety.py"
Cohesion: 0.23
Nodes (11): Baseline, CheckError, collect_findings(), find_repo_root(), Findings, git(), is_waived(), load_baseline() (+3 more)

### Community 74 - "js_literal.py"
Cohesion: 0.27
Nodes (12): _Cursor, _find_declaration(), find_export(), _parse_array(), _parse_key(), _parse_keyword(), _parse_number(), _parse_object() (+4 more)

### Community 75 - "test_seed.py"
Cohesion: 0.12
Nodes (12): test_block_letters_are_stored_not_derived(), test_buildings_without_any_plan_are_marked_demo(), test_campus_timezone_is_stored_on_the_row(), test_connectors_link_known_buildings_only(), test_demo_flag_mirrors_the_front_ends_provenance(), test_legacy_aliases_are_seeded(), test_room_order_within_a_floor_is_preserved(), test_seed_records_a_run_with_the_inventory_hash() (+4 more)

### Community 76 - "RecurrenceError"
Cohesion: 0.13
Nodes (9): _apply_override(), OverrideSpec, RecurrenceError, test_a_cancelled_occurrence_stays_in_the_series_flagged(), test_a_dtstart_with_an_offset_is_rejected(), test_a_move_override_without_a_new_start_is_rejected(), test_an_exdate_matches_the_original_start_not_a_moved_one(), test_an_override_that_ends_before_it_starts_is_rejected() (+1 more)

### Community 78 - "cinematicStore.ts"
Cohesion: 0.12
Nodes (14): CinematicState, ControllerApi, initial(), listeners, RecordingState, __resetCinematicForTests(), ResolutionOption, Settings (+6 more)

### Community 79 - "engines/evidence.py"
Cohesion: 0.12
Nodes (6): _confidence_from_weight(), Estimate, EstimatorConfig, _headcount_band(), _provenance_for(), TestConfidence

### Community 80 - "import_timetable"
Cohesion: 0.19
Nodes (4): get_import(), import_timetable(), list_imports(), rollback_import()

### Community 82 - "AmphitheaterHall.tsx"
Cohesion: 0.13
Nodes (26): AmphitheaterHall(), createAmphitheaterHipRoofGeometry(), createOctagonShape(), createTierRingGeometry(), StaircaseFlight(), ADR-0029, getAmphitheaterFloorLogoTexture(), getAmphitheaterScreenTexture() (+18 more)

### Community 83 - "compilerOptions"
Cohesion: 0.12
Nodes (16): compilerOptions, allowJs, allowSyntheticDefaultImports, forceConsistentCasingInFileNames, isolatedModules, jsx, lib, module (+8 more)

### Community 85 - "security.py"
Cohesion: 0.18
Nodes (7): hash_password(), verify_password(), test_empty_password_is_refused(), test_hash_format_is_self_describing(), test_hashes_are_salted(), test_password_round_trip(), test_verify_rejects_malformed_input_without_raising()

### Community 86 - "stream.py"
Cohesion: 0.06
Nodes (16): _beat(), _current_sequence(), _error(), _send_catch_up(), _serve(), stream(), stream_changes(), _try_subscribe() (+8 more)

### Community 87 - "storageService.ts"
Cohesion: 0.40
Nodes (14): createInitialDocument(), VersionType, createNamedVersion(), deleteVersion(), initStorage(), isIDBAvailable(), isLocalStorageAvailable(), loadDraft() (+6 more)

### Community 88 - "free_windows"
Cohesion: 0.19
Nodes (3): free_windows(), test_free_windows_never_overlap_each_other_or_the_busy_blocks(), TestFreeWindows

### Community 89 - "env.py"
Cohesion: 0.20
Nodes (6): _configure(), do_run_migrations(), include_object(), run_migrations_offline(), run_migrations_online(), _set_search_path()

### Community 90 - "fetch_edupage_timetable.py"
Cohesion: 0.32
Nodes (8): fetch_timetable(), list_timetables(), main(), _post(), room_report(), run(), summarise(), tables_of()

### Community 93 - "CinematicRecorderEngine"
Cohesion: 0.21
Nodes (5): CinematicRecorderEngine, MIME_CANDIDATES, pickMimeType(), recorderEngine, RecorderOptions

### Community 94 - "AttendancePrior"
Cohesion: 0.15
Nodes (3): AttendancePrior, schedule_prior(), TestSchedulePrior

### Community 97 - "test_timetable_import.py"
Cohesion: 0.09
Nodes (8): sniff_format(), _normalise(), parse_weekday(), _squash(), test_a_single_well_formed_row_always_validates(), test_every_row_is_either_usable_or_has_a_reported_issue(), TestFormatSniffing, TestWeekdayParsing

### Community 98 - "frontend"
Cohesion: 0.18
Nodes (11): condition, api, VITE_BACKEND_PROXY_TARGET, VITE_WATCH_POLLING, depends_on, environment, image, ports (+3 more)

### Community 99 - "backend-init"
Cohesion: 0.18
Nodes (11): depends_on, command, condition, depends_on, image, restart, volumes, condition (+3 more)

### Community 100 - "pathMath.ts"
Cohesion: 0.18
Nodes (15): CameraPathEditor(), Gizmo(), Marker(), loadStored(), EASING_LABELS, EASINGS, evalSegment(), hermite() (+7 more)

### Community 101 - "cinematic/presets.ts"
Cohesion: 0.20
Nodes (15): CameraPath, EasingId, makeKeyframeId(), add(), buildingFocus(), buildPreset(), CAMPUS_LOCK, kf() (+7 more)

### Community 102 - "api"
Cohesion: 0.20
Nodes (10): command, environment, image, ports, pull_policy, restart, volumes, environment (+2 more)

### Community 103 - "db"
Cohesion: 0.20
Nodes (10): entrypoint, environment, image, ports, restart, volumes, POSTGRES_DB, POSTGRES_INITDB_ARGS (+2 more)

### Community 104 - "deploy-server.sh"
Cohesion: 0.51
Nodes (9): backup_db_if_migrations_changed(), compose(), detect_docker(), log(), main(), rollback(), deploy-server.sh script, sync_demo_inventory_if_needed() (+1 more)

### Community 107 - "b46274d842de_initial_schema.py"
Cohesion: 0.25
Nodes (3): upgrade(), downgrade(), upgrade()

### Community 108 - "healthcheck"
Cohesion: 0.54
Nodes (8): healthcheck, healthcheck, healthcheck, interval, retries, start_period, test, timeout

### Community 109 - "compat_service.py"
Cohesion: 0.07
Nodes (21): CompatBuilding, CompatCampus, CompatCampusResponse, CompatCatalogResponse, CompatFloor, CompatLesson, CompatLessonsResponse, CompatMeta (+13 more)

### Community 110 - "test_evidence.py"
Cohesion: 0.24
Nodes (6): SignalType, test_an_older_signal_never_pulls_harder_than_a_younger_one(), test_confidence_never_decreases_when_a_consistent_signal_is_added(), test_every_fraction_maps_to_some_crowd_level(), test_the_attendance_posterior_is_always_a_valid_rate(), test_the_estimate_stays_within_the_range_of_its_inputs()

### Community 112 - "icons.tsx"
Cohesion: 0.35
Nodes (11): CameraKeyframeList(), KeyframeInspector(), NumField(), IconCamera(), IconCopy(), IconDown(), IconEye(), IconPlus() (+3 more)

### Community 113 - "Principal"
Cohesion: 0.26
Nodes (6): PermissionDeniedError, Principal, test_admin_implies_every_role(), test_require_raises_permission_denied_with_context(), test_roles_are_not_a_hierarchy(), test_unknown_roles_in_a_token_grant_nothing()

### Community 114 - "services"
Cohesion: 0.33
Nodes (5): name, name, services, volumes, pgdata

### Community 115 - "_generate_one"
Cohesion: 0.15
Nodes (6): _generate_one(), test_generated_lessons_match_the_front_ends_picks(), test_slot_times_convert_from_campus_local_to_utc(), test_the_hash_matches_javascript_exactly(), test_the_lesson_id_matches_the_front_ends_format(), test_the_occupancy_threshold_is_the_right_way_round()

### Community 117 - "AsyncSession"
Cohesion: 0.13
Nodes (7): scheduled_client(), scheduled_session(), test_a_cancelled_lesson_holds_no_occupancy(), test_day_is_demo_reports_generated_data(), test_lessons_for_day_uses_campus_local_bounds(), test_reseeding_the_schedule_does_not_duplicate(), test_weekends_are_skipped_but_weekdays_are_not()

### Community 118 - "env_file"
Cohesion: 0.60
Nodes (5): env_file, env_file, env_file, path, required

### Community 119 - "build"
Cohesion: 0.60
Nodes (5): build, context, dockerfile, target, build

### Community 120 - "CinematicCameraController.tsx"
Cohesion: 0.21
Nodes (11): CinematicCameraController(), poseAt(), Controls, isTyping(), MAX_BANK, SavedCamera, smoothstep(), runtime (+3 more)

### Community 129 - "CameraTimeline.tsx"
Cohesion: 0.46
Nodes (7): CameraTimeline(), fmt(), clampTime(), IconPause(), IconPlay(), keyframeTimes(), totalDuration()

### Community 137 - "fetch_active_edupage_payload"
Cohesion: 0.33
Nodes (3): _candidate_academic_years(), _edupage_post(), fetch_active_edupage_payload()

### Community 140 - "render_notification_template"
Cohesion: 0.20
Nodes (4): render_notification_template(), RenderedNotification, _SafeFormatDict, TestNotificationTemplates

### Community 144 - "auth.py"
Cohesion: 0.17
Nodes (6): dev_token(), DevTokenRequest, me(), PrincipalResponse, TokenResponse, get_request_id()

## Knowledge Gaps
- **23 isolated node(s):** `ADR-0023`, `ADR-0020`, `ADR-0029`, `ADR-0029`, `BasinRipple` (+18 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 1548 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **45 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `Settings` connect `Settings` to `ticket_service.py`, `conftest.py`, `engines/studentlife.py`, `base.py`, `get_settings`, `settle_due_rooms`, `v1/compat.py`, `get_state`, `Role`, `auth.py`, `main.py`, `pytest`, `security.py`, `stream.py`, `crowd_service.py`, `errors.py`, `sqlalchemy_ext_asyncio`, `state_service.py`?**
  _High betweenness centrality (0.023) - this node is a cross-community bridge._
- **Are the 26 inferred relationships involving `Settings` (e.g. with `healthz()` and `readyz()`) actually correct?**
  _`Settings` has 26 INFERRED edges - model-reasoned connections that need verification._
- **What connects `ADR-0023`, `ADR-0020`, `ADR-0029` to the rest of the system?**
  _23 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `studentlife_service.py` be split into smaller, more focused modules?**
  _Cohesion score 0.0606942889137738 - nodes in this community are weakly interconnected._
- **Why does `parse_csv()` connect `parse_csv` to `parsers.py`, `test_timetable_import.py`, `engines/studentlife.py`, `validate.py`, `TimetableRow`, `.infer`, `import_service.py`, `test_edupage_sync.py`?**
  _High betweenness centrality (0.021) - this node is a cross-community bridge._
- **Are the 48 inferred relationships involving `RoomStateKind` (e.g. with `BuildingSummaryOut` and `RoomStateOut`) actually correct?**
  _`RoomStateKind` has 48 INFERRED edges - model-reasoned connections that need verification._
- **Should `Hub` be split into smaller, more focused modules?**
  _Cohesion score 0.09398907103825137 - nodes in this community are weakly interconnected._