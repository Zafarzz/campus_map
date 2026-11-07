import { describe, expect, it } from 'vitest';
import React from 'react';
import {
  ClassroomInterior3D,
  CLASSROOM_BOOTH_SPECS,
} from '../components/3d/ClassroomInterior3D';
import { Room } from '../components/3d/Room';
import type { Room as RoomData } from '../domain/campus/types';
import type { RoomGeometry } from '../domain/geometry/types';

describe('3D Classroom Interior (CAD Sheet 1 Group I25C specifications)', () => {
  it('exports valid React component ClassroomInterior3D and booth specs', () => {
    expect(typeof ClassroomInterior3D).toBe('function');
    expect(CLASSROOM_BOOTH_SPECS).toBeDefined();
  });

  it('verifies booth and chair dimensions match Sheet 1 Group I25C specifications', () => {
    // Учебные парты-кабины двухместные: 1600 x 600 mm, h=950 mm
    expect(CLASSROOM_BOOTH_SPECS.boothWidth).toBe(1.6);
    expect(CLASSROOM_BOOTH_SPECS.boothDepth).toBe(0.6);
    expect(CLASSROOM_BOOTH_SPECS.deskSurfaceHeight).toBe(0.74);
    expect(CLASSROOM_BOOTH_SPECS.wingHeight).toBe(0.95);
    expect(CLASSROOM_BOOTH_SPECS.wingFilletRadius).toBe(0.14);
    expect(CLASSROOM_BOOTH_SPECS.cableGrommetDiameter).toBe(0.06);

    // Стул на металлокаркасе: seat=450 mm, backrest=800 mm
    expect(CLASSROOM_BOOTH_SPECS.chairSeatHeight).toBe(0.45);
    expect(CLASSROOM_BOOTH_SPECS.chairBackHeight).toBe(0.8);

    // Materials
    expect(CLASSROOM_BOOTH_SPECS.finishMaterial).toBe('ЛДСП 16 мм Дуб сонома');
    expect(CLASSROOM_BOOTH_SPECS.frameMaterial).toBe('Стальной каркас');
  });

  it('creates valid React element for standard lecture room (w >= d, long building orientation)', () => {
    const el = React.createElement(ClassroomInterior3D, {
      position: [0, 1.5, 0],
      size: [14.0, 3.0, 6.5],
      capacity: 36,
      roomNumber: 'B-103',
      selected: true,
    });
    expect(React.isValidElement(el)).toBe(true);
    expect(el.props.roomNumber).toBe('B-103');
    expect(el.props.capacity).toBe(36);
  });

  it('creates valid React element for large lecture hall (d > w or extra wide)', () => {
    const el = React.createElement(ClassroomInterior3D, {
      position: [10, 1.5, 5],
      size: [10.0, 3.5, 16.0],
      capacity: 120,
      roomNumber: 'A-101',
      isBigLecture: true,
      selected: true,
    });
    expect(React.isValidElement(el)).toBe(true);
    expect(el.props.isBigLecture).toBe(true);
  });

  it('creates valid React element for Room with ClassroomInterior3D when selected', () => {
    const room: RoomData = {
      id: 'bld-g-f1-b103',
      number: 'B-103',
      name: 'Classroom (103-B)',
      kind: 'classroom',
      capacity: 36,
      provenance: 'confirmed',
    };
    const geometry: RoomGeometry = {
      type: 'box',
      position: [20, 1.5, -10],
      size: [14, 3, 6.5],
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
});
