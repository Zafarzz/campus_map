import type { RoomStatus } from '../domain/schedule/types';
import type { Vec3 } from '../domain/geometry/types';

/**
 * Frequently tuned values. Keep magic numbers here, not in components.
 */
export const mapConfig = {
  /** Google Earth screenshot used to trace approximate building footprints. */
  reference: {
    imageUrl: '/reference/campus.jpg',
    imageSizePx: [703, 1024] as [number, number],
    // TODO: Calibrate against a real measurement (e.g. known building length).
    // 0.3 m/px is an estimate based on the size of the sports pitch.
    metersPerPixel: 0.3,
  },

  building: {
    floorHeight: 3.6,
    slabThickness: 0.25,
    /** Height used for context structures whose floor count is unknown. */
    unknownStructureHeight: 4,
  },

  /** Procedural room layout (used until real floor plans exist). */
  roomLayout: {
    roomHeight: 2.6,
    wallInset: 1.2,
    corridorWidth: 2.6,
    gap: 0.5,
    minRoomDepth: 5,
  },

  camera: {
    fov: 40,
    /** Campus overview, relative to the campus center. */
    campusPosition: [70, 170, 190] as Vec3,
    /** Direction from target towards camera when focusing buildings/rooms. */
    focusDirection: [0.45, 0.85, 0.75] as Vec3,
    buildingDistanceFactor: 2.2,
    minBuildingDistance: 55,
    roomDistance: 32,
    minDistance: 10,
    maxDistance: 450,
    /** Prevent looking from below ground. */
    maxPolarAngle: Math.PI / 2.15,
  },

  schedule: {
    upcomingWindowMinutes: 60,
    liveTickMs: 30_000,
    /** Range of the simulated-time slider, minutes since midnight. */
    simulatedRange: [8 * 60, 20 * 60] as [number, number],
    defaultSimulatedMinutes: 10 * 60 + 30,
    /** Official Ajou University in Tashkent lesson periods (12:45?13:30 is lunch break). */
    slots: [
      ['08:30', '09:45'],
      ['10:00', '11:15'],
      ['11:30', '12:45'],
      ['13:30', '14:45'],
      ['15:00', '16:15'],
      ['16:30', '17:45'],
      ['18:00', '19:15'],
    ] as [string, string][],
  },

  colors: {
    background: '#eef1f4',
    ground: '#dfe6dc',
    building: '#d8d2c8',
    buildingSelected: '#f3efe8',
    buildingEdges: '#6b7280',
    floorSlab: '#f7f7f5',
    floorSlabGhost: '#c9ced6',
    roomSelected: '#1d4ed8',
    context: {
      track: '#c98a6a',
      pitch: '#6fae6a',
      court: '#cfc6b4',
      lawn: '#b9d3a8',
      road: '#cfd3d8',
      structure: '#b6bac1',
    },
    status: {
      AVAILABLE: '#3fae7a',
      CURRENT: '#e5534b',
      UPCOMING: '#f0a431',
      FINISHED: '#8b93a7',
      CANCELLED: '#9b6cf0',
    } satisfies Record<RoomStatus, string>,
  },

  opacity: {
    dimmedBuilding: 0.28,
    ghostSlab: 0.35,
    selectedShell: 0.08,
  },
} as const;

export const statusLabels: Record<RoomStatus, string> = {
  AVAILABLE: 'Free',
  CURRENT: 'Lesson now',
  UPCOMING: 'Starts soon',
  FINISHED: 'Done for today',
  CANCELLED: 'Cancelled',
};
