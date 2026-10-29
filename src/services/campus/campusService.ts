import type { Campus } from '../../domain/campus/types';
import type { RoomGeometry } from '../../domain/geometry/types';
import type { ContextFeaturePx, PxRect } from '../../data/reference-footprints';
import { demoCampus } from '../../data/demo-campus';
import { loadDraft } from '../../editor/storage/storageService';
import { editorDocToCampusAndGeom } from '../../editor/domain/adapter';
import { apiGet, isBackendEnabled } from '../api/apiClient';

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
    const hasAllBuildings =
      draft &&
      draft.buildings &&
      demoCampus.buildings.every((db) => draft.buildings.some((b) => b.id === db.id));

    if (hasAllBuildings && draft && draft.buildings && draft.buildings.length >= demoCampus.buildings.length) {
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
  return (await loadCampusFromBackend()) ?? demoCampus;
}


/**
 * Campus tree from the backend database (`GET /api/v1/compat/campus/bare`).
 * Accepted only when it is a superset of `demoCampus` (same building and room ids), because
 * geometry is keyed by those ids and must never lose a building or room. Otherwise null,
 * and the caller keeps the static demo campus.
 */
async function loadCampusFromBackend(): Promise<Campus | null> {
  if (!isBackendEnabled) return null;
  try {
    const remote = await apiGet<Campus>('/compat/campus/bare');
    const remoteBuildings = new Map((remote.buildings ?? []).map((b) => [b.id, b]));
    const remoteRooms = new Set(
      (remote.buildings ?? []).flatMap((b) => b.floors.flatMap((f) => f.rooms.map((r) => r.id))),
    );
    const complete = demoCampus.buildings.every(
      (b) =>
        remoteBuildings.has(b.id) &&
        b.floors.every((f) => f.rooms.every((r) => remoteRooms.has(r.id))),
    );
    if (!complete) {
      console.warn('[campusService] Backend campus is missing demo buildings/rooms, using demoCampus');
      return null;
    }
    return remote;
  } catch (err) {
    console.warn('[campusService] Backend unavailable, using demoCampus:', err);
    return null;
  }
}
