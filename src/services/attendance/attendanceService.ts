import { apiGet, apiPatch, apiPost } from '../api/apiClient';
import type {
  AttendanceRecordItem,
  AttendanceScanResult,
  AttendanceSessionInfo,
  OpenAttendanceSessionParams,
  RotatingQrTokenData,
  ScanAttendanceParams,
  StudentAttendanceRecord,
} from './attendanceTypes';

const STORAGE_SESSIONS_KEY = 'campus_attendance_sessions_v1';
const STORAGE_MY_RECORDS_KEY = 'campus_my_attendance_records_v1';

// Seed demo sessions when localStorage is empty
const INITIAL_DEMO_SESSIONS: AttendanceSessionInfo[] = [
  {
    id: 'demo-session-a101',
    meeting_id: null,
    room_id: 'room-a-101',
    subject: 'Computer Vision & Deep Learning',
    teacher_label: 'Prof. Kim',
    group_label: 'I25D',
    opened_at: new Date(Date.now() - 10 * 60 * 1000).toISOString(),
    closed_at: null,
    is_open: true,
    token_step_seconds: 20,
    late_after_minutes: 15,
    expected_count: 32,
    counts: {
      present: 24,
      late: 2,
      pending_review: 1,
      guest: 0,
      rejected: 0,
    },
    total_scans: 27,
    records: [
      {
        id: 'rec-1',
        user_id: 'user-robiyaxon',
        state: 'present',
        scanned_at: new Date(Date.now() - 9 * 60 * 1000).toISOString(),
      },
      {
        id: 'rec-2',
        user_id: 'user-munisa',
        state: 'present',
        scanned_at: new Date(Date.now() - 8 * 60 * 1000).toISOString(),
      },
      {
        id: 'rec-3',
        user_id: 'user-bobur',
        state: 'late',
        scanned_at: new Date(Date.now() - 2 * 60 * 1000).toISOString(),
        review_reason: 'Scan after 15m late threshold',
      },
      {
        id: 'rec-4',
        user_id: 'user-guest-99',
        state: 'pending_review',
        scanned_at: new Date(Date.now() - 1 * 60 * 1000).toISOString(),
        review_reason: 'Device ID mismatch or geofence boundary',
      },
    ],
  },
  {
    id: 'demo-session-c201',
    meeting_id: null,
    room_id: 'room-c-conf',
    subject: 'Algorithm Analysis & Complexity',
    teacher_label: 'Dr. Zafar',
    group_label: 'I25C',
    opened_at: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
    closed_at: null,
    is_open: true,
    token_step_seconds: 20,
    late_after_minutes: 20,
    expected_count: 45,
    counts: {
      present: 38,
      late: 1,
      pending_review: 0,
      guest: 0,
      rejected: 0,
    },
    total_scans: 39,
    records: [],
  },
];

function loadLocalSessions(): AttendanceSessionInfo[] {
  if (typeof window === 'undefined') return INITIAL_DEMO_SESSIONS;
  try {
    const raw = localStorage.getItem(STORAGE_SESSIONS_KEY);
    if (!raw) {
      localStorage.setItem(STORAGE_SESSIONS_KEY, JSON.stringify(INITIAL_DEMO_SESSIONS));
      return INITIAL_DEMO_SESSIONS;
    }
    return JSON.parse(raw);
  } catch {
    return INITIAL_DEMO_SESSIONS;
  }
}

function saveLocalSessions(sessions: AttendanceSessionInfo[]) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_SESSIONS_KEY, JSON.stringify(sessions));
  } catch (err) {
    console.warn('Failed to save attendance sessions to localStorage', err);
  }
}

