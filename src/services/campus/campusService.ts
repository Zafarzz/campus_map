import type { Campus } from '../../domain/campus/types';
import type { RoomGeometry } from '../../domain/geometry/types';
import type { ContextFeaturePx, PxRect } from '../../data/reference-footprints';
import { demoCampus } from '../../data/demo-campus';
import type { EditorDocument } from '../../editor/domain/types';
import { apiGet, isBackendEnabled } from '../api/apiClient';
import {
  HAS_EDITOR_DRAFT_KEY,
  LS_EDITOR_DRAFT_KEY,
  getRawStorageItem,
} from '../storage/localStore';

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
 * or falls back to demoCampus without downloading editor modules on cold start.
 */
export async function loadCampus(): Promise<Campus> {
  const hasSavedDraft =
    getRawStorageItem(HAS_EDITOR_DRAFT_KEY) === '1' ||
    getRawStorageItem(LS_EDITOR_DRAFT_KEY) !== null;

  if (hasSavedDraft) {
    try {
      const { loadDraft } = await import('../../editor/storage/storageService');
      const draft = await loadDraft();
      const hasAllBuildings =
        draft &&
        draft.buildings &&
        demoCampus.buildings.every((db) => draft.buildings.some((b) => b.id === db.id));

      if (hasAllBuildings && draft && draft.buildings && draft.buildings.length >= demoCampus.buildings.length) {
        const cCount = draft.buildings.filter((b) => b.shortName === 'C').length;
        if (cCount <= 1) {
          const { createInitialDocument, editorDocToCampusAndGeom } = await import(
            '../../editor/domain/adapter'
          );
          let cachedInitialDoc: EditorDocument | null = null;
          const getInitialDoc = (): EditorDocument => {
            if (!cachedInitialDoc) {
              cachedInitialDoc = createInitialDocument();
            }
            return cachedInitialDoc;
          };

        // Ensure Block B (bld-g) in saved draft is flush with the amphitheater hall without gap (ADR-029)
        const bldG = draft.buildings.find((b) => b.id === 'bld-g');
        if (bldG) {
          bldG.footprint.center = [69.0, 60.5];
          if (bldG.parts?.[0]) bldG.parts[0].center = [69.0, 60.5];
        }
        const connG = draft.outdoorElements?.find((e) => e.id === 'out-conn-bld-g-bld-i');
        if (connG) {
          connG.center = [65.25, 76.25];
          connG.size = [7.5, 16.5];
        }

        // Ensure Block C (bld-i) Floor 2 contains C-201, C-202 & Volleyball Arena (bld-i-f2-gym),
        // Open Study Lounges (room-open-study-ac, room-open-study-bc),
        // and does NOT contain the removed Conference Hall (room-c-conf),
        // and Floor 1 contains Canteen (room-canteen) spanning the floor.
        const bldI = draft.buildings.find((b) => b.id === 'bld-i');
        const bldIFloor1 = bldI?.floors.find((f) => f.level === 1);
        const bldIFloor2 = bldI?.floors.find((f) => f.level === 2);
        if (
          (bldIFloor2 &&
            (!bldIFloor2.rooms.some((r) => r.id === 'bld-i-f2-c201') ||
              !bldIFloor2.rooms.some((r) => r.id === 'bld-i-f2-gym') ||
              !bldIFloor2.rooms.some((r) => r.id === 'room-open-study-ac') ||
              bldIFloor2.rooms.some((r) => r.id === 'room-c-conf'))) ||
          (bldIFloor1 &&
            (bldIFloor1.rooms.some((r) => r.id === 'bld-i-f1-room5') ||
              bldIFloor1.rooms.some((r) => r.id === 'room-c-conf') ||
              !bldIFloor1.rooms.some((r) => r.id === 'bld-i-f1-foyer')))
        ) {
          const initialDoc = getInitialDoc();
          const initBldI = initialDoc.buildings.find((b) => b.id === 'bld-i');
          const initFloor1 = initBldI?.floors.find((f) => f.level === 1);
          const initFloor2 = initBldI?.floors.find((f) => f.level === 2);
          if (initFloor1 && bldIFloor1) {
            bldIFloor1.rooms = initFloor1.rooms;
          }
          if (initFloor2 && bldIFloor2) {
            bldIFloor2.rooms = initFloor2.rooms;
          }
        }

        // Ensure Halls (bld-e) Floor 1 contains the 3 halls (bld-e-f1-tennis, hall-1, hall-2)
        const bldE = draft.buildings.find((b) => b.id === 'bld-e');
        const bldEFloor1 = bldE?.floors.find((f) => f.level === 1);
        if (bldE && bldEFloor1 && !bldEFloor1.rooms.some((r) => r.id === 'bld-e-f1-tennis')) {
          const initialDoc = getInitialDoc();
          const initBldE = initialDoc.buildings.find((b) => b.id === 'bld-e');
          const initFloor1 = initBldE?.floors.find((f) => f.level === 1);
          if (initFloor1) {
            bldEFloor1.rooms = initFloor1.rooms;
          }
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
