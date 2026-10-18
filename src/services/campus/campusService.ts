import type { Campus } from '../../domain/campus/types';
import type { RoomGeometry } from '../../domain/geometry/types';
import type { ContextFeaturePx, PxRect } from '../../data/reference-footprints';
import { demoCampus } from '../../data/demo-campus';
import { loadDraft } from '../../editor/storage/storageService';
import { editorDocToCampusAndGeom } from '../../editor/domain/adapter';

export type ActiveEditorOverrides = {
  buildingFootprintsPx?: Record<string, PxRect[]>;
  roomOverrides?: Record<string, RoomGeometry>;
  contextFeaturesPx?: ContextFeaturePx[];
};

let activeEditorOverrides: ActiveEditorOverrides = {};

export function getActiveEditorOverrides(): ActiveEditorOverrides {
  return activeEditorOverrides;
}

/**
 * Campus data source. Loads user-saved draft from storage if present,
 * or falls back to demoCampus.
 */
export async function loadCampus(): Promise<Campus> {
  try {
    const draft = await loadDraft();
    if (draft && draft.buildings && draft.buildings.length > 0) {
      const cCount = draft.buildings.filter((b) => b.shortName === 'C').length;
      if (cCount <= 1) {
        const { campus, buildingFootprintsPx, roomOverrides, contextFeaturesPx } =
          editorDocToCampusAndGeom(draft);
        activeEditorOverrides = { buildingFootprintsPx, roomOverrides, contextFeaturesPx };
        return campus;
      }
    }
  } catch (err) {
    console.warn('[campusService] Failed to load draft from storage, using demoCampus:', err);
  }

  activeEditorOverrides = {};
  return demoCampus;
}

