# Graph Report - campus-map  (2026-10-31)

## Corpus Check
- 313 files · ~329,321 words
- Verdict: corpus is large enough that graph structure adds value.
- Unclassified: 19 file(s) not represented in the graph (top: (none) 8, .example 2, .po 2)

## Summary
- 4245 nodes · 12519 edges · 152 communities (116 shown, 36 thin omitted)
- Extraction: 91% EXTRACTED · 9% INFERRED · 0% AMBIGUOUS · INFERRED: 1183 edges (avg confidence: 0.93)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `187900f1`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- studentlife_service.py
- Hub
- ticket_service.py
- DetailedBuilding.tsx
- MapProvider.tsx
- RoomStateKind
- notification_service.py
- base.py
- Provenance
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
- test_crowds.py
- test_booking.py
- time.py
- test_import_service.py
- test_recurrence.py
- import_service.py
- sqlalchemy_ext_asyncio
- v1/studentlife.py
- state_service.py
- crowd_service.py
- Room
- parsers.py
- Settings
- test_frontend_extract.py
- conftest.py
- api
- test_demo_schedule.py
- Floor
- .from_default
- validate.py
- geometry/types.ts
- domain/types.ts
- test_api.py
- Vegetation.tsx
- v1/state.py
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
- busyness.py
- errors.py
- exportService.ts
- StateOptions
- attachmentStorage.ts
- argparse
- seed_demo_schedule
- cinematicStore.ts
- schedule_service.py
- compute_hourly_profile
- scheduleService.ts
- expand_rule
- HistoryManager
- StorageAdapter
- engines/studentlife.py
- FrontendInventory
- test_schema.py
- check_repo_safety.py
- js_literal.py
- list_notifications
- RecurrenceError
- TimetableRow
- test_studentlife.py
- logging.py
- import_timetable
- .infer
- AmphitheaterHall.tsx
- compilerOptions
- .from_json
- IssueCode
- stream.py
- storageService.ts
- free_windows
- env.py
- fetch_edupage_timetable.py
- settle_due_rooms
- CampusAudioEngine
- CinematicRecorderEngine
- demo_schedule.py
- parse_xlsx
- compat_service.py
- test_timetable_import.py
- frontend
- backend-init
- v1/tickets.py
- mmc_queue_estimate
- api
- db
- deploy-server.sh
- ImportReport
- capture_views.mjs
- b46274d842de_initial_schema.py
- healthcheck
- schemas/compat.py
- ParticleKind
- sniff_format
- ImportBatch
- services
- scripts
- ImportDiff
- scheduled_client
- env_file
- build
- Topic
- _isolate_environment
- test_every_occurrence_keeps_its_local_wall_clock
- 849d42a79241_add_meeting_rule_source_identity.py
- campus_with_term
- test_an_unbounded_rule_over_a_huge_window_hits_the_ceiling
- test_the_default_ceiling_is_documented_and_generous
- campus-backend
- test_notifications.py
- engines/booking.py
- test_migrations.py
- render_notification_template
- ensure_aware
- CampusEnvironmentDetail.tsx
- LocalDiskStorageAdapter
- dev_token
- .__call__
- me
- computeSemanticChanges
- _is_exclusion_violation
- SpaceKind
- CLAUDE.md
- .claude/CLAUDE.md

## God Nodes (most connected - your core abstractions)
1. `Settings` - 74 edges
2. `react` - 65 edges
3. `RoomStateKind` - 64 edges
4. `Base` - 63 edges
5. `Room` - 60 edges
6. `get_settings()` - 60 edges
7. `ValidationError` - 59 edges
8. `Resource` - 55 edges
9. `parse_csv()` - 53 edges
10. `_slot()` - 53 edges

## Surprising Connections (you probably didn't know these)
- `3. Поток данных: от источника геометрии до 3D [факт]` --references--> `CampusGeometry`  [INFERRED]
  docs/ARCHITECTURE.md → src/domain/geometry/types.ts
- `4. 3D-сцена [факт]` --references--> `DetailedBuilding()`  [INFERRED]
  docs/ARCHITECTURE.md → src/components/3d/DetailedBuilding.tsx
- `5. Выбор, этажи, поиск, навигация [факт]` --references--> `BuildingLabel()`  [INFERRED]
  docs/ARCHITECTURE.md → src/components/3d/BuildingLabel.tsx
