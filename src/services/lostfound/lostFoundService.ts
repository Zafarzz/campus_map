import type { CampusIndex } from '../../domain/campus/campusIndex';
import { apiGet, apiPost, isBackendEnabled } from '../api/apiClient';
import { getJsonStorageItem, setJsonStorageItem } from '../storage/localStore';
import type {
  CreateLostFoundPayload,
  LostFoundClaim,
  LostFoundItem,
  LostFoundKind,
  LostFoundMatch,
  LostFoundStatus,
  ResolveClaimPayload,
  SubmitClaimPayload,
} from './lostFoundTypes';

const OFFLINE_LF_KEY = 'campus_offline_lostfound_items';
const OFFLINE_CLAIMS_KEY = 'campus_offline_lostfound_claims';

const INITIAL_DEMO_ITEMS: LostFoundItem[] = [
  {
    id: 'demo-lf-1',
    reporter_user_id: 'demo-202590123',
    is_mine: true,
    kind: 'found',
    status: 'open',
    category: 'electronics',
    title: 'Apple AirPods Pro in White Case',
    description: 'Found on the 2nd row table in Block A Room 204 Computer Lab after the 11:15 class.',
    contact_info: '@aut_student_2025',
    building_id: 'bld-h',
    floor_id: 'bld-h-f2',
    room_id: 'bld-h-f2-a204',
    occurred_at: new Date(Date.now() - 3600_000 * 3).toISOString(),
    verification_question: 'What distinctive engraving or small sticker is on the charging case?',
    handover_point: 'Block A Security Reception Desk',
    expires_at: new Date(Date.now() + 86400_000 * 25).toISOString(),
  },
  {
    id: 'demo-lf-2',
    reporter_user_id: 'other-student',
    is_mine: false,
    kind: 'lost',
    status: 'open',
    category: 'keys',
    title: 'Dormitory Room Key with Blue Ajou Lanyard',
    description: 'Dropped somewhere between Block B and the Amphitheater cafeteria around lunchtime.',
    contact_info: '+998 90 987 65 43',
    building_id: 'bld-g',
    floor_id: 'bld-g-f1',
    room_id: 'bld-g-f1-lobby',
    occurred_at: new Date(Date.now() - 3600_000 * 5).toISOString(),
    verification_question: 'Which room number tag is attached to the ring?',
    handover_point: 'Dormitory Reception',
    expires_at: new Date(Date.now() + 86400_000 * 28).toISOString(),
  },
  {
    id: 'demo-lf-3',
    reporter_user_id: 'other-student-2',
    is_mine: false,
    kind: 'found',
    status: 'open',
    category: 'cards',
    title: 'Student ID Card (AUT)',
    description: 'Handed over to Block C Amphitheater security.',
    contact_info: '@campus_security',
    building_id: 'bld-i',
    floor_id: 'bld-i-f1',
    room_id: 'bld-i-f1-foyer',
    occurred_at: new Date(Date.now() - 3600_000 * 8).toISOString(),
    verification_question: 'What is the student name and department printed on the front?',
    handover_point: 'Block C Security Post',
    expires_at: new Date(Date.now() + 86400_000 * 20).toISOString(),
  },
];

export interface LostFoundNavigationTarget {
  buildingId: string | null;
  floorId: string | null;
  roomId: string | null;
}

const LEGACY_ROOM_ALIASES: Record<string, string> = {
  'bld-h-f2-r204': 'bld-h-f2-a204',
  'bld-i-f1-hall': 'bld-i-f1-foyer',
  'bld-i-f2-r1': 'bld-i-f2-c201',
  'bld-i-f2-r2': 'bld-i-f2-c202',
};

const BUILDING_SHORT_PREFIX: Record<string, string> = {
  'bld-h': 'A',
  'bld-g': 'B',
  'bld-i': 'C',
  'bld-c': 'D',
  'bld-b': 'E',
  'bld-d': 'F',
  'bld-e': 'H',
};

function normalizeLostFoundBuildingId(id?: string | null): string | null {
  if (!id || id === 'campus-grounds') return null;
  if (id === 'bld-f') return 'bld-d';
  return id;
}

