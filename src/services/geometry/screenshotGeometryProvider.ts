import type { Campus } from '../../domain/campus/types';
import type {
  BuildingGeometry,
  CampusGeometry,
  CampusGeometryProvider,
  ConnectorGeometry,
  ContextFeature,
  Footprint,
  RoomGeometry,
  Vec2,
} from '../../domain/geometry/types';
import type { ConnectorPx, ContextFeaturePx, PxRect } from '../../data/reference-footprints';
import { layoutRoomsInRect, type RoomLayoutOptions } from './proceduralRoomLayout';

export type ScreenshotGeometryOptions = {
  buildingFootprintsPx: Record<string, PxRect[]>;
  contextFeaturesPx: ContextFeaturePx[];
  /** Enclosed passages between buildings (ADR-020). */
  connectorsPx?: ConnectorPx[];
  imageSizePx: [number, number];
  metersPerPixel: number;
  floorHeight: number;
  unknownStructureHeight: number;
  roomLayout: RoomLayoutOptions;
  /** Exact room geometry that overrides the procedural layout (e.g. from a floor plan). */
  roomOverrides?: Record<string, RoomGeometry>;
};

type Rect = { center: Vec2; size: Vec2 };

/**
 * Geometry provider for the prototype:
 *  - building footprints traced from the Google Earth screenshot (pixels → meters);
 *  - rooms laid out procedurally inside each building.
 *
 * To use real data later, write another `CampusGeometryProvider` (floor plans,
 * GLTF, CAD export…) and swap it in `services/geometry/index.ts`.
 */
export function createScreenshotGeometryProvider(opts: ScreenshotGeometryOptions): CampusGeometryProvider {
  const [imgW, imgH] = opts.imageSizePx;
  const mpp = opts.metersPerPixel;

  const pxRectToRect = ([l, t, r, b]: PxRect): Rect => ({
    center: [((l + r) / 2 - imgW / 2) * mpp, ((t + b) / 2 - imgH / 2) * mpp],
    size: [(r - l) * mpp, (b - t) * mpp],
  });

  const toFootprint = (rect: Rect, cornerRadius?: number): Footprint => ({
    type: 'rect',
    center: rect.center,
    size: rect.size,
    cornerRadius,
  });

  return {
    name: 'screenshot-trace',
    build(campus: Campus): CampusGeometry {
      const buildings: Record<string, BuildingGeometry> = {};
      const rooms: Record<string, RoomGeometry> = {};
      const min: Vec2 = [Infinity, Infinity];
      const max: Vec2 = [-Infinity, -Infinity];
      const extend = ({ center: [x, z], size: [w, d] }: Rect) => {
        min[0] = Math.min(min[0], x - w / 2);
        min[1] = Math.min(min[1], z - d / 2);
        max[0] = Math.max(max[0], x + w / 2);
        max[1] = Math.max(max[1], z + d / 2);
      };

      for (const building of campus.buildings) {
        const pxRects = opts.buildingFootprintsPx[building.id];
        if (!pxRects?.length) {
          // TODO: Building exists in data but has no traced footprint yet.
          console.warn(`[geometry] No footprint for building "${building.id}"`);
          continue;
        }
        const rects = pxRects.map(pxRectToRect);
        rects.forEach(extend);

        const bMin: Vec2 = [Infinity, Infinity];
        const bMax: Vec2 = [-Infinity, -Infinity];
        for (const { center: [x, z], size: [w, d] } of rects) {
          bMin[0] = Math.min(bMin[0], x - w / 2);
          bMin[1] = Math.min(bMin[1], z - d / 2);
          bMax[0] = Math.max(bMax[0], x + w / 2);
          bMax[1] = Math.max(bMax[1], z + d / 2);
        }

        const floors: BuildingGeometry['floors'] = {};
        const primary = rects.reduce((a, b) => (b.size[0] * b.size[1] > a.size[0] * a.size[1] ? b : a));

        for (const floor of building.floors) {
          const elevation = (floor.level - 1) * opts.floorHeight;
          floors[floor.id] = { floorId: floor.id, elevation, height: opts.floorHeight };

          const procedural = layoutRoomsInRect(primary, floor.rooms.length, elevation, opts.roomLayout);
          floor.rooms.forEach((room, i) => {
            rooms[room.id] = opts.roomOverrides?.[room.id] ?? procedural[i];
          });
        }

        const levels = building.floors.map((f) => f.level);
        const topLevel = levels.length ? Math.max(...levels) : 1;

        buildings[building.id] = {
          buildingId: building.id,
          parts: rects.map((r) => toFootprint(r)),
          height: Math.max(1, topLevel) * opts.floorHeight,
          floors,
          center: [(bMin[0] + bMax[0]) / 2, 0, (bMin[1] + bMax[1]) / 2],
          radius: Math.hypot(bMax[0] - bMin[0], bMax[1] - bMin[1]) / 2,
          precision: 'approximate',
        };
      }

      const context: ContextFeature[] = opts.contextFeaturesPx.map((f) => {
        const rect = pxRectToRect(f.rect);
        extend(rect);
        return {
          id: f.id,
          kind: f.kind,
          label: f.label,
          footprint: toFootprint(rect, f.rounded ? Math.min(...rect.size) / 2 : undefined),
          height: f.kind === 'structure' ? opts.unknownStructureHeight : undefined,
        };
      });

      const connectors: ConnectorGeometry[] = (opts.connectorsPx ?? []).map((c) => {
        const missing = c.buildingIds.filter((id) => !buildings[id]);
        if (missing.length) {
          console.warn(`[geometry] Connector "${c.id}" references buildings without geometry: ${missing.join(', ')}`);
        }
        const rect = pxRectToRect(c.rect);
        extend(rect);
        return {
          id: c.id,
          kind: c.kind,
          buildingIds: c.buildingIds,
          footprint: toFootprint(rect),
          elevation: 0,
          height: Math.max(1, c.floorCount) * opts.floorHeight,
          precision: 'approximate',
        };
      });

      return { buildings, rooms, context, connectors, bounds: { min, max } };
    },
  };
}