- `5. Выбор, этажи, поиск, навигация [факт]` --references--> `DetailedBuilding()`  [INFERRED]
  docs/ARCHITECTURE.md → src/components/3d/DetailedBuilding.tsx
- `5. Выбор, этажи, поиск, навигация [факт]` --references--> `isClick()`  [INFERRED]
  docs/ARCHITECTURE.md → src/components/3d/pointer.ts

## Import Cycles
- None detected.

## Communities (152 total, 36 thin omitted)

### Community 0 - "studentlife_service.py"
Cohesion: 0.08
Nodes (34): NotFoundError, StudyGroupStatus, TeacherVisibilityMode, TeacherProfile, StudyGroupMember, StudyGroupRequest, StudyGroupSession, TeacherStatusView (+26 more)

### Community 1 - "Hub"
Cohesion: 0.08
Nodes (8): InProcessBroker, Connection, Hub, test_a_second_scheduler_pass_records_nothing_new(), test_the_scheduler_settles_due_rooms_and_records_them(), Recorder, TestHub, TestInProcessBroker

### Community 2 - "ticket_service.py"
Cohesion: 0.08
Nodes (18): TicketPriority, TicketStatus, Ticket, TicketEvent, CandidateExistingTicket, compute_sla_due_at(), find_duplicate_ticket(), InvalidTicketTransitionError (+10 more)

### Community 3 - "DetailedBuilding.tsx"
Cohesion: 0.06
Nodes (65): 9. Архитектурное разделение слоёв и визуальная подсистема (Этап C) [факт], three, vitest, windowTexture, ClassicalPortico(), createTrueHipRoofGeometry(), DetailedBuilding(), EntrancePortal() (+57 more)

### Community 4 - "MapProvider.tsx"
Cohesion: 0.06
Nodes (68): 1. Стек и точки входа [факт], 2.1 Зависимости модулей, 2. Модули [факт], 3. Поток данных: от источника геометрии до 3D [факт], 5. Выбор, этажи, поиск, навигация [факт], 7. Целевая архитектура после этапов A–C [предложение], 8.1 Можно менять независимо (в рамках своей задачи, без ADR), 8.2 Требуют согласованного изменения (ADR + обновление документов) (+60 more)

### Community 5 - "RoomStateKind"
Cohesion: 0.06
Nodes (41): RoomStateKind, RoomStateEvent, _details(), _differs(), events_since(), latest_sequence(), _latest_states(), _load_baseline() (+33 more)

### Community 6 - "notification_service.py"
Cohesion: 0.08
Nodes (18): ChannelAdapter, default_channel_adapters(), DeliveryResult, EmailAdapter, InAppAdapter, SmsAdapter, TelegramAdapter, WebPushAdapter (+10 more)

### Community 7 - "base.py"
Cohesion: 0.08
Nodes (17): Base, MeetingOverride, IsDemoMixin, pg_enum(), TimestampMixin, UuidPkMixin, Blackout, AttendanceRate (+9 more)

### Community 8 - "Provenance"
Cohesion: 0.05
Nodes (20): Provenance, SignalType, _confidence_from_weight(), confirmation_for(), Estimate, estimate_occupancy(), EstimatorConfig, _headcount_band() (+12 more)

### Community 9 - "test_room_state.py"
Cohesion: 0.07
Nodes (48): Interval, next_transition_at(), RoomContext, state_at(), summarise(), _context(), _lesson(), _local() (+40 more)

### Community 10 - "get_settings"
Cohesion: 0.07
Nodes (19): _db(), healthz(), metrics(), readyz(), get_settings(), create_engine(), Database, get_database() (+11 more)

### Community 11 - "adapter.ts"
Cohesion: 0.07
Nodes (42): ADR-0023, BuildingStructure, campusInfo, knownBuildings, buildBuilding(), buildFloor(), buildRoomsForFloor(), knownRooms (+34 more)

### Community 12 - "GameScene.tsx"
Cohesion: 0.08
Nodes (56): ADR-0001, @react-three/rapier@^2.2.0, react, @react-three/rapier, CampusEnvironmentDetailProps, VegetationProps, AMPHITHEATER_BUILDING, AmphitheaterHallSpec (+48 more)

### Community 13 - "v1/compat.py"
Cohesion: 0.18
Nodes (9): CompatCampusResponse, CompatLiveCountsResponse, compat_campus(), compat_campus_bare(), compat_lessons(), compat_live_counts(), compat_room_states(), _parse_compat_at() (+1 more)