function inferBuildingIdFromText(text: string): string | null {
  if (/\bblock\s*a\b/i.test(text)) return 'bld-h';
  if (/\bblock\s*b\b/i.test(text)) return 'bld-g';
  if (/\b(block\s*c|amphitheat|canteen|cafeteria)\b/i.test(text)) return 'bld-i';
  if (/\bblock\s*d\b/i.test(text)) return 'bld-c';
  if (/\bblock\s*e\b/i.test(text)) return 'bld-b';
  if (/\b(block\s*f|library)\b/i.test(text)) return 'bld-d';
  if (/\b(tennis|halls\s*building|\bh-10[123]\b)\b/i.test(text)) return 'bld-e';
  if (/\bdorm/i.test(text)) return 'bld-j';
  return null;
}

/**
 * Resolves the best 3D map target (room, floor, or building) for a Lost & Found item.
 */
export function resolveLostFoundNavigationTarget(
  item: LostFoundItem,
  index: CampusIndex,
): LostFoundNavigationTarget {
  const normalizedBldId = normalizeLostFoundBuildingId(item.building_id);

  // 1. Direct or alias room_id lookup
  if (item.room_id) {
    const candidateRoomId = LEGACY_ROOM_ALIASES[item.room_id] ?? item.room_id;
    const roomLoc = index.rooms.get(candidateRoomId);
    if (roomLoc) {
      return {
        buildingId: roomLoc.building.id,
        floorId: roomLoc.floor.id,
        roomId: roomLoc.room.id,
      };
    }
  }

  // 2. Infer room or building from title / description / handover_point
  const combinedText = `${item.title || ''} ${item.description || ''} ${item.handover_point || ''}`;
  const effectiveBuildingId = normalizedBldId ?? inferBuildingIdFromText(combinedText);

  const explicitCodeMatch = combinedText.match(/\b([A-FH])\s*-\s*(\d{3})\b/i);
  if (explicitCodeMatch) {
    const targetNumber = `${explicitCodeMatch[1].toUpperCase()}-${explicitCodeMatch[2]}`;
    for (const loc of index.rooms.values()) {
      if (loc.room.number.toUpperCase() === targetNumber) {
        return {
          buildingId: loc.building.id,
          floorId: loc.floor.id,
          roomId: loc.room.id,
        };
      }
    }
  }

  const roomDigitsMatch = combinedText.match(/\broom\s+(\d{3})\b/i);
  if (roomDigitsMatch && effectiveBuildingId) {
    const digits = roomDigitsMatch[1];
    const prefix = BUILDING_SHORT_PREFIX[effectiveBuildingId];
    const expectedCode = prefix ? `${prefix}-${digits}` : digits;
    const building = index.buildings.get(effectiveBuildingId);
    if (building) {
      for (const floor of building.floors) {
        const matchRoom = floor.rooms.find(
          (r) =>
            r.number.toUpperCase() === expectedCode ||
            r.number.toUpperCase().endsWith(`-${digits}`) ||
            r.number === digits,
        );
        if (matchRoom) {
          return {
            buildingId: building.id,
            floorId: floor.id,
            roomId: matchRoom.id,
          };
        }
      }
    }
  }

  if (
    /\blibrary\b/i.test(combinedText) &&
    (effectiveBuildingId === 'bld-d' || !effectiveBuildingId) &&
    index.rooms.has('bld-d-f1-f101')
  ) {
    return {
      buildingId: 'bld-d',
      floorId: 'bld-d-f1',
      roomId: 'bld-d-f1-f101',
    };
  }

  if (
    /\b(canteen|cafeteria)\b/i.test(combinedText) &&
    (effectiveBuildingId === 'bld-i' || !effectiveBuildingId) &&
    index.rooms.has('room-canteen')
  ) {
    return {
      buildingId: 'bld-i',
      floorId: 'bld-i-f1',
      roomId: 'room-canteen',
    };
  }

  // 3. Direct floor_id lookup
  if (item.floor_id) {
    const floorLoc = index.floors.get(item.floor_id);
    if (floorLoc) {
      return {
        buildingId: floorLoc.building.id,
        floorId: floorLoc.floor.id,
        roomId: null,
      };
    }
  }

  // 4. Building lookup
  if (effectiveBuildingId && index.buildings.has(effectiveBuildingId)) {
    return {
      buildingId: effectiveBuildingId,
      floorId: null,
      roomId: null,
    };
  }

  return {
    buildingId: null,
    floorId: null,
    roomId: null,
  };
}

