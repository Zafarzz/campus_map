import { apiGet, apiPost, isBackendEnabled } from '../api/apiClient';
import type { BookableResource, Booking, CreateBookingPayload } from './bookingTypes';

const OFFLINE_BOOKINGS_KEY = 'campus_offline_bookings';
const memoryStore = new Map<string, string>();

const DEMO_BOOKABLE_RESOURCES: BookableResource[] = [
  {
    id: '01a154d5-79c7-729c-a7da-e8578d10571b',
    code: 'room:bld-h-f2-a204',
    name: 'Block A - A-204 Classroom',
    kind: 'room',
    room_id: 'bld-h-f2-a204',
    building_id: 'bld-h',
    capacity: 36,
    requires_approval: false,
    min_duration_minutes: 15,
    max_duration_minutes: 240,
    max_days_ahead: 14,
  },
  {
    id: '01a154d5-79c7-736c-85f9-d3f9ee30b2fe',
    code: 'room:bld-h-f1-a104',
    name: 'Block A - A-104 Lecture Room',
    kind: 'room',
    room_id: 'bld-h-f1-a104',
    building_id: 'bld-h',
    capacity: 40,
    requires_approval: false,
    min_duration_minutes: 15,
    max_duration_minutes: 240,
    max_days_ahead: 14,
  },
  {
    id: '01a154d5-79c7-70ba-aa83-20889f68ee06',
    code: 'room:bld-g-f2-b202',
    name: 'Block B - B-202 Seminar Room',
    kind: 'room',
    room_id: 'bld-g-f2-b202',
    building_id: 'bld-g',
    capacity: 36,
    requires_approval: false,
    min_duration_minutes: 15,
    max_duration_minutes: 240,
    max_days_ahead: 14,
  },
  {
    id: '01a154d5-79c7-7819-85d3-86eb4b4e185d',
    code: 'room:bld-d-f2-f201',
    name: 'Block F - Tiered Lecture Hall (Amphitheatre West)',
    kind: 'hall',
    room_id: 'bld-d-f2-f201',
    building_id: 'bld-d',
    capacity: 120,
    requires_approval: false,
    min_duration_minutes: 15,
    max_duration_minutes: 240,
    max_days_ahead: 30,
  },
  {
    id: '01a154d5-79c7-78ba-a4db-0303e5074c5a',
    code: 'room:bld-d-f2-f202',
    name: 'Block F - Tiered Lecture Hall (Amphitheatre East)',
    kind: 'hall',
    room_id: 'bld-d-f2-f202',
    building_id: 'bld-d',
    capacity: 120,
    requires_approval: false,
    min_duration_minutes: 15,
    max_duration_minutes: 240,
    max_days_ahead: 30,
  },
  {
    id: '01a154d5-79c7-7134-936b-49adc7bbd1e4',
    code: 'room:bld-b-f1-e102',
    name: 'Block E - Design Studio 1-A (E-102)',
    kind: 'room',
    room_id: 'bld-b-f1-e102',
    building_id: 'bld-b',
    capacity: 45,
    requires_approval: false,
    min_duration_minutes: 15,
    max_duration_minutes: 240,
    max_days_ahead: 14,
  },
  {
    id: '01a154d5-79c7-785c-8a55-6811a0aaeac3',
    code: 'room:bld-b-f1-e101',
    name: 'Block E - Main Lecture Hall & Design Studio (166 Seats)',
    kind: 'hall',
    room_id: 'bld-b-f1-e101',
    building_id: 'bld-b',
    capacity: 166,
    requires_approval: false,
    min_duration_minutes: 15,
    max_duration_minutes: 240,
    max_days_ahead: 14,
  },
  {
    id: '01a18e72-5ab6-775e-b505-77c34b00f057',
    code: 'room:bld-e-f1-r1',
    name: 'Halls - Event Hall H101',
    kind: 'room',
    room_id: 'bld-e-f1-r1',
    building_id: 'bld-e',
    capacity: 50,
    requires_approval: false,
    min_duration_minutes: 15,
    max_duration_minutes: 240,
    max_days_ahead: 7,
  },
];

