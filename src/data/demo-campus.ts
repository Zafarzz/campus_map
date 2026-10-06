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
  'bld-e': [{ id: 'room-c-sport', number: 'C-sport hall', name: 'Indoor Courts (3 Tennis Courts)', kind: 'hall' }],
  'bld-f': [{ id: 'room-c-conf', number: 'C-conF', name: 'Conference Hall', kind: 'hall' }],
  'bld-i': [{ id: 'room-canteen', number: 'Canteen', name: 'Canteen', kind: 'other' }],
};

function buildRoomsForFloor(structure: BuildingStructure, level: number): Room[] {
  // If we have explicitly known special rooms for this building, place them on the first floor.
  if (level === 1 && specialRooms[structure.id]) {
    return specialRooms[structure.id].map(r => ({ ...r, provenance: 'confirmed' }));
  }

  // Find known rooms from the schedule for this block and floor level.
  // E.g., for Block A, level 1 -> A-102, A-104
  const blockRooms = knownRooms[structure.shortName] || [];
  const floorRooms = blockRooms.filter(r => r.includes(`-${level}0`) || r.includes(`-${level}1`));

  if (floorRooms.length > 0) {
    return floorRooms.map((roomName, i) => ({
      id: `${structure.id}-f${level}-r${i + 1}`,
      number: roomName,
      kind: 'classroom',
      capacity: 30,
      provenance: 'confirmed',
    }));
  }

  // If no known rooms, generate a few placeholders so the map isn't entirely empty.
  // We keep it sparse (e.g. 2 rooms) to respect "Do not invent exact floor plans".
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
