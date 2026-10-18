import { describe, expect, it } from 'vitest';
import {
  computeSemanticChanges,
  revertIndividualChange,
} from '../editor/changeTracking/changeTracker';
import { createInitialDocument, editorDocToCampusAndGeom } from '../editor/domain/adapter';
import type {
  EditorBuilding,
  EditorDocument,
  EditorOutdoorElement,
  EditorRoom,
  PhotoAttachment,
} from '../editor/domain/types';
import { buildCampusEditZipPackage } from '../editor/export/exportService';
import { readZipArchive } from '../editor/export/zipWriter';
import {
  addBuildingToDoc,
  addOutdoorElementToDoc,
  addPhotosToTargetInDoc,
  addRoomToDoc,
  duplicateBuildingInDoc,
  duplicateOutdoorElementInDoc,
  duplicateRoomInDoc,
  removeBuildingFromDoc,
  removeOutdoorElementFromDoc,
  removePhotoFromTargetInDoc,
  removeRoomFromDoc,
  reorderPhotoInTargetInDoc,
  SnapshotCommand,
  updateBuildingFootprint,
  updateBuildingPropsInDoc,
  updateOutdoorElementInDoc,
  updatePhotoInTargetInDoc,
  updateRoomGeometry,
  updateRoomPolygonInDoc,
  updateRoomPropsInDoc,
} from '../editor/history/commands';
import { HistoryManager } from '../editor/history/historyManager';
import {
  clearAllAttachmentBlobs,
  deleteAttachmentBlob,
  getAttachmentBlobSync,
  saveAttachmentBlob,
  simulatePageReloadForAttachments,
} from '../editor/storage/attachmentStorage';
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
  it('creates initial EditorDocument conforming to schema v1 with outdoor elements and multi-part wings', () => {
    const doc = createInitialDocument();
    expect(doc.schemaVersion).toBe(1);
    expect(doc.buildings.length).toBeGreaterThan(0);
    expect((doc.outdoorElements ?? []).length).toBeGreaterThan(0);

    const bldH = doc.buildings.find((b) => b.id === 'bld-h');
    expect(bldH).toBeDefined();
    expect(bldH!.footprint.size[0]).toBeGreaterThan(0);
    expect(bldH!.footprint.size[1]).toBeGreaterThan(0);
    expect(bldH!.floors.length).toBe(2);

    // Multi-part building bld-a preserves its secondary wings
    const bldA = doc.buildings.find((b) => b.id === 'bld-a');
    expect(bldA).toBeDefined();
    expect((bldA!.parts ?? []).length).toBeGreaterThan(1);
  });

  it('converts EditorDocument back to Campus and 3D geometries with high fidelity', () => {
    const doc = createInitialDocument();
    const { campus, buildingFootprintsPx, roomOverrides, contextFeaturesPx } =
      editorDocToCampusAndGeom(doc);

    expect(campus.buildings.length).toBe(doc.buildings.length);
    expect(Object.keys(buildingFootprintsPx).length).toBe(doc.buildings.length);
    expect(Object.keys(roomOverrides).length).toBeGreaterThan(0);
    expect((contextFeaturesPx ?? []).length).toBeGreaterThan(0);

    // Verify multi-wing building keeps its parts in 3D footprints
    expect(buildingFootprintsPx['bld-a'].length).toBeGreaterThan(1);

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

  it('handles room movement, polygon reshaping, and duplication', () => {
    const doc = createInitialDocument();
    const bld = doc.buildings[0];
    const fl = bld.floors[0];
    const rm = fl.rooms[0];

    const updated = updateRoomGeometry(doc, bld.id, fl.id, rm.id, [12.5, -4.2], [9, 7]);
    const updatedRm = updated.buildings[0].floors[0].rooms.find((r) => r.id === rm.id);

    expect(updatedRm!.localCenter).toEqual([12.5, -4.2]);
    expect(updatedRm!.size).toEqual([9, 7]);

    // Polygon reshaping updates center and bounding size automatically
    const polyDoc = updateRoomPolygonInDoc(updated, bld.id, fl.id, rm.id, [
      [0, 0],
      [10, 0],
      [10, 6],
      [0, 6],
    ]);
    const polyRm = polyDoc.buildings[0].floors[0].rooms.find((r) => r.id === rm.id);
    expect(polyRm!.shape).toBe('polygon');
    expect(polyRm!.localCenter).toEqual([5, 3]);
    expect(polyRm!.size).toEqual([10, 6]);

    // Duplicate room
    const dupRes = duplicateRoomInDoc(polyDoc, bld.id, fl.id, rm.id);
    expect(dupRes.newRoomId).toBeDefined();
    expect(dupRes.doc.buildings[0].floors[0].rooms.length).toBe(fl.rooms.length + 1);
  });

  it('supports adding, editing, duplicating, and deleting outdoor elements and indoor corridors/doors/walls', () => {
    let doc = createInitialDocument();
    const bld = doc.buildings[0];
    const fl = bld.floors[0];

    // Add a thin door and a corridor
    const newDoor: EditorRoom = {
      id: 'rm-door-test',
      number: 'DR-101',
      name: 'Main Corridor Door',
      kind: 'other',
      elementType: 'door',
      localCenter: [0, 0],
      size: [1.5, 0.5],
      aiComment: 'Place double glass doors facing the lobby.',
      provenance: 'demo',
    };
    doc = addRoomToDoc(doc, bld.id, fl.id, newDoor);
    expect(validateDocument(doc).filter((i) => i.severity === 'error')).toHaveLength(0);

    // Add an outdoor path polyline
    const newPath: EditorOutdoorElement = {
      id: 'out-path-test',
      name: 'South Garden Walkway',
      type: 'path',
      layer: 'paths',
      shape: 'polyline',
      center: [10, 20],
      size: [30, 10],
      width: 4,
      points: [
        [-5, 15],
        [10, 20],
        [25, 25],
      ],
      aiComment: 'Add tree-lined paving stones along this path.',
    };
    doc = addOutdoorElementToDoc(doc, newPath);
    expect((doc.outdoorElements ?? []).some((o) => o.id === 'out-path-test')).toBe(true);

    // Update outdoor path width
    doc = updateOutdoorElementInDoc(doc, 'out-path-test', { width: 5.5 });
    expect((doc.outdoorElements ?? []).find((o) => o.id === 'out-path-test')?.width).toBe(5.5);

    // Duplicate outdoor element
    const dupOut = duplicateOutdoorElementInDoc(doc, 'out-path-test');
    expect(dupOut.newOutdoorId).toBeDefined();

    // Remove outdoor element
    doc = removeOutdoorElementFromDoc(dupOut.doc, dupOut.newOutdoorId!);
    expect((doc.outdoorElements ?? []).some((o) => o.id === dupOut.newOutdoorId)).toBe(false);
  });
});

