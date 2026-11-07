import React from 'react';
import { describe, expect, it } from 'vitest';
import {
  BlockCSportsHallInterior,
  SPORTS_HALL_LAYOUT,
  SPORTS_HALL_ROOM_ID,
} from '../components/3d/BlockCSportsHallInterior';
import { demoCampus } from '../data/demo-campus';
import { accurateRoomOverrides } from '../data/floor-plans';
import { geometryProvider } from '../services/geometry';
import { createCampusIndex } from '../domain/campus/campusIndex';
import { search } from '../services/search/searchService';
import { buildSportsHallInteriorColliderSpecs } from '../game/world/CampusColliders';

describe('Block C 3D Sports Hall Interior (Volleyball & Basketball, 5m Height)', () => {
  it('exports valid React component BlockCSportsHallInterior', () => {
    expect(typeof BlockCSportsHallInterior).toBe('function');
  });

  it('defines CAD-accurate dimensions (9.6m x 18.2m x 5.0m) inside Block C Floor 2', () => {
    expect(SPORTS_HALL_ROOM_ID).toBe('bld-i-f2-gym');
    expect(SPORTS_HALL_LAYOUT.widthX).toBeCloseTo(9.6, 1);
    expect(SPORTS_HALL_LAYOUT.lengthZ).toBeCloseTo(18.2, 1);
    expect(SPORTS_HALL_LAYOUT.heightY).toBeCloseTo(5.0, 1);
    expect(SPORTS_HALL_LAYOUT.worldPosition[0]).toBeCloseTo(74.15, 1);
    expect(SPORTS_HALL_LAYOUT.worldPosition[2]).toBeCloseTo(123.65, 1);
  });

  it('renders valid React elements for selected and non-selected states', () => {
    const elNormal = React.createElement(BlockCSportsHallInterior, {
      position: [74.15, 6.4, 123.65],
      size: [9.6, 5.0, 18.2],
      selected: false,
    });
    expect(React.isValidElement(elNormal)).toBe(true);

    const elSelected = React.createElement(BlockCSportsHallInterior, {
      position: [74.15, 6.4, 123.65],
      size: [9.6, 5.0, 18.2],
      selected: true,
    });
    expect(React.isValidElement(elSelected)).toBe(true);
  });

  it('registers bld-i-f2-gym in demoCampus under Block C Floor 2', () => {
    const bldC = demoCampus.buildings.find((b) => b.id === 'bld-i');
    expect(bldC).toBeDefined();

    const floor2 = bldC?.floors.find((f) => f.level === 2);
    expect(floor2).toBeDefined();

    const gymRoom = floor2?.rooms.find((r) => r.id === 'bld-i-f2-gym');
    expect(gymRoom).toBeDefined();
    expect(gymRoom?.number).toBe('C-GYM');
    expect(gymRoom?.name).toMatch(/Volleyball|Sports Hall/i);
    expect(gymRoom?.description?.toLowerCase()).toContain('volleyball');
    expect(gymRoom?.provenance).toBe('confirmed');
  });

  it('provides surveyed 3D RoomGeometry box with height 5.0m in accurateRoomOverrides inside Block C', () => {
    const gymGeom = accurateRoomOverrides['bld-i-f2-gym'];
    expect(gymGeom).toBeDefined();
    expect(gymGeom.type).toBe('box');

    if (gymGeom.type === 'box') {
      const [w, h, d] = gymGeom.size;
      expect(w).toBeCloseTo(9.6, 1);
      expect(h).toBeCloseTo(5.0, 1);
      expect(d).toBeCloseTo(18.2, 1);
      expect(gymGeom.position[0]).toBeCloseTo(74.15, 1);
      expect(gymGeom.position[2]).toBeCloseTo(123.65, 1);
      expect(gymGeom.precision).toBe('surveyed');
    }
  });

  it('indexes bld-i-f2-gym in search service with relevant keywords', () => {
    const index = createCampusIndex(demoCampus);

    const resultsGym = search('gym', index, []);
    expect(resultsGym.some((r) => r.roomId === 'bld-i-f2-gym')).toBe(true);

    const resultsSports = search('Volleyball', index, []);
    expect(resultsSports.some((r) => r.roomId === 'bld-i-f2-gym')).toBe(true);

    const resultsNumber = search('C-GYM', index, []);
    expect(resultsNumber.some((r) => r.roomId === 'bld-i-f2-gym')).toBe(true);
  });

  it('generates physical collider specs for sprung floor, enclosing walls, and volleyball posts', () => {
    const campusGeom = geometryProvider.build(demoCampus);
    const specs = buildSportsHallInteriorColliderSpecs(campusGeom);

    expect(specs.length).toBeGreaterThanOrEqual(6);
    expect(specs.some((s) => s.id === 'gym-floor-slab')).toBe(true);
    expect(specs.some((s) => s.id === 'gym-wall-south')).toBe(true);
    expect(specs.some((s) => s.id === 'gym-wall-north')).toBe(true);
    expect(specs.some((s) => s.id === 'gym-volley-post-w')).toBe(true);
    expect(specs.some((s) => s.id === 'gym-volley-post-e')).toBe(true);
  });
});
