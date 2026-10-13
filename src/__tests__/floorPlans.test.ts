import { describe, it, expect } from 'vitest';
import { demoCampus } from '../data/demo-campus';
import { confirmedFloorPlans, accurateRoomOverrides } from '../data/floor-plans';
import { geometryProvider } from '../services/geometry';
import { createCampusIndex } from '../domain/campus/campusIndex';
import { search } from '../services/search/searchService';
import { createDemoSchedule } from '../data/demo-schedule';

describe('CAD Floor Plans and Geometry Integration', () => {
  it('loads all confirmed floor plans from Campus map (3).pdf', () => {
    expect(confirmedFloorPlans.length).toBeGreaterThanOrEqual(8);

    const buildingIds = new Set(confirmedFloorPlans.map((p) => p.buildingId));
    // Buildings A, B, D, E, F
    expect(buildingIds.has('bld-h')).toBe(true);
    expect(buildingIds.has('bld-g')).toBe(true);
    expect(buildingIds.has('bld-c')).toBe(true);
    expect(buildingIds.has('bld-b')).toBe(true);
    expect(buildingIds.has('bld-d')).toBe(true);
  });

  it('configures Building A and Building D as 2-storey buildings', () => {
    const buildingA = demoCampus.buildings.find((b) => b.id === 'bld-h');
    const buildingD = demoCampus.buildings.find((b) => b.id === 'bld-c');
    expect(buildingA).toBeDefined();
    expect(buildingD).toBeDefined();
    expect(buildingA?.floors.length).toBe(2);
    expect(buildingD?.floors.length).toBe(2);

    const geom = geometryProvider.build(demoCampus);
    expect(geom.buildings['bld-h']?.height).toBe(7.2); // 2 floors * 3.6m
    expect(geom.buildings['bld-c']?.height).toBe(7.2);
  });

  it('generates surveyed room geometry overrides for all confirmed rooms', () => {
    expect(Object.keys(accurateRoomOverrides).length).toBeGreaterThan(30);

    for (const [id, geom] of Object.entries(accurateRoomOverrides)) {
      expect(geom.precision).toBe('surveyed');
      expect(geom.type).toBe('box');
      if (geom.type === 'box') {
        expect(geom.size[0]).toBeGreaterThan(0.5);
        expect(geom.size[1]).toBe(2.6); // Room clear height
        expect(geom.size[2]).toBeGreaterThan(0.5);
        expect(Number.isFinite(geom.position[0])).toBe(true);
        expect(Number.isFinite(geom.position[1])).toBe(true);
        expect(Number.isFinite(geom.position[2])).toBe(true);
      }
    }
  });

  it('populates surveyed precision rooms in built CampusGeometry', () => {
    const campusGeom = geometryProvider.build(demoCampus);
    expect(campusGeom.buildings['bld-h']).toBeDefined();
    expect(campusGeom.buildings['bld-c']).toBeDefined();

    // Check specific confirmed rooms have surveyed precision
    expect(campusGeom.rooms['bld-h-f1-a101']?.precision).toBe('surveyed');
    expect(campusGeom.rooms['bld-c-f1-d101']?.precision).toBe('surveyed');
    expect(campusGeom.rooms['bld-g-f1-b105']?.precision).toBe('surveyed');
    expect(campusGeom.rooms['bld-b-f1-e101']?.precision).toBe('surveyed');
    expect(campusGeom.rooms['bld-d-f2-f201']?.precision).toBe('surveyed');
  });

  it('indexes all confirmed rooms in campus index and allows searching them', () => {
    const index = createCampusIndex(demoCampus);

    // Search for rooms from each confirmed building
    const searchA = search('A-101', index, []);
    expect(searchA.some((r) => r.kind === 'room' && r.title.includes('A-101'))).toBe(true);

    const searchB = search('B-105', index, []);
    expect(searchB.some((r) => r.kind === 'room' && r.title.includes('B-105'))).toBe(true);

    const searchD = search('D-107', index, []);
    expect(searchD.some((r) => r.kind === 'room' && r.title.includes('D-107'))).toBe(true);

    const searchE = search('E-101', index, []);
    expect(searchE.some((r) => r.kind === 'room' && r.title.includes('E-101'))).toBe(true);

    const searchF = search('F-201', index, []);
    expect(searchF.some((r) => r.kind === 'room' && r.title.includes('F-201'))).toBe(true);

    const searchF203 = search('F-203', index, []);
    expect(searchF203.length).toBe(0);
  });

  it('generates demo schedule without errors for confirmed and upper floor rooms', () => {
    const lessons = createDemoSchedule(demoCampus, '2026-10-14', [
      ['09:00', '10:20'],
      ['10:30', '11:50'],
      ['13:00', '14:20'],
    ]);
    expect(lessons.length).toBeGreaterThan(0);

    const lessonRoomIds = new Set(lessons.map((l) => l.roomId));
    expect(lessonRoomIds.size).toBeGreaterThan(10);
  });
});