function loadLocalMyRecords(): StudentAttendanceRecord[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_MY_RECORDS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveLocalMyRecord(record: StudentAttendanceRecord) {
  if (typeof window === 'undefined') return;
  try {
    const existing = loadLocalMyRecords().filter((r) => r.id !== record.id);
    existing.unshift(record);
    localStorage.setItem(STORAGE_MY_RECORDS_KEY, JSON.stringify(existing.slice(0, 50)));
  } catch (err) {
    console.warn('Failed to save my attendance record to localStorage', err);
  }
}

/**
 * Generate a deterministic SVG QR code pattern for offline demo mode
 */
export function generateDeterministicQrSvg(payload: string): string {
  // Simple 21x21 QR code matrix simulator
  const size = 21;
  const matrix: boolean[][] = Array.from({ length: size }, () => Array(size).fill(false));

  // Finder pattern helper (7x7)
  const drawFinder = (r0: number, c0: number) => {
    for (let r = 0; r < 7; r++) {
      for (let c = 0; c < 7; c++) {
        if (
          r === 0 ||
          r === 6 ||
          c === 0 ||
          c === 6 ||
          (r >= 2 && r <= 4 && c >= 2 && c <= 4)
        ) {
          matrix[r0 + r][c0 + c] = true;
        }
      }
    }
  };

  drawFinder(0, 0); // Top-left
  drawFinder(0, size - 7); // Top-right
  drawFinder(size - 7, 0); // Bottom-left

  // Timing lines
  for (let i = 8; i < size - 8; i++) {
    matrix[6][i] = i % 2 === 0;
    matrix[i][6] = i % 2 === 0;
  }

  // Hash-based data filler
  let hash = 0;
  for (let i = 0; i < payload.length; i++) {
    hash = (hash << 5) - hash + payload.charCodeAt(i);
    hash |= 0;
  }

  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      // Skip finder areas
      const inTL = r < 8 && c < 8;
      const inTR = r < 8 && c >= size - 8;
      const inBL = r >= size - 8 && c < 8;
      if (inTL || inTR || inBL || r === 6 || c === 6) continue;

      const bit = ((hash ^ (r * 31 + c * 17)) & 1) === 1;
      matrix[r][c] = bit;
    }
  }

  const moduleSize = 8;
  const padding = 16;
  const totalDim = size * moduleSize + padding * 2;

  let rects = '';
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (matrix[r][c]) {
        const x = padding + c * moduleSize;
        const y = padding + r * moduleSize;
        rects += `<rect x="${x}" y="${y}" width="${moduleSize}" height="${moduleSize}" fill="#1e293b"/>`;
      }
    }
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${totalDim} ${totalDim}" width="100%" height="100%" style="background:#ffffff;border-radius:12px;">${rects}</svg>`;
}

/**
 * List active or past attendance sessions
 */
export async function listAttendanceSessions(
  status: 'open' | 'closed' | 'all' = 'all',
  roomId?: string,
): Promise<AttendanceSessionInfo[]> {
  try {
    const params = new URLSearchParams();
    if (status !== 'all') params.set('status', status);
    if (roomId) params.set('room_id', roomId);
    const query = params.toString() ? `?${params.toString()}` : '';

    const res = await apiGet<{ count: number; sessions: AttendanceSessionInfo[] }>(
      `/academic/attendance/sessions${query}`,
    );
    if (res?.sessions && Array.isArray(res.sessions)) {
      return res.sessions;
    }
  } catch (err) {
    console.warn('Backend attendance session list unreachable, using local store:', err);
  }

  // Fallback to local store
  let sessions = loadLocalSessions();
  if (status === 'open') {
    sessions = sessions.filter((s) => s.is_open);
  } else if (status === 'closed') {
    sessions = sessions.filter((s) => !s.is_open);
  }
  if (roomId) {
    sessions = sessions.filter((s) => s.room_id === roomId);
  }
  return sessions;
}

/**
 * Get single attendance session summary with records
 */
export async function getAttendanceSession(sessionId: string): Promise<AttendanceSessionInfo | null> {
  try {
    const res = await apiGet<AttendanceSessionInfo>(
      `/academic/attendance/sessions/${sessionId}`,
    );
    if (res?.id) return res;
  } catch (err) {
    console.warn(`Failed to fetch session ${sessionId} from backend:`, err);
  }

  const local = loadLocalSessions().find((s) => s.id === sessionId);
  return local || null;
}