function getStoredOfflineBookings(): Booking[] {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      const raw = window.localStorage.getItem(OFFLINE_BOOKINGS_KEY);
      if (raw) return JSON.parse(raw) as Booking[];
    }
  } catch {
    // fallback
  }
  const memRaw = memoryStore.get(OFFLINE_BOOKINGS_KEY);
  if (memRaw) return JSON.parse(memRaw) as Booking[];
  return [];
}

function saveStoredOfflineBookings(bookings: Booking[]): void {
  const json = JSON.stringify(bookings);
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem(OFFLINE_BOOKINGS_KEY, json);
    }
  } catch {
    // fallback
  }
  memoryStore.set(OFFLINE_BOOKINGS_KEY, json);
}

export function isExcludedFromBooking(r: Partial<BookableResource>): boolean {
  if (r.room_id === 'bld-i-f2-c201' || r.room_id === 'bld-i-f2-c202' || r.room_id === 'room-c-conf' || r.room_id === 'bld-i-f2-r1' || r.room_id === 'bld-i-f2-r2') return false;
  if (r.kind === 'laundry' || r.kind === 'dorm') return true;
  if (r.building_id === 'bld-j') return true;
  const lowerName = (r.name || '').toLowerCase();
  const lowerCode = (r.code || '').toLowerCase();
  const lowerRoomId = (r.room_id || '').toLowerCase();
  if (
    lowerName.includes('toilet') ||
    lowerName.includes('restroom') ||
    lowerName.includes('canteen') ||
    lowerName.includes('cafeteria') ||
    lowerName.includes('dining') ||
    lowerName.includes('library') ||
    lowerName.includes('reading') ||
    lowerCode.includes('toilet') ||
    lowerCode.includes('wc') ||
    lowerCode.includes('canteen') ||
    lowerCode.includes('library') ||
    lowerRoomId.includes('wc') ||
    lowerRoomId.startsWith('bld-j')
  ) {
    return true;
  }
  const knownExcludedRoomIds = new Set([
    'room-canteen',
    'bld-d-f1-f101',
    'bld-h-f1-a105',
    'bld-h-f1-a107',
    'bld-g-f1-lobby',
    'bld-g-f2-lobby',
    'bld-b-f1-lobby',
    'bld-b-f2-lobby',
    'bld-b-f1-e105',
    'bld-b-f2-e205',
    'bld-g-f3-r2',
    'bld-g-f3-r5',
    'bld-g-f4-r2',
    'bld-g-f4-r5',
    'bld-g-f1-wc-m',
    'bld-g-f1-wc-f',
    'bld-g-f2-wc-m',
    'bld-g-f2-wc-f',
  ]);
  if (r.room_id && knownExcludedRoomIds.has(r.room_id)) return true;
  return false;
}

export async function listBookableResources(
  token?: string | null,
  kind?: string,
  buildingId?: string,
): Promise<BookableResource[]> {
  if (isBackendEnabled) {
    try {
      const params: Record<string, string | undefined> = {};
      if (kind && kind !== 'all') params.kind = kind;
      if (buildingId && buildingId !== 'all') params.building_id = buildingId;
      const res = await apiGet<BookableResource[]>('/bookings/resources', params, undefined, token);
      if (Array.isArray(res) && res.length > 0) {
        return res.filter((r) => !isExcludedFromBooking(r));
      }
    } catch {
      // fallback to demo resources
    }
  }

  let list = DEMO_BOOKABLE_RESOURCES.filter((r) => !isExcludedFromBooking(r));
  if (kind && kind !== 'all') {
    list = list.filter((r) => r.kind === kind);
  }
  if (buildingId && buildingId !== 'all') {
    list = list.filter((r) => r.building_id === buildingId);
  }
  return list;
}

