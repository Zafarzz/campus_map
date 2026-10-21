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
        // Ensure Block B (bld-g) in saved draft is flush with the amphitheater hall without gap (ADR-029)
        const bldG = draft.buildings.find((b) => b.id === 'bld-g');
        if (bldG) {
          bldG.footprint.center = [69.0, 60.5];
          if (bldG.parts?.[0]) bldG.parts[0].center = [69.0, 60.5];
        }
        const connG = draft.outdoorElements?.find((e: any) => e.id === 'out-conn-bld-g-bld-i');
        if (connG) {
          connG.center = [65.25, 76.25];
          connG.size = [7.5, 16.5];
        }
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

