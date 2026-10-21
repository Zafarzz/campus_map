import type { Building } from '../domain/campus/types';
import type { Vec2 } from '../domain/geometry/types';

/**
 * «Зал амфитеатра» — added in the 2D editor as `out-plaza-mvijfubr`
 * (package `campus-edit-2026-10-21-20-05-05`, ADR-029).
 *
 * All interior dimensions come from the attached CAD-style sheets
 * (Лист 1: план пола / план потолка, Лист 2: развёртки 4 стен), calibrated to the
 * user-specified 2D-editor contour: Center [50.5, 76.5], Size 20m × 17m.
 *
 * Drawing frame ("plan" coordinates used throughout this file):
 *   X = east, Y = north, Z = up, origin = centre of the hall floor, metres.
 * World mapping (ADR-001): worldX = center[0] + X, worldY = Z, worldZ = center[1] − Y.
 */
export const AMPHITHEATER_HALL = {
  id: 'amph-hall',
  editorId: 'out-plaza-mvijfubr',
  name: 'Зал амфитеатра',
  /**
   * World centre [x, z]. Editor placed a 20×17 m rect at [50.5, 76.5] (ADR-029).
   * North face z = 68.0m (1.1m south of Block B's south face at z=66.9m).
   * South face z = 85.0m (touches Block A's north face at z=84.9m).
   * East gallery annex (x = +12.2m from center -> worldX = 62.7m) connects to the B↔C walkway.
   */
  center: [50.5, 76.5] as Vec2,
  /** Outer contour of the hall (amphitheatre outer edge = inner wall line), metres. */
  size: [20, 17] as Vec2,
  /** Wall thickness, built inward from the outer contour. */
  wallThickness: 0.25,

  floor: {
    /** Sunken octagonal bowl at ±0.00 (laminate): half-size rx=7.6m (width 15.2m), ry=6.1m (depth 12.2m), 45° chamfer 2.6m. */
    bowl: { rx: 7.6, ry: 6.1, chamfer: 2.6 },
    /** Logo Ø3.20 m in the centre of the bowl. */
    logoDiameter: 3.2,
    logoInnerDiameter: 2.2,
  },

  /** 3 amphitheatre tiers, each 0.80 m wide; outer contour of tier 3 = 20×17 m rectangle. */
  tiers: [
    { outer: { rx: 8.4, ry: 6.9, chamfer: 2.0 }, inner: { rx: 7.6, ry: 6.1, chamfer: 2.6 }, top: 0.45 },
    { outer: { rx: 9.2, ry: 7.7, chamfer: 1.4 }, inner: { rx: 8.4, ry: 6.9, chamfer: 2.0 }, top: 0.90 },
    { outer: { rx: 10.0, ry: 8.5, chamfer: 0.0 }, inner: { rx: 9.2, ry: 7.7, chamfer: 1.4 }, top: 1.35 },
  ],

  /** 3 staircases on the symmetry axes (E, W, S): 2.80 wide, 2.40 deep, 6 risers 0.225 / treads 0.40. */
  stairs: {
    width: 2.8,
    depth: 2.4,
    steps: 6,
    rise: 0.225,
    tread: 0.4,
    /** Rectangles in plan [x0, y0, x1, y1] and the direction of ascent (unit vector, plan frame). */
    flights: [
      { id: 'east', rect: [7.6, -1.4, 10.0, 1.4], up: [1, 0] },
      { id: 'west', rect: [-10.0, -1.4, -7.6, 1.4], up: [-1, 0] },
      { id: 'south', rect: [-1.4, -8.5, 1.4, -6.1], up: [0, -1] },
    ] as { id: string; rect: [number, number, number, number]; up: [number, number] }[],
  },

  /** North stage podium: X −3.20…+3.20, Y +6.10…+8.50, top +1.35, railing H=0.85 (5 sections). */
  stage: {
    rect: [-3.2, 6.1, 3.2, 8.5] as [number, number, number, number],
    top: 1.35,
    railing: { y: 6.22, x0: -3.0, x1: 3.0, height: 0.85, posts: 6 },
    speakers: { size: [0.45, 0.7, 0.45] as [number, number, number], centersX: [-2.575, 2.575], y: 6.575 },
  },

  /** Cushions Ø0.34 m on tiers 1 and 2 (radial positions 8.0 / 8.8): east = red, west & south = blue. */
  cushions: {
    radius: 0.17,
    alongX: Array.from({ length: 13 }, (_, i) => -6.2 + (12.4 / 12) * i).filter((v) => Math.abs(v) > 1.7),
    alongY: Array.from({ length: 11 }, (_, i) => -5.0 + (10.0 / 10) * i).filter((v) => Math.abs(v) > 1.5),
    radial: [8.0, 8.8],
  },

  ceiling: {
    /** Perimeter sloped timber-slat soffit: from +7.20 at the walls up to +8.50 at inner field. */
    soffitLow: 7.2,
    soffitHigh: 8.5,
    soffitInnerX: 8.0,
    soffitInnerY: 6.5,
    /** Black open-cell (Grilyato) field 16×13 m at +8.50. */
    grilyatoHalfX: 8.0,
    grilyatoHalfY: 6.5,
    /** 5×5 recessed LED panels 0.60×0.60 (0.70 trim). */
    ledCoordsX: [-6.4, -3.2, 0.0, 3.2, 6.4],
    ledCoordsY: [-4.8, -2.4, 0.0, 2.4, 4.8],
    ledSize: 0.6,
    /** Linear LED strips embedded in the soffit at R = 9.0 (X) and 7.5 (Y), 2.4 m long. */
    linearLedAtX: 9.0,
    linearLedAtY: 7.5,
    linearLedCenters: [-6.0, -2.0, 2.0, 6.0],
    linearLedLength: 2.4,
  },

  /** Roof slab and parapet above the Grilyato ceiling. */
  roof: { bottom: 8.9, top: 9.25, parapetTop: 9.7 },

  north: {
    y: 8.5,
    screen: { x0: -3.2, x1: 3.2, z0: 2.6, z1: 6.1 },
    screenFrames: [
      [-3.5, -3.2],
      [3.2, 3.5],
    ] as [number, number][],
    bookshelves: [
      [-9.6, -3.5],
      [3.5, 9.6],
    ] as [number, number][],
    wainscot: { z0: 1.35, z1: 2.3 },
    shelves: { z0: 2.3, z1: 7.1, boards: 9 },
    upperShelf: { x0: -3.2, x1: 3.2, z0: 6.2, z1: 7.1 },
  },

  east: {
    towerFrom: 6.0,
    opening: { half: 6.0, z0: 1.35, z1: 4.5 },
    columns: { at: [-5.0, -1.8, 1.8, 5.0], section: 0.6, z0: 1.35, z1: 4.5 },
    upperPillars: { section: 0.5, z0: 4.85, z1: 7.2 },
    beam: { z0: 4.5, z1: 4.85 },
    railing: { z0: 4.85, z1: 5.85 },
    /** 2nd-floor balcony / gallery annex outside the east wall: X 10…11.15 (touches B↔C walkway at 61.65m). */
    gallery: { x1: 11.15, half: 6.0, floor: 4.65, ceiling: 7.2, groundFloor: 1.35 },
    /** Main entrance glass portal 2.60 × 2.85 (Z 1.35…4.20), on the gallery's east wall. */
    portal: { half: 1.3, z0: 1.35, z1: 4.2 },
  },

  west: {
    towerFrom: 6.0,
    /** Panoramic curtain wall: bays × 2.00, transoms at +2.10 and +5.40. */
    window: { half: 6.0, z0: 1.35, z1: 7.2, bays: 6, transoms: [2.1, 5.4] },
    /** 4 convectors 1.60 × 0.55 (elevation h → plan Y = h). */
    radiators: { at: [-4.5, -1.5, 1.5, 4.5], width: 1.6, height: 0.55 },
  },

  south: {
    y: -8.5,
    towerFrom: 7.0,
    opening: { half: 7.0, z0: 1.35, z1: 7.2 },
    pillars: { at: [-6.0, -2.2, 2.2, 6.0], section: 0.5 },
    truss: { z0: 4.4, z1: 4.95, panel: 0.7 },
    drapes: [-4.1, 0.0, 4.1],
    glassRail: { z0: 1.35, z1: 2.25 },
  },
} as const;

export type AmphitheaterHallSpec = typeof AMPHITHEATER_HALL;

export const AMPHITHEATER_BUILDING: Building = {
  id: 'amph-hall',
  name: 'Зал амфитеатра',
  shortName: 'Амфитеатр',
  description: 'Многофункциональный зал амфитеатра с большим экраном и сценой',
  provenance: 'confirmed',
  floors: [
    {
      id: 'amph-floor-1',
      level: 1,
      name: '1 этаж',
      rooms: [
        {
          id: 'amph-room-main',
          number: 'Зал',
          name: 'Главный зал амфитеатра',
          kind: 'hall',
          capacity: 150,
          provenance: 'confirmed',
        },
      ],
    },
  ],
};
