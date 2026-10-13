import type { EditorBuilding, EditorDocument, EditorFloor, EditorRoom } from '../domain/types';
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
    bld.footprint = {
      ...bld.footprint,
      center: [Number(center[0].toFixed(2)), Number(center[1].toFixed(2))],
      size: [Math.max(1, Number(size[0].toFixed(2))), Math.max(1, Number(size[1].toFixed(2)))],
    };
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
    rm.localCenter = [Number(localCenter[0].toFixed(2)), Number(localCenter[1].toFixed(2))];
    rm.size = [Math.max(1, Number(size[0].toFixed(2))), Math.max(1, Number(size[1].toFixed(2)))];
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