/**
 * Fetch rotating QR code token and SVG
 */
export async function getAttendanceQr(sessionId: string): Promise<RotatingQrTokenData> {
  try {
    const res = await apiGet<RotatingQrTokenData>(
      `/academic/attendance/sessions/${sessionId}/qr`,
    );
    if (res?.token) return res;
  } catch (err) {
    console.warn(`Failed to fetch live QR from backend for ${sessionId}:`, err);
  }

  // Local simulated rotating token calculation
  const stepSeconds = 20;
  const nowMs = Date.now();
  const windowIndex = Math.floor(nowMs / (stepSeconds * 1000));
  const pseudoToken = Math.abs((windowIndex * 2654435761) ^ 0x5f3759df)
    .toString(16)
    .padStart(8, '0')
    .slice(0, 8);
  const payload = `aut-att:${sessionId}:${pseudoToken}`;

  return {
    session_id: sessionId,
    token: pseudoToken,
    window_index: windowIndex,
    step_seconds: stepSeconds,
    valid_from: new Date(windowIndex * stepSeconds * 1000).toISOString(),
    valid_until: new Date((windowIndex + 1) * stepSeconds * 1000).toISOString(),
    qr_payload: payload,
    qr_svg: generateDeterministicQrSvg(payload),
  };
}

/**
 * Open a new attendance session (Teacher/Admin)
 */
export async function openAttendanceSession(
  params: OpenAttendanceSessionParams,
): Promise<AttendanceSessionInfo> {
  try {
    const res = await apiPost<any>('/academic/attendance/sessions', {
      room_id: params.room_id,
      meeting_id: params.meeting_id || null,
      token_step_seconds: params.token_step_seconds ?? 20,
      late_after_minutes: params.late_after_minutes ?? 20,
      expected_count: params.expected_count ?? 30,
    });
    if (res?.id) {
      return {
        id: res.id,
        meeting_id: res.meeting_id ?? null,
        room_id: res.room_id ?? params.room_id,
        opened_at: res.opened_at,
        closed_at: null,
        is_open: true,
        token_step_seconds: res.token_step_seconds,
        late_after_minutes: res.late_after_minutes,
        expected_count: res.expected_count,
        counts: { present: 0, late: 0, pending_review: 0, guest: 0, rejected: 0 },
        total_scans: 0,
        records: [],
      };
    }
  } catch (err) {
    console.warn('Failed to open attendance session on backend, creating local fallback:', err);
  }

  // Local demo fallback
  const newSession: AttendanceSessionInfo = {
    id: `local-session-${Date.now()}`,
    meeting_id: params.meeting_id || null,
    room_id: params.room_id,
    subject: `Active Class Session (${params.room_id.replace(/^room-/, '').toUpperCase()})`,
    teacher_label: 'Current Instructor',
    opened_at: new Date().toISOString(),
    closed_at: null,
    is_open: true,
    token_step_seconds: params.token_step_seconds ?? 20,
    late_after_minutes: params.late_after_minutes ?? 20,
    expected_count: params.expected_count ?? 30,
    counts: { present: 0, late: 0, pending_review: 0, guest: 0, rejected: 0 },
    total_scans: 0,
    records: [],
  };

  const current = loadLocalSessions();
  saveLocalSessions([newSession, ...current]);
  return newSession;
}

/**
 * Student scans/submits a QR attendance token
 */
