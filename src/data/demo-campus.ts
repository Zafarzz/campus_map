/**
 * DEMO CAMPUS — known structure + generated placeholder rooms.
 * Includes explicit known rooms from the official schedule data.
 */
import type { Building, Campus, Floor, Room, RoomKind } from '../domain/campus/types';
import { campusInfo, knownBuildings, type BuildingStructure } from './campus-structure';

const knownRooms: Record<string, string[]> = {
  A: ['A-102', 'A-104', 'A-201', 'A-202', 'A-203', 'A-204', 'A-206', 'A-208', 'A-210'],
  B: ['B-101', 'B-102', 'B-103', 'B-104', 'B-106', 'B-201', 'B-202', 'B-203', 'B-205', 'B-206'],
  D: ['D-101', 'D-102', 'D-103', 'D-107', 'D-201', 'D-202', 'D-203', 'D-204', 'D-206'],
  E: ['E-101', 'E-202', 'E-203', 'E-204', 'E-205', 'E-206', 'E-301', 'E-306'],
};

/** Rooms with specific known names based on the "C Block" description */
const specialRooms: Record<string, { id: string; number: string; name: string; kind: RoomKind }[]> = {
  'bld-i': [
    { id: 'room-c-conf', number: 'C-conF', name: 'Conference Hall', kind: 'hall' },
    { id: 'room-canteen', number: 'Canteen', name: 'Canteen', kind: 'other' },
  ],
};

import { confirmedFloorPlans } from './floor-plans';

function buildRoomsForFloor(structure: BuildingStructure, level: number): Room[] {
  // 1. Check if we have an official floor plan from the CAD drawings
  const confirmedPlan = confirmedFloorPlans.find(
    (p) => p.buildingId === structure.id && p.level === level
  );
  if (confirmedPlan) {
    return confirmedPlan.rooms.map((r) => ({
      id: r.id,
      number: r.number,
      name: r.name,
      kind: r.kind,
      capacity: r.capacity ?? 30,
      provenance: r.provenance ?? 'confirmed',
    }));
  }

  // 2. If we have explicitly known special rooms for this building, place them on the first floor.
  if (level === 1 && specialRooms[structure.id]) {
    return specialRooms[structure.id].map((r) => ({ ...r, provenance: 'confirmed' }));
  }

  // 3. For upper levels of buildings with confirmed 2F plans (levels 3 and 4), replicate the 2F room layout
  const level2Plan = confirmedFloorPlans.find(
    (p) => p.buildingId === structure.id && p.level === 2
  );
  if (level2Plan && level > 2) {
    return level2Plan.rooms.map((r, i) => {
      const roomNum = r.number.replace(/^[A-Z]-2/, `${structure.shortName}-${level}`);
      return {
        id: `${structure.id}-f${level}-r${i + 1}`,
        number: roomNum,
        name: r.name,
        kind: r.kind,
        capacity: r.capacity ?? 30,
        provenance: 'confirmed',
      };
    });
  }

  // 4. Find known rooms from the schedule for this block and floor level.
  const blockRooms = knownRooms[structure.shortName] || [];
  const floorRooms = blockRooms.filter((r) => r.includes(`-${level}0`) || r.includes(`-${level}1`));

  if (floorRooms.length > 0) {
    return floorRooms.map((roomName, i) => ({
      id: `${structure.id}-f${level}-r${i + 1}`,
      number: roomName,
      kind: 'classroom',
      capacity: 30,
      provenance: 'confirmed',
    }));
  }

  // 5. If no known rooms, generate sparse placeholders (e.g. unconfirmed buildings bld-a, bld-j).
  return Array.from({ length: 2 }, (_, i) => ({
    id: `${structure.id}-f${level}-r${i + 1}`,
    number: `${structure.shortName}${level}${String(i + 1).padStart(2, '0')}`,
    kind: 'classroom',
    capacity: 30,
    provenance: 'demo',
  }));
}

function buildFloor(structure: BuildingStructure, level: number): Floor {
  return {
    id: `${structure.id}-f${level}`,
    level,
    name: `Floor ${level}`,
    rooms: buildRoomsForFloor(structure, level),
  };
}

function buildBuilding(structure: BuildingStructure): Building {
  return {
    id: structure.id,
    name: structure.name,
    shortName: structure.shortName,
    description: structure.description,
    provenance: 'confirmed',
    floors: Array.from({ length: structure.floorCount }, (_, i) => buildFloor(structure, i + 1)),
  };
}

export const demoCampus: Campus = {
  ...campusInfo,
  buildings: knownBuildings.map(buildBuilding),
};
