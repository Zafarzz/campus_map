import { beforeEach, describe, expect, it } from 'vitest';

const storageMap = new Map<string, string>();
const localStorageMock = {
  getItem: (key: string) => storageMap.get(key) ?? null,
  setItem: (key: string, val: string) => storageMap.set(key, String(val)),
  removeItem: (key: string) => storageMap.delete(key),
  clear: () => storageMap.clear(),
  get length() {
    return storageMap.size;
  },
  key: (i: number) => Array.from(storageMap.keys())[i] ?? null,
};

(globalThis as any).localStorage = localStorageMock;
if (typeof (globalThis as any).window === 'undefined') {
  (globalThis as any).window = globalThis;
}
(globalThis as any).window.localStorage = localStorageMock;

import {
  closeAttendanceSession,
  generateDeterministicQrSvg,
  getAttendanceQr,
  getAttendanceSession,
  listAttendanceSessions,
  listMyAttendanceRecords,
  openAttendanceSession,
  reviewAttendanceRecord,
  scanAttendanceQr,
} from '../services/attendance/attendanceService';

describe('QR Attendance Service & Integration', () => {
  beforeEach(() => {
    localStorageMock.clear();
  });

  it('lists default attendance sessions and filters by open status', async () => {
    const all = await listAttendanceSessions('all');
    expect(all.length).toBeGreaterThan(0);

    const openOnly = await listAttendanceSessions('open');
    expect(openOnly.length).toBeGreaterThan(0);
    expect(openOnly.every((s) => s.is_open)).toBe(true);

    const closedOnly = await listAttendanceSessions('closed');
    expect(closedOnly.every((s) => !s.is_open)).toBe(true);
  });

  it('generates a rotating HMAC-format QR payload with valid SVG', async () => {
    const sessionId = 'test-session-123';
    const qrData = await getAttendanceQr(sessionId);

    expect(qrData.session_id).toBe(sessionId);
    expect(qrData.token).toBeTruthy();
    expect(qrData.step_seconds).toBe(20);
    expect(qrData.qr_payload).toMatch(/^aut-att:test-session-123:[0-9a-fA-F]+/);
    expect(qrData.qr_svg).toContain('<svg');
    expect(qrData.qr_svg).toContain('</svg>');
  });

  it('creates a new teacher attendance session with initial counts', async () => {
    const created = await openAttendanceSession({
      room_id: 'room-a-101',
      token_step_seconds: 20,
      late_after_minutes: 15,
      expected_count: 35,
    });

    expect(created.id).toBeTruthy();
    expect(created.room_id).toBe('room-a-101');
    expect(created.is_open).toBe(true);
    expect(created.total_scans).toBe(0);
    expect(created.counts.present).toBe(0);

    const fetched = await getAttendanceSession(created.id);
    expect(fetched).not.toBeNull();
    expect(fetched?.id).toBe(created.id);
  });

  it('allows a student to scan/check in to an active session', async () => {
    const session = await openAttendanceSession({
      room_id: 'room-c-201',
      token_step_seconds: 20,
      late_after_minutes: 30,
    });

    const qr = await getAttendanceQr(session.id);
    const result = await scanAttendanceQr(session.id, {
      token: qr.token,
    });

    expect(result.session_id).toBe(session.id);
    expect(result.state).toBe('present');
    expect(result.is_late).toBe(false);
    expect(result.counts_toward_occupancy).toBe(true);

    // Verify it is recorded in my attendance history
    const myHistory = await listMyAttendanceRecords();
    expect(myHistory.length).toBeGreaterThan(0);
    expect(myHistory.some((r) => r.session_id === session.id)).toBe(true);
  });

  it('allows a teacher to review pending student scans', async () => {
    const session = await openAttendanceSession({
      room_id: 'room-a-102',
    });

    // Add a pending review record directly in session
    session.records = [
      {
        id: 'rec-flagged-1',
        user_id: 'user-flagged',
        state: 'pending_review',
        scanned_at: new Date().toISOString(),
        review_reason: 'Device signature mismatch',
      },
    ];
    session.counts.pending_review = 1;
    const currentSessions = await listAttendanceSessions('all');
    const updatedAll = currentSessions.map((s) => (s.id === session.id ? session : s));
    localStorageMock.setItem('campus_attendance_sessions_v1', JSON.stringify(updatedAll));

    // Teacher approves
    await reviewAttendanceRecord('rec-flagged-1', 'present');

    const updated = await getAttendanceSession(session.id);
    const updatedRec = updated?.records?.find((r) => r.id === 'rec-flagged-1');
    expect(updatedRec?.state).toBe('present');
  });

  it('closes an active attendance session', async () => {
    const session = await openAttendanceSession({
      room_id: 'room-h-103',
    });
    expect(session.is_open).toBe(true);

    await closeAttendanceSession(session.id);
    const closed = await getAttendanceSession(session.id);
    expect(closed?.is_open).toBe(false);
    expect(closed?.closed_at).not.toBeNull();
  });

  it('renders deterministic QR SVGs for offline projector display', () => {
    const svg = generateDeterministicQrSvg('aut-att:session-xyz:abcdef');
    expect(svg).toContain('<svg');
    expect(svg).toContain('viewBox');
    expect(svg).toContain('<rect');
    expect(svg).toContain('fill="#1e293b"');
  });
});
