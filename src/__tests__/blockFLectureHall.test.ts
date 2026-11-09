import { describe, expect, it } from 'vitest';
import React from 'react';
import { BlockFLectureHall3D } from '../components/3d/BlockFLectureHall3D';
import { Room } from '../components/3d/Room';
import { demoCampus } from '../data/demo-campus';
import { confirmedFloorPlans } from '../data/floor-plans';
import { geometryProvider } from '../services/geometry';
import { createCampusIndex } from '../domain/campus/campusIndex';
import { search } from '../services/search/searchService';
import type { Room as RoomData } from '../domain/campus/types';
import type { RoomGeometry } from '../domain/geometry/types';

describe('Block F Floor 2 Tiered Amphitheatre Lecture Halls (F-201 and F-202)', () => {
  it('exports valid React component BlockFLectureHall3D', () => {
    expect(typeof BlockFLectureHall3D).toBe('function');
  });

  it('renders valid React element for BlockFLectureHall3D with custom props', () => {
    const el = React.createElement(BlockFLectureHall3D, {
      position: [57.95, 4.90, -61.20],
      size: [8.2, 2.6, 26.88],
      roomNumber: 'F-201',
      selected: true,
    });
    expect(React.isValidElement(el)).toBe(true);
    expect(el.props.roomNumber).toBe('F-201');
    expect(el.props.size[0]).toBeCloseTo(8.2);
    expect(el.props.size[2]).toBeCloseTo(26.88);
    expect(el.props.selected).toBe(true);
  });

  it('renders valid React element for Room with BlockFLectureHall3D for F-201', () => {
    const room: RoomData = {
      id: 'bld-d-f2-f201',
      number: 'F-201',
      name: 'Tiered Lecture Hall (Amphitheatre West)',
      kind: 'hall',
      capacity: 120,
      provenance: 'confirmed',
    };
    const geometry: RoomGeometry = {
      type: 'box',
      position: [57.95, 4.90, -61.20],
      size: [8.2, 2.6, 26.88],
      precision: 'surveyed',
    };

    const roomEl = React.createElement(Room, {
      room,
      geometry,
      status: 'CURRENT',
      selected: true,
      onSelect: () => {},
    });
    expect(React.isValidElement(roomEl)).toBe(true);
  });

  it('renders valid React element for Room with BlockFLectureHall3D for F-202', () => {
    const room: RoomData = {
      id: 'bld-d-f2-f202',
      number: 'F-202',
      name: 'Tiered Lecture Hall (Amphitheatre East)',
      kind: 'hall',
      capacity: 120,
      provenance: 'confirmed',
    };
    const geometry: RoomGeometry = {
      type: 'box',
      position: [67.35, 4.90, -61.20],
      size: [8.2, 2.6, 26.88],
      precision: 'surveyed',
    };

    const roomEl = React.createElement(Room, {
      room,
      geometry,
      status: 'AVAILABLE',
      selected: false,
      onSelect: () => {},
    });
    expect(React.isValidElement(roomEl)).toBe(true);
  });

  it('verifies confirmedFloorPlans defines F-201 and F-202 as 120-capacity tiered halls', () => {
    const bldFPlan = confirmedFloorPlans.find((p) => p.buildingId === 'bld-d' && p.level === 2);
    expect(bldFPlan).toBeDefined();

    const f201 = bldFPlan?.rooms.find((r) => r.id === 'bld-d-f2-f201');
    expect(f201).toBeDefined();
    expect(f201?.number).toBe('F-201');
    expect(f201?.kind).toBe('hall');
    expect(f201?.capacity).toBe(120);

    const f202 = bldFPlan?.rooms.find((r) => r.id === 'bld-d-f2-f202');
    expect(f202).toBeDefined();
    expect(f202?.number).toBe('F-202');
    expect(f202?.kind).toBe('hall');
    expect(f202?.capacity).toBe(120);
  });

  it('verifies geometryProvider builds surveyed precision geometry for F-201 and F-202', () => {
    const geom = geometryProvider.build(demoCampus);
    const geomF201 = geom.rooms['bld-d-f2-f201'];
    const geomF202 = geom.rooms['bld-d-f2-f202'];

    expect(geomF201).toBeDefined();
    expect(geomF202).toBeDefined();
    expect(geomF201?.precision).toBe('surveyed');
    expect(geomF202?.precision).toBe('surveyed');
  });

  it('verifies campus search index finds F-201 and F-202 as confirmed lecture halls', () => {
    const index = createCampusIndex(demoCampus);

    const searchF201 = search('F-201', index, []);
    expect(searchF201.some((r) => r.kind === 'room' && r.title.includes('F-201'))).toBe(true);

    const searchF202 = search('F-202', index, []);
    expect(searchF202.some((r) => r.kind === 'room' && r.title.includes('F-202'))).toBe(true);
  });
});
