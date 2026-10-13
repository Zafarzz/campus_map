import { describe, expect, it } from 'vitest';
import { createInitialDocument, editorDocToCampusAndGeom } from '../editor/domain/adapter';
import type { EditorBuilding, EditorDocument, EditorRoom } from '../editor/domain/types';
import {
  addBuildingToDoc,
  addRoomToDoc,
  removeBuildingFromDoc,
  removeRoomFromDoc,
  SnapshotCommand,
  updateBuildingFootprint,
  updateRoomGeometry,
} from '../editor/history/commands';
import { HistoryManager } from '../editor/history/historyManager';
import {
  cloneDocument,
  createNamedVersion,
  deleteVersion,
  initStorage,
  loadDraft,
  loadVersions,
  saveDraft,
} from '../editor/storage/storageService';
import { validateDocument } from '../editor/validation/validator';

describe('2D Editor Domain & Adapter', () => {
  it('creates initial EditorDocument conforming to schema v1', () => {
    const doc = createInitialDocument();
    expect(doc.schemaVersion).toBe(1);
    expect(doc.buildings.length).toBeGreaterThan(0);

    const bldA = doc.buildings.find((b) => b.id === 'bld-h');
    expect(bldA).toBeDefined();
    expect(bldA!.footprint.size[0]).toBeGreaterThan(0);
    expect(bldA!.footprint.size[1]).toBeGreaterThan(0);
    expect(bldA!.floors.length).toBe(2);
  });

  it('converts EditorDocument back to Campus and 3D geometries with high fidelity', () => {
    const doc = createInitialDocument();
    const { campus, buildingFootprintsPx, roomOverrides } = editorDocToCampusAndGeom(doc);

    expect(campus.buildings.length).toBe(doc.buildings.length);
    expect(Object.keys(buildingFootprintsPx).length).toBe(doc.buildings.length);
    expect(Object.keys(roomOverrides).length).toBeGreaterThan(0);

    // Verify room geometry has 3D position and size
    const firstRoomId = Object.keys(roomOverrides)[0];
    const geom = roomOverrides[firstRoomId];
    expect(geom.type).toBe('box');
    if (geom.type === 'box') {
      expect(geom.position).toHaveLength(3);
      expect(geom.size).toHaveLength(3);
    }
  });
});

describe('2D Editor Storage & Persistence', () => {
  it('initializes storage with initial draft and version snapshot', async () => {
    const { doc, versions } = await initStorage();
    expect(doc).toBeDefined();
    expect(versions.length).toBeGreaterThanOrEqual(1);
    expect(versions.some((v) => v.type === 'initial')).toBe(true);
  });

  it('saves and reloads draft document', async () => {
    const doc = createInitialDocument();
    doc.name = 'Updated Test Campus';
    await saveDraft(doc);

    const loaded = await loadDraft();
    expect(loaded).toBeDefined();
    expect(loaded!.name).toBe('Updated Test Campus');
  });

  it('creates named version and forbids deleting initial version', async () => {
    const doc = createInitialDocument();
    const ver = await createNamedVersion(doc, 'Контрольная точка 1', 'Тестовое описание', 'manual');
    expect(ver.name).toBe('Контрольная точка 1');

    const versions = await loadVersions();
    expect(versions.some((v) => v.id === ver.id)).toBe(true);

    // Initial version cannot be deleted
    const initialVer = versions.find((v) => v.type === 'initial');
    if (initialVer) {
      const deleted = await deleteVersion(initialVer.id);
      expect(deleted).toBe(false);
    }

    // Manual version can be deleted
    const deletedManual = await deleteVersion(ver.id);
    expect(deletedManual).toBe(true);
  });
});

