import { mapConfig } from '../../config/mapConfig';
import { demoCampus } from '../../data/demo-campus';
import { accurateRoomOverrides } from '../../data/floor-plans';
import { buildingFootprintsPx, type PxRect } from '../../data/reference-footprints';
import type { Campus } from '../../domain/campus/types';
import type { RoomGeometry, Vec2, Vec3 } from '../../domain/geometry/types';
import type { EditorBuilding, EditorDocument, EditorFloor, EditorRoom } from './types';

const [imgW, imgH] = mapConfig.reference.imageSizePx;
const mpp = mapConfig.reference.metersPerPixel;
const floorHeight = mapConfig.building.floorHeight;
const slabThickness = mapConfig.building.slabThickness;
const roomHeight = mapConfig.roomLayout.roomHeight;

/**
 * Converts image pixel rect to world meters rect.
 */
export function pxRectToMeters([l, t, r, b]: PxRect): { center: Vec2; size: [number, number] } {
  return {
    center: [((l + r) / 2 - imgW / 2) * mpp, ((t + b) / 2 - imgH / 2) * mpp],
    size: [(r - l) * mpp, (b - t) * mpp],
  };
}

/**
 * Converts world meters rect to image pixel rect.
 */
export function metersToPxRect(center: Vec2, size: [number, number]): PxRect {
  const [cx, cz] = center;
  const [w, d] = size;
  const l = cx / mpp + imgW / 2 - w / (2 * mpp);
  const r = l + w / mpp;
  const t = cz / mpp + imgH / 2 - d / (2 * mpp);
  const b = t + d / mpp;
  return [Math.round(l), Math.round(t), Math.round(r), Math.round(b)];
}

/**
 * Creates the initial EditorDocument from existing project data.
 */
export function createInitialDocument(): EditorDocument {
  const buildings: EditorBuilding[] = demoCampus.buildings.map((bld) => {
    const pxList = buildingFootprintsPx[bld.id];
    let center: Vec2 = [0, 0];
    let size: [number, number] = [30, 15];

    if (pxList && pxList.length > 0) {
      // Use largest primary footprint
      const rects = pxList.map(pxRectToMeters);
      const primary = rects.reduce((a, b) => (b.size[0] * b.size[1] > a.size[0] * a.size[1] ? b : a));
      center = primary.center;
      size = primary.size;
    }

    const floors: EditorFloor[] = bld.floors.map((fl) => {
      const rooms: EditorRoom[] = fl.rooms.map((rm, i) => {
        const override = accurateRoomOverrides[rm.id];
        let localCenter: Vec2 = [0, 0];
        let roomSize: [number, number] = [8, 6];

        if (override && override.type === 'box') {
          localCenter = [override.position[0] - center[0], override.position[2] - center[1]];
          roomSize = [override.size[0], override.size[2]];
        } else {
          // Procedural distribution inside building footprint
          const count = fl.rooms.length;
          const col = i % Math.max(1, Math.ceil(count / 2));
          const row = Math.floor(i / Math.max(1, Math.ceil(count / 2)));
          const u = -size[0] / 2 + (size[0] / Math.max(1, Math.ceil(count / 2))) * (col + 0.5);
          const v = (row === 0 ? -1 : 1) * (size[1] * 0.28);
          localCenter = [u, v];
          roomSize = [Math.max(4, size[0] / Math.max(1, count) - 1), Math.max(3, size[1] * 0.35)];
        }

        return {
          id: rm.id,
          number: rm.number,
          name: rm.name,
          kind: rm.kind,
          capacity: rm.capacity ?? 30,
          localCenter,
          size: roomSize,
          provenance: rm.provenance,
        };
      });

      return {
        id: fl.id,
        level: fl.level,
        name: fl.name,
        rooms,
      };
    });

    return {
      id: bld.id,
      name: bld.name,
      shortName: bld.shortName,
      description: bld.description,
      footprint: { center, size },
      floors,
      floorCount: bld.floors.length,
      appearancePreset: bld.appearancePreset,
      appearance: bld.appearance,
    };
  });

  return {
    schemaVersion: 1,
    campusId: demoCampus.id,
    name: demoCampus.name,
    lastModified: new Date().toISOString(),
    buildings,
  };
}

/**
 * Converts an EditorDocument back to domain Campus and geometries for 3D rendering.
 */
export function editorDocToCampusAndGeom(doc: EditorDocument): {
  campus: Campus;
  buildingFootprintsPx: Record<string, PxRect[]>;
  roomOverrides: Record<string, RoomGeometry>;
} {
  const buildingFootprintsPxMap: Record<string, PxRect[]> = {};
  const roomOverrides: Record<string, RoomGeometry> = {};

  const campus: Campus = {
    id: doc.campusId,
    name: doc.name,
    buildings: doc.buildings.map((bld) => {
      const pxRect = metersToPxRect(bld.footprint.center, bld.footprint.size);
      buildingFootprintsPxMap[bld.id] = [pxRect];

      const floors = bld.floors.map((fl) => {
        const elevation = (fl.level - 1) * floorHeight;
        const y = elevation + slabThickness + roomHeight / 2;

        const rooms = fl.rooms.map((rm) => {
          const worldX = bld.footprint.center[0] + rm.localCenter[0];
          const worldZ = bld.footprint.center[1] + rm.localCenter[1];

          const geom: RoomGeometry = {
            type: 'box',
            position: [worldX, y, worldZ],
            size: [rm.size[0], roomHeight, rm.size[1]],
            rotation: rm.rotation,
            precision: rm.provenance === 'confirmed' ? 'surveyed' : 'approximate',
          };
          roomOverrides[rm.id] = geom;

          return {
            id: rm.id,
            number: rm.number,
            name: rm.name,
            kind: rm.kind,
            capacity: rm.capacity,
            provenance: rm.provenance,
          };
        });

        return {
          id: fl.id,
          level: fl.level,
          name: fl.name,
          rooms,
        };
      });

      return {
        id: bld.id,
        name: bld.name,
        shortName: bld.shortName,
        description: bld.description,
        floors,
        provenance: 'confirmed',
        appearancePreset: bld.appearancePreset,
        appearance: bld.appearance,
      };
    }),
  };

  return {
    campus,
    buildingFootprintsPx: buildingFootprintsPxMap,
    roomOverrides,
  };
}
