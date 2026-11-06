import { describe, expect, it } from 'vitest';
import {
  cancelBooking,
  checkInBooking,
  createBooking,
  listBookableResources,
  listMyBookings,
} from '../services/booking/bookingService';
import {
  BOOKABLE_BUILDINGS,
  computeRoomFreeWindows,
  isToiletOrDormResource,
  resolveResourceKind,
} from '../components/booking/BookingsView';
import type { Lesson } from '../domain/schedule/types';
import {
  claimLostFoundItem,
  createLostFoundItem,
  listClaimsForItem,
  listLostFoundItems,
  listMyClaims,
  resolveLostFoundClaim,
} from '../services/lostfound/lostFoundService';

describe('Booking Service Seams', () => {
  it('loads bookable resources with fallback and filters by kind', async () => {
    const all = await listBookableResources('mock-token-test');
    expect(all.length).toBeGreaterThan(0);
    const rooms = await listBookableResources('mock-token-test', 'room');
    expect(rooms.every((r) => r.kind === 'room')).toBe(true);
  });

  it('creates, checks in, and cancels a booking offline/fallback', async () => {
    const booking = await createBooking('mock-token-test', {
      resource_id: '01a154d5-79c7-729c-a7da-e8578d10571b',
      starts_at: '2026-11-05T14:00:00+05:00',
      ends_at: '2026-11-05T15:00:00+05:00',
      purpose: 'Algorithm review session',
      attendee_count: 3,
    });
    expect(booking.id).toBeDefined();
    expect(booking.status).toBe('confirmed');

    const myBookings = await listMyBookings('mock-token-test');
    expect(myBookings.some((b) => b.id === booking.id)).toBe(true);

    const checkedIn = await checkInBooking('mock-token-test', booking.id);
    expect(checkedIn.checked_in_at).toBeDefined();

    const cancelled = await cancelBooking('mock-token-test', booking.id);
    expect(cancelled.status).toBe('cancelled');
  });

  it('computes exact working-hour free windows (08:30-20:45) for A-204 Monday schedule', () => {
    const mondayA204Lessons: Lesson[] = [
      {
        id: 'l1',
        roomId: 'bld-h-f2-a204',
        subject: 'Practical Business English 1',
        teacher: 'Prof. Kim',
        group: 'I25A',
        startsAt: '2026-11-02T08:30:00',
        endsAt: '2026-11-02T09:45:00',
      },
      {
        id: 'l2',
        roomId: 'bld-h-f2-a204',
        subject: 'Practical Business English 1',
        teacher: 'Prof. Kim',
        group: 'I25B',
        startsAt: '2026-11-02T10:00:00',
        endsAt: '2026-11-02T11:15:00',
      },
      {
        id: 'l3',
        roomId: 'bld-h-f2-a204',
        subject: 'EFL Reading & Writing 1',
        teacher: 'Prof. Lee',
        group: 'I25C',
        startsAt: '2026-11-02T11:30:00',
        endsAt: '2026-11-02T12:45:00',
      },
      {
        id: 'l4',
        roomId: 'bld-h-f2-a204',
        subject: 'EFL Reading & Writing 1',
        teacher: 'Prof. Lee',
        group: 'I25D',
        startsAt: '2026-11-02T15:00:00',
        endsAt: '2026-11-02T16:15:00',
      },
    ];

    const windows = computeRoomFreeWindows(mondayA204Lessons, []);
    expect(windows).toEqual([
      {
        startMins: 13 * 60 + 30,
        endMins: 14 * 60 + 45,
        startStr: '13:30',
        endStr: '14:45',
        durationMins: 75,
      },
      {
        startMins: 16 * 60 + 30,
        endMins: 20 * 60 + 45,
        startStr: '16:30',
        endStr: '20:45',
        durationMins: 255,
      },
    ]);
  });

  it('excludes toilets, restrooms, and dormitory services from booking', () => {
    // Restroom in Block B
    expect(
      isToiletOrDormResource({
        id: 'r-toilet-m',
        code: 'room:bld-g-f3-r2',
        name: 'Block B - Toilet-M Restroom (Men)',
        kind: 'room',
        room_id: 'bld-g-f3-r2',
        building_id: 'bld-g',
        requires_approval: false,
        min_duration_minutes: 15,
        max_duration_minutes: 240,
        max_days_ahead: 14,
      }, { room: { number: 'Toilet-M', name: 'Restroom (Men)' } })
    ).toBe(true);

    // Dormitory service/room
    expect(
      isToiletOrDormResource({
        id: 'r-dorm-101',
        code: 'room:bld-j-f1-r1',
        name: 'Dorm101',
        kind: 'room',
        room_id: 'bld-j-f1-r1',
        building_id: 'bld-j',
        requires_approval: false,
        min_duration_minutes: 15,
        max_duration_minutes: 240,
        max_days_ahead: 14,
      })
    ).toBe(true);

    // Dorm laundry
    expect(
      isToiletOrDormResource({
        id: 'r-laundry-1',
        code: 'laundry:bld-j-m1',
        name: 'Dorm Washing Machine #1',
        kind: 'laundry',
        building_id: 'bld-j',
        requires_approval: false,
        min_duration_minutes: 15,
        max_duration_minutes: 240,
        max_days_ahead: 14,
      })
    ).toBe(true);

    // Canteen in Block C
    expect(
      isToiletOrDormResource({
        id: 'r-canteen',
        code: 'room:room-canteen',
        name: 'Block C - Room Canteen',
        kind: 'room',
        room_id: 'room-canteen',
        building_id: 'bld-i',
        requires_approval: false,
        min_duration_minutes: 15,
        max_duration_minutes: 240,
        max_days_ahead: 14,
      }, { room: { number: 'Canteen', name: 'Canteen & Dining Hall' } })
    ).toBe(true);

    // University Library in Block F
    expect(
      isToiletOrDormResource({
        id: 'r-f101-lib',
        code: 'room:bld-d-f1-f101',
        name: 'Block F - Campus Library & Reading Hall',
        kind: 'hall',
        room_id: 'bld-d-f1-f101',
        building_id: 'bld-d',
        requires_approval: false,
        min_duration_minutes: 15,
        max_duration_minutes: 240,
        max_days_ahead: 14,
      }, { room: { number: 'F-101', name: 'Campus Library & Reading Hall (F101)' } })
    ).toBe(true);

    // Open study spaces / lounges in Block A & B
    expect(
      isToiletOrDormResource({
        id: 'r-a105',
        code: 'room:bld-h-f1-a105',
        name: 'Block A - Library Reading Hall',
        kind: 'room',
        room_id: 'bld-h-f1-a105',
        building_id: 'bld-h',
        requires_approval: false,
        min_duration_minutes: 15,
        max_duration_minutes: 240,
        max_days_ahead: 14,
      })
    ).toBe(true);

    // Regular classroom should NOT be excluded
    expect(
      isToiletOrDormResource({
        id: 'r-a204',
        code: 'room:bld-h-f2-a204',
        name: 'Block A - 204 Computer Lab',
        kind: 'room',
        room_id: 'bld-h-f2-a204',
        building_id: 'bld-h',
        requires_approval: false,
        min_duration_minutes: 15,
        max_duration_minutes: 240,
        max_days_ahead: 14,
      }, { room: { number: 'A-204', name: 'Computer Lab' } })
    ).toBe(false);
  });

  it('includes Block E and excludes Block C from bookable buildings list', () => {
    const blockE = BOOKABLE_BUILDINGS.find((b) => b.id === 'bld-b');
    expect(blockE).toBeDefined();
    expect(blockE?.name).toBe('Block E');
    expect(blockE?.code).toBe('E');

    // Block C (bld-i) consists of public canteen/spaces and must be excluded
    const blockC = BOOKABLE_BUILDINGS.find((b) => b.id === 'bld-i');
    expect(blockC).toBeUndefined();
  });

  it('accurately resolves lecture halls such as Block F second floor tiered lecture halls', () => {
    // Block F second floor tiered lecture halls
    expect(
      resolveResourceKind({
        id: 'r-f201',
        code: 'room:bld-d-f2-f201',
        name: 'Tiered Lecture Hall (Amphitheatre West)',
        kind: 'room', // even if backend had room
        room_id: 'bld-d-f2-f201',
        building_id: 'bld-d',
        requires_approval: false,
        min_duration_minutes: 15,
        max_duration_minutes: 240,
        max_days_ahead: 30,
      }, { room: { number: 'F-201', name: 'Tiered Lecture Hall (Amphitheatre West)', kind: 'hall' } })
    ).toBe('hall');

    expect(
      resolveResourceKind({
        id: 'r-f202',
        code: 'room:bld-d-f2-f202',
        name: 'Tiered Lecture Hall (Amphitheatre East)',
        kind: 'room',
        room_id: 'bld-d-f2-f202',
        building_id: 'bld-d',
        requires_approval: false,
        min_duration_minutes: 15,
        max_duration_minutes: 240,
        max_days_ahead: 30,
      }, { room: { number: 'F-202', name: 'Tiered Lecture Hall (Amphitheatre East)', kind: 'hall' } })
    ).toBe('hall');

    // Standard classroom
    expect(
      resolveResourceKind({
        id: 'r-a204',
        code: 'room:bld-h-f2-a204',
        name: 'Block A - 204 Computer Lab',
        kind: 'room',
        room_id: 'bld-h-f2-a204',
        building_id: 'bld-h',
        requires_approval: false,
        min_duration_minutes: 15,
        max_duration_minutes: 240,
        max_days_ahead: 14,
      }, { room: { number: 'A-204', name: 'Computer Lab', kind: 'classroom' } })
    ).toBe('room');
  });
});

