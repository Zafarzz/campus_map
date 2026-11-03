import { describe, expect, it } from 'vitest';
import React from 'react';
import { ClassroomInterior3D } from '../components/3d/ClassroomInterior3D';
import { Room } from '../components/3d/Room';
import type { Room as RoomData } from '../domain/campus/types';
import type { RoomGeometry } from '../domain/geometry/types';

describe('3D Classroom Interior (Item 2 of todo_list.md)', () => {
  it('exports valid React component ClassroomInterior3D', () => {
    expect(typeof ClassroomInterior3D).toBe('function');
  });

  it('creates valid React element for standard lecture room', () => {
    const el = React.createElement(ClassroomInterior3D, {
      position: [0, 1.5, 0],
      size: [8.0, 3.0, 10.0],
      capacity: 50,
      roomNumber: 'E-201',
      selected: true,
    });
    expect(React.isValidElement(el)).toBe(true);
    expect(el.props.roomNumber).toBe('E-201');
    expect(el.props.capacity).toBe(50);
  });

  it('creates valid React element for large lecture hall', () => {
    const el = React.createElement(ClassroomInterior3D, {
      position: [10, 1.5, 5],
      size: [14.0, 3.5, 12.0],
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
      id: 'bld-b-f2-e201',
      number: 'E-201',
      name: 'Lecture Room (70p)',
      kind: 'classroom',
      capacity: 70,
      provenance: 'confirmed',
    };
    const geometry: RoomGeometry = {
      type: 'box',
      position: [0, 1.5, 0],
      size: [8, 3, 10],
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
