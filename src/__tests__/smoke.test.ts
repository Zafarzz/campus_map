import { describe, it, expect } from 'vitest';
import { demoCampus } from '../data/demo-campus';
import { createCampusIndex } from '../domain/campus/campusIndex';
import { computeRoomState } from '../domain/schedule/roomStatus';
import { search } from '../services/search/searchService';

describe('Smoke test suite', () => {
  it('creates campus index and indexes all buildings and rooms', () => {
    const index = createCampusIndex(demoCampus);
    expect(index.buildings.size).toBeGreaterThan(0);
    expect(index.floors.size).toBeGreaterThan(0);
    expect(index.rooms.size).toBeGreaterThan(0);

    const firstRoom = Array.from(index.rooms.values())[0];
    expect(firstRoom).toBeDefined();
    expect(firstRoom.building).toBeDefined();
    expect(firstRoom.floor).toBeDefined();
    expect(firstRoom.room.number).toBeTruthy();
  });

  it('computes AVAILABLE status for empty lessons', () => {
    const state = computeRoomState([], new Date(), { upcomingWindowMinutes: 60 });
    expect(state.status).toBe('AVAILABLE');
    expect(state.current).toBeUndefined();
    expect(state.next).toBeUndefined();
  });

  it('searches rooms by number query', () => {
    const index = createCampusIndex(demoCampus);
    const results = search('101', index, []);
    expect(Array.isArray(results)).toBe(true);
  });
});