### Community 14 - "parse_csv"
Cohesion: 0.05
Nodes (6): parse_csv(), TestBrokenFile, TestCsvParsing, TestDiff, TestValidation, _validate()

### Community 15 - "Role"
Cohesion: 0.07
Nodes (27): AuthenticationError, PermissionDeniedError, create_access_token(), current_principal(), decode_access_token(), hash_password(), optional_principal(), Principal (+19 more)

### Community 16 - "ContextLayer.tsx"
Cohesion: 0.08
Nodes (40): AJOU_ART_DIMENSIONS, AJOU_ART_MATERIALS, AjouArtObject(), AjouArtObjectProps, CampusWalkways(), createPaverTexture(), WalkwaySegment, contextColors (+32 more)

### Community 17 - "main.py"
Cohesion: 0.06
Nodes (12): dispose_database(), configure_logging(), _inject_request_id(), RequestContextMiddleware, MetricsMiddleware, _route_template(), get_scheduler(), reset_scheduler() (+4 more)

### Community 18 - "_slot"
Cohesion: 0.08
Nodes (9): BookingPolicy, propose_alternatives(), Slot, validate_request(), _load_blackouts(), _slot(), TestAlternatives, TestSlot (+1 more)

### Community 19 - "test_state_api.py"
Cohesion: 0.05
Nodes (33): test_a_legacy_room_id_resolves_for_state_too(), test_a_naive_at_is_rejected_by_the_clean_api(), test_a_scheduled_lesson_is_unconfirmed_not_empty(), test_a_single_room_state_matches_the_bulk_answer(), test_a_utc_z_suffix_is_accepted(), test_an_out_of_range_window_is_rejected(), test_an_unknown_building_is_404(), test_an_unknown_room_state_is_404() (+25 more)

### Community 20 - "Subscription"
Cohesion: 0.11
Nodes (3): RedisBroker, Subscription, TestBackpressure

### Community 21 - "test_crowds.py"
Cohesion: 0.06
Nodes (20): building_distance_m(), CanteenQueueConfig, check_walking_transitions(), ClassChangeFlowResult, compute_class_change_flows(), compute_schedule_proxy_by_how(), CorridorFlowBin, EntranceFlowBin (+12 more)

### Community 22 - "test_booking.py"
Cohesion: 0.13
Nodes (32): ConflictError, ValidationError, Resource, BookingRequest, create_booking(), resource(), test_a_blackout_blocks_a_booking(), test_a_booking_cannot_land_on_top_of_a_lesson() (+24 more)

### Community 23 - "time.py"
Cohesion: 0.09
Nodes (18): campus_date(), campus_instant_at_minutes(), campus_local_naive(), minutes_since_campus_midnight(), parse_campus_local_naive(), to_campus(), test_campus_date_uses_campus_midnight_not_utc_midnight(), test_compat_format_is_offset_naive_campus_local() (+10 more)

### Community 24 - "test_import_service.py"
Cohesion: 0.08
Nodes (30): MeetingRule, rollback_import(), _apply(), test_a_conflicting_occupancy_is_skipped_and_reported_not_a_crash(), test_a_dry_run_writes_no_timetable_rows(), test_a_file_with_errors_is_refused_and_writes_nothing(), test_a_foreign_header_layout_imports_without_a_code_change(), test_a_rollback_keeps_the_batch_row_as_an_audit_trail() (+22 more)

### Community 25 - "test_recurrence.py"
Cohesion: 0.10
Nodes (36): RecurrenceSpec, weekly_rrule(), _local_starts(), test_a_bare_yyyymmdd_exdate_is_accepted(), test_a_biweekly_rule_skips_the_odd_week(), test_a_date_only_exdate_removes_the_whole_local_day(), test_a_lesson_already_running_when_the_window_opens_is_included(), test_a_lesson_in_the_skipped_hour_of_a_spring_transition_still_resolves() (+28 more)

### Community 26 - "import_service.py"
Cohesion: 0.09
Nodes (24): Course, Meeting, Section, Term, new_uuid(), apply_import(), ApplyResult, _build_rule() (+16 more)

### Community 27 - "sqlalchemy_ext_asyncio"
Cohesion: 0.10
Nodes (3): _aware(), get_replay(), get_session()

### Community 28 - "v1/studentlife.py"
Cohesion: 0.14
Nodes (35): ensure_principal_user(), book_teacher_appointment_endpoint(), claim_lost_found(), ConsentIn, create_dorm_booking(), create_dorm_notice_endpoint(), create_dorm_ticket_endpoint(), create_lost_found() (+27 more)

