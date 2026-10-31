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

  it('uses official AUT EduPage lesson periods with 12:45?13:30 lunch break free', () => {
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
      capacity: 48,
      level: 'busy',
      percentage_of_capacity: 75.8,
      headcount_likely: 36,
      provenance: 'estimated',
      confidence: 0.65,
    };

    const target = resolvePlaceNavigationTarget(studyLounge);
    expect(target).toEqual({
      buildingId: 'bld-h',
      floorId: 'bld-h-f1',
      roomId: 'bld-h-f1-a105',
      locationBadge: 'Block A · F1',
    });

    navigateToPlaceOnMap(studyLounge, nav);
    expect(selectedRooms).toEqual(['bld-h-f1-a105']);
    expect(index.rooms.get('bld-h-f1-a105')?.building.id).toBe('bld-h');
    expect(index.rooms.get('bld-h-f1-a105')?.floor.id).toBe('bld-h-f1');

    const canteen: BusynessPlace = {
      ...studyLounge,
      place_id: 'place-canteen',
      name: 'Main Student Canteen',
      kind: 'canteen',
      building_id: 'bld-i',
    };
    navigateToPlaceOnMap(canteen, nav);
    expect(selectedRooms).toEqual(['bld-h-f1-a105', 'room-canteen']);
    expect(index.rooms.get('room-canteen')?.building.id).toBe('bld-i');
    expect(index.rooms.get('room-canteen')?.floor.id).toBe('bld-i-f1');
  });
});
