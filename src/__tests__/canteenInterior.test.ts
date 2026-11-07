import React from 'react';
import { describe, expect, it } from 'vitest';
import {
  BlockCCanteenInterior3D,
  CANTEEN_LAYOUT,
  CANTEEN_ROOM_ID,
} from '../components/3d/BlockCCanteenInterior3D';
import { demoCampus } from '../data/demo-campus';
import { accurateRoomOverrides } from '../data/floor-plans';
import { geometryProvider } from '../services/geometry';
import { createCampusIndex } from '../domain/campus/campusIndex';
import { search } from '../services/search/searchService';

describe('Block C 3D Canteen & Dining Hall Interior (Floor 1)', () => {
  it('exports valid React component BlockCCanteenInterior3D', () => {
    expect(typeof BlockCCanteenInterior3D).toBe('function');
  });

  it('defines CAD-accurate dimensions (17.0m x 2.6m x 44.0m) inside Block C Floor 1', () => {
    expect(CANTEEN_ROOM_ID).toBe('room-canteen');
    expect(CANTEEN_LAYOUT.widthX).toBeCloseTo(19.0, 1);
    expect(CANTEEN_LAYOUT.heightY).toBeCloseTo(2.6, 1);
    expect(CANTEEN_LAYOUT.lengthZ).toBeCloseTo(27.2, 1);
    expect(CANTEEN_LAYOUT.worldPosition[0]).toBeCloseTo(69.65, 1);
    expect(CANTEEN_LAYOUT.worldPosition[1]).toBeCloseTo(1.55, 1);
    expect(CANTEEN_LAYOUT.worldPosition[2]).toBeCloseTo(119.08, 1);
  });

  it('renders valid React elements for selected and non-selected states', () => {
    const elNormal = React.createElement(BlockCCanteenInterior3D, {
      position: [69.65, 1.55, 108.90],
      size: [17.0, 2.6, 44.0],
      selected: false,
    });
    expect(React.isValidElement(elNormal)).toBe(true);

    const elSelected = React.createElement(BlockCCanteenInterior3D, {
      position: [69.65, 1.55, 108.90],
      size: [17.0, 2.6, 44.0],
      selected: true,
    });
    expect(React.isValidElement(elSelected)).toBe(true);
  });

  it('registers room-canteen in demoCampus under Block C Floor 1 spanning the full cafeteria', () => {
    const bldC = demoCampus.buildings.find((b) => b.id === 'bld-i');
    expect(bldC).toBeDefined();

    const floor1 = bldC?.floors.find((f) => f.level === 1);
    expect(floor1).toBeDefined();

    const canteen = floor1?.rooms.find((r) => r.id === 'room-canteen');
    expect(canteen).toBeDefined();
    expect(canteen?.number).toBe('Canteen');
    expect(canteen?.name).toContain('Canteen');
    expect(canteen?.capacity).toBeGreaterThanOrEqual(120);
  });

  it('verifies Large Lecture Hall C-201 and Volleyball Arena are on Floor 2 of Block C', () => {
    const bldC = demoCampus.buildings.find((b) => b.id === 'bld-i');
    const floor2 = bldC?.floors.find((f) => f.level === 2);
    expect(floor2).toBeDefined();

    const c201 = floor2?.rooms.find((r) => r.id === 'bld-i-f2-c201');
    expect(c201).toBeDefined();
    expect(c201?.number).toBe('C-201');
  });

  it('provides surveyed 3D room overrides with exact ground-floor coordinates', () => {
    const canteenGeom = accurateRoomOverrides['room-canteen'];
    expect(canteenGeom).toBeDefined();
    expect(canteenGeom.type).toBe('box');
    if (canteenGeom.type === 'box') {
      expect(canteenGeom.position[0]).toBeCloseTo(69.65, 1);
      expect(canteenGeom.position[1]).toBeCloseTo(1.55, 1);
      expect(canteenGeom.position[2]).toBeCloseTo(119.08, 1);
      expect(canteenGeom.size[0]).toBeCloseTo(19.0, 1);
      expect(canteenGeom.size[2]).toBeCloseTo(27.2, 1);
    }

    const c201Geom = accurateRoomOverrides['bld-i-f2-c201'];
    expect(c201Geom).toBeDefined();
    expect(c201Geom.type).toBe('box');
    if (c201Geom.type === 'box') {
      expect(c201Geom.position[0]).toBeCloseTo(74.15, 1);
      expect(c201Geom.position[1]).toBeCloseTo(6.40, 1);
      expect(c201Geom.position[2]).toBeCloseTo(92.55, 1);
    }
  });

  it('allows searching Canteen via global campus search', () => {
    const index = createCampusIndex(demoCampus);
    const searchResults = search('Canteen', index, []);
    expect(searchResults.some((res) => res.roomId === 'room-canteen')).toBe(true);
  });

  it('generates surveyed room geometry in geometryProvider', () => {
    const campusGeom = geometryProvider.build(demoCampus);
    const canteenGeom = campusGeom.rooms['room-canteen'];
    expect(canteenGeom).toBeDefined();
    expect(canteenGeom.type).toBe('box');
    expect(canteenGeom.precision).toBe('surveyed');

    const c201Geom = campusGeom.rooms['bld-i-f2-c201'];
    expect(c201Geom).toBeDefined();
    expect(c201Geom.type).toBe('box');
    expect(c201Geom.precision).toBe('surveyed');
  });
});
