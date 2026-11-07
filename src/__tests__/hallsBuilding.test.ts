import React from 'react';
import { describe, expect, it } from 'vitest';
import {
  EventHallInterior3D,
  TennisHallInterior3D,
  EVENT_HALL_1_ID,
  EVENT_HALL_2_ID,
  TENNIS_HALL_ID,
  HALLS_BUILDING_ID,
} from '../components/3d/HallsBuildingInteriors';
import { demoCampus } from '../data/demo-campus';
import { accurateRoomOverrides } from '../data/floor-plans';
import { createCampusIndex } from '../domain/campus/campusIndex';
import { search } from '../services/search/searchService';
import { geometryProvider } from '../services/geometry';

describe('Halls Building (bld-e) & 3 Halls Interior (2 Event Halls, 1 Tennis Hall)', () => {
  it('renames bld-e to Halls in demoCampus and campus model', () => {
    const bldE = demoCampus.buildings.find((b) => b.id === HALLS_BUILDING_ID);
    expect(bldE).toBeDefined();
    expect(bldE?.name).toBe('Halls');
    expect(bldE?.shortName).toBe('H');
  });

  it('contains exactly 3 halls on Floor 1: 2 event halls and 1 tennis hall', () => {
    const bldE = demoCampus.buildings.find((b) => b.id === HALLS_BUILDING_ID);
    const floor1 = bldE?.floors.find((f) => f.level === 1);
    expect(floor1).toBeDefined();
    expect(floor1?.rooms.length).toBe(3);

    const hall1 = floor1?.rooms.find((r) => r.id === EVENT_HALL_1_ID);
    expect(hall1).toBeDefined();
    expect(hall1?.number).toBe('H-101');
    expect(hall1?.name).toContain('Event Hall 1');

    const hall2 = floor1?.rooms.find((r) => r.id === EVENT_HALL_2_ID);
    expect(hall2).toBeDefined();
    expect(hall2?.number).toBe('H-102');
    expect(hall2?.name).toContain('Event Hall 2');

    const tennis = floor1?.rooms.find((r) => r.id === TENNIS_HALL_ID);
    expect(tennis).toBeDefined();
    expect(tennis?.number).toBe('H-103');
    expect(tennis?.name).toContain('Tennis Hall');
    expect(tennis?.description?.toLowerCase()).toContain('tennis');
  });

  it('provides surveyed 3D RoomGeometry overrides for all 3 halls matching the 3 architectural gables', () => {
    const campusGeom = geometryProvider.build(demoCampus);

    const gHall1 = campusGeom.rooms[EVENT_HALL_1_ID];
    const gHall2 = campusGeom.rooms[EVENT_HALL_2_ID];
    const gTennis = campusGeom.rooms[TENNIS_HALL_ID];

    expect(gHall1).toBeDefined();
    expect(gHall2).toBeDefined();
    expect(gTennis).toBeDefined();

    expect(gHall1.precision).toBe('surveyed');
    expect(gHall2.precision).toBe('surveyed');
    expect(gTennis.precision).toBe('surveyed');

    if (gHall1.type === 'box' && gHall2.type === 'box' && gTennis.type === 'box') {
      // Each hall has width ~17.8m and depth ~34.0m, height 6.0m
      expect(gHall1.size[0]).toBeCloseTo(17.8, 1);
      expect(gHall1.size[1]).toBeCloseTo(6.0, 1);
      expect(gHall1.size[2]).toBeCloseTo(34.0, 1);

      expect(gTennis.size[0]).toBeCloseTo(17.8, 1);
      expect(gTennis.size[1]).toBeCloseTo(6.0, 1);
      expect(gTennis.size[2]).toBeCloseTo(34.0, 1);

      // Halls are laid out from West to East: Hall 1 < Hall 2 < Tennis Hall along X
      expect(gHall1.position[0]).toBeLessThan(gHall2.position[0]);
      expect(gHall2.position[0]).toBeLessThan(gTennis.position[0]);
    }
  });

  it('renders valid React elements for TennisHallInterior3D and EventHallInterior3D', () => {
    const elTennis = React.createElement(TennisHallInterior3D, {
      position: [-2.12, 3.25, 10.90],
      size: [17.8, 6.0, 34.0],
      selected: false,
    });
    expect(React.isValidElement(elTennis)).toBe(true);

    const elEvent = React.createElement(EventHallInterior3D, {
      position: [-38.78, 3.25, 10.90],
      size: [17.8, 6.0, 34.0],
      selected: true,
    });
    expect(React.isValidElement(elEvent)).toBe(true);
  });

  it('indexes all 3 halls in search service and resolves queries for tennis and events', () => {
    const index = createCampusIndex(demoCampus);

    const resultsHalls = search('Halls', index, []);
    expect(resultsHalls.some((r) => r.roomId === EVENT_HALL_1_ID)).toBe(true);
    expect(resultsHalls.some((r) => r.roomId === TENNIS_HALL_ID)).toBe(true);

    const resultsTennis = search('tennis', index, []);
    expect(resultsTennis.some((r) => r.roomId === TENNIS_HALL_ID)).toBe(true);

    const resultsEvent = search('Event Hall', index, []);
    expect(resultsEvent.some((r) => r.roomId === EVENT_HALL_1_ID)).toBe(true);
    expect(resultsEvent.some((r) => r.roomId === EVENT_HALL_2_ID)).toBe(true);

    const resultsH101 = search('H-101', index, []);
    expect(resultsH101.some((r) => r.roomId === EVENT_HALL_1_ID)).toBe(true);
  });
});
