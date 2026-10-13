import { describe, expect, it } from 'vitest';
import { demoCampus } from '../data/demo-campus';
import {
  ACADEMIC_CLASSIC,
  ACADEMIC_MODERN,
  DEFAULT_APPEARANCE,
  getBuildingAppearance,
} from '../domain/appearance';
import type { Building } from '../domain/campus/types';
import { createInitialDocument, editorDocToCampusAndGeom } from '../editor/domain/adapter';
import type { EditorBuilding, EditorDocument } from '../editor/domain/types';
import {
  addBuildingToDoc,
  removeBuildingFromDoc,
  updateBuildingFootprint,
} from '../editor/history/commands';
import {
  cloneDocument,
  createNamedVersion,
  initStorage,
  loadDraft,
  saveDraft,
} from '../editor/storage/storageService';
import { geometryProvider } from '../services/geometry';

describe('Layer Independence & Visual Architecture (Stage C)', () => {
  it('Scenario 1: Changing building appearance does not mutate spatial geometry', () => {
    const doc = createInitialDocument();
    const bld = doc.buildings[0];
    const initialCenter = [...bld.footprint.center];
    const initialSize = [...bld.footprint.size];

    // Change appearance
    bld.appearance = { wallColor: '#ff0000', roofType: 'hip', roofColor: '#00ff00' };
    bld.appearancePreset = 'academic-modern';

    // Verify spatial geometry is completely untouched
    expect(bld.footprint.center).toEqual(initialCenter);
    expect(bld.footprint.size).toEqual(initialSize);

    // Verify 3D geometry built by geometryProvider retains exact center & size
    const { campus } = editorDocToCampusAndGeom(doc);
    const geom = geometryProvider.build(campus);
    const bldGeom = geom.buildings[bld.id];
    expect(bldGeom).toBeDefined();
    expect(bldGeom.parts[0].type).toBe('rect');
    if (bldGeom.parts[0].type === 'rect') {
      expect(bldGeom.parts[0].center[0]).toBeCloseTo(initialCenter[0]);
      expect(bldGeom.parts[0].center[1]).toBeCloseTo(initialCenter[1]);
      expect(bldGeom.parts[0].size[0]).toBeCloseTo(initialSize[0]);
      expect(bldGeom.parts[0].size[1]).toBeCloseTo(initialSize[1]);
    }
  });

  it('Scenario 2: Resizing building updates geometry while preserving appearance configuration', () => {
    const doc = createInitialDocument();
    const bldId = doc.buildings[0].id;
    const initialAppearance = getBuildingAppearance(doc.buildings[0]);

    const resizedDoc = updateBuildingFootprint(doc, bldId, [50, -30], [60, 25]);
    const resizedBld = resizedDoc.buildings.find((b) => b.id === bldId)!;

    expect(resizedBld.footprint.size).toEqual([60, 25]);
    expect(resizedBld.footprint.center).toEqual([50, -30]);

    // Appearance resolved for resized building remains identical
    const appearanceAfterResize = getBuildingAppearance(resizedBld);
    expect(appearanceAfterResize.wallColor).toBe(initialAppearance.wallColor);
    expect(appearanceAfterResize.roofType).toBe(initialAppearance.roofType);
  });

  it('Scenario 3: Changing room data does not break building facade or appearance', () => {
    const doc = createInitialDocument();
    const bld = doc.buildings[0];
    const initialAppearance = getBuildingAppearance(bld);

    // Add / edit rooms
    bld.floors[0].rooms.push({
      id: `rm-${bld.id}-999`,
      number: '999',
      name: 'Новая комната',
      kind: 'classroom',
      capacity: 50,
      localCenter: [0, 0],
      size: [8, 6],
      provenance: 'demo',
    });

    const appearanceAfterRoomsChange = getBuildingAppearance(bld);
    expect(appearanceAfterRoomsChange).toEqual(initialAppearance);
  });

  it('Scenario 4: Adding or removing a building does not disrupt other buildings', () => {
    const doc = createInitialDocument();
    const countBefore = doc.buildings.length;
    const secondBldId = doc.buildings[1].id;
    const secondBldAppearance = getBuildingAppearance(doc.buildings[1]);

    // Add a new building
    const newBld: EditorBuilding = {
      id: 'bld-test-new',
      name: 'Новый лабораторный корпус',
      shortName: 'NLK',
      footprint: { center: [100, 100], size: [30, 20] },
      floorCount: 1,
      floors: [],
      appearancePreset: 'academic-modern',
    };
    const docWithNew = addBuildingToDoc(doc, newBld);
    expect(docWithNew.buildings.length).toBe(countBefore + 1);

    // Existing building appearance remains identical
    expect(getBuildingAppearance(docWithNew.buildings.find((b) => b.id === secondBldId)!)).toEqual(
      secondBldAppearance,
    );

    // Delete first building
    const docAfterRemove = removeBuildingFromDoc(docWithNew, doc.buildings[0].id);
    expect(docAfterRemove.buildings.find((b) => b.id === secondBldId)).toBeDefined();
    expect(
      getBuildingAppearance(docAfterRemove.buildings.find((b) => b.id === secondBldId)!),
    ).toEqual(secondBldAppearance);
  });

  it('Scenario 5: Reordering buildings does not cross-assign appearances', () => {
    const doc = createInitialDocument();
    const appearancesBefore = doc.buildings.map((b) => ({ id: b.id, app: getBuildingAppearance(b) }));

    // Reverse building order
    const reversedBuildings = [...doc.buildings].reverse();
    const appearancesAfter = reversedBuildings.map((b) => ({ id: b.id, app: getBuildingAppearance(b) }));

    for (const item of appearancesBefore) {
      const match = appearancesAfter.find((a) => a.id === item.id);
      expect(match).toBeDefined();
      expect(match!.app).toEqual(item.app);
    }
  });

  it('Scenario 6: Missing or unknown visual configuration safely falls back to DEFAULT_APPEARANCE', () => {
    const unknownBuilding: Building = {
      id: 'unknown-bld-xyz-999',
      name: 'Unknown Building',
      shortName: 'UNK',
      floors: [],
      provenance: 'demo',
    };

    const appearance = getBuildingAppearance(unknownBuilding);
    expect(appearance).toBeDefined();
    expect(appearance.wallColor).toBe(DEFAULT_APPEARANCE.wallColor);
    expect(appearance.roofType).toBe(DEFAULT_APPEARANCE.roofType);
  });

  it('Scenario 7 & 8: Version history snapshots and restoration preserve visual configuration', async () => {
    const doc = createInitialDocument();
    doc.buildings[0].appearancePreset = 'academic-classic';
    doc.buildings[0].appearance = { wallColor: '#e0e7ff', roofColor: '#1e3a8a' };

    await saveDraft(doc);
    const ver = await createNamedVersion(doc, 'Snapshot with custom appearance', 'Stage C test', 'manual');

    // Make an edit
    const editedDoc = cloneDocument(doc);
    editedDoc.buildings[0].appearance = { wallColor: '#000000' };
    await saveDraft(editedDoc);

    // Restore from snapshot
    const restoredDoc = cloneDocument(ver.document);
    await saveDraft(restoredDoc);

    const loaded = await loadDraft();
    expect(loaded).toBeDefined();
    expect(loaded!.buildings[0].appearancePreset).toBe('academic-classic');
    expect(loaded!.buildings[0].appearance.wallColor).toBe('#e0e7ff');
    expect(loaded!.buildings[0].appearance.roofColor).toBe('#1e3a8a');
  });
});