describe('2D Editor Semantic Change Tracking & Individual Revert', () => {
  it('tracks added, moved, resized, renamed, modified, and deleted objects and reverts them individually', () => {
    const baseline = createInitialDocument();
    let current = cloneDocument(baseline);

    const bld = current.buildings[0];
    const fl = bld.floors[0];
    const rm1 = fl.rooms[0];
    const rm2 = fl.rooms[1];

    // 1. Move + Resize + Rename + Annotate rm1
    current = updateRoomGeometry(
      current,
      bld.id,
      fl.id,
      rm1.id,
      [rm1.localCenter[0] + 5, rm1.localCenter[1] + 3],
      [rm1.size[0] + 4, rm1.size[1] + 2],
    );
    current = updateRoomPropsInDoc(current, bld.id, fl.id, rm1.id, {
      name: 'Expanded Robotics Lab',
      aiComment: 'Combine with adjacent storage space and add lab benches.',
    });

    // 2. Delete rm2
    current = removeRoomFromDoc(current, bld.id, fl.id, rm2.id);

    // 3. Add a new room
    const addedRoom: EditorRoom = {
      id: 'rm-added-999',
      number: '199',
      name: 'New Student Lounge',
      kind: 'hall',
      elementType: 'lobby',
      localCenter: [0, 0],
      size: [8, 6],
      provenance: 'demo',
    };
    current = addRoomToDoc(current, bld.id, fl.id, addedRoom);

    const changes = computeSemanticChanges(baseline, current);
    expect(changes.length).toBe(3);

    const rm1Change = changes.find((c) => c.targetId === rm1.id);
    expect(rm1Change).toBeDefined();
    expect(rm1Change!.categories).toContain('moved');
    expect(rm1Change!.categories).toContain('resized');
    expect(rm1Change!.categories).toContain('renamed');
    expect(rm1Change!.categories).toContain('modified');
    expect(rm1Change!.aiComment).toContain('Combine with adjacent storage');

    const rm2DeleteChange = changes.find((c) => c.targetId === rm2.id);
    expect(rm2DeleteChange).toBeDefined();
    expect(rm2DeleteChange!.primaryCategory).toBe('deleted');

    const addedRoomChange = changes.find((c) => c.targetId === 'rm-added-999');
    expect(addedRoomChange).toBeDefined();
    expect(addedRoomChange!.primaryCategory).toBe('added');

    // Revert the deletion of rm2 individually
    current = revertIndividualChange(current, baseline, rm2DeleteChange!);
    expect(
      current.buildings[0].floors[0].rooms.some((r) => r.id === rm2.id),
    ).toBe(true);

    // Revert the addition of rm-added-999 individually
    current = revertIndividualChange(current, baseline, addedRoomChange!);
    expect(
      current.buildings[0].floors[0].rooms.some((r) => r.id === 'rm-added-999'),
    ).toBe(false);

    // Revert rm1 modifications individually
    current = revertIndividualChange(current, baseline, rm1Change!);
    expect(computeSemanticChanges(baseline, current)).toHaveLength(0);
  });
});

