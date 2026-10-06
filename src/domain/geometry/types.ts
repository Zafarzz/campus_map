import type { Campus } from '../campus/types';

/**
 * World-space geometry consumed by the 3D renderer.
 *
 * Units: meters. Axes: X = east, Y = up, Z = south (north is -Z).
 * The renderer only understands these types; it does not care whether they were
 * traced from a screenshot, generated procedurally, or loaded from CAD/GLTF.
 */

export type Vec2 = [x: number, z: number];
export type Vec3 = [x: number, y: number, z: number];

export type GeometryPrecision = 'approximate' | 'surveyed';

export type Footprint =
  | {
      type: 'rect';
      center: Vec2;
      size: Vec2;
      /** Radians around the Y axis. */
      rotation?: number;
      cornerRadius?: number;
    }
  | { type: 'polygon'; points: Vec2[] };

export type RoomGeometry =
  | {
      type: 'box';
      /** Center of the box. */
      position: Vec3;
      size: Vec3;
      rotation?: number;
      precision: GeometryPrecision;
    }
  | {
      type: 'polygon';
      points: Vec2[];
      /** Y of the room's floor. */
      elevation: number;
      height: number;
      precision: GeometryPrecision;
    };

export type FloorGeometry = {
  floorId: string;
  /** Y of the floor slab top. */
  elevation: number;
  height: number;
};

export type BuildingGeometry = {
  buildingId: string;
  parts: Footprint[];
  height: number;
  floors: Record<string, FloorGeometry>;
  /** Center of the footprint bounding box at ground level. */
  center: Vec3;
  /** Rough horizontal radius, used for camera framing. */
  radius: number;
  precision: GeometryPrecision;
};

export type ContextFeatureKind = 'track' | 'pitch' | 'court' | 'lawn' | 'road' | 'structure';

/** Non-interactive surroundings (sports fields, lawns, unidentified structures). */
export type ContextFeature = {
  id: string;
  kind: ContextFeatureKind;
  footprint: Footprint;
  height?: number;
  label?: string;
};

export type CampusGeometry = {
  buildings: Record<string, BuildingGeometry>;
  rooms: Record<string, RoomGeometry>;
  context: ContextFeature[];
  bounds: { min: Vec2; max: Vec2 };
};

/** Adapter boundary: campus data in → renderable geometry out. */
export interface CampusGeometryProvider {
  readonly name: string;
  build(campus: Campus): CampusGeometry;
}