export async function scanAttendanceQr(
  sessionId: string,
  params: ScanAttendanceParams,
): Promise<AttendanceScanResult> {
  try {
    const res = await apiPost<AttendanceScanResult>(
      `/academic/attendance/sessions/${sessionId}/scan`,
      {
        token: params.token,
        device_id: params.device_id || 'web-browser',
        latitude: params.latitude,
        longitude: params.longitude,
        geofence_enabled: Boolean(params.geofence_enabled),
      },
    );
    if (res?.record_id) {
      // Save to student check-in history
      saveLocalMyRecord({
        id: res.record_id,
        session_id: res.session_id,
        room_id: null,
        state: res.state,
        scanned_at: res.scanned_at,
        review_reason: res.review_reason,
      });
      return res;
    }
  } catch (err) {
    console.warn(`Backend scan failed for session ${sessionId}:`, err);
  }

  // Fallback local registration
  const sessions = loadLocalSessions();
  const session = sessions.find((s) => s.id === sessionId);
  const isLate = session
    ? Date.now() - new Date(session.opened_at).getTime() > (session.late_after_minutes || 20) * 60 * 1000
    : false;

  const state: 'present' | 'late' = isLate ? 'late' : 'present';
  const recordId = `scan-${Date.now()}`;
  const scannedAt = new Date().toISOString();

  if (session) {
    session.counts[state] = (session.counts[state] || 0) + 1;
    session.total_scans = (session.total_scans || 0) + 1;
    session.records = session.records || [];
    session.records.unshift({
      id: recordId,
      user_id: 'current-user',
      state,
      scanned_at: scannedAt,
    });
    saveLocalSessions(sessions);
  }

  const result: AttendanceScanResult = {
    record_id: recordId,
    session_id: sessionId,
    user_id: 'current-user',
    state,
    scanned_at: scannedAt,
    review_reason: isLate ? 'Scanned after late threshold' : null,
    is_late: isLate,
    counts_toward_occupancy: true,
  };

  saveLocalMyRecord({
    id: recordId,
    session_id: sessionId,
    room_id: session?.room_id || null,
    subject: session?.subject || 'Class Lecture',
    teacher_label: session?.teacher_label || null,
    group_label: session?.group_label || null,
    state,
    scanned_at: scannedAt,
  });

  return result;
}

/**
 * Teacher reviews a pending attendance scan (Approve/Reject)
 */
export async function reviewAttendanceRecord(
  recordId: string,
  decision: 'present' | 'late' | 'rejected',
  note?: string,
): Promise<void> {
  try {
    await apiPatch(`/academic/attendance/records/${recordId}/review`, {
      decision,
      note,
    });
    return;
  } catch (err) {
    console.warn(`Backend review failed for record ${recordId}:`, err);
  }

  // Fallback local update
  const sessions = loadLocalSessions();
  for (const s of sessions) {
    const rec = (s.records || []).find((r) => r.id === recordId);
    if (rec) {
      if (s.counts[rec.state] > 0) s.counts[rec.state]--;
      rec.state = decision;
      s.counts[decision] = (s.counts[decision] || 0) + 1;
      saveLocalSessions(sessions);
      break;
    }
  }
}

/**
 * Close an active attendance session
 */
export async function closeAttendanceSession(sessionId: string): Promise<void> {
  try {
    await apiPost(`/academic/attendance/sessions/${sessionId}/close`, {});
    return;
  } catch (err) {
    console.warn(`Backend close session failed for ${sessionId}:`, err);
  }

  // Fallback local update
  const sessions = loadLocalSessions();
  const session = sessions.find((s) => s.id === sessionId);
  if (session) {
    session.closed_at = new Date().toISOString();
    session.is_open = false;
    saveLocalSessions(sessions);
  }
}

/**
 * List the current student's check-in history
 */
export async function listMyAttendanceRecords(): Promise<StudentAttendanceRecord[]> {
  try {
    const res = await apiGet<{ count: number; records: StudentAttendanceRecord[] }>(
      '/academic/attendance/my-records',
    );
    if (res?.records && Array.isArray(res.records)) {
      return res.records;
    }
  } catch (err) {
    console.warn('Backend my-records unreachable, returning local records:', err);
  }
  return loadLocalMyRecords();
}
