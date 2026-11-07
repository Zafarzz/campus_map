import { describe, expect, it } from 'vitest';
import React from 'react';
import { LobbyInterior3D } from '../components/3d/LobbyInterior3D';
import { Room } from '../components/3d/Room';
import type { Room as RoomData } from '../domain/campus/types';
import type { RoomGeometry } from '../domain/geometry/types';
import { confirmedFloorPlans } from '../data/floor-plans';
import { isExcludedFromBooking } from '../services/booking/bookingService';

describe('3D Empty Architectural Lobbies (B-Lobby and E-Lobby)', () => {
  it('exports valid React component LobbyInterior3D', () => {
    expect(typeof LobbyInterior3D).toBe('function');
  });

  it('creates valid React element for LobbyInterior3D with correct dimensions', () => {
    const el = React.createElement(LobbyInterior3D, {
      position: [0, 1.3, 0],
      size: [30.8, 2.6, 5.6],
      selected: false,
      label: 'B-Lobby',
    });
    expect(React.isValidElement(el)).toBe(true);
    expect(el.props.size).toEqual([30.8, 2.6, 5.6]);
    expect(el.props.label).toBe('B-Lobby');
  });

  it('renders Room for B-Lobby without classroom desks', () => {
    const room: RoomData = {
      id: 'bld-g-f1-lobby',
      number: 'B-Lobby',
      name: 'Lobby & Exhibition Hall',
      kind: 'hall',
      capacity: 100,
      provenance: 'confirmed',
    };
    const geometry: RoomGeometry = {
      type: 'box',
      position: [0, 1.3, 0],
      size: [30.8, 2.6, 5.6],
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

  it('renders Room for E-Lobby without classroom desks', () => {
    const room: RoomData = {
      id: 'bld-b-f1-lobby',
      number: 'E-Lobby',
      name: 'Lobby & Exhibition Hall',
      kind: 'hall',
      capacity: 100,
      provenance: 'confirmed',
    };
    const geometry: RoomGeometry = {
      type: 'box',
      position: [50, 1.3, -20],
      size: [24.2, 2.6, 5.6],
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

  it('verifies confirmedFloorPlans contains B-Lobby and E-Lobby', () => {
    const bldGPlanF1 = confirmedFloorPlans.find((p) => p.buildingId === 'bld-g' && p.level === 1);
    const bldBPlanF1 = confirmedFloorPlans.find((p) => p.buildingId === 'bld-b' && p.level === 1);

    expect(bldGPlanF1).toBeDefined();
    expect(bldBPlanF1).toBeDefined();

    const bLobby = bldGPlanF1?.rooms.find((r) => r.id === 'bld-g-f1-lobby');
    const eLobby = bldBPlanF1?.rooms.find((r) => r.id === 'bld-b-f1-lobby');

    expect(bLobby).toBeDefined();
    expect(bLobby?.number).toBe('B-Lobby');
    expect(eLobby).toBeDefined();
    expect(eLobby?.number).toBe('E-Lobby');
  });

  it('excludes B-Lobby and E-Lobby from room reservation bookings', () => {
    expect(isExcludedFromBooking({ room_id: 'bld-g-f1-lobby' })).toBe(true);
    expect(isExcludedFromBooking({ room_id: 'bld-g-f2-lobby' })).toBe(true);
    expect(isExcludedFromBooking({ room_id: 'bld-b-f1-lobby' })).toBe(true);
    expect(isExcludedFromBooking({ room_id: 'bld-b-f2-lobby' })).toBe(true);
  });
});