### Community 29 - "state_service.py"
Cohesion: 0.08
Nodes (24): _booking_confirmation(), _evaluate(), invalidate_state_cache(), _load_booking_intervals(), _load_meeting_intervals(), load_room_contexts(), _load_rooms(), _on_session_after_flush() (+16 more)

### Community 30 - "crowd_service.py"
Cohesion: 0.10
Nodes (23): CrowdLevel, PlaceKind, CrowdReport, Signal, BusynessSnapshot, Place, BestTimeProfile, fraction_for_crowd_level() (+15 more)

### Community 31 - "Room"
Cohesion: 0.08
Nodes (30): RoomKind, SeedRun, Building, Connector, Room, RoomAlias, CampusTree, _load_rooms() (+22 more)

### Community 32 - "parsers.py"
Cohesion: 0.06
Nodes (13): _coerce_date(), _coerce_int(), _coerce_time(), _coerce_week_pattern(), _ics_datetime(), _ics_exdates(), _ics_text(), _ics_until() (+5 more)

### Community 34 - "test_frontend_extract.py"
Cohesion: 0.06
Nodes (26): JsLiteralError, parse_js_literal(), strip_comments(), inventory(), test_booleans_and_null(), test_building_id_to_block_letter_mapping(), test_committed_snapshot_matches_the_front_end(), test_confirmed_cad_rooms_keep_their_stable_ids() (+18 more)

### Community 35 - "conftest.py"
Cohesion: 0.09
Nodes (14): anyio_backend(), clean_database(), client(), database(), frontend_src(), _maintenance_url(), migrated_database(), pytest_collection_modifyitems() (+6 more)

### Community 36 - "api"
Cohesion: 0.05
Nodes (42): build, command, depends_on, env_file, environment, ports, restart, volumes (+34 more)

### Community 37 - "test_demo_schedule.py"
Cohesion: 0.07
Nodes (22): fnv1a_unit(), generate_demo_lessons(), _pick(), _generate_one(), test_a_character_outside_the_bmp_counts_as_two_code_units(), test_a_slot_crossing_midnight_rolls_to_the_next_day(), test_bulk_occupancy_matches_javascript_exactly(), test_classrooms_draw_from_the_subject_list() (+14 more)

### Community 38 - "Floor"
Cohesion: 0.11
Nodes (16): AmbiguousAliasError, Floor, campus_counts(), count_rooms_per_floor(), get_building(), _get_campus_by_id(), get_default_campus(), get_room() (+8 more)

### Community 39 - ".from_default"
Cohesion: 0.09
Nodes (6): AttendancePrior, schedule_prior(), update_attendance_prior(), test_the_attendance_posterior_is_always_a_valid_rate(), TestAttendancePrior, TestSchedulePrior

### Community 40 - "validate.py"
Cohesion: 0.08
Nodes (15): _build_diff(), _build_lookup(), _dates_overlap(), _find_double_bookings(), _find_walking_transition_warnings(), Issue, _local_time_exists(), normalise_room_code() (+7 more)

### Community 41 - "geometry/types.ts"
Cohesion: 0.07
Nodes (46): 4. 3D-сцена [факт], 6. Ограничения и технический долг [факт], BlockFLibraryInterior(), BOOK_PALETTE, LIBRARY_ROOM_ID, Props, Building(), BuildingInterior() (+38 more)

### Community 42 - "domain/types.ts"
Cohesion: 0.12
Nodes (37): 10. Архитектура 2D Visual Editor (`src/editor/`) [факт], CHANGE_CATEGORY_LABELS, AlignmentGuide, DragState, EditorCanvasProps, HandleType, INDOOR_STYLES, OUTDOOR_STYLES (+29 more)

### Community 43 - "test_api.py"
Cohesion: 0.09
Nodes (26): test_a_current_id_wins_over_an_alias(), test_a_legacy_room_id_resolves_to_its_current_room(), test_an_ambiguous_legacy_id_is_a_409_not_a_guess(), test_an_inbound_request_id_is_honoured(), test_building_detail_reports_room_counts_per_floor(), test_building_rooms_are_ordered_by_floor(), test_clean_campus_endpoint(), test_compat_block_a_rooms_come_from_the_cad_drawings() (+18 more)

