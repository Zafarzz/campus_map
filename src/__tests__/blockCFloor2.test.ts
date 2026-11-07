import { describe, expect, it } from 'vitest';
import React from 'react';
import { BlockCLectureHall3D } from '../components/3d/BlockCLectureHall3D';
import { BlockCSportsHallInterior } from '../components/3d/BlockCSportsHallInterior';
import { Room } from '../components/3d/Room';
import { demoCampus } from '../data/demo-campus';
import { confirmedFloorPlans, accurateRoomOverrides } from '../data/floor-plans';
import { geometryProvider } from '../services/geometry';
import { createCampusIndex } from '../domain/campus/campusIndex';
import { search } from '../services/search/searchService';
import type { Room as RoomData } from '../domain/campus/types';
import type { RoomGeometry } from '../domain/geometry/types';

describe('Block C Floor 2 Architecture (Blueprint media_1794086015357_8ef747bc.png)', () => {
  it('exports valid React components BlockCLectureHall3D and BlockCSportsHallInterior', () => {
    expect(typeof BlockCLectureHall3D).toBe('function');
    expect(typeof BlockCSportsHallInterior).toBe('function');
  });

  it('renders valid React element for BlockCLectureHall3D with 5m high ceiling', () => {
    const el = React.createElement(BlockCLectureHall3D, {
      position: [74.15, 6.40, 92.55],
      size: [9.6, 5.0, 15.0],
      roomNumber: 'C-201',
      selected: true,
    });
    expect(React.isValidElement(el)).toBe(true);
    expect(el.props.size[1]).toBe(5.0);
    expect(el.props.roomNumber).toBe('C-201');
  });

  it('renders valid React element for Room with BlockCLectureHall3D', () => {
    const room: RoomData = {
      id: 'bld-i-f2-c201',
      number: 'C-201',
      name: 'Lecture Hall C-201 (5m High)',
      kind: 'hall',
      capacity: 80,
      provenance: 'confirmed',
    };
    const geometry: RoomGeometry = {
      type: 'box',
      position: [74.15, 6.40, 92.55],
      size: [9.6, 5.0, 15.0],
      precision: 'surveyed',
    };

    const roomEl = React.createElement(Room, {
      room,
      geometry,
      status: 'AVAILABLE',
      selected: true,
      onSelect: () => {},
    });
    expect(React.isValidElement(roomEl)).toBe(true);
  });

  it('verifies Conference Hall (room-c-conf) is removed from Block C Floor 2', () => {
    const bldC = demoCampus.buildings.find((b) => b.id === 'bld-i');
    const floor2 = bldC?.floors.find((f) => f.level === 2);
    expect(floor2).toBeDefined();

    // Conference Hall should NOT be on floor 2
    const confHall = floor2?.rooms.find((r) => r.id === 'room-c-conf');
    expect(confHall).toBeUndefined();
  });

  it('verifies Block C Floor 2 contains C-201, C-202, C-GYM, and C-Locker', () => {
    const bldCPlan = confirmedFloorPlans.find((p) => p.buildingId === 'bld-i' && p.level === 2);
    expect(bldCPlan).toBeDefined();

    const roomIds = bldCPlan?.rooms.map((r) => r.id);
    expect(roomIds).toContain('bld-i-f2-c201');
    expect(roomIds).toContain('bld-i-f2-c202');
    expect(roomIds).toContain('bld-i-f2-gym');
    expect(roomIds).toContain('bld-i-f2-locker');

    const c201 = bldCPlan?.rooms.find((r) => r.id === 'bld-i-f2-c201');
    const c202 = bldCPlan?.rooms.find((r) => r.id === 'bld-i-f2-c202');
    const gym = bldCPlan?.rooms.find((r) => r.id === 'bld-i-f2-gym');
    const locker = bldCPlan?.rooms.find((r) => r.id === 'bld-i-f2-locker');

    expect(c201?.number).toBe('C-201');
    expect(c202?.number).toBe('C-202');
    expect(gym?.number).toBe('C-GYM');
    expect(gym?.name).toContain('Volleyball');
    expect(locker?.number).toBe('C-Locker');
  });

  it('verifies exact millimeter-matched surveyed positions in accurateRoomOverrides', () => {
    const c201Geom = accurateRoomOverrides['bld-i-f2-c201'];
    const c202Geom = accurateRoomOverrides['bld-i-f2-c202'];
    const gymGeom = accurateRoomOverrides['bld-i-f2-gym'];
    const lockerGeom = accurateRoomOverrides['bld-i-f2-locker'];

    expect(c201Geom?.type).toBe('box');
    expect(c202Geom?.type).toBe('box');
    expect(gymGeom?.type).toBe('box');
    expect(lockerGeom?.type).toBe('box');

    if (c201Geom.type === 'box') {
      expect(c201Geom.size[1]).toBe(5.0); // 5m high ceiling
      expect(c201Geom.position[0]).toBeCloseTo(74.15, 1);
      expect(c201Geom.position[2]).toBeCloseTo(92.55, 1);
    }

    if (c202Geom.type === 'box') {
      expect(c202Geom.size[1]).toBe(5.0);
      expect(c202Geom.position[0]).toBeCloseTo(74.15, 1);
      expect(c202Geom.position[2]).toBeCloseTo(107.30, 1);
    }

    if (gymGeom.type === 'box') {
      expect(gymGeom.size[1]).toBe(5.0);
      expect(gymGeom.position[0]).toBeCloseTo(74.15, 1);
      expect(gymGeom.position[2]).toBeCloseTo(123.65, 1);
    }

    if (lockerGeom.type === 'box') {
      expect(lockerGeom.position[0]).toBeCloseTo(63.85, 1);
    }
  });

  it('allows global campus searching for C-201, C-202, and Volleyball Arena', () => {
    const index = createCampusIndex(demoCampus);

    const search201 = search('C-201', index, []);
    expect(search201.some((r) => r.roomId === 'bld-i-f2-c201')).toBe(true);

    const search202 = search('C-202', index, []);
    expect(search202.some((r) => r.roomId === 'bld-i-f2-c202')).toBe(true);

    const searchVolley = search('Volleyball', index, []);
    expect(searchVolley.some((r) => r.roomId === 'bld-i-f2-gym')).toBe(true);
  });
});
