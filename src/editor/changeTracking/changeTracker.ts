import type {
  ChangeCategory,
  EditorBuilding,
  EditorDocument,
  EditorOutdoorElement,
  EditorRoom,
  PhotoAttachment,
  SemanticChange,
} from '../domain/types';
import { cloneDocument } from '../storage/storageService';

const EPS = 0.02;

function numDiff(a: number, b: number): boolean {
  return Math.abs(a - b) > EPS;
}

function pointsDiff(a?: [number, number][], b?: [number, number][]): boolean {
  if (!a && !b) return false;
  if (!a || !b) return true;
  if (a.length !== b.length) return true;
  for (let i = 0; i < a.length; i++) {
    if (numDiff(a[i][0], b[i][0]) || numDiff(a[i][1], b[i][1])) return true;
  }
  return false;
}

function photosDiff(a?: PhotoAttachment[], b?: PhotoAttachment[]): boolean {
  const listA = a ?? [];
  const listB = b ?? [];
  if (listA.length !== listB.length) return true;
  for (let i = 0; i < listA.length; i++) {
    const pa = listA[i];
    const pb = listB[i];
    if (
      pa.id !== pb.id ||
      pa.fileId !== pb.fileId ||
      pa.fileName !== pb.fileName ||
      (pa.title || '') !== (pb.title || '') ||
      (pa.caption || '') !== (pb.caption || '') ||
      (pa.aiInstruction || '') !== (pb.aiInstruction || '') ||
      (pa.direction || '') !== (pb.direction || '') ||
      pa.order !== pb.order
    ) {
      return true;
    }
  }
  return false;
}

function pickPrimaryCategory(categories: ChangeCategory[]): ChangeCategory {
  if (categories.includes('added')) return 'added';
  if (categories.includes('deleted')) return 'deleted';
  if (categories.includes('moved')) return 'moved';
  if (categories.includes('resized')) return 'resized';
  if (categories.includes('renamed')) return 'renamed';
  return 'modified';
}

export const CHANGE_CATEGORY_LABELS: Record<
  ChangeCategory,
  { label: string; shortBadge: string; color: string; bgColor: string; borderColor: string }
> = {
  added: {
    label: 'Added',
    shortBadge: '+ NEW',
    color: '#15803d',
    bgColor: '#dcfce7',
    borderColor: '#22c55e',
  },
  moved: {
    label: 'Moved',
    shortBadge: '↔ MOVED',
    color: '#b45309',
    bgColor: '#fef3c7',
    borderColor: '#f59e0b',
  },
  resized: {
    label: 'Resized',
    shortBadge: '⤢ RESIZED',
    color: '#7c3aed',
    bgColor: '#ede9fe',
    borderColor: '#8b5cf6',
  },
  renamed: {
    label: 'Renamed',
    shortBadge: '✎ RENAMED',
    color: '#0369a1',
    bgColor: '#e0f2fe',
    borderColor: '#0ea5e9',
  },
  modified: {
    label: 'Modified',
    shortBadge: '★ MODIFIED',
    color: '#c2410c',
    bgColor: '#ffedd5',
    borderColor: '#f97316',
  },
  deleted: {
    label: 'Deleted',
    shortBadge: '✕ DELETED',
    color: '#b91c1c',
    bgColor: '#fee2e2',
    borderColor: '#ef4444',
  },
};

/**
 * Computes all semantic-level changes between the baseline document and the current document.
 * Tracks Added, Moved, Resized, Renamed, Modified, and Deleted objects across buildings,
 * indoor floor elements, and outdoor campus elements.
 */