export async function listOccupiedSlots(token?: string | null): Promise<Booking[]> {
  if (isBackendEnabled) {
    try {
      const res = await apiGet<Booking[]>('/bookings/occupied-slots', undefined, undefined, token);
      if (Array.isArray(res)) {
        return res;
      }
    } catch {
      // fallback
    }
  }
  return getStoredOfflineBookings();
}

export async function listMyBookings(token?: string | null): Promise<Booking[]> {
  if (isBackendEnabled) {
    try {
      const res = await apiGet<Booking[]>('/bookings', undefined, undefined, token);
      if (Array.isArray(res)) {
        return res;
      }
    } catch {
      // fallback to offline
    }
  }
  return getStoredOfflineBookings();
}

export async function createBooking(
  token: string | null,
  payload: CreateBookingPayload,
): Promise<Booking> {
  if (isBackendEnabled) {
    try {
      const res = await apiPost<Booking>('/bookings', payload, undefined, token);
      return res;
    } catch (err: unknown) {
      const status = (err as { status?: number })?.status;
      // Only propagate real booking validation/conflict errors (409, 422), not auth/network errors
      if (status === 409 || status === 422 || status === 400) {
        throw err;
      }
      console.warn('Booking API error/unreachable, saving reservation locally:', err);
    }
  }

  // Offline fallback booking
  const existing = getStoredOfflineBookings();
  const mockBooking: Booking = {
    id: `book-local-${Date.now()}`,
    resource_id: payload.resource_id,
    room_id: payload.room_id,
    starts_at: payload.starts_at,
    ends_at: payload.ends_at,
    status: 'confirmed',
    purpose: payload.purpose || 'Study Session',
    attendee_count: payload.attendee_count || 1,
    checked_in_at: null,
    released_at: null,
    awaiting_approval: false,
    checkin_opens_at: payload.starts_at,
    checkin_closes_at: payload.ends_at,
  };
  const updated = [mockBooking, ...existing];
  saveStoredOfflineBookings(updated);
  return mockBooking;
}

export async function checkInBooking(
  token: string | null,
  bookingId: string,
): Promise<Booking> {
  if (isBackendEnabled && !bookingId.startsWith('book-local-') && !bookingId.startsWith('mock-book-')) {
    try {
      const res = await apiPost<Booking>(`/bookings/${bookingId}/checkin`, undefined, undefined, token);
      return res;
    } catch (err: unknown) {
      const status = (err as { status?: number })?.status;
      if (status === 409 || status === 422 || status === 400) {
        throw err;
      }
      console.warn('Check-in API unreachable, checking in locally:', err);
    }
  }

  const existing = getStoredOfflineBookings();
  const found = existing.find((b) => b.id === bookingId);
  if (!found) throw new Error('Booking not found');
  found.checked_in_at = new Date().toISOString();
  saveStoredOfflineBookings(existing);
  return found;
}

export async function cancelBooking(
  token: string | null,
  bookingId: string,
  reason?: string,
): Promise<Booking> {
  if (isBackendEnabled && !bookingId.startsWith('book-local-') && !bookingId.startsWith('mock-book-')) {
    try {
      const query = reason ? `?reason=${encodeURIComponent(reason)}` : '';
      const res = await apiPost<Booking>(`/bookings/${bookingId}/cancel${query}`, undefined, undefined, token);
      return res;
    } catch (err: unknown) {
      const status = (err as { status?: number })?.status;
      if (status === 409 || status === 422 || status === 400) {
        throw err;
      }
      console.warn('Cancel API unreachable, cancelling locally:', err);
    }
  }

  const existing = getStoredOfflineBookings();
  const found = existing.find((b) => b.id === bookingId);
  if (!found) throw new Error('Booking not found');
  found.status = 'cancelled';
  saveStoredOfflineBookings(existing);
  return found;
}