### Community 44 - "Vegetation.tsx"
Cohesion: 0.11
Nodes (26): LIBRARY_LAYOUT, computeShrubPlacements(), computeTreePlacements(), coniferFoliageGeo, coniferMat, createPRNG(), deciduousFoliageGeo, deciduousMat (+18 more)

### Community 45 - "v1/state.py"
Cohesion: 0.09
Nodes (18): BuildingSummaryOut, OccurrenceOut, RoomStateOut, StateModel, StateResponse, TransitionOut, TransitionsResponse, get_room_state() (+10 more)

### Community 46 - "env"
Cohesion: 0.06
Nodes (35): concurrency, cancel-in-progress, group, if, name, needs, runs-on, steps (+27 more)

### Community 47 - "seed_demo_campus.py"
Cohesion: 0.09
Nodes (19): extract_inventory(), ExtractedBuilding, ExtractedConnector, ExtractedFloor, ExtractedRoom, _opt_int(), _opt_str(), _read() (+11 more)

### Community 48 - "v1/campus.py"
Cohesion: 0.16
Nodes (17): ApiModel, BuildingDetailOut, BuildingOut, CampusDetailOut, CampusOut, Computed, ConnectorOut, FloorDetailOut (+9 more)

### Community 49 - "EditorPage.tsx"
Cohesion: 0.20
Nodes (32): revertIndividualChange(), EditorCanvas(), EditorLeftPanel(), EditorPage(), EditorTopBar(), VersionHistoryModal(), addBuildingToDoc(), addFloorToDoc() (+24 more)

### Community 50 - "booking_service.py"
Cohesion: 0.16
Nodes (14): OccupancyStatus, Booking, ResourceOccupancy, BookingResult, cancel_booking(), check_in(), _conflict_error(), _count_active_bookings() (+6 more)

### Community 51 - "search_rooms"
Cohesion: 0.10
Nodes (8): _feature_keys(), _free_minutes(), _has_features(), search_rooms(), rank_candidates(), _reason_for(), RoomCandidate, TestRanking

### Community 52 - "pytest"
Cohesion: 0.12
Nodes (19): AppEnv, build(), test_campus_timezone_is_required(), test_campus_timezone_must_be_a_real_iana_zone(), test_campus_timezone_rejects_an_empty_string(), test_compat_window_defaults_to_the_front_ends_value(), test_cors_origins_are_parsed_and_trimmed(), test_development_allows_the_conveniences() (+11 more)

### Community 53 - "package.json"
Cohesion: 0.09
Nodes (31): dependencies, leva@^0.10.1, react@^19.3.0, react-dom@^19.3.0, @react-three/drei@^10.7.9, @react-three/fiber@^9.8.1, three@^0.186.1, devDependencies (+23 more)

### Community 54 - "CampusFountain.tsx"
Cohesion: 0.18
Nodes (13): AUT_EMBLEM_POLY_0, AUT_EMBLEM_POLY_1, CampusFountain(), CampusFountainProps, createMergedPalmCrownGeometry(), createPalmFrondGeometry(), FOUNTAIN_DIMENSIONS, FOUNTAIN_MATERIALS (+5 more)

### Community 55 - "bookings.py"
Cohesion: 0.17
Nodes (9): BookingCreate, BookingOut, cancel_booking(), check_in(), create_booking(), list_bookings(), _may_act_on(), _out() (+1 more)

### Community 56 - "busyness.py"
Cohesion: 0.17
Nodes (11): CrowdReportIn, get_best_time(), get_busyness(), get_canteen_queue(), get_display_view(), get_flows(), get_walking_check(), list_busyness() (+3 more)

### Community 57 - "errors.py"
Cohesion: 0.08
Nodes (16): AppError, _code_for_status(), error_payload(), NotImplementedYetError, register_exception_handlers(), _app_error(), _http_error(), _unhandled() (+8 more)

### Community 58 - "exportService.ts"
Cohesion: 0.14
Nodes (24): buildCampusEditZipPackage(), downloadCampusEditZip(), escapeXml(), EXPORT_SCHEMA_VERSION, ExportedObjectReferencesMetadata, ExportedReferencePhotoEntry, generateCampusOverviewSvg(), generateFloorPlanSvg() (+16 more)

### Community 59 - "StateOptions"
Cohesion: 0.12
Nodes (8): campus_day_bounds(), StateOptions, states_for_day(), _without_overlay(), test_a_days_walk_handles_a_long_dst_day(), test_a_days_walk_handles_a_short_dst_day(), test_a_negative_starts_soon_window_is_rejected(), test_the_state_service_matches_the_generator_room_by_room()

