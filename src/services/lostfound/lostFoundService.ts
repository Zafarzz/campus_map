import { apiGet, apiPost, isBackendEnabled } from '../api/apiClient';
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
const memoryStore = new Map<string, string>();

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
    room_id: 'bld-h-f2-r204',
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
    room_id: null,
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
    room_id: 'bld-i-f1-hall',
    occurred_at: new Date(Date.now() - 3600_000 * 8).toISOString(),
    verification_question: 'What is the student name and department printed on the front?',
    handover_point: 'Block C Security Post',
    expires_at: new Date(Date.now() + 86400_000 * 20).toISOString(),
  },
];

function isCleanItem(item: LostFoundItem): boolean {
  if (item.id === '01a1af7a-853d-7f10-b89f-0643442c2492') return false;
  const title = (item.title || '').toLowerCase();
  if (title.includes('test keychain')) return false;
  if (title === 'i found a wallet' && (item.description || '').toLowerCase().includes('malika nizamitdinova')) {
    return false;
  }
  return true;
}

function getStoredOfflineItems(): LostFoundItem[] {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      const raw = window.localStorage.getItem(OFFLINE_LF_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as LostFoundItem[];
        return parsed.filter(isCleanItem);
      }
    }
  } catch {
    // fallback
  }
  const memRaw = memoryStore.get(OFFLINE_LF_KEY);
  if (memRaw) {
    const parsed = JSON.parse(memRaw) as LostFoundItem[];
    return parsed.filter(isCleanItem);
  }
  return INITIAL_DEMO_ITEMS;
}

function saveStoredOfflineItems(items: LostFoundItem[]): void {
  const json = JSON.stringify(items);
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem(OFFLINE_LF_KEY, json);
    }
  } catch {
    // fallback
  }
  memoryStore.set(OFFLINE_LF_KEY, json);
}

function getStoredOfflineClaims(): LostFoundClaim[] {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      const raw = window.localStorage.getItem(OFFLINE_CLAIMS_KEY);
      if (raw) return JSON.parse(raw) as LostFoundClaim[];
    }
  } catch {
    // fallback
  }
  const memRaw = memoryStore.get(OFFLINE_CLAIMS_KEY);
  if (memRaw) return JSON.parse(memRaw) as LostFoundClaim[];
  return [];
}

function saveStoredOfflineClaims(claims: LostFoundClaim[]): void {
  const json = JSON.stringify(claims);
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem(OFFLINE_CLAIMS_KEY, json);
    }
  } catch {
    // fallback
  }
  memoryStore.set(OFFLINE_CLAIMS_KEY, json);
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