describe('Lost & Found Service Seams', () => {
  it('lists lost and found items and filters by category', async () => {
    const all = await listLostFoundItems('mock-token-test');
    expect(all.length).toBeGreaterThan(0);
    const electronics = await listLostFoundItems('mock-token-test', { category: 'electronics' });
    expect(electronics.every((i) => i.category === 'electronics')).toBe(true);
  });

  it('submits a new report with contact info and photo, claims an item, and resolves claim', async () => {
    const created = await createLostFoundItem('mock-token-test', {
      kind: 'found',
      category: 'keys',
      title: 'Set of 3 keys with red Ajou tag',
      description: 'Found near fountain bench',
      contact_info: '@student_helper',
      photo_base64: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
      building_id: 'bld-h',
      verification_question: 'What shape is the bottle opener on the ring?',
      handover_point: 'Block A Security',
    });
    expect(created.item.id).toBeDefined();
    expect(created.item.is_mine).toBe(true);
    expect(created.item.contact_info).toBe('@student_helper');
    expect(created.item.photo_url).toBeDefined();

    const claim = await claimLostFoundItem('mock-token-test', created.item.id, {
      verification_answer: 'Bronze eagle shape',
    });
    expect(claim.status).toBe('pending');

    const itemClaims = await listClaimsForItem('mock-token-test', created.item.id);
    expect(itemClaims.some((c) => c.id === claim.id)).toBe(true);

    const myClaims = await listMyClaims('mock-token-test');
    expect(myClaims.some((c) => c.id === claim.id)).toBe(true);

    const resolved = await resolveLostFoundClaim('mock-token-test', claim.id, {
      approve: true,
      handover_point: 'Block A Security',
      mark_returned: true,
    });
    expect(resolved.status).toBe('approved');
  });
});
