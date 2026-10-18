import { mapConfig } from '../../config/mapConfig';
import { demoCampus } from '../../data/demo-campus';
import { accurateRoomOverrides } from '../../data/floor-plans';
import {
  buildingFootprintsPx,
  connectorsPx,
  contextFeaturesPx,
  type ContextFeaturePx,
  type PxRect,
} from '../../data/reference-footprints';
import type { Campus } from '../../domain/campus/types';
import type { RoomGeometry, Vec2 } from '../../domain/geometry/types';
import type {
  EditorBuilding,
  EditorDocument,
  EditorFloor,
  EditorLayerId,
  EditorOutdoorElement,
  EditorRoom,
  IndoorElementType,
  OutdoorElementType,
  Rect2D,
} from './types';

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
    center: [
      Number((((l + r) / 2 - imgW / 2) * mpp).toFixed(2)),
      Number((((t + b) / 2 - imgH / 2) * mpp).toFixed(2)),
    ],
    size: [
      Number(((r - l) * mpp).toFixed(2)),
      Number(((b - t) * mpp).toFixed(2)),
    ],
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

const CONTEXT_LABELS: Record<string, string> = {
  track: 'Running Track (Беговая дорожка)',
  pitch: 'Central Campus Fountain Plaza',
  court: 'Sports Court (Спортивная площадка)',
  'lawn-sq': 'Central Square Lawn (Сквер)',
  'lawn-g1': 'North Promenade Lawn (Газон)',
  'lawn-orchard1': 'Courtyard Garden (Внутренний сад)',
  'lawn-orchard2': 'South Garden (Южный сад)',
  'lawn-n': 'North-West Park (Северо-западный парк)',
  'road-east': 'East Main Road (Восточный проезд)',
  'kpp-n': 'North Gate (Северное КПП)',
  'kpp-w': 'West Checkpoint (Западное КПП)',
  'kpp-sw': 'South-West Gate (Юго-западный вход)',
  'kpp-e': 'Main East Entrance (Главный вход КПП AUT)',
};

function createInitialOutdoorElements(): EditorOutdoorElement[] {
  const elements: EditorOutdoorElement[] = [];

  for (const cf of contextFeaturesPx) {
    const { center, size } = pxRectToMeters(cf.rect);
    if (cf.id === 'pitch') {
      // Represented as the Grand Campus Fountain (ADR-023)
      elements.push({
        id: 'out-fountain-main',
        type: 'fountain',
        name: 'Grand Campus Fountain (Главный фонтан)',
        description: 'Architectural fountain with 2 bridges and 5-tier cascade',
        layer: 'infrastructure',
        shape: 'rect',
        center: [Number((center[0] - 50.0).toFixed(2)), center[1]],
        size: [54, 18],
        contextKind: 'pitch',
      });
      continue;
    }

    let type: OutdoorElementType = 'custom';
    let layer: EditorLayerId = 'infrastructure';

    if (cf.kind === 'lawn') {
      type = 'lawn';
      layer = 'greenery';
    } else if (cf.kind === 'road') {
      type = 'road';
      layer = 'paths';
    } else if (cf.kind === 'court' || cf.kind === 'track') {
      type = 'plaza';
      layer = 'infrastructure';
    } else if (cf.kind === 'structure') {
      type = 'entrance';
      layer = 'infrastructure';
    }

    elements.push({
      id: `out-${cf.id}`,
      type,
      name: CONTEXT_LABELS[cf.id] || cf.label || cf.id,
      layer,
      shape: 'rect',
      center,
      size,
      contextKind: cf.kind,
    });
  }

  // Add enclosed walkways / connectors between buildings
  for (const conn of connectorsPx) {
    const { center, size } = pxRectToMeters(conn.rect);
    elements.push({
      id: `out-${conn.id}`,
      type: 'walkway',
      name:
        conn.id === 'conn-bld-g-bld-i'
          ? 'Walkway Block B ↔ Block C'
          : 'Walkway Block A ↔ Block C',
      description: 'Enclosed ground-level connecting passage between academic blocks',
      layer: 'paths',
      shape: 'rect',
      center,
      size,
      width: Math.min(size[0], size[1]),
      connectedBuildingIds: conn.buildingIds,
    });
  }

  // Add default main pedestrian path from East Gate toward Central Fountain & Academic Blocks
  elements.push({
    id: 'out-path-main-promenade',
    type: 'path',
    name: 'Main Pedestrian Promenade (Главная аллея)',
    description: 'Central pedestrian walkway connecting East Entrance with Fountain and Blocks A/B',
    layer: 'paths',
    shape: 'polyline',
    center: [45, 22],
    size: [110, 10],
    points: [
      [105, 18],
      [45, 18],
      [-2, 18],
    ],
    width: 4.5,
  });

  // Add sample tree clusters in greenery layer
  elements.push(
    {
      id: 'out-tree-promenade-1',
      type: 'tree',
      name: 'Palm Row North (Пальмовая аллея С)',
      layer: 'greenery',
      shape: 'point',
      center: [-10, 4],
      size: [5, 5],
    },
    {
      id: 'out-tree-promenade-2',
      type: 'tree',
      name: 'Palm Row South (Пальмовая аллея Ю)',
      layer: 'greenery',
      shape: 'point',
      center: [-10, 28],
      size: [5, 5],
    },
  );

  return elements;
}