export function computeSemanticChanges(
  baselineDoc: EditorDocument,
  currentDoc: EditorDocument,
): SemanticChange[] {
  const changes: SemanticChange[] = [];

  const baseBuildings = new Map<string, EditorBuilding>();
  for (const b of baselineDoc.buildings) {
    baseBuildings.set(b.id, b);
  }

  const currBuildings = new Map<string, EditorBuilding>();
  for (const b of currentDoc.buildings) {
    currBuildings.set(b.id, b);
  }

  // 0. Check Campus-level metadata & photos
  const campusPhotosChanged = photosDiff(baselineDoc.photos, currentDoc.photos);
  const campusMetaChanged =
    baselineDoc.name !== currentDoc.name ||
    (baselineDoc.description || '') !== (currentDoc.description || '') ||
    (baselineDoc.aiComment || '') !== (currentDoc.aiComment || '') ||
    campusPhotosChanged;
  if (campusMetaChanged) {
    const campCats: ChangeCategory[] = [];
    const campSummaries: string[] = [];
    if (baselineDoc.name !== currentDoc.name) {
      campCats.push('renamed');
      campSummaries.push(`Renamed campus to "${currentDoc.name}"`);
    }
    if (
      (baselineDoc.description || '') !== (currentDoc.description || '') ||
      (baselineDoc.aiComment || '') !== (currentDoc.aiComment || '') ||
      campusPhotosChanged
    ) {
      campCats.push('modified');
      if (campusPhotosChanged) {
        campSummaries.push(`Attached ${(currentDoc.photos ?? []).length} campus reference photo(s)`);
      } else {
        campSummaries.push('Updated campus instructions / description');
      }
    }
    changes.push({
      id: `chg-campus-${currentDoc.campusId}`,
      targetId: currentDoc.campusId,
      targetType: 'campus',
      name: currentDoc.name,
      semanticLabel: 'Campus',
      locationLabel: 'Overall Campus',
      primaryCategory: pickPrimaryCategory(campCats),
      categories: campCats,
      summary: campSummaries.join('; '),
      aiComment: currentDoc.aiComment,
      before: {
        name: baselineDoc.name,
        description: baselineDoc.description,
        aiComment: baselineDoc.aiComment,
        photos: cloneDocument((baselineDoc.photos ?? []) as any),
      },
      after: {
        name: currentDoc.name,
        description: currentDoc.description,
        aiComment: currentDoc.aiComment,
        photos: cloneDocument((currentDoc.photos ?? []) as any),
      },
    });
  }

  // 1. Check Buildings & Indoor Rooms/Elements
  for (const [bldId, currBld] of currBuildings) {
    const baseBld = baseBuildings.get(bldId);
    if (!baseBld) {
      changes.push({
        id: `chg-bld-${bldId}`,
        targetId: bldId,
        targetType: 'building',
        buildingId: bldId,
        name: currBld.name || currBld.shortName || bldId,
        semanticLabel: 'Building',
        locationLabel: 'Campus Exterior',
        primaryCategory: 'added',
        categories: ['added'],
        summary: `Added building "${currBld.name}" (${currBld.footprint.size[0]}m × ${currBld.footprint.size[1]}m, ${currBld.floors.length} floors)`,
        aiComment: currBld.aiComment,
        before: null,
        after: cloneDocument(currBld as any),
      });

      // Also record rooms added inside the new building
      for (const fl of currBld.floors) {
        for (const rm of fl.rooms) {
          changes.push({
            id: `chg-rm-${rm.id}`,
            targetId: rm.id,
            targetType: 'room',
            buildingId: bldId,
            floorId: fl.id,
            name: rm.name ? `${rm.number} · ${rm.name}` : rm.number,
            semanticLabel: rm.elementType || rm.kind,
            locationLabel: `${currBld.shortName || currBld.name} · Floor ${fl.level}`,
            primaryCategory: 'added',
            categories: ['added'],
            summary: `Added ${rm.elementType || rm.kind} "${rm.number}" (${rm.size[0]}m × ${rm.size[1]}m)`,
            aiComment: rm.aiComment,
            before: null,
            after: cloneDocument(rm as any),
          });
        }
      }
      continue;
    }

    // Compare existing building
    const bldCats: ChangeCategory[] = [];
    const bldSummaries: string[] = [];

    const moved =
      numDiff(baseBld.footprint.center[0], currBld.footprint.center[0]) ||
      numDiff(baseBld.footprint.center[1], currBld.footprint.center[1]);
    if (moved) {
      bldCats.push('moved');
      const dx = (currBld.footprint.center[0] - baseBld.footprint.center[0]).toFixed(1);
      const dz = (currBld.footprint.center[1] - baseBld.footprint.center[1]).toFixed(1);
      bldSummaries.push(`Moved by (${dx}m, ${dz}m)`);
    }

    const resized =
      numDiff(baseBld.footprint.size[0], currBld.footprint.size[0]) ||
      numDiff(baseBld.footprint.size[1], currBld.footprint.size[1]) ||
      pointsDiff(baseBld.polygon, currBld.polygon);
    if (resized) {
      bldCats.push('resized');
      bldSummaries.push(
        `Resized from ${baseBld.footprint.size[0]}×${baseBld.footprint.size[1]}m to ${currBld.footprint.size[0]}×${currBld.footprint.size[1]}m`,
      );
    }

    const renamed =
      baseBld.name !== currBld.name || (baseBld.shortName || '') !== (currBld.shortName || '');
    if (renamed) {
      bldCats.push('renamed');
      bldSummaries.push(`Renamed from "${baseBld.name}" to "${currBld.name}"`);
    }

    const bldPhotosChanged = photosDiff(baseBld.photos, currBld.photos);
    const modified =
      (baseBld.description || '') !== (currBld.description || '') ||
      (baseBld.aiComment || '') !== (currBld.aiComment || '') ||
      baseBld.floors.length !== currBld.floors.length ||
      bldPhotosChanged;
    if (modified) {
      bldCats.push('modified');
      if (bldPhotosChanged) {
        bldSummaries.push(`Attached ${(currBld.photos ?? []).length} reference photo(s)`);
      } else if (currBld.aiComment && currBld.aiComment !== baseBld.aiComment) {
        bldSummaries.push(`Added AI instructions`);
      } else if (baseBld.floors.length !== currBld.floors.length) {
        bldSummaries.push(`Floor count changed (${baseBld.floors.length} → ${currBld.floors.length})`);
      } else {
        bldSummaries.push(`Updated properties`);
      }
    }

    if (bldCats.length > 0) {
      const { floors: _bf, ...baseBldMeta } = baseBld;
      const { floors: _cf, ...currBldMeta } = currBld;
      changes.push({
        id: `chg-bld-${bldId}`,
        targetId: bldId,
        targetType: 'building',
        buildingId: bldId,
        name: currBld.name || currBld.shortName || bldId,
        semanticLabel: 'Building',
        locationLabel: 'Campus Exterior',
        primaryCategory: pickPrimaryCategory(bldCats),
        categories: bldCats,
        summary: bldSummaries.join('; '),
        aiComment: currBld.aiComment,
        before: cloneDocument(baseBldMeta as any),
        after: cloneDocument(currBldMeta as any),
      });
    }

    // Compare floor-level metadata & photos
    for (const currFl of currBld.floors) {
      const baseFl = baseBld.floors.find((f) => f.id === currFl.id);
      if (baseFl) {
        const flPhotosChanged = photosDiff(baseFl.photos, currFl.photos);
        const flModified =
          baseFl.name !== currFl.name ||
          (baseFl.description || '') !== (currFl.description || '') ||
          (baseFl.aiComment || '') !== (currFl.aiComment || '') ||
          flPhotosChanged;
        if (flModified) {
          const flCats: ChangeCategory[] = [];
          const flSums: string[] = [];
          if (baseFl.name !== currFl.name) {
            flCats.push('renamed');
            flSums.push(`Renamed floor to "${currFl.name}"`);
          }
          if (
            (baseFl.description || '') !== (currFl.description || '') ||
            (baseFl.aiComment || '') !== (currFl.aiComment || '') ||
            flPhotosChanged
          ) {
            flCats.push('modified');
            if (flPhotosChanged) {
              flSums.push(`Attached ${(currFl.photos ?? []).length} floor reference photo(s)`);
            } else {
              flSums.push('Updated floor notes');
            }
          }
          const { rooms: _br, ...baseFlMeta } = baseFl;
          const { rooms: _cr, ...currFlMeta } = currFl;
          changes.push({
            id: `chg-fl-${currFl.id}`,
            targetId: currFl.id,
            targetType: 'floor',
            buildingId: bldId,
            floorId: currFl.id,
            name: currFl.name,
            semanticLabel: 'Floor',
            locationLabel: `${currBld.shortName || currBld.name} · Floor ${currFl.level}`,
            primaryCategory: pickPrimaryCategory(flCats),
            categories: flCats,
            summary: flSums.join('; '),
            aiComment: currFl.aiComment,
            before: cloneDocument(baseFlMeta as any),
            after: cloneDocument(currFlMeta as any),
          });
        }
      }
    }

    // Compare rooms/elements across floors of this building
    const baseRooms = new Map<string, { room: EditorRoom; floorId: string; level: number }>();
    for (const fl of baseBld.floors) {
      for (const rm of fl.rooms) {
        baseRooms.set(rm.id, { room: rm, floorId: fl.id, level: fl.level });
      }
    }

    const currRooms = new Map<string, { room: EditorRoom; floorId: string; level: number }>();
    for (const fl of currBld.floors) {
      for (const rm of fl.rooms) {
        currRooms.set(rm.id, { room: rm, floorId: fl.id, level: fl.level });
      }
    }

    for (const [rmId, { room: currRm, floorId, level }] of currRooms) {
      const baseEntry = baseRooms.get(rmId);
      const locLabel = `${currBld.shortName || currBld.name} · Floor ${level}`;
      const semLabel = currRm.elementType || currRm.kind;

      if (!baseEntry) {
        changes.push({
          id: `chg-rm-${rmId}`,
          targetId: rmId,
          targetType: 'room',
          buildingId: bldId,
          floorId,
          name: currRm.name ? `${currRm.number} · ${currRm.name}` : currRm.number,
          semanticLabel: semLabel,
          locationLabel: locLabel,
          primaryCategory: 'added',
          categories: ['added'],
          summary: `Added ${semLabel} "${currRm.number}" (${currRm.size[0]}m × ${currRm.size[1]}m)`,
          aiComment: currRm.aiComment,
          before: null,
          after: cloneDocument(currRm as any),
        });
        continue;
      }

      const baseRm = baseEntry.room;
      const rmCats: ChangeCategory[] = [];
      const rmSummaries: string[] = [];

      const rmMoved =
        numDiff(baseRm.localCenter[0], currRm.localCenter[0]) ||
        numDiff(baseRm.localCenter[1], currRm.localCenter[1]) ||
        baseEntry.floorId !== floorId;
      if (rmMoved) {
        rmCats.push('moved');
        const dx = (currRm.localCenter[0] - baseRm.localCenter[0]).toFixed(1);
        const dz = (currRm.localCenter[1] - baseRm.localCenter[1]).toFixed(1);
        rmSummaries.push(`Moved by (${dx}m, ${dz}m)`);
      }

      const rmResized =
        numDiff(baseRm.size[0], currRm.size[0]) ||
        numDiff(baseRm.size[1], currRm.size[1]) ||
        pointsDiff(baseRm.polygon, currRm.polygon) ||
        numDiff(baseRm.rotation ?? 0, currRm.rotation ?? 0);
      if (rmResized) {
        rmCats.push('resized');
        rmSummaries.push(
          `Resized from ${baseRm.size[0]}×${baseRm.size[1]}m to ${currRm.size[0]}×${currRm.size[1]}m`,
        );
      }

      const rmRenamed =
        baseRm.number !== currRm.number || (baseRm.name || '') !== (currRm.name || '');
      if (rmRenamed) {
        rmCats.push('renamed');
        rmSummaries.push(
          `Renamed "${baseRm.number}${baseRm.name ? ` (${baseRm.name})` : ''}" → "${currRm.number}${currRm.name ? ` (${currRm.name})` : ''}"`,
        );
      }

      const rmPhotosChanged = photosDiff(baseRm.photos, currRm.photos);
      const rmModified =
        baseRm.kind !== currRm.kind ||
        (baseRm.elementType || 'room') !== (currRm.elementType || 'room') ||
        (baseRm.description || '') !== (currRm.description || '') ||
        (baseRm.aiComment || '') !== (currRm.aiComment || '') ||
        (baseRm.capacity ?? 30) !== (currRm.capacity ?? 30) ||
        rmPhotosChanged;
      if (rmModified) {
        rmCats.push('modified');
        if (rmPhotosChanged) {
          rmSummaries.push(`Attached ${(currRm.photos ?? []).length} reference photo(s)`);
        } else if (currRm.aiComment && currRm.aiComment !== baseRm.aiComment) {
          rmSummaries.push(`AI instruction: "${currRm.aiComment}"`);
        } else {
          rmSummaries.push(`Updated properties / type`);
        }
      }

      if (rmCats.length > 0) {
        changes.push({
          id: `chg-rm-${rmId}`,
          targetId: rmId,
          targetType: 'room',
          buildingId: bldId,
          floorId,
          name: currRm.name ? `${currRm.number} · ${currRm.name}` : currRm.number,
          semanticLabel: semLabel,
          locationLabel: locLabel,
          primaryCategory: pickPrimaryCategory(rmCats),
          categories: rmCats,
          summary: rmSummaries.join('; '),
          aiComment: currRm.aiComment,
          before: cloneDocument(baseRm as any),
          after: cloneDocument(currRm as any),
        });
      }
    }

    // Deleted rooms in this building
    for (const [rmId, { room: baseRm, floorId, level }] of baseRooms) {
      if (!currRooms.has(rmId)) {
        const semLabel = baseRm.elementType || baseRm.kind;
        changes.push({
          id: `chg-rm-${rmId}`,
          targetId: rmId,
          targetType: 'room',
          buildingId: bldId,
          floorId,
          name: baseRm.name ? `${baseRm.number} · ${baseRm.name}` : baseRm.number,
          semanticLabel: semLabel,
          locationLabel: `${currBld.shortName || currBld.name} · Floor ${level}`,
          primaryCategory: 'deleted',
          categories: ['deleted'],
          summary: `Deleted ${semLabel} "${baseRm.number}" (${baseRm.size[0]}m × ${baseRm.size[1]}m)`,
          aiComment: baseRm.aiComment,
          before: cloneDocument(baseRm as any),
          after: null,
        });
      }
    }
  }

  // Deleted buildings
  for (const [bldId, baseBld] of baseBuildings) {
    if (!currBuildings.has(bldId)) {
      changes.push({
        id: `chg-bld-${bldId}`,
        targetId: bldId,
        targetType: 'building',
        buildingId: bldId,
        name: baseBld.name || baseBld.shortName || bldId,
        semanticLabel: 'Building',
        locationLabel: 'Campus Exterior',
        primaryCategory: 'deleted',
        categories: ['deleted'],
        summary: `Deleted building "${baseBld.name}" (${baseBld.footprint.size[0]}m × ${baseBld.footprint.size[1]}m)`,
        aiComment: baseBld.aiComment,
        before: cloneDocument(baseBld as any),
        after: null,
      });
    }
  }

  // 2. Compare Outdoor Elements
  const baseOut = new Map<string, EditorOutdoorElement>();
  for (const el of baselineDoc.outdoorElements ?? []) {
    baseOut.set(el.id, el);
  }

  const currOut = new Map<string, EditorOutdoorElement>();
  for (const el of currentDoc.outdoorElements ?? []) {
    currOut.set(el.id, el);
  }

  for (const [outId, currEl] of currOut) {
    const baseEl = baseOut.get(outId);
    if (!baseEl) {
      changes.push({
        id: `chg-out-${outId}`,
        targetId: outId,
        targetType: 'outdoor',
        name: currEl.name,
        semanticLabel: currEl.type,
        locationLabel: `Outdoor · ${currEl.layer}`,
        primaryCategory: 'added',
        categories: ['added'],
        summary: `Added outdoor ${currEl.type} "${currEl.name}"`,
        aiComment: currEl.aiComment,
        before: null,
        after: cloneDocument(currEl as any),
      });
      continue;
    }

    const outCats: ChangeCategory[] = [];
    const outSummaries: string[] = [];

    const outMoved =
      numDiff(baseEl.center[0], currEl.center[0]) || numDiff(baseEl.center[1], currEl.center[1]);
    if (outMoved) {
      outCats.push('moved');
      const dx = (currEl.center[0] - baseEl.center[0]).toFixed(1);
      const dz = (currEl.center[1] - baseEl.center[1]).toFixed(1);
      outSummaries.push(`Moved by (${dx}m, ${dz}m)`);
    }

    const outResized =
      numDiff(baseEl.size[0], currEl.size[0]) ||
      numDiff(baseEl.size[1], currEl.size[1]) ||
      pointsDiff(baseEl.points, currEl.points) ||
      numDiff(baseEl.width ?? 0, currEl.width ?? 0);
    if (outResized) {
      outCats.push('resized');
      outSummaries.push(
        `Reshaped / resized (${baseEl.size[0]}×${baseEl.size[1]}m → ${currEl.size[0]}×${currEl.size[1]}m)`,
      );
    }

    const outRenamed = baseEl.name !== currEl.name;
    if (outRenamed) {
      outCats.push('renamed');
      outSummaries.push(`Renamed from "${baseEl.name}" to "${currEl.name}"`);
    }

    const outPhotosChanged = photosDiff(baseEl.photos, currEl.photos);
    const outModified =
      baseEl.type !== currEl.type ||
      (baseEl.description || '') !== (currEl.description || '') ||
      (baseEl.aiComment || '') !== (currEl.aiComment || '') ||
      outPhotosChanged;
    if (outModified) {
      outCats.push('modified');
      if (outPhotosChanged) {
        outSummaries.push(`Attached ${(currEl.photos ?? []).length} reference photo(s)`);
      } else if (currEl.aiComment && currEl.aiComment !== baseEl.aiComment) {
        outSummaries.push(`AI instruction: "${currEl.aiComment}"`);
      } else {
        outSummaries.push(`Updated properties`);
      }
    }

    if (outCats.length > 0) {
      changes.push({
        id: `chg-out-${outId}`,
        targetId: outId,
        targetType: 'outdoor',
        name: currEl.name,
        semanticLabel: currEl.type,
        locationLabel: `Outdoor · ${currEl.layer}`,
        primaryCategory: pickPrimaryCategory(outCats),
        categories: outCats,
        summary: outSummaries.join('; '),
        aiComment: currEl.aiComment,
        before: cloneDocument(baseEl as any),
        after: cloneDocument(currEl as any),
      });
    }
  }

  for (const [outId, baseEl] of baseOut) {
    if (!currOut.has(outId)) {
      changes.push({
        id: `chg-out-${outId}`,
        targetId: outId,
        targetType: 'outdoor',
        name: baseEl.name,
        semanticLabel: baseEl.type,
        locationLabel: `Outdoor · ${baseEl.layer}`,
        primaryCategory: 'deleted',
        categories: ['deleted'],
        summary: `Deleted outdoor ${baseEl.type} "${baseEl.name}"`,
        aiComment: baseEl.aiComment,
        before: cloneDocument(baseEl as any),
        after: null,
      });
    }
  }

  return changes;
}

