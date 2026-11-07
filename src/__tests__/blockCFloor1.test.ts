import React from 'react';
import { describe, expect, it } from 'vitest';
import {
  BlockCFoyerInterior3D,
  BlockCWCInterior3D,
  BlockCStairsInterior3D,
} from '../components/3d/BlockCFloor1Interiors';
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

describe('Block C Floor 1 (CAD Blueprint media_1794086099836_2b4970fa.png)', () => {
  it('exports valid React components for Floor 1 spaces', () => {
    expect(typeof BlockCFoyerInterior3D).toBe('function');
    expect(typeof BlockCWCInterior3D).toBe('function');
    expect(typeof BlockCStairsInterior3D).toBe('function');
    expect(typeof BlockCCanteenInterior3D).toBe('function');
  });

  it('renders valid React elements for Foyer, WC, Stairs, and Canteen', () => {
    const elFoyer = React.createElement(BlockCFoyerInterior3D, {
      position: [62.37, 1.55, 93.67],
      size: [5.53, 2.6, 10.76],
      selected: false,
    });
    expect(React.isValidElement(elFoyer)).toBe(true);

    const elWC = React.createElement(BlockCWCInterior3D, {
      position: [62.37, 1.55, 102.20],
      size: [5.53, 2.6, 6.31],
      selected: false,
    });
    expect(React.isValidElement(elWC)).toBe(true);

    const elStairs = React.createElement(BlockCStairsInterior3D, {
      position: [62.37, 1.55, 86.57],
      size: [5.53, 2.6, 3.44],
      selected: false,
    });
    expect(React.isValidElement(elStairs)).toBe(true);

    const elCanteen = React.createElement(BlockCCanteenInterior3D, {
      position: CANTEEN_LAYOUT.worldPosition,
      size: CANTEEN_LAYOUT.worldSize,
      selected: false,
    });
    expect(React.isValidElement(elCanteen)).toBe(true);
  });

  it('verifies Room 5 is removed and registers remaining rooms under Block C Floor 1', () => {
    const bldC = demoCampus.buildings.find((b) => b.id === 'bld-i');
    expect(bldC).toBeDefined();

    const floor1 = bldC?.floors.find((f) => f.level === 1);
    expect(floor1).toBeDefined();

    const roomIds = floor1?.rooms.map((r) => r.id) ?? [];
    expect(roomIds).not.toContain('bld-i-f1-room5');
    expect(roomIds).not.toContain('room-c-conf');
    expect(roomIds).toContain('room-canteen');
    expect(roomIds).toContain('bld-i-f1-foyer');
    expect(roomIds).toContain('bld-i-f1-wc');
    expect(roomIds).toContain('bld-i-f1-stairs');

    const canteen = floor1?.rooms.find((r) => r.id === 'room-canteen');
    expect(canteen?.number).toBe('Canteen');
    expect(canteen?.capacity).toBeGreaterThanOrEqual(150);
  });

  it('provides CAD-accurate 3D room geometries in accurateRoomOverrides with Room 5 removed', () => {
    expect(accurateRoomOverrides['bld-i-f1-room5']).toBeUndefined();

    // Canteen South Wing: 19.0m width x 27.2m length x 2.6m height
    const canteenGeom = accurateRoomOverrides['room-canteen'];
    expect(canteenGeom).toBeDefined();
    expect(canteenGeom.type).toBe('box');
    if (canteenGeom.type === 'box') {
      expect(canteenGeom.position[0]).toBeCloseTo(69.65, 1);
      expect(canteenGeom.position[1]).toBeCloseTo(1.55, 1);
      expect(canteenGeom.position[2]).toBeCloseTo(119.08, 1);
      expect(canteenGeom.size[0]).toBeCloseTo(19.0, 1);
      expect(canteenGeom.size[1]).toBeCloseTo(2.6, 1);
      expect(canteenGeom.size[2]).toBeCloseTo(27.2, 1);
    }

    // West Foyer: 5.53m width x 10.76m length
    const foyerGeom = accurateRoomOverrides['bld-i-f1-foyer'];
    expect(foyerGeom).toBeDefined();
    expect(foyerGeom.type).toBe('box');
    if (foyerGeom.type === 'box') {
      expect(foyerGeom.position[0]).toBeCloseTo(62.37, 1);
      expect(foyerGeom.size[0]).toBeCloseTo(5.53, 1);
      expect(foyerGeom.size[2]).toBeCloseTo(10.76, 1);
    }

    // Restrooms WC: 5.53m width x 6.31m length
    const wcGeom = accurateRoomOverrides['bld-i-f1-wc'];
    expect(wcGeom).toBeDefined();
    expect(wcGeom.type).toBe('box');
    if (wcGeom.type === 'box') {
      expect(wcGeom.position[0]).toBeCloseTo(62.37, 1);
      expect(wcGeom.size[0]).toBeCloseTo(5.53, 1);
      expect(wcGeom.size[2]).toBeCloseTo(6.31, 1);
    }

    // Northwest Staircase: 5.53m width x 3.44m length
    const stairsGeom = accurateRoomOverrides['bld-i-f1-stairs'];
    expect(stairsGeom).toBeDefined();
    expect(stairsGeom.type).toBe('box');
    if (stairsGeom.type === 'box') {
      expect(stairsGeom.position[0]).toBeCloseTo(62.37, 1);
      expect(stairsGeom.size[0]).toBeCloseTo(5.53, 1);
      expect(stairsGeom.size[2]).toBeCloseTo(3.44, 1);
    }
  });

  it('indexes Canteen and Foyer in global search service', () => {
    const index = createCampusIndex(demoCampus);
    const searchRoom5 = search('Room 5', index, []);
    expect(searchRoom5.some((res) => res.roomId === 'bld-i-f1-room5')).toBe(false);

    const searchCanteen = search('Canteen', index, []);
    expect(searchCanteen.some((res) => res.roomId === 'room-canteen')).toBe(true);
  });

  it('generates surveyed room geometries in geometryProvider for Floor 1 rooms', () => {
    const campusGeom = geometryProvider.build(demoCampus);
    expect(campusGeom.rooms['bld-i-f1-room5']).toBeUndefined();

    const canteen = campusGeom.rooms['room-canteen'];
    expect(canteen).toBeDefined();
    expect(canteen.precision).toBe('surveyed');

    const foyer = campusGeom.rooms['bld-i-f1-foyer'];
    expect(foyer).toBeDefined();
    expect(foyer.precision).toBe('surveyed');
  });
});