/**
 * Creates the initial EditorDocument from existing project data.
 */
export function createInitialDocument(): EditorDocument {
  const buildings: EditorBuilding[] = demoCampus.buildings.map((bld) => {
    const pxList = buildingFootprintsPx[bld.id];
    let center: Vec2 = [0, 0];
    let size: [number, number] = [30, 15];
    let parts: Rect2D[] = [];

    if (pxList && pxList.length > 0) {
      const rects = pxList.map(pxRectToMeters);
      parts = rects.map((r) => ({ center: [...r.center] as Vec2, size: [...r.size] as [number, number] }));
      const primary = rects.reduce((a, b) => (b.size[0] * b.size[1] > a.size[0] * a.size[1] ? b : a));
      center = [...primary.center] as Vec2;
      size = [...primary.size] as [number, number];
    }

    const floors: EditorFloor[] = bld.floors.map((fl) => {
      const rooms: EditorRoom[] = fl.rooms.map((rm, i) => {
        const override = accurateRoomOverrides[rm.id];
        let localCenter: Vec2 = [0, 0];
        let roomSize: [number, number] = [8, 6];

        if (override && override.type === 'box') {
          localCenter = [
            Number((override.position[0] - center[0]).toFixed(2)),
            Number((override.position[2] - center[1]).toFixed(2)),
          ];
          roomSize = [
            Number(override.size[0].toFixed(2)),
            Number(override.size[2].toFixed(2)),
          ];
        } else {
          // Procedural distribution inside building footprint
          const count = fl.rooms.length;
          const col = i % Math.max(1, Math.ceil(count / 2));
          const row = Math.floor(i / Math.max(1, Math.ceil(count / 2)));
          const u = -size[0] / 2 + (size[0] / Math.max(1, Math.ceil(count / 2))) * (col + 0.5);
          const v = (row === 0 ? -1 : 1) * (size[1] * 0.28);
          localCenter = [Number(u.toFixed(2)), Number(v.toFixed(2))];
          roomSize = [
            Number(Math.max(4, size[0] / Math.max(1, count) - 1).toFixed(2)),
            Number(Math.max(3, size[1] * 0.35).toFixed(2)),
          ];
        }

        const elementType: IndoorElementType =
          rm.kind === 'hall'
            ? rm.name?.toLowerCase().includes('lobby')
              ? 'lobby'
              : 'hall'
            : 'room';

        return {
          id: rm.id,
          number: rm.number,
          name: rm.name,
          kind: rm.kind,
          elementType,
          shape: 'rect',
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
      parts,
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
    outdoorElements: createInitialOutdoorElements(),
  };
}

/**
 * Converts an EditorDocument back to domain Campus and geometries for 3D rendering.
 */
export function editorDocToCampusAndGeom(doc: EditorDocument): {
  campus: Campus;
  buildingFootprintsPx: Record<string, PxRect[]>;
  roomOverrides: Record<string, RoomGeometry>;
  contextFeaturesPx?: ContextFeaturePx[];
} {
  const buildingFootprintsPxMap: Record<string, PxRect[]> = {};
  const roomOverrides: Record<string, RoomGeometry> = {};

  const campus: Campus = {
    id: doc.campusId,
    name: doc.name,
    buildings: doc.buildings.map((bld) => {
      // Preserve multi-wing footprints if present and unmodified, or transform them coherently
      if (bld.parts && bld.parts.length > 1) {
        const primaryIdx = bld.parts.reduce(
          (bestIdx, curr, idx, arr) =>
            curr.size[0] * curr.size[1] > arr[bestIdx].size[0] * arr[bestIdx].size[1] ? idx : bestIdx,
          0,
        );
        const origPrimary = bld.parts[primaryIdx];
        const dx = bld.footprint.center[0] - origPrimary.center[0];
        const dz = bld.footprint.center[1] - origPrimary.center[1];
        const sizeChanged =
          Math.abs(bld.footprint.size[0] - origPrimary.size[0]) > 0.05 ||
          Math.abs(bld.footprint.size[1] - origPrimary.size[1]) > 0.05;

        buildingFootprintsPxMap[bld.id] = bld.parts.map((part, idx) => {
          if (idx === primaryIdx && sizeChanged) {
            return metersToPxRect(bld.footprint.center, bld.footprint.size);
          }
          return metersToPxRect([part.center[0] + dx, part.center[1] + dz], part.size);
        });
      } else {
        const pxRect = metersToPxRect(bld.footprint.center, bld.footprint.size);
        buildingFootprintsPxMap[bld.id] = [pxRect];
      }

      const floors = bld.floors.map((fl) => {
        const elevation = (fl.level - 1) * floorHeight;
        const y = elevation + slabThickness + roomHeight / 2;

        const rooms = fl.rooms.map((rm) => {
          const worldX = bld.footprint.center[0] + rm.localCenter[0];
          const worldZ = bld.footprint.center[1] + rm.localCenter[1];

          const elHeight =
            rm.elementType === 'door'
              ? 2.1
              : rm.elementType === 'window'
                ? 1.4
                : rm.elementType === 'wall' || rm.elementType === 'partition'
                  ? roomHeight
                  : roomHeight;

          const geom: RoomGeometry = {
            type: 'box',
            position: [worldX, y, worldZ],
            size: [rm.size[0], elHeight, rm.size[1]],
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

  let derivedContextPx: ContextFeaturePx[] | undefined;
  if (doc.outdoorElements && doc.outdoorElements.length > 0) {
    derivedContextPx = [...contextFeaturesPx];
    for (const out of doc.outdoorElements) {
      if (out.id === 'out-fountain-main') continue;
      if (out.id.startsWith('out-')) {
        const origId = out.id.slice(4);
        const existingIdx = derivedContextPx.findIndex((c) => c.id === origId);
        const mappedKind: ContextFeaturePx['kind'] =
          out.contextKind ??
          (out.type === 'lawn' || out.type === 'tree'
            ? 'lawn'
            : out.type === 'road' || out.type === 'path' || out.type === 'walkway'
              ? 'road'
              : out.type === 'entrance'
                ? 'structure'
                : 'court');

        const rect = metersToPxRect(out.center, out.size);
        if (existingIdx >= 0) {
          derivedContextPx[existingIdx] = {
            ...derivedContextPx[existingIdx],
            rect,
            label: out.name,
          };
        } else {
          derivedContextPx.push({
            id: out.id,
            kind: mappedKind,
            rect,
            label: out.name,
          });
        }
      }
    }
  }

  return {
    campus,
    buildingFootprintsPx: buildingFootprintsPxMap,
    roomOverrides,
    contextFeaturesPx: derivedContextPx,
  };
}