### Community 60 - "attachmentStorage.ts"
Cohesion: 0.14
Nodes (26): EditorRightPanel(), DIRECTION_PRESETS, formatBytes(), PhotoAttachmentsSection(), PhotoAttachmentsSectionProps, PhotoAttachment, PhotoTargetSpec, base64ToUint8() (+18 more)

### Community 61 - "argparse"
Cohesion: 0.14
Nodes (12): compose(), main(), main(), psql(), restore(), row_counts(), run(), self_test() (+4 more)

### Community 62 - "seed_demo_schedule"
Cohesion: 0.15
Nodes (10): _bump(), clear_demo_schedule(), _course_code(), DemoScheduleResult, _ensure_room_resources(), _ensure_section(), _range(), seed_demo_schedule() (+2 more)

### Community 63 - "cinematicStore.ts"
Cohesion: 0.05
Nodes (98): Cinematic Mode (`src/cinematic/`), CameraKeyframeList(), KeyframeInspector(), NumField(), CameraPathEditor(), Gizmo(), Marker(), CameraPresets() (+90 more)

### Community 64 - "schedule_service.py"
Cohesion: 0.14
Nodes (10): day_is_demo(), lessons_between(), lessons_by_room_for_day(), lessons_for_day(), lessons_for_room(), test_a_cancelled_lesson_holds_no_occupancy(), test_day_is_demo_reports_generated_data(), test_lessons_for_day_uses_campus_local_bounds() (+2 more)

### Community 65 - "compute_hourly_profile"
Cohesion: 0.13
Nodes (5): compute_hourly_profile(), HourlyBucketProfile, crowd_level_for_fraction(), TestBestTimeToGo, TestCrowdLevels

### Community 66 - "scheduleService.ts"
Cohesion: 0.11
Nodes (25): createDemoSchedule(), groups, pick(), rand(), subjects, teachers, BackendLive, BusynessPlace (+17 more)

### Community 67 - "expand_rule"
Cohesion: 0.15
Nodes (7): _build_rule(), expand_rule(), _extend_bare_until(), _is_excluded(), _normalise_exdates(), Occurrence, parse_local_naive()

### Community 69 - "StorageAdapter"
Cohesion: 0.14
Nodes (3): S3CompatibleStorageAdapter, StorageAdapter, StoredObject

### Community 70 - "engines/studentlife.py"
Cohesion: 0.09
Nodes (11): compute_free_windows(), intersect_windows(), match_study_groups(), resolve_teacher_status(), score_study_pair(), StudyCandidate, StudyGroupMatchProposal, TimeWindow (+3 more)

### Community 71 - "FrontendInventory"
Cohesion: 0.25
Nodes (4): FrontendInventory, _validate(), build_snapshot(), summarise()

### Community 72 - "test_schema.py"
Cohesion: 0.18
Nodes (13): Campus, text(), make_resource(), period(), test_a_booking_may_start_exactly_when_a_lesson_ends(), test_a_cancelled_occupancy_frees_its_slot(), test_an_empty_period_is_refused(), test_btree_gist_and_the_exclusion_constraint_exist() (+5 more)

### Community 73 - "check_repo_safety.py"
Cohesion: 0.23
Nodes (11): Baseline, CheckError, collect_findings(), find_repo_root(), Findings, git(), is_waived(), load_baseline() (+3 more)

### Community 74 - "js_literal.py"
Cohesion: 0.27
Nodes (12): _Cursor, _find_declaration(), find_export(), _parse_array(), _parse_key(), _parse_keyword(), _parse_number(), _parse_object() (+4 more)

### Community 75 - "list_notifications"
Cohesion: 0.20
Nodes (7): ack_notification(), broadcast(), BroadcastIn, list_notifications(), PushSubscriptionIn, register_push(), _serialize_notification()

### Community 76 - "RecurrenceError"
Cohesion: 0.13
Nodes (9): _apply_override(), OverrideSpec, RecurrenceError, test_a_cancelled_occurrence_stays_in_the_series_flagged(), test_a_dtstart_with_an_offset_is_rejected(), test_a_move_override_without_a_new_start_is_rejected(), test_an_exdate_matches_the_original_start_not_a_moved_one(), test_an_override_that_ends_before_it_starts_is_rejected() (+1 more)

