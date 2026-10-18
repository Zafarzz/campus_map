import type { Vec2 } from '../../domain/geometry/types';
import type {
  EditorBuilding,
  EditorDocument,
  EditorFloor,
  EditorOutdoorElement,
  EditorRoom,
  PhotoAttachment,
} from '../domain/types';
import { cloneDocument } from '../storage/storageService';

export interface EditorCommand {
  readonly description: string;
  execute(currentDoc: EditorDocument): EditorDocument;
  undo(currentDoc: EditorDocument): EditorDocument;
}

/**
 * Snapshot-based command ensuring 100% loss-free restoration of all nested structures.
 */
export class SnapshotCommand implements EditorCommand {
  constructor(
    public readonly description: string,
    private readonly beforeDoc: EditorDocument,
    private readonly afterDoc: EditorDocument,
  ) {}

  execute(): EditorDocument {
    return cloneDocument(this.afterDoc);
  }

  undo(): EditorDocument {
    return cloneDocument(this.beforeDoc);
  }
}

// Immutable document modification helpers

export function updateBuildingFootprint(
  doc: EditorDocument,
  buildingId: string,
  center: [number, number],
  size: [number, number],
): EditorDocument {
  const next = cloneDocument(doc);
  const bld = next.buildings.find((b) => b.id === buildingId);
  if (bld) {
    const oldCenter = bld.footprint.center;
    const oldSize = bld.footprint.size;
    const newCenter: [number, number] = [Number(center[0].toFixed(2)), Number(center[1].toFixed(2))];
    const newSize: [number, number] = [
      Math.max(1, Number(size[0].toFixed(2))),
      Math.max(1, Number(size[1].toFixed(2))),
    ];
    const dx = newCenter[0] - oldCenter[0];
    const dz = newCenter[1] - oldCenter[1];

    bld.footprint = {
      ...bld.footprint,
      center: newCenter,
      size: newSize,
    };

    if (bld.parts && bld.parts.length > 0) {
      const primaryIdx = bld.parts.reduce(
        (bestIdx, curr, idx, arr) =>
          curr.size[0] * curr.size[1] > arr[bestIdx].size[0] * arr[bestIdx].size[1] ? idx : bestIdx,
        0,
      );
      const sizeChanged =
        Math.abs(newSize[0] - oldSize[0]) > 0.01 || Math.abs(newSize[1] - oldSize[1]) > 0.01;

      bld.parts = bld.parts.map((part, idx) => {
        if (idx === primaryIdx && sizeChanged) {
          return { ...part, center: newCenter, size: newSize };
        }
        return {
          ...part,
          center: [Number((part.center[0] + dx).toFixed(2)), Number((part.center[1] + dz).toFixed(2))],
        };
      });
    }
  }
  return next;
}

export function updateRoomGeometry(
  doc: EditorDocument,
  buildingId: string,
  floorId: string,
  roomId: string,
  localCenter: [number, number],
  size: [number, number],
): EditorDocument {
  const next = cloneDocument(doc);
  const bld = next.buildings.find((b) => b.id === buildingId);
  const fl = bld?.floors.find((f) => f.id === floorId);
  const rm = fl?.rooms.find((r) => r.id === roomId);
  if (rm) {
    const dx = localCenter[0] - rm.localCenter[0];
    const dz = localCenter[1] - rm.localCenter[1];
    rm.localCenter = [Number(localCenter[0].toFixed(2)), Number(localCenter[1].toFixed(2))];
    rm.size = [Math.max(0.2, Number(size[0].toFixed(2))), Math.max(0.2, Number(size[1].toFixed(2)))];
    if (rm.polygon && rm.polygon.length > 0 && (Math.abs(dx) > 0.001 || Math.abs(dz) > 0.001)) {
      rm.polygon = rm.polygon.map(([px, pz]) => [
        Number((px + dx).toFixed(2)),
        Number((pz + dz).toFixed(2)),
      ]);
    }
  }
  return next;
}

export function updateRoomPolygonInDoc(
  doc: EditorDocument,
  buildingId: string,
  floorId: string,
  roomId: string,
  polygon: Vec2[],
): EditorDocument {
  const next = cloneDocument(doc);
  const bld = next.buildings.find((b) => b.id === buildingId);
  const fl = bld?.floors.find((f) => f.id === floorId);
  const rm = fl?.rooms.find((r) => r.id === roomId);
  if (rm && polygon.length >= 2) {
    rm.shape = polygon.length >= 3 ? 'polygon' : 'polyline';
    rm.polygon = polygon.map(([x, z]) => [Number(x.toFixed(2)), Number(z.toFixed(2))]);
    const xs = rm.polygon.map((p) => p[0]);
    const zs = rm.polygon.map((p) => p[1]);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minZ = Math.min(...zs);
    const maxZ = Math.max(...zs);
    rm.localCenter = [Number(((minX + maxX) / 2).toFixed(2)), Number(((minZ + maxZ) / 2).toFixed(2))];
    rm.size = [
      Math.max(0.3, Number((maxX - minX).toFixed(2))),
      Math.max(0.3, Number((maxZ - minZ).toFixed(2))),
    ];
  }
  return next;
}