/**
 * Navigates the 3D map camera to the room, floor, or building where a Lost & Found item was reported.
 */
export function navigateToLostFoundItemOnMap(
  item: LostFoundItem,
  index: CampusIndex,
  nav: {
    selectBuilding: (id: string) => void;
    selectFloor: (id: string) => void;
    selectRoom: (id: string) => void;
    clearSelection?: () => void;
  },
): LostFoundNavigationTarget {
  const target = resolveLostFoundNavigationTarget(item, index);
  if (target.roomId && index.rooms.has(target.roomId)) {
    nav.selectRoom(target.roomId);
    return target;
  }
  if (target.floorId && index.floors.has(target.floorId)) {
    nav.selectFloor(target.floorId);
    return target;
  }
  if (target.buildingId && index.buildings.has(target.buildingId)) {
    nav.selectBuilding(target.buildingId);
    return target;
  }
  nav.clearSelection?.();
  return target;
}

function isCleanItem(item: LostFoundItem): boolean {
  if (!item || !item.id || !item.title) return false;
  const title = item.title.toLowerCase();
  if (title.includes('test keychain')) return false;
  return true;
}

function getStoredOfflineItems(): LostFoundItem[] {
  const stored = getJsonStorageItem<LostFoundItem[] | null>(OFFLINE_LF_KEY, null);
  return stored ? stored.filter(isCleanItem) : INITIAL_DEMO_ITEMS;
}

function saveStoredOfflineItems(items: LostFoundItem[]): void {
  setJsonStorageItem(OFFLINE_LF_KEY, items);
}

function getStoredOfflineClaims(): LostFoundClaim[] {
  return getJsonStorageItem<LostFoundClaim[]>(OFFLINE_CLAIMS_KEY, []);
}

function saveStoredOfflineClaims(claims: LostFoundClaim[]): void {
  setJsonStorageItem(OFFLINE_CLAIMS_KEY, claims);
}

export async function listLostFoundItems(
  token?: string | null,
  filters?: {
    kind?: LostFoundKind;
    status?: LostFoundStatus;
    category?: string;
    building_id?: string;
  },
): Promise<LostFoundItem[]> {
  if (isBackendEnabled && token) {
    try {
      const params: Record<string, string | undefined> = {};
      if (filters?.kind) params.kind = filters.kind;
      if (filters?.status) params.status = filters.status;
      if (filters?.category && filters.category !== 'all') params.category = filters.category;
      if (filters?.building_id && filters.building_id !== 'all') params.building_id = filters.building_id;

      const res = await apiGet<{ count: number; items: LostFoundItem[] }>(
        '/lost-found/items',
        params,
        undefined,
        token,
      );
      if (Array.isArray(res?.items)) {
        return res.items.filter(isCleanItem);
      }
    } catch {
      // fallback
    }
  }

  let items = getStoredOfflineItems();
  if (filters?.kind) {
    items = items.filter((i) => i.kind === filters.kind);
  }
  if (filters?.status) {
    items = items.filter((i) => i.status === filters.status);
  }
  if (filters?.category && filters.category !== 'all') {
    items = items.filter((i) => i.category.toLowerCase() === filters.category!.toLowerCase());
  }
  if (filters?.building_id && filters.building_id !== 'all') {
    items = items.filter((i) => i.building_id === filters.building_id);
  }
  return items;
}