describe('2D Editor AI-Friendly ZIP Export Package', () => {
  it('builds a self-contained, valid ZIP archive with manifest, instructions.md, changes.json, geometry.json, preview.png, and floor SVGs', () => {
    const baseline = createInitialDocument();
    let current = cloneDocument(baseline);

    const bld = current.buildings[0];
    const fl = bld.floors[0];
    const rm = fl.rooms[0];

    current = updateRoomPropsInDoc(current, bld.id, fl.id, rm.id, {
      name: 'AI Innovation Hub',
      aiComment: 'Extend the lobby toward the corridor and preserve the main entrance.',
    });
    current = removeRoomFromDoc(current, bld.id, fl.id, fl.rooms[1].id);

    const pkg = buildCampusEditZipPackage(current, baseline);
    expect(pkg.zipBytes.byteLength).toBeGreaterThan(1000);
    expect(pkg.manifest.schemaVersion).toBe('1.0.0');
    expect(pkg.manifest.stats.totalChanges).toBe(2);
    expect(pkg.manifest.stats.deletedCount).toBe(1);
    expect(pkg.manifest.stats.aiCommentCount).toBeGreaterThanOrEqual(1);

    // Verify the binary ZIP can be parsed back and contains all required files
    const entries = readZipArchive(pkg.zipBytes);
    const paths = Object.keys(entries);

    expect(paths).toContain('campus-edit/manifest.json');
    expect(paths).toContain('campus-edit/instructions.md');
    expect(paths).toContain('campus-edit/changes.json');
    expect(paths).toContain('campus-edit/geometry.json');
    expect(paths).toContain('campus-edit/preview.png');
    expect(paths).toContain('campus-edit/campus-overview.svg');
    expect(paths.some((p) => p.startsWith('campus-edit/floor-plans/') && p.endsWith('.svg'))).toBe(
      true,
    );

    const instructionsText = new TextDecoder().decode(entries['campus-edit/instructions.md']);
    expect(instructionsText).toContain('Extend the lobby toward the corridor');
    expect(instructionsText).toContain('AI Innovation Hub');

    const changesJson = JSON.parse(
      new TextDecoder().decode(entries['campus-edit/changes.json']),
    );
    expect(changesJson.changes).toHaveLength(2);
    expect(changesJson.changes.some((c: any) => c.primaryCategory === 'deleted')).toBe(true);
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

describe('2D Editor Photo Attachments & Visual References (Section 10)', () => {
  it('attaches multiple photos to rooms, floors, buildings, outdoor objects, and campus, preserving associations across move/rename/reorder/remove', async () => {
    await clearAllAttachmentBlobs();
    let doc = createInitialDocument();
    const bldA = doc.buildings.find((b) => b.id === 'bld-a') || doc.buildings[0];
    const fl1 = bldA.floors[0];
    const mainHall = fl1.rooms[0];

    // Update room to represent Main Hall
    doc = updateRoomPropsInDoc(doc, bldA.id, fl1.id, mainHall.id, {
      name: 'Main Hall',
      elementType: 'hall',
    });

    const bytes1 = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]);
    const bytes2 = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x01, 0x02]);
    const bytes3 = new Uint8Array([0x52, 0x49, 0x46, 0x46, 0x24, 0x00, 0x00, 0x00, 0x57, 0x45]);

    await saveAttachmentBlob({
      fileId: 'file-hall-01',
      fileName: 'hall_reference_01.jpg',
      mimeType: 'image/jpeg',
      byteSize: bytes1.byteLength,
      bytes: bytes1,
      createdAt: '2026-10-19T00:00:00.000Z',
    });
    await saveAttachmentBlob({
      fileId: 'file-hall-02',
      fileName: 'hall_ceiling_02.png',
      mimeType: 'image/png',
      byteSize: bytes2.byteLength,
      bytes: bytes2,
      createdAt: '2026-10-19T00:01:00.000Z',
    });
    await saveAttachmentBlob({
      fileId: 'file-bld-ext',
      fileName: 'block_a_facade.webp',
      mimeType: 'image/webp',
      byteSize: bytes3.byteLength,
      bytes: bytes3,
      createdAt: '2026-10-19T00:02:00.000Z',
    });

    const photo1: PhotoAttachment = {
      id: 'photo-hall-1',
      fileId: 'file-hall-01',
      fileName: 'hall_reference_01.jpg',
      mimeType: 'image/jpeg',
      byteSize: bytes1.byteLength,
      title: 'Main Hall Entrance View',
      caption: 'Actual main hall, photographed from the entrance.',
      aiInstruction:
        "Use this photo to understand the hall's proportions, ceiling height, materials, and lighting. Preserve the existing room layout unless the plan explicitly requests a change.",
      direction: 'From entrance looking North',
      order: 0,
      createdAt: '2026-10-19T00:00:00.000Z',
    };

    const photo2: PhotoAttachment = {
      id: 'photo-hall-2',
      fileId: 'file-hall-02',
      fileName: 'hall_ceiling_02.png',
      mimeType: 'image/png',
      byteSize: bytes2.byteLength,
      // Optional fields left blank to verify user can attach without filling all fields
      order: 1,
      createdAt: '2026-10-19T00:01:00.000Z',
    };

    const bldPhoto: PhotoAttachment = {
      id: 'photo-bld-1',
      fileId: 'file-bld-ext',
      fileName: 'block_a_facade.webp',
      mimeType: 'image/webp',
      byteSize: bytes3.byteLength,
      caption: 'Front facade of Block A.',
      order: 0,
      createdAt: '2026-10-19T00:02:00.000Z',
    };

    // Attach 2 photos to Main Hall and 1 photo to Building A
    doc = addPhotosToTargetInDoc(
      doc,
      { targetType: 'room', buildingId: bldA.id, floorId: fl1.id, roomId: mainHall.id },
      [photo1, photo2],
    );
    doc = addPhotosToTargetInDoc(
      doc,
      { targetType: 'building', buildingId: bldA.id },
      [bldPhoto],
    );

    // Move and rename Main Hall -> verify photo associations are preserved
    doc = updateRoomGeometry(doc, bldA.id, fl1.id, mainHall.id, [4.5, -2.0], [14, 9]);
    doc = updateRoomPropsInDoc(doc, bldA.id, fl1.id, mainHall.id, {
      name: 'Grand Main Hall',
      number: '101-A',
    });

    // Move and rename Building A -> verify building and room photo associations are preserved
    doc = updateBuildingFootprint(doc, bldA.id, [bldA.footprint.center[0] + 5, bldA.footprint.center[1]], bldA.footprint.size);
    doc = updateBuildingPropsInDoc(doc, bldA.id, { name: 'Academic Block A' });

    const updatedBld = doc.buildings.find((b) => b.id === bldA.id)!;
    const updatedHall = updatedBld.floors[0].rooms.find((r) => r.id === mainHall.id)!;
    expect(updatedHall.photos).toHaveLength(2);
    expect(updatedHall.photos![0].id).toBe('photo-hall-1');
    expect(updatedHall.photos![0].caption).toBe('Actual main hall, photographed from the entrance.');
    expect(updatedBld.photos).toHaveLength(1);
    expect(updatedBld.photos![0].id).toBe('photo-bld-1');

    // Reorder photos on Main Hall (swap photo 2 to top)
    doc = reorderPhotoInTargetInDoc(
      doc,
      { targetType: 'room', buildingId: bldA.id, floorId: fl1.id, roomId: mainHall.id },
      'photo-hall-2',
      'up',
    );
    const reorderedHall = doc.buildings.find((b) => b.id === bldA.id)!.floors[0].rooms.find((r) => r.id === mainHall.id)!;
    expect(reorderedHall.photos![0].id).toBe('photo-hall-2');
    expect(reorderedHall.photos![1].id).toBe('photo-hall-1');

    // Rename attachment and update caption
    doc = updatePhotoInTargetInDoc(
      doc,
      { targetType: 'room', buildingId: bldA.id, floorId: fl1.id, roomId: mainHall.id },
      'photo-hall-2',
      { fileName: 'renamed_ceiling.png', caption: 'Acoustic ceiling panels.' },
    );
    expect(
      doc.buildings.find((b) => b.id === bldA.id)!.floors[0].rooms.find((r) => r.id === mainHall.id)!.photos![0].fileName,
    ).toBe('renamed_ceiling.png');

    // Remove photo-hall-2 from Main Hall -> verify photo-hall-1 and Building A's photo are untouched
    doc = removePhotoFromTargetInDoc(
      doc,
      { targetType: 'room', buildingId: bldA.id, floorId: fl1.id, roomId: mainHall.id },
      'photo-hall-2',
    );
    const afterRemoveHall = doc.buildings.find((b) => b.id === bldA.id)!.floors[0].rooms.find((r) => r.id === mainHall.id)!;
    expect(afterRemoveHall.photos).toHaveLength(1);
    expect(afterRemoveHall.photos![0].id).toBe('photo-hall-1');
    expect(doc.buildings.find((b) => b.id === bldA.id)!.photos).toHaveLength(1);
    expect(getAttachmentBlobSync('file-bld-ext')).toBeDefined();
  });

  it('persists attachments and object associations across simulated page reloads without embedding base64 in geometry.json', async () => {
    await clearAllAttachmentBlobs();
    let doc = createInitialDocument();
    const bld = doc.buildings[0];

    const rawBytes = new Uint8Array([10, 20, 30, 40, 50, 60, 70, 80]);
    await saveAttachmentBlob({
      fileId: 'file-persist-test',
      fileName: 'campus_courtyard.jpg',
      mimeType: 'image/jpeg',
      byteSize: rawBytes.byteLength,
      bytes: rawBytes,
      createdAt: '2026-10-19T01:00:00.000Z',
    });

    doc = addPhotosToTargetInDoc(
      doc,
      { targetType: 'building', buildingId: bld.id },
      [
        {
          id: 'photo-persist-1',
          fileId: 'file-persist-test',
          fileName: 'campus_courtyard.jpg',
          mimeType: 'image/jpeg',
          byteSize: rawBytes.byteLength,
          title: 'Courtyard View',
          caption: 'Main courtyard facing the entrance.',
          aiInstruction: 'Preserve brick facade texture.',
          order: 0,
          createdAt: '2026-10-19T01:00:00.000Z',
        },
      ],
    );
    await saveDraft(doc);

    // Simulate browser page reload (clear in-memory cache and re-initialize from persistent storage)
    simulatePageReloadForAttachments();
    const { doc: reloadedDoc } = await initStorage();

    const reloadedBld = reloadedDoc.buildings.find((b) => b.id === bld.id)!;
    expect(reloadedBld.photos).toHaveLength(1);
    expect(reloadedBld.photos![0].fileId).toBe('file-persist-test');

    const reloadedBlob = getAttachmentBlobSync('file-persist-test');
    expect(reloadedBlob).toBeDefined();
    expect(Array.from(reloadedBlob!.bytes)).toEqual(Array.from(rawBytes));
  });

  it('exports original binary images, structured metadata.json, instructions.md guide, and supports all vs. changed-only scopes', async () => {
    await clearAllAttachmentBlobs();
    let baseline = createInitialDocument();
    const bldA = baseline.buildings[0];
    const bldB = baseline.buildings[1];
    const flA1 = bldA.floors[0];
    const hallRoom = flA1.rooms[0];

    const baselineBldBBytes = new Uint8Array([1, 2, 3, 4, 5]);
    const changedHallBytes = new Uint8Array([99, 88, 77, 66, 55, 44]);

    await saveAttachmentBlob({
      fileId: 'file-unchanged-bldb',
      fileName: 'block_b_reference.jpg',
      mimeType: 'image/jpeg',
      byteSize: baselineBldBBytes.byteLength,
      bytes: baselineBldBBytes,
      createdAt: '2026-10-19T02:00:00.000Z',
    });
    await saveAttachmentBlob({
      fileId: 'file-changed-hall',
      fileName: 'hall_reference_01.jpg',
      mimeType: 'image/jpeg',
      byteSize: changedHallBytes.byteLength,
      bytes: changedHallBytes,
      createdAt: '2026-10-19T02:05:00.000Z',
    });

    // Attach a baseline photo to Building B (which will NOT be edited in the session)
    baseline = addPhotosToTargetInDoc(
      baseline,
      { targetType: 'building', buildingId: bldB.id },
      [
        {
          id: 'photo-bldb-base',
          fileId: 'file-unchanged-bldb',
          fileName: 'block_b_reference.jpg',
          mimeType: 'image/jpeg',
          byteSize: baselineBldBBytes.byteLength,
          caption: 'Baseline photo on untouched Building B.',
          order: 0,
          createdAt: '2026-10-19T02:00:00.000Z',
        },
      ],
    );

    // Start editing session from baseline: modify hallRoom in Building A and attach photo
    let current = cloneDocument(baseline);
    current = updateRoomPropsInDoc(current, bldA.id, flA1.id, hallRoom.id, {
      name: 'Main Hall',
      elementType: 'hall',
    });
    current = addPhotosToTargetInDoc(
      current,
      { targetType: 'room', buildingId: bldA.id, floorId: flA1.id, roomId: hallRoom.id },
      [
        {
          id: 'photo-hall-ref',
          fileId: 'file-changed-hall',
          fileName: 'hall_reference_01.jpg',
          mimeType: 'image/jpeg',
          byteSize: changedHallBytes.byteLength,
          title: 'Main Hall Entrance',
          caption: 'Actual main hall, photographed from the entrance.',
          aiInstruction:
            "Use this photo to understand the hall's proportions, ceiling height, materials, and lighting.",
          direction: 'Looking North from main entrance',
          order: 0,
          createdAt: '2026-10-19T02:05:00.000Z',
        },
      ],
    );

    // 1. Export with scope = 'all' -> includes both Building B's photo and Main Hall's photo
    const pkgAll = buildCampusEditZipPackage(current, baseline, { referenceScope: 'all' });
    expect(pkgAll.manifest.stats.referencePhotoCount).toBe(2);
    const entriesAll = readZipArchive(pkgAll.zipBytes);
    const pathsAll = Object.keys(entriesAll);

    // Check Main Hall reference photo & metadata.json path
    const hallPhotoEntry = pkgAll.references.find((r) => r.targetId === hallRoom.id);
    expect(hallPhotoEntry).toBeDefined();
    expect(hallPhotoEntry!.photos[0].archivePath).toMatch(
      /^campus-edit\/references\/.*\/floor-1\/main-hall\/hall_reference_01\.jpg$/,
    );
    expect(pathsAll).toContain(hallPhotoEntry!.photos[0].archivePath);
    expect(pathsAll).toContain(`campus-edit/${hallPhotoEntry!.metadataPath}`);
    expect(pathsAll).toContain('campus-edit/references/index.json');

    // Verify original binary bytes are preserved identically in the ZIP
    expect(Array.from(entriesAll[hallPhotoEntry!.photos[0].archivePath])).toEqual(
      Array.from(changedHallBytes),
    );

    // Verify instructions.md explicitly tells the AI how to interpret the photo
    const instructionsAll = new TextDecoder().decode(entriesAll['campus-edit/instructions.md']);
    expect(instructionsAll).toContain('Visual Reference Photographs & AI Interpretation Guide');
    expect(instructionsAll).toContain(hallRoom.id);
    expect(instructionsAll).toContain('Actual main hall, photographed from the entrance.');
    expect(instructionsAll).toContain("understand the hall's proportions");
    expect(instructionsAll).toContain('Looking North from main entrance');

    // Verify geometry.json does NOT contain base64 image strings
    const geometryText = new TextDecoder().decode(entriesAll['campus-edit/geometry.json']);
    expect(geometryText).not.toContain('data:image/');

    // 2. Export with scope = 'changed-only' -> includes ONLY Main Hall's photo (excludes untouched Building B)
    const pkgChangedOnly = buildCampusEditZipPackage(current, baseline, {
      referenceScope: 'changed-only',
    });
    expect(pkgChangedOnly.manifest.referenceScope).toBe('changed-only');
    expect(pkgChangedOnly.manifest.stats.referencePhotoCount).toBe(1);
    expect(pkgChangedOnly.references).toHaveLength(1);
    expect(pkgChangedOnly.references[0].targetId).toBe(hallRoom.id);

    // 3. Validate that missing binary files are caught by validateDocument and export
    await deleteAttachmentBlob('file-changed-hall');
    const validationIssues = validateDocument(current);
    expect(
      validationIssues.some(
        (i) => i.severity === 'error' && i.message.includes('Missing image file'),
      ),
    ).toBe(true);
    expect(() => buildCampusEditZipPackage(current, baseline, { referenceScope: 'all' })).toThrow(
      /Missing image file "hall_reference_01\.jpg"/,
    );
  });
});