export function addBuildingToDoc(doc: EditorDocument, building: EditorBuilding): EditorDocument {
  const next = cloneDocument(doc);
  next.buildings.push(cloneDocument(building as any) as any);
  return next;
}

export function removeBuildingFromDoc(doc: EditorDocument, buildingId: string): EditorDocument {
  const next = cloneDocument(doc);
  next.buildings = next.buildings.filter((b) => b.id !== buildingId);
  return next;
}

export function duplicateBuildingInDoc(
  doc: EditorDocument,
  buildingId: string,
): { doc: EditorDocument; newBuildingId?: string } {
  const next = cloneDocument(doc);
  const src = next.buildings.find((b) => b.id === buildingId);
  if (!src) return { doc: next };

  const suffix = Date.now().toString(36).slice(-4);
  const newBldId = `${src.id}-copy-${suffix}`;
  const offset: Vec2 = [8, 8];
  const copy: EditorBuilding = cloneDocument(src as any) as any;
  copy.id = newBldId;
  copy.name = `${src.name} (Copy)`;
  copy.shortName = `${src.shortName || 'B'}-2`;
  copy.footprint.center = [
    Number((src.footprint.center[0] + offset[0]).toFixed(2)),
    Number((src.footprint.center[1] + offset[1]).toFixed(2)),
  ];
  if (copy.parts) {
    copy.parts = copy.parts.map((p) => ({
      ...p,
      center: [
        Number((p.center[0] + offset[0]).toFixed(2)),
        Number((p.center[1] + offset[1]).toFixed(2)),
      ],
    }));
  }
  copy.floors = copy.floors.map((fl) => ({
    ...fl,
    id: `${newBldId}-f${fl.level}`,
    rooms: fl.rooms.map((rm, idx) => ({
      ...rm,
      id: `${newBldId}-f${fl.level}-r${idx + 1}-${suffix}`,
    })),
  }));

  next.buildings.push(copy);
  return { doc: next, newBuildingId: newBldId };
}

export function addFloorToDoc(doc: EditorDocument, buildingId: string, floor: EditorFloor): EditorDocument {
  const next = cloneDocument(doc);
  const bld = next.buildings.find((b) => b.id === buildingId);
  if (bld) {
    bld.floors.push(cloneDocument(floor as any) as any);
    bld.floors.sort((a, b) => a.level - b.level);
    bld.floorCount = bld.floors.length;
  }
  return next;
}

export function removeFloorFromDoc(doc: EditorDocument, buildingId: string, floorId: string): EditorDocument {
  const next = cloneDocument(doc);
  const bld = next.buildings.find((b) => b.id === buildingId);
  if (bld) {
    bld.floors = bld.floors.filter((f) => f.id !== floorId);
    bld.floorCount = bld.floors.length;
  }
  return next;
}

export function addRoomToDoc(doc: EditorDocument, buildingId: string, floorId: string, room: EditorRoom): EditorDocument {
  const next = cloneDocument(doc);
  const bld = next.buildings.find((b) => b.id === buildingId);
  const fl = bld?.floors.find((f) => f.id === floorId);
  if (fl) {
    fl.rooms.push(cloneDocument(room as any) as any);
  }
  return next;
}

export function removeRoomFromDoc(
  doc: EditorDocument,
  buildingId: string,
  floorId: string,
  roomId: string,
): EditorDocument {
  const next = cloneDocument(doc);
  const bld = next.buildings.find((b) => b.id === buildingId);
  const fl = bld?.floors.find((f) => f.id === floorId);
  if (fl) {
    fl.rooms = fl.rooms.filter((r) => r.id !== roomId);
  }
  return next;
}

