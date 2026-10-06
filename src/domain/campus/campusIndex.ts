import type { Building, Campus, Floor, Room } from './types';

export type RoomLocation = { building: Building; floor: Floor; room: Room };
export type FloorLocation = { building: Building; floor: Floor };

/** Fast ID lookups over a campus tree. Rebuild whenever the campus data changes. */
export type CampusIndex = {
  buildings: Map<string, Building>;
  floors: Map<string, FloorLocation>;
  rooms: Map<string, RoomLocation>;
};

export function createCampusIndex(campus: Campus): CampusIndex {
  const buildings = new Map<string, Building>();
  const floors = new Map<string, FloorLocation>();
  const rooms = new Map<string, RoomLocation>();

  for (const building of campus.buildings) {
    buildings.set(building.id, building);
    for (const floor of building.floors) {
      floors.set(floor.id, { building, floor });
      for (const room of floor.rooms) {
        rooms.set(room.id, { building, floor, room });
      }
    }
  }
  return { buildings, floors, rooms };
}

/** Floors ordered bottom → top. */
export function sortedFloors(building: Building): Floor[] {
  return [...building.floors].sort((a, b) => a.level - b.level);
}

export function defaultFloor(building: Building): Floor | undefined {
  const floors = sortedFloors(building);
  return floors.find((f) => f.level === 1) ?? floors[0];
}