### Community 78 - "test_studentlife.py"
Cohesion: 0.09
Nodes (17): has_exif_metadata(), InvalidImageError, strip_image_exif(), LostFoundKind, LostFoundStatus, LostFoundItem, LostFoundCandidate, LostFoundMatch (+9 more)

### Community 79 - "logging.py"
Cohesion: 0.11
Nodes (3): get_logger(), Broker, get_broker()

### Community 80 - "import_timetable"
Cohesion: 0.16
Nodes (5): get_import(), import_timetable(), list_imports(), _parse_column_map(), rollback_import()

### Community 81 - ".infer"
Cohesion: 0.18
Nodes (3): _normalise(), _squash(), TestColumnMapping

### Community 82 - "AmphitheaterHall.tsx"
Cohesion: 0.12
Nodes (27): AmphitheaterHall(), createAmphitheaterHipRoofGeometry(), createOctagonShape(), createTierRingGeometry(), StaircaseFlight(), ADR-0029, getAmphitheaterFloorLogoTexture(), getAmphitheaterScreenTexture() (+19 more)

### Community 83 - "compilerOptions"
Cohesion: 0.12
Nodes (16): compilerOptions, allowJs, allowSyntheticDefaultImports, forceConsistentCasingInFileNames, isolatedModules, jsx, lib, module (+8 more)

### Community 86 - "stream.py"
Cohesion: 0.09
Nodes (13): _beat(), _current_sequence(), _error(), _send_catch_up(), _serve(), stream(), stream_changes(), _try_subscribe() (+5 more)

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
Cohesion: 0.30
Nodes (8): fetch_timetable(), list_timetables(), main(), _post(), room_report(), run(), summarise(), tables_of()

### Community 91 - "settle_due_rooms"
Cohesion: 0.09
Nodes (6): JobScheduler, _publish_changes(), settle_due_rooms(), SettleResult, TransitionRunner, test_the_scheduler_delay_is_clamped()

### Community 94 - "demo_schedule.py"
Cohesion: 0.20
Nodes (3): DemoLesson, _slot_instants(), _utf16_code_units()

### Community 96 - "compat_service.py"
Cohesion: 0.13
Nodes (10): CompatLesson, CompatMeta, RoomStatusCompat, interval_to_compat_lesson(), _lesson_id(), meeting_to_compat(), meta_for_campus(), meta_for_states() (+2 more)

### Community 97 - "test_timetable_import.py"
Cohesion: 0.15
Nodes (4): parse_weekday(), test_a_single_well_formed_row_always_validates(), test_every_row_is_either_usable_or_has_a_reported_issue(), TestWeekdayParsing

### Community 98 - "frontend"
Cohesion: 0.18
Nodes (11): condition, api, VITE_BACKEND_PROXY_TARGET, VITE_WATCH_POLLING, depends_on, environment, image, ports (+3 more)

### Community 99 - "backend-init"
Cohesion: 0.18
Nodes (11): depends_on, command, condition, depends_on, image, restart, volumes, condition (+3 more)

### Community 100 - "v1/tickets.py"
Cohesion: 0.18
Nodes (9): create_ticket(), get_ticket(), list_tickets(), rate_ticket(), _serialize_ticket(), TicketCreateIn, TicketRatingIn, TicketTransitionIn (+1 more)

### Community 101 - "mmc_queue_estimate"
Cohesion: 0.12
Nodes (6): calibrate_arrival_multiplier(), canteen_arrival_rate(), CanteenQueueEstimate, erlang_c_probability(), mmc_queue_estimate(), TestErlangCAndQueueFormulas

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

### Community 109 - "schemas/compat.py"
Cohesion: 0.12
Nodes (11): CompatBuilding, CompatCampus, CompatFloor, CompatLessonsResponse, CompatModel, CompatRoom, CompatRoomScheduleState, CompatRoomStatesResponse (+3 more)

### Community 110 - "ParticleKind"
Cohesion: 0.25
Nodes (8): ParticleKind, BasinRipple, CascadeCurtain, FanJet, FoamNozzle, GeyserCore, GeyserMist, SplashCrown

### Community 112 - "sniff_format"
Cohesion: 0.32
Nodes (3): sniff_format(), _source_label(), TestFormatSniffing

### Community 113 - "ImportBatch"
Cohesion: 0.40
Nodes (3): ImportBatch, ImportStatus, test_a_dry_run_records_its_report_for_audit()