export function duplicateRoomInDoc(
  doc: EditorDocument,
  buildingId: string,
  floorId: string,
  roomId: string,
): { doc: EditorDocument; newRoomId?: string } {
  const next = cloneDocument(doc);
  const bld = next.buildings.find((b) => b.id === buildingId);
  const fl = bld?.floors.find((f) => f.id === floorId);
  const src = fl?.rooms.find((r) => r.id === roomId);
  if (!fl || !src) return { doc: next };

  const suffix = Date.now().toString(36).slice(-4);
  const newId = `${src.id}-copy-${suffix}`;
  const offset: Vec2 = [2.0, 2.0];
  const copy: EditorRoom = cloneDocument(src as any) as any;
  copy.id = newId;
  copy.number = `${src.number}-C`;
  copy.name = src.name ? `${src.name} (Copy)` : undefined;
  copy.localCenter = [
    Number((src.localCenter[0] + offset[0]).toFixed(2)),
    Number((src.localCenter[1] + offset[1]).toFixed(2)),
  ];
  if (copy.polygon) {
    copy.polygon = copy.polygon.map(([px, pz]) => [
      Number((px + offset[0]).toFixed(2)),
      Number((pz + offset[1]).toFixed(2)),
    ]);
  }
  fl.rooms.push(copy);
  return { doc: next, newRoomId: newId };
}

export function updateBuildingPropsInDoc(
  doc: EditorDocument,
  buildingId: string,
  patch: Partial<Omit<EditorBuilding, 'id' | 'floors'>>,
): EditorDocument {
  const next = cloneDocument(doc);
  const bld = next.buildings.find((b) => b.id === buildingId);
  if (bld) {
    Object.assign(bld, patch);
  }
  return next;
}

export function updateRoomPropsInDoc(
  doc: EditorDocument,
  buildingId: string,
  floorId: string,
  roomId: string,
  patch: Partial<Omit<EditorRoom, 'id'>>,
): EditorDocument {
  const next = cloneDocument(doc);
  const bld = next.buildings.find((b) => b.id === buildingId);
  const fl = bld?.floors.find((f) => f.id === floorId);
  const rm = fl?.rooms.find((r) => r.id === roomId);
  if (rm) {
    Object.assign(rm, patch);
  }
  return next;
}

// Outdoor Element Commands

export function addOutdoorElementToDoc(
  doc: EditorDocument,
  element: EditorOutdoorElement,
): EditorDocument {
  const next = cloneDocument(doc);
  if (!next.outdoorElements) next.outdoorElements = [];
  next.outdoorElements.push(cloneDocument(element as any) as any);
  return next;
}

export function removeOutdoorElementFromDoc(
  doc: EditorDocument,
  outdoorId: string,
): EditorDocument {
  const next = cloneDocument(doc);
  if (!next.outdoorElements) return next;
  next.outdoorElements = next.outdoorElements.filter((el) => el.id !== outdoorId);
  return next;
}

export function updateOutdoorElementInDoc(
  doc: EditorDocument,
  outdoorId: string,
  patch: Partial<Omit<EditorOutdoorElement, 'id'>>,
): EditorDocument {
  const next = cloneDocument(doc);
  if (!next.outdoorElements) return next;
  const el = next.outdoorElements.find((item) => item.id === outdoorId);
  if (!el) return next;

  if (patch.center && el.points && el.points.length > 0 && !patch.points) {
    const dx = patch.center[0] - el.center[0];
    const dz = patch.center[1] - el.center[1];
    if (Math.abs(dx) > 0.001 || Math.abs(dz) > 0.001) {
      el.points = el.points.map(([px, pz]) => [
        Number((px + dx).toFixed(2)),
        Number((pz + dz).toFixed(2)),
      ]);
    }
  }

  Object.assign(el, patch);

  if (patch.points && patch.points.length >= 2 && !patch.center) {
    const xs = patch.points.map((p) => p[0]);
    const zs = patch.points.map((p) => p[1]);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minZ = Math.min(...zs);
    const maxZ = Math.max(...zs);
    el.center = [Number(((minX + maxX) / 2).toFixed(2)), Number(((minZ + maxZ) / 2).toFixed(2))];
    el.size = [
      Math.max(1, Number((maxX - minX).toFixed(2))),
      Math.max(1, Number((maxZ - minZ).toFixed(2))),
    ];
  }

  return next;
}

export function duplicateOutdoorElementInDoc(
  doc: EditorDocument,
  outdoorId: string,
): { doc: EditorDocument; newOutdoorId?: string } {
  const next = cloneDocument(doc);
  if (!next.outdoorElements) return { doc: next };
  const src = next.outdoorElements.find((el) => el.id === outdoorId);
  if (!src) return { doc: next };

  const suffix = Date.now().toString(36).slice(-4);
  const newId = `${src.id}-copy-${suffix}`;
  const offset: Vec2 = [5, 5];
  const copy: EditorOutdoorElement = cloneDocument(src as any) as any;
  copy.id = newId;
  copy.name = `${src.name} (Copy)`;
  copy.center = [
    Number((src.center[0] + offset[0]).toFixed(2)),
    Number((src.center[1] + offset[1]).toFixed(2)),
  ];
  if (copy.points) {
    copy.points = copy.points.map(([px, pz]) => [
      Number((px + offset[0]).toFixed(2)),
      Number((pz + offset[1]).toFixed(2)),
    ]);
  }
  next.outdoorElements.push(copy);
  return { doc: next, newOutdoorId: newId };
}