/**
 * Reverts a single semantic change back to its baseline state without losing unrelated edits.
 */
export function revertIndividualChange(
  currentDoc: EditorDocument,
  baselineDoc: EditorDocument,
  change: SemanticChange,
): EditorDocument {
  const next = cloneDocument(currentDoc);

  if (change.targetType === 'campus') {
    next.name = baselineDoc.name;
    next.description = baselineDoc.description;
    next.aiComment = baselineDoc.aiComment;
    next.photos = baselineDoc.photos ? JSON.parse(JSON.stringify(baselineDoc.photos)) : undefined;
    return next;
  }

  if (change.targetType === 'building') {
    const baseBld = baselineDoc.buildings.find((b) => b.id === change.targetId);
    if (!baseBld) {
      // It was added -> remove it
      next.buildings = next.buildings.filter((b) => b.id !== change.targetId);
    } else {
      const currIdx = next.buildings.findIndex((b) => b.id === change.targetId);
      if (currIdx === -1) {
        // It was deleted -> restore full building
        next.buildings.push(cloneDocument(baseBld as any) as any);
      } else {
        // Restore building shell/props while keeping floor rooms unless they were also reverted
        const existingFloors = next.buildings[currIdx].floors;
        const restoredBld = cloneDocument(baseBld as any) as unknown as EditorBuilding;
        restoredBld.floors = existingFloors;
        restoredBld.floorCount = existingFloors.length;
        next.buildings[currIdx] = restoredBld;
      }
    }
    return next;
  }

  if (change.targetType === 'floor' && change.buildingId) {
    const bld = next.buildings.find((b) => b.id === change.buildingId);
    const fl = bld?.floors.find((f) => f.id === change.targetId);
    const baseBld = baselineDoc.buildings.find((b) => b.id === change.buildingId);
    const baseFl = baseBld?.floors.find((f) => f.id === change.targetId);
    if (fl && baseFl) {
      fl.name = baseFl.name;
      fl.description = baseFl.description;
      fl.aiComment = baseFl.aiComment;
      fl.photos = baseFl.photos ? JSON.parse(JSON.stringify(baseFl.photos)) : undefined;
    }
    return next;
  }

  if (change.targetType === 'room' && change.buildingId && change.floorId) {
    const bld = next.buildings.find((b) => b.id === change.buildingId);
    const fl = bld?.floors.find((f) => f.id === change.floorId);
    if (!fl) return next;

    const baseBld = baselineDoc.buildings.find((b) => b.id === change.buildingId);
    const baseFl = baseBld?.floors.find((f) => f.id === change.floorId);
    const baseRm = baseFl?.rooms.find((r) => r.id === change.targetId);

    if (!baseRm) {
      // Added room -> remove it
      fl.rooms = fl.rooms.filter((r) => r.id !== change.targetId);
    } else {
      const rmIdx = fl.rooms.findIndex((r) => r.id === change.targetId);
      if (rmIdx === -1) {
        // Deleted room -> restore it
        fl.rooms.push(cloneDocument(baseRm as any) as any);
      } else {
        // Modified/moved/resized/renamed room -> restore to baseline
        fl.rooms[rmIdx] = cloneDocument(baseRm as any) as any;
      }
    }
    return next;
  }

  if (change.targetType === 'outdoor') {
    if (!next.outdoorElements) next.outdoorElements = [];
    const baseOut = (baselineDoc.outdoorElements ?? []).find((el) => el.id === change.targetId);
    if (!baseOut) {
      next.outdoorElements = next.outdoorElements.filter((el) => el.id !== change.targetId);
    } else {
      const idx = next.outdoorElements.findIndex((el) => el.id === change.targetId);
      if (idx === -1) {
        next.outdoorElements.push(cloneDocument(baseOut as any) as any);
      } else {
        next.outdoorElements[idx] = cloneDocument(baseOut as any) as any;
      }
    }
    return next;
  }

  return next;
}

