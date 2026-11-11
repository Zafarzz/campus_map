import { beforeEach, describe, expect, it } from 'vitest';
import jsQR from 'jsqr';

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
import type { UserProfile } from '../services/auth/authTypes';

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

    // Rasterize the SVG <rect> modules into an RGBA pixel buffer and decode with jsQR
    const vbMatch = svg.match(/viewBox="0 0 (\d+) (\d+)"/);
    expect(vbMatch).not.toBeNull();
    const dim = Number(vbMatch![1]);
    const rgba = new Uint8ClampedArray(dim * dim * 4);
    rgba.fill(255); // white background

    const rectRegex = /<rect x="(\d+)" y="(\d+)" width="(\d+)" height="(\d+)"/g;
    let m: RegExpExecArray | null;
    while ((m = rectRegex.exec(svg)) !== null) {
      const rx = Number(m[1]);
      const ry = Number(m[2]);
      const rw = Number(m[3]);
      const rh = Number(m[4]);
      for (let py = ry; py < ry + rh; py++) {
        for (let px = rx; px < rx + rw; px++) {
          const idx = (py * dim + px) * 4;
          rgba[idx] = 0;
          rgba[idx + 1] = 0;
          rgba[idx + 2] = 0;
          rgba[idx + 3] = 255;
        }
      }
    }

    const decoded = jsQR(rgba, dim, dim);
    expect(decoded).not.toBeNull();
    expect(decoded?.data).toBe('aut-att:session-xyz:abcdef');
  });

  it('supports token-only check-in and populates both student history and teacher roster with full name & group', async () => {
    localStorageMock.setItem(
      'campus_auth_user',
      JSON.stringify({
        user_id: 'usr-munisa',
        account_type: 'student',
        is_admin: false,
        student_id: '202590112',
        display_name: 'TURSUNOVA MUNISA ANVAR QIZI',
        first_name: 'MUNISA',
        last_name: 'TURSUNOVA',
        fathers_name: 'ANVAR QIZI',
        department: 'Electrical and Computer Engineering',
        group_no: 'I25C',
        must_change_password: false,
        roles: ['student'],
        effective_roles: ['student'],
      }),
    );

    const session = await openAttendanceSession({
      room_id: 'bld-c-f2-r3',
      room_label: 'Civil-Laboratory 4 (Block D)',
      subject: 'Organizational Behaviour',
      group_label: 'I25C',
      expected_count: 45,
    });

    const qr = await getAttendanceQr(session.id);

    // Check in using ONLY the 8-character token without passing sessionId
    const scanRes = await scanAttendanceQr('', { token: qr.token });
    expect(scanRes.session_id).toBe(session.id);
    expect(scanRes.state).toBe('present');

    // Student history must show the check-in
    const myRecords = await listMyAttendanceRecords();
    expect(myRecords.some((r) => r.session_id === session.id && r.subject === 'Organizational Behaviour')).toBe(
      true,
    );

    // Teacher session summary must show the student's full name and group number
    const teacherView = await getAttendanceSession(session.id);
    expect(teacherView?.counts.present).toBe(1);
    expect(teacherView?.records?.[0]?.student_name).toBe('TURSUNOVA MUNISA ANVAR QIZI');
    expect(teacherView?.records?.[0]?.group_no).toBe('I25C');
    expect(teacherView?.records?.[0]?.student_id).toBe('202590112');
  });

  it('isolates My History records strictly per student account when switching users', async () => {
    // 1. Sign in as Student 1 (Munisa) and check in
    localStorageMock.setItem(
      'campus_auth_user',
      JSON.stringify({
        user_id: 'usr-munisa-1',
        account_type: 'student',
        is_admin: false,
        student_id: '202590232',
        display_name: 'TOJIBOYEVA MUNISA ABDURAXMON QIZI',
        group_no: 'I25C',
        roles: ['student'],
        effective_roles: ['student'],
      }),
    );

    const session = await openAttendanceSession({
      room_id: 'bld-c-f1-d102',
      room_label: 'D-102 · Classroom (Block D)',
      subject: 'Operations Management',
      group_label: 'I25A, I25C',
      expected_count: 60,
    });
    expect(session.group_label).toBe('I25A, I25C');

    const qr = await getAttendanceQr(session.id);
    await scanAttendanceQr(session.id, { token: qr.token });

    const munisaRecords = await listMyAttendanceRecords();
    expect(munisaRecords.length).toBe(1);
    expect(munisaRecords[0].session_id).toBe(session.id);

    // 2. Switch to Student 2 (Muslimaxon, who has NOT checked in)
    localStorageMock.setItem(
      'campus_auth_user',
      JSON.stringify({
        user_id: 'usr-muslimaxon-2',
        account_type: 'student',
        is_admin: false,
        student_id: '202590143',
        display_name: 'BAHODIROVA MUSLIMAXON SHAVKAT QIZI',
        group_no: 'I25A',
        roles: ['student'],
        effective_roles: ['student'],
      }),
    );

    const muslimaxonRecords = await listMyAttendanceRecords();
    expect(muslimaxonRecords.length).toBe(0);

    // 3. Close the session and verify it is no longer listed in open sessions
    await closeAttendanceSession(session.id);
    const openAfterClose = await listAttendanceSessions('open');
    expect(openAfterClose.some((s) => s.id === session.id)).toBe(false);
  });

  it('strictly distinguishes student role from teacher/instructor role', () => {
    const isTeacherOrAdmin = (user: UserProfile | null) =>
      Boolean(
        user && (
          user.is_admin ||
          user.account_type === 'staff' ||
          user.roles?.some((r) => r === 'teacher' || r === 'staff' || r === 'admin') ||
          user.effective_roles?.some((r) => r === 'teacher' || r === 'staff' || r === 'admin')
        ),
      );

    const studentUser: UserProfile = {
      user_id: 'usr-student-1',
      account_type: 'student',
      is_admin: false,
      student_id: 'I25D1010',
      display_name: 'ROBIYAXON M.',
      first_name: 'Robiyaxon',
      last_name: 'M.',
      fathers_name: '',
      department: 'Computer Science',
      group_no: 'I25D',
      must_change_password: false,
      roles: ['student'],
      effective_roles: ['student'],
    };

    const teacherUser: UserProfile = {
      user_id: 'usr-teacher-1',
      account_type: 'staff',
      is_admin: false,
      email: 'teacher@ajou.uz',
      display_name: 'Prof. Kim',
      first_name: 'Min-Jun',
      last_name: 'Kim',
      fathers_name: '',
      department: 'Software Engineering',
      group_no: '',
      must_change_password: false,
      roles: ['teacher', 'staff'],
      effective_roles: ['teacher', 'staff'],
    };

    const adminUser: UserProfile = {
      user_id: 'usr-admin-1',
      account_type: 'staff',
      is_admin: true,
      email: 'admin@ajou.uz',
      display_name: 'Admin',
      first_name: 'Admin',
      last_name: 'System',
      fathers_name: '',
      department: 'IT Infrastructure',
      group_no: '',
      must_change_password: false,
      roles: ['admin'],
      effective_roles: ['admin'],
    };

    expect(isTeacherOrAdmin(studentUser)).toBe(false);
    expect(isTeacherOrAdmin(null)).toBe(false);
    expect(isTeacherOrAdmin(teacherUser)).toBe(true);
    expect(isTeacherOrAdmin(adminUser)).toBe(true);
  });

  it('blocks students from other groups when a class is restricted to specific groups (e.g. I25D, I25C)', async () => {
    const session = await openAttendanceSession({
      room_id: 'bld-h-f2-a207',
      room_label: 'A-207 · Faculty / Seminar (Block A)',
      subject: 'English',
      group_label: 'I25D, I25C',
      expected_count: 40,
    });
    const qr = await getAttendanceQr(session.id);

    // 1. Student from I25A (not in I25D or I25C) must be rejected
    localStorageMock.setItem(
      'campus_auth_user',
      JSON.stringify({
        user_id: 'usr-muslimaxon-i25a',
        account_type: 'student',
        is_admin: false,
        student_id: '202590143',
        display_name: 'BAHODIROVA MUSLIMAXON SHAVKAT QIZI',
        group_no: 'I25A',
        roles: ['student'],
        effective_roles: ['student'],
      }),
    );

    await expect(scanAttendanceQr(session.id, { token: qr.token })).rejects.toThrow(
      /only for group\(s\) I25D, I25C/i,
    );
    const i25aHistory = await listMyAttendanceRecords();
    expect(i25aHistory.length).toBe(0);

    // 2. Student from I25D (in I25D, I25C) succeeds
    localStorageMock.setItem(
      'campus_auth_user',
      JSON.stringify({
        user_id: 'usr-robiyaxon-i25d',
        account_type: 'student',
        is_admin: false,
        student_id: '202590207',
        display_name: 'ROBIYAXON M.',
        group_no: 'I25D',
        roles: ['student'],
        effective_roles: ['student'],
      }),
    );

    const i25dRes = await scanAttendanceQr(session.id, { token: qr.token });
    expect(i25dRes.state).toBe('present');
    const i25dHistory = await listMyAttendanceRecords();
    expect(i25dHistory.length).toBe(1);
  });
});