export function updateFloorPropsInDoc(
  doc: EditorDocument,
  buildingId: string,
  floorId: string,
  patch: Partial<Omit<EditorFloor, 'id' | 'rooms'>>,
): EditorDocument {
  const next = cloneDocument(doc);
  const bld = next.buildings.find((b) => b.id === buildingId);
  const fl = bld?.floors.find((f) => f.id === floorId);
  if (fl) {
    Object.assign(fl, patch);
  }
  return next;
}

export function updateCampusPropsInDoc(
  doc: EditorDocument,
  patch: Partial<Pick<EditorDocument, 'name' | 'description' | 'aiComment' | 'photos'>>,
): EditorDocument {
  const next = cloneDocument(doc);
  Object.assign(next, patch);
  return next;
}

// Photo Attachment Commands

export type PhotoTargetSpec =
  | { targetType: 'campus' }
  | { targetType: 'building'; buildingId: string }
  | { targetType: 'floor'; buildingId: string; floorId: string }
  | { targetType: 'room'; buildingId: string; floorId: string; roomId: string }
  | { targetType: 'outdoor'; outdoorId: string };

function getTargetContainer(
  doc: EditorDocument,
  spec: PhotoTargetSpec,
): { photos?: PhotoAttachment[] } | null {
  switch (spec.targetType) {
    case 'campus':
      return doc;
    case 'building':
      return doc.buildings.find((b) => b.id === spec.buildingId) ?? null;
    case 'floor': {
      const bld = doc.buildings.find((b) => b.id === spec.buildingId);
      return bld?.floors.find((f) => f.id === spec.floorId) ?? null;
    }
    case 'room': {
      const bld = doc.buildings.find((b) => b.id === spec.buildingId);
      const fl = bld?.floors.find((f) => f.id === spec.floorId);
      return fl?.rooms.find((r) => r.id === spec.roomId) ?? null;
    }
    case 'outdoor':
      return (doc.outdoorElements ?? []).find((o) => o.id === spec.outdoorId) ?? null;
  }
}

export function addPhotosToTargetInDoc(
  doc: EditorDocument,
  spec: PhotoTargetSpec,
  newPhotos: PhotoAttachment[],
): EditorDocument {
  const next = cloneDocument(doc);
  const target = getTargetContainer(next, spec);
  if (!target) return next;
  const existing = target.photos ? [...target.photos] : [];
  for (const photo of newPhotos) {
    existing.push({
      ...photo,
      order: existing.length,
    });
  }
  target.photos = existing;
  return next;
}

export function updatePhotoInTargetInDoc(
  doc: EditorDocument,
  spec: PhotoTargetSpec,
  photoId: string,
  patch: Partial<Omit<PhotoAttachment, 'id' | 'fileId'>>,
): EditorDocument {
  const next = cloneDocument(doc);
  const target = getTargetContainer(next, spec);
  if (!target || !target.photos) return next;
  target.photos = target.photos.map((p) => (p.id === photoId ? { ...p, ...patch } : p));
  return next;
}

export function reorderPhotoInTargetInDoc(
  doc: EditorDocument,
  spec: PhotoTargetSpec,
  photoId: string,
  direction: 'up' | 'down',
): EditorDocument {
  const next = cloneDocument(doc);
  const target = getTargetContainer(next, spec);
  if (!target || !target.photos || target.photos.length < 2) return next;

  const list = [...target.photos];
  const idx = list.findIndex((p) => p.id === photoId);
  if (idx === -1) return next;

  const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
  if (swapIdx < 0 || swapIdx >= list.length) return next;

  const temp = list[idx];
  list[idx] = list[swapIdx];
  list[swapIdx] = temp;

  target.photos = list.map((p, i) => ({ ...p, order: i }));
  return next;
}

export function removePhotoFromTargetInDoc(
  doc: EditorDocument,
  spec: PhotoTargetSpec,
  photoId: string,
): EditorDocument {
  const next = cloneDocument(doc);
  const target = getTargetContainer(next, spec);
  if (!target || !target.photos) return next;
  target.photos = target.photos
    .filter((p) => p.id !== photoId)
    .map((p, i) => ({ ...p, order: i }));
  return next;
}