describe('2D Editor Undo / Redo & Commands', () => {
  it('handles building movement and undo restoration', () => {
    const doc = createInitialDocument();
    const bldId = doc.buildings[0].id;
    const initialCenter = [...doc.buildings[0].footprint.center] as [number, number];

    const modified = updateBuildingFootprint(
      doc,
      bldId,
      [initialCenter[0] + 15, initialCenter[1] - 10],
      doc.buildings[0].footprint.size,
    );

    const history = new HistoryManager();
    const cmd = new SnapshotCommand('Перемещение здания', doc, modified);
    history.push(cmd);

    expect(modified.buildings[0].footprint.center[0]).toBeCloseTo(initialCenter[0] + 15);

    // Undo
    const undoRes = history.undo(modified);
    expect(undoRes).toBeDefined();
    expect(undoRes!.doc.buildings[0].footprint.center[0]).toBeCloseTo(initialCenter[0]);

    // Redo
    const redoRes = history.redo(undoRes!.doc);
    expect(redoRes).toBeDefined();
    expect(redoRes!.doc.buildings[0].footprint.center[0]).toBeCloseTo(initialCenter[0] + 15);
  });

  it('completely restores deleted building with all floors and rooms via Undo', () => {
    const doc = createInitialDocument();
    const targetBuilding = doc.buildings[0];
    const initialFloorCount = targetBuilding.floors.length;
    const initialRoomCount = targetBuilding.floors.reduce((acc, f) => acc + f.rooms.length, 0);

    const docAfterDelete = removeBuildingFromDoc(doc, targetBuilding.id);
    expect(docAfterDelete.buildings.find((b) => b.id === targetBuilding.id)).toBeUndefined();

    const history = new HistoryManager();
    const cmd = new SnapshotCommand('Удаление корпуса', doc, docAfterDelete);
    history.push(cmd);

    // Undo delete
    const restored = history.undo(docAfterDelete);
    expect(restored).toBeDefined();

    const restoredBld = restored!.doc.buildings.find((b) => b.id === targetBuilding.id);
    expect(restoredBld).toBeDefined();
    expect(restoredBld!.floors.length).toBe(initialFloorCount);
    expect(restoredBld!.floors.reduce((acc, f) => acc + f.rooms.length, 0)).toBe(initialRoomCount);
  });

  it('handles room movement and geometry updates', () => {
    const doc = createInitialDocument();
    const bld = doc.buildings[0];
    const fl = bld.floors[0];
    const rm = fl.rooms[0];

    const updated = updateRoomGeometry(doc, bld.id, fl.id, rm.id, [12.5, -4.2], [9, 7]);
    const updatedRm = updated.buildings[0].floors[0].rooms.find((r) => r.id === rm.id);

    expect(updatedRm!.localCenter).toEqual([12.5, -4.2]);
    expect(updatedRm!.size).toEqual([9, 7]);
  });
});

describe('2D Editor Validation', () => {
  it('passes on valid document', () => {
    const doc = createInitialDocument();
    const issues = validateDocument(doc);
    const errors = issues.filter((i) => i.severity === 'error');
    expect(errors).toHaveLength(0);
  });

  it('detects duplicate building IDs and invalid dimensions', () => {
    const doc = createInitialDocument();
    const invalidDoc = cloneDocument(doc);

    // Add duplicate building with negative dimension
    const baseBld = doc.buildings[0];
    const dupBld: EditorBuilding = {
      ...JSON.parse(JSON.stringify(baseBld)),
      footprint: { center: [0, 0], size: [-5, 10] },
    };
    invalidDoc.buildings.push(dupBld);

    const issues = validateDocument(invalidDoc);
    expect(issues.some((i) => i.message.includes('Дублирующийся ID здания'))).toBe(true);
    expect(issues.some((i) => i.message.includes('Некорректные размеры здания'))).toBe(true);
  });

  it('detects room boundary overflow warning', () => {
    const doc = createInitialDocument();
    const overflowDoc = cloneDocument(doc);

    // Place a room far outside the building bounds
    overflowDoc.buildings[0].floors[0].rooms[0].localCenter = [200, 200];

    const issues = validateDocument(overflowDoc);
    expect(issues.some((i) => i.message.includes('выходит за границы здания'))).toBe(true);
  });
});
