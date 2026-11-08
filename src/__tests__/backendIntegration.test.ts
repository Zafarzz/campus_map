import { afterEach, describe, expect, it, vi } from 'vitest';
import { demoCampus } from '../data/demo-campus';
import { mapConfig } from '../config/mapConfig';
import { createCampusIndex } from '../domain/campus/campusIndex';
import {
  navigateToPlaceOnMap,
  reconcileBuildVersion,
  resolvePlaceNavigationTarget,
  toCampusIsoMinute,
  type BusynessPlace,
} from '../hooks/useBackendLive';
import { initialTimeMode, resolveSimulatedDate } from '../hooks/useNow';
import { fetchBuildVersion, isBackendEnabled } from '../services/api/apiClient';
import { loadCampus } from '../services/campus/campusService';
import {
  navigateToLostFoundItemOnMap,
  resolveLostFoundNavigationTarget,
} from '../services/lostfound/lostFoundService';
import type { LostFoundItem } from '../services/lostfound/lostFoundTypes';
import { loadLessonsForDate } from '../services/schedule/scheduleService';

const okJson = (body: unknown) => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(body) } as Response);

afterEach(() => vi.unstubAllGlobals());

describe('backend integration seams', () => {
  it('enables backend integration by default unless explicitly disabled', () => {
    expect(isBackendEnabled).toBe(true);
  });

  it('formats /busyness timestamps with explicit +05:00 Asia/Tashkent offset', () => {
    const sample = new Date(2026, 9, 31, 10, 30, 45);
    expect(toCampusIsoMinute(sample)).toBe('2026-10-31T10:30:00+05:00');
  });

  it('uses lessons from the backend when reachable', async () => {
    const lesson = {
      id: 'l1',
      roomId: 'bld-h-f1-a102',
      subject: 'From DB',
      startsAt: '2026-10-27T09:00:00',
      endsAt: '2026-10-27T10:20:00',
    };
    const fetchMock = vi.fn((_url: string) => okJson({ date: '2026-10-27', lessons: [lesson] }));
    vi.stubGlobal('fetch', fetchMock);
    const lessons = await loadLessonsForDate(demoCampus, '2026-10-27');
    expect(lessons).toEqual([lesson]);
    expect(String(fetchMock.mock.calls[0]![0])).toContain('/api/v1/compat/lessons?date=2026-10-27');
  });

  it('returns an empty list instead of fake mock lessons when backend is unreachable', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('connection refused'))));
    const lessons = await loadLessonsForDate(demoCampus, '2026-10-27');
    expect(lessons).toEqual([]);
  });

  it('keeps demoCampus when the backend campus is incomplete', async () => {
    vi.stubGlobal('fetch', vi.fn(() => okJson({ id: 'x', name: 'x', buildings: [] })));
    const campus = await loadCampus();
    expect(campus.buildings.length).toBe(demoCampus.buildings.length);
  });

  it('accepts the backend campus when it covers every demo building and room', async () => {
    const remote = { ...demoCampus, name: 'Campus from DB' };
    vi.stubGlobal('fetch', vi.fn(() => okJson(remote)));
    const campus = await loadCampus();
    expect(campus.name).toBe('Campus from DB');
  });

  it('parses /version.json when valid and returns null in dev/404 mode', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => okJson({ commit: '25fa250', buildId: 'a1b2c3d4e5f6', builtAt: '2026-10-29T15:00:00Z' })),
    );
    const info = await fetchBuildVersion();
    expect(info).toEqual({ commit: '25fa250', buildId: 'a1b2c3d4e5f6', builtAt: '2026-10-29T15:00:00Z' });

    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({ ok: false, status: 404 } as Response)));
    expect(await fetchBuildVersion()).toBeNull();
  });

  it('distinguishes backend-only deploys from frontend bundle updates', () => {
    const v1 = { commit: '25fa250', buildId: 'bundle-aaa111' };
    expect(reconcileBuildVersion(null, v1)).toEqual({ action: 'init', current: v1 });
    expect(reconcileBuildVersion(v1, v1)).toEqual({ action: 'none', current: v1 });

    const backendOnly = { commit: '89bc012', buildId: 'bundle-aaa111' };
    expect(reconcileBuildVersion(v1, backendOnly)).toEqual({ action: 'backend-updated', current: backendOnly });

    const frontendChanged = { commit: '99de345', buildId: 'bundle-bbb222' };
    expect(reconcileBuildVersion(backendOnly, frontendChanged)).toEqual({
      action: 'frontend-updated',
      current: frontendChanged,
    });
  });

  it('uses official AUT EduPage lesson periods with 12:45-13:30 lunch break free', () => {
    const slotPairs = mapConfig.schedule.slots.map(([s, e]) => `${s}-${e}`);
    expect(slotPairs).not.toContain('12:00-13:20');
    expect(slotPairs).toEqual([
      '08:30-09:45',
      '10:00-11:15',
      '11:30-12:45',
      '13:30-14:45',
      '15:00-16:15',
      '16:30-17:45',
      '18:00-19:15',
    ]);
  });

  it('defaults weekend visits to simulated Monday while keeping weekday class hours live', () => {
    const satMorning = new Date(2026, 9, 31, 10, 30, 0); // Saturday Oct 31, 2026
    const modeSat = initialTimeMode(satMorning);
    expect(modeSat).toEqual({ mode: 'simulated', minutes: 630, weekday: 0 });

    const resolvedMon = resolveSimulatedDate(satMorning, 630, 0);
    expect(resolvedMon.getFullYear()).toBe(2026);
    expect(resolvedMon.getMonth()).toBe(9);
    expect(resolvedMon.getDate()).toBe(26); // Monday Oct 26, 2026
    expect(resolvedMon.getHours()).toBe(10);
    expect(resolvedMon.getMinutes()).toBe(30);

    const tueMorning = new Date(2026, 9, 27, 10, 30, 0); // Tuesday Oct 27, 2026
    expect(initialTimeMode(tueMorning)).toEqual({ mode: 'live' });
  });

  it('navigates to the exact building, floor, and room when a crowded place is clicked', () => {
    const index = createCampusIndex(demoCampus);
    const selectedRooms: string[] = [];
    const selectedFloors: string[] = [];
    const selectedBuildings: string[] = [];

    const nav = {
      hasRoom: (id: string) => index.rooms.has(id),
      hasFloor: (id: string) => index.floors.has(id),
      hasBuilding: (id: string) => index.buildings.has(id),
      selectRoom: (id: string) => selectedRooms.push(id),
      selectFloor: (id: string) => selectedFloors.push(id),
      selectBuilding: (id: string) => selectedBuildings.push(id),
    };

    const studyLounge: BusynessPlace = {
      place_id: 'place-study-a',
      name: 'Block A Open Study Lounge',
      kind: 'study_area',
      building_id: 'bld-h',
      floor_id: 'bld-h-f1',
      room_id: 'bld-h-f1-a105',
      capacity: 48,
      level: 'busy',
      percentage_of_capacity: 75.8,
      headcount_likely: 36,
      provenance: 'estimated',
      confidence: 0.65,
    };

    const target = resolvePlaceNavigationTarget(studyLounge);
    expect(target).toEqual({
      buildingId: 'bld-i',
      floorId: 'bld-i-f2',
      roomId: 'room-open-study-ac',
      locationBadge: 'Block A–C · F2 · OSP-AC',
    });

    navigateToPlaceOnMap(studyLounge, nav);
    expect(selectedRooms).toEqual(['room-open-study-ac']);
    expect(index.rooms.get('room-open-study-ac')?.building.id).toBe('bld-i');
    expect(index.rooms.get('room-open-study-ac')?.floor.id).toBe('bld-i-f2');

    const sportsHall: BusynessPlace = {
      ...studyLounge,
      place_id: 'place-sports-hall',
      name: 'Main Sports Hall',
      kind: 'sports_hall',
      building_id: 'bld-e',
      floor_id: 'bld-e-f1',
      room_id: 'bld-e-f1-r1',
    };
    expect(resolvePlaceNavigationTarget(sportsHall)).toEqual({
      buildingId: 'bld-i',
      floorId: 'bld-i-f2',
      roomId: 'bld-i-f2-gym',
      locationBadge: 'Block C · F2 · C-GYM',
    });
    navigateToPlaceOnMap(sportsHall, nav);
    expect(selectedRooms).toEqual(['room-open-study-ac', 'bld-i-f2-gym']);
    expect(index.rooms.get('bld-i-f2-gym')?.building.id).toBe('bld-i');
    expect(index.rooms.get('bld-i-f2-gym')?.floor.id).toBe('bld-i-f2');

    const indoorTennis: BusynessPlace = {
      ...studyLounge,
      place_id: 'place-gym',
      name: 'Indoor Tennis Hall (H-103)',
      kind: 'gym',
      building_id: 'bld-e',
      floor_id: 'bld-e-f1',
      room_id: 'bld-e-f1-r1',
    };
    expect(resolvePlaceNavigationTarget(indoorTennis)).toEqual({
      buildingId: 'bld-e',
      floorId: 'bld-e-f1',
      roomId: 'bld-e-f1-tennis',
      locationBadge: 'Halls · F1 · H-103',
    });
    navigateToPlaceOnMap(indoorTennis, nav);
    expect(selectedRooms).toEqual(['room-open-study-ac', 'bld-i-f2-gym', 'bld-e-f1-tennis']);
    expect(index.rooms.get('bld-e-f1-tennis')?.building.id).toBe('bld-e');
    expect(index.rooms.get('bld-e-f1-tennis')?.floor.id).toBe('bld-e-f1');

    const canteen: BusynessPlace = {
      ...studyLounge,
      place_id: 'place-canteen',
      name: 'Main Student Canteen',
      kind: 'canteen',
      building_id: 'bld-i',
      floor_id: 'bld-i-f1',
      room_id: 'room-canteen',
    };
    navigateToPlaceOnMap(canteen, nav);
    expect(selectedRooms).toEqual([
      'room-open-study-ac',
      'bld-i-f2-gym',
      'bld-e-f1-tennis',
      'room-canteen',
    ]);
  });

  it('navigates to the exact building, floor, or room when a Lost & Found item is tapped', () => {
    const index = createCampusIndex(demoCampus);
    const selectedRooms: string[] = [];
    const selectedFloors: string[] = [];
    const selectedBuildings: string[] = [];

    const nav = {
      selectRoom: (id: string) => selectedRooms.push(id),
      selectFloor: (id: string) => selectedFloors.push(id),
      selectBuilding: (id: string) => selectedBuildings.push(id),
    };

    const airpodsItem: LostFoundItem = {
      id: 'demo-lf-1',
      reporter_user_id: 'demo-202590123',
      is_mine: true,
      kind: 'found',
      status: 'open',
      category: 'electronics',
      title: 'Apple AirPods Pro in White Case',
      description: 'Found on the 2nd row table in Block A Room 204 Computer Lab after the 11:15 class.',
      building_id: 'bld-h',
      floor_id: 'bld-h-f2',
      room_id: 'bld-h-f2-r204', // legacy room ID
      occurred_at: '2026-11-08T08:00:00Z',
      expires_at: '2026-12-08T08:00:00Z',
    };

    expect(resolveLostFoundNavigationTarget(airpodsItem, index)).toEqual({
      buildingId: 'bld-h',
      floorId: 'bld-h-f2',
      roomId: 'bld-h-f2-a204',
    });
    navigateToLostFoundItemOnMap(airpodsItem, index, nav);
    expect(selectedRooms).toEqual(['bld-h-f2-a204']);

    const libraryItem: LostFoundItem = {
      id: 'lf-lib',
      reporter_user_id: 'student-2',
      is_mine: false,
      kind: 'lost',
      status: 'open',
      category: 'books',
      title: 'Calculus Textbook',
      description: 'Left on a reading desk in the Library',
      building_id: 'bld-f',
      occurred_at: '2026-11-08T09:00:00Z',
      expires_at: '2026-12-08T09:00:00Z',
    };

    expect(resolveLostFoundNavigationTarget(libraryItem, index)).toEqual({
      buildingId: 'bld-d',
      floorId: 'bld-d-f1',
      roomId: 'bld-d-f1-f101',
    });
    navigateToLostFoundItemOnMap(libraryItem, index, nav);
    expect(selectedRooms).toEqual(['bld-h-f2-a204', 'bld-d-f1-f101']);

    const dormBuildingOnly: LostFoundItem = {
      id: 'lf-dorm',
      reporter_user_id: 'student-3',
      is_mine: false,
      kind: 'lost',
      status: 'open',
      category: 'clothing',
      title: 'Grey Hoodie',
      description: 'Left near the dormitory entrance bench',
      building_id: 'bld-j',
      occurred_at: '2026-11-08T09:30:00Z',
      expires_at: '2026-12-08T09:30:00Z',
    };

    expect(resolveLostFoundNavigationTarget(dormBuildingOnly, index)).toEqual({
      buildingId: 'bld-j',
      floorId: null,
      roomId: null,
    });
    navigateToLostFoundItemOnMap(dormBuildingOnly, index, nav);
    expect(selectedBuildings).toEqual(['bld-j']);
  });
});