export async function createLostFoundItem(
  token: string | null,
  payload: CreateLostFoundPayload,
): Promise<{ item: LostFoundItem; matches: LostFoundMatch[] }> {
  if (isBackendEnabled && token) {
    try {
      const res = await apiPost<{ item: LostFoundItem; matches: LostFoundMatch[] }>(
        '/lost-found/items',
        payload,
        undefined,
        token,
      );
      return res;
    } catch (err) {
      if (!token.startsWith('mock-token-')) {
        throw err;
      }
    }
  }

  const existing = getStoredOfflineItems();
  const newItem: LostFoundItem = {
    id: `mock-lf-${Date.now()}`,
    reporter_user_id: 'demo-user',
    is_mine: true,
    kind: payload.kind,
    status: 'open',
    category: payload.category,
    title: payload.title,
    description: payload.description || '',
    contact_info: payload.contact_info || null,
    photo_storage_key: payload.photo_base64 || null,
    photo_url: payload.photo_base64 || null,
    building_id: payload.building_id || null,
    floor_id: payload.floor_id || null,
    room_id: payload.room_id || null,
    occurred_at: payload.occurred_at || new Date().toISOString(),
    verification_question: payload.verification_question || null,
    handover_point: payload.handover_point || null,
    expires_at: new Date(Date.now() + 86400_000 * 30).toISOString(),
  };

  saveStoredOfflineItems([newItem, ...existing]);
  return { item: newItem, matches: [] };
}

export async function listClaimsForItem(
  token: string | null,
  itemId: string,
): Promise<LostFoundClaim[]> {
  if (isBackendEnabled && token) {
    try {
      const res = await apiGet<{ count: number; claims: LostFoundClaim[] }>(
        `/lost-found/items/${itemId}/claims`,
        undefined,
        undefined,
        token,
      );
      if (Array.isArray(res?.claims)) {
        return res.claims;
      }
    } catch {
      // fallback
    }
  }

  const allClaims = getStoredOfflineClaims();
  return allClaims.filter((c) => c.item_id === itemId);
}

export async function listMyClaims(token: string | null): Promise<LostFoundClaim[]> {
  if (isBackendEnabled && token) {
    try {
      const res = await apiGet<{ count: number; claims: LostFoundClaim[] }>(
        '/lost-found/my-claims',
        undefined,
        undefined,
        token,
      );
      if (Array.isArray(res?.claims)) {
        return res.claims;
      }
    } catch {
      // fallback
    }
  }

  return getStoredOfflineClaims();
}

export async function claimLostFoundItem(
  token: string | null,
  itemId: string,
  payload: SubmitClaimPayload,
): Promise<LostFoundClaim> {
  if (isBackendEnabled && token) {
    try {
      const res = await apiPost<LostFoundClaim>(
        `/lost-found/items/${itemId}/claims`,
        payload,
        undefined,
        token,
      );
      return res;
    } catch (err) {
      if (!token.startsWith('mock-token-')) {
        throw err;
      }
    }
  }

  const claims = getStoredOfflineClaims();
  const newClaim: LostFoundClaim = {
    id: `mock-claim-${Date.now()}`,
    item_id: itemId,
    status: 'pending',
    verification_answer: payload.verification_answer,
    created_at: new Date().toISOString(),
    resolved_at: null,
  };
  saveStoredOfflineClaims([newClaim, ...claims]);
  return newClaim;
}

export async function resolveLostFoundClaim(
  token: string | null,
  claimId: string,
  payload: ResolveClaimPayload,
): Promise<LostFoundClaim> {
  if (isBackendEnabled && token) {
    try {
      const res = await apiPost<LostFoundClaim>(
        `/lost-found/claims/${claimId}/resolve`,
        payload,
        undefined,
        token,
      );
      return res;
    } catch (err) {
      if (!token.startsWith('mock-token-')) {
        throw err;
      }
    }
  }

  const claims = getStoredOfflineClaims();
  const target = claims.find((c) => c.id === claimId);
  if (!target) throw new Error('Claim not found');
  target.status = payload.approve ? 'approved' : 'rejected';
  target.resolved_at = new Date().toISOString();
  if (payload.handover_point) target.handover_point = payload.handover_point;
  saveStoredOfflineClaims(claims);
  return target;
}