### Community 114 - "services"
Cohesion: 0.33
Nodes (5): name, name, services, volumes, pgdata

### Community 115 - "scripts"
Cohesion: 0.33
Nodes (6): scripts, build, dev, preview, test, typecheck

### Community 118 - "env_file"
Cohesion: 0.60
Nodes (5): env_file, env_file, env_file, path, required

### Community 119 - "build"
Cohesion: 0.60
Nodes (5): build, context, dockerfile, target, build

### Community 120 - "Topic"
Cohesion: 0.13
Nodes (3): Topic, TopicKind, TestTopicParsing

### Community 137 - "test_notifications.py"
Cohesion: 0.18
Nodes (8): AppUser, AuditLog, test_broadcast_and_audit_logging(), test_notifications_api_lifecycle(), test_push_subscription_registration(), test_send_and_acknowledge_notification(), test_ticket_creation_duplicate_merge_and_upvote(), test_tickets_api_lifecycle()

### Community 138 - "engines/booking.py"
Cohesion: 0.16
Nodes (6): _merge(), _opening_hours_violations(), violation(), PolicyViolation, ViolationCode, _policy_error()

### Community 139 - "test_migrations.py"
Cohesion: 0.19
Nodes (8): _alembic(), _count(), _include(), test_models_and_migration_agree(), _compare(), test_the_version_table_survives_an_upgrade(), test_upgrade_then_downgrade_then_upgrade(), throwaway_database()

### Community 140 - "render_notification_template"
Cohesion: 0.19
Nodes (4): render_notification_template(), RenderedNotification, _SafeFormatDict, TestNotificationTemplates

### Community 141 - "ensure_aware"
Cohesion: 0.17
Nodes (5): ensure_aware(), to_utc(), test_ensure_aware_accepts_an_explicit_assumption(), test_ensure_aware_refuses_naive_without_a_zone(), test_utc_conversion_is_lossless()

### Community 142 - "CampusEnvironmentDetail.tsx"
Cohesion: 0.27
Nodes (11): BenchSpec, CampusEnvironmentDetail, computeCampusBenchesAndBins(), computeCampusStreetLamps(), computeCampusTotems(), cumulusCloudGeo, isInsideBuildingMargin(), isPointInsideFootprintWithMargin() (+3 more)

### Community 144 - "dev_token"
Cohesion: 0.29
Nodes (3): dev_token(), DevTokenRequest, TokenResponse

### Community 147 - "computeSemanticChanges"
Cohesion: 0.50
Nodes (5): computeSemanticChanges(), numDiff(), photosDiff(), pickPrimaryCategory(), pointsDiff()

## Knowledge Gaps
- **23 isolated node(s):** `ADR-0023`, `ADR-0020`, `ADR-0029`, `ADR-0020`, `ADR-0029` (+18 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 1499 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **36 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `RoomStateKind` connect `RoomStateKind` to `compat_service.py`, `studentlife_service.py`, `ticket_service.py`, `notification_service.py`, `base.py`, `test_schema.py`, `test_room_state.py`, `StateOptions`, `v1/state.py`, `search_rooms`, `test_state_api.py`, `sqlalchemy_ext_asyncio`?**
  _High betweenness centrality (0.024) - this node is a cross-community bridge._
- **Are the 29 inferred relationships involving `Settings` (e.g. with `healthz()` and `readyz()`) actually correct?**
  _`Settings` has 29 INFERRED edges - model-reasoned connections that need verification._
- **What connects `ADR-0023`, `ADR-0020`, `ADR-0029` to the rest of the system?**
  _23 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `studentlife_service.py` be split into smaller, more focused modules?**
  _Cohesion score 0.07863849765258216 - nodes in this community are weakly interconnected._
- **Why does `parse_csv()` connect `parse_csv` to `parsers.py`, `test_timetable_import.py`, `validate.py`, `TimetableRow`, `test_studentlife.py`, `.infer`, `import_service.py`?**
  _High betweenness centrality (0.022) - this node is a cross-community bridge._
- **Are the 48 inferred relationships involving `RoomStateKind` (e.g. with `BuildingSummaryOut` and `RoomStateOut`) actually correct?**
  _`RoomStateKind` has 48 INFERRED edges - model-reasoned connections that need verification._
- **Should `Hub` be split into smaller, more focused modules?**
  _Cohesion score 0.0845771144278607 - nodes in this community are weakly interconnected._