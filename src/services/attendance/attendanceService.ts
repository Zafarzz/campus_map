import QRCode from 'qrcode';
import { ApiError, apiGet, apiPatch, apiPost, isBackendEnabled } from '../api/apiClient';
import { getStoredUser } from '../auth/authService';
import { getJsonStorageItem, getRawStorageItem, setJsonStorageItem } from '../storage/localStore';
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
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Seed demo sessions when localStorage is empty
const INITIAL_DEMO_SESSIONS: AttendanceSessionInfo[] = [
  {
    id: 'demo-session-a101',
    meeting_id: null,
    room_id: 'room-a-101',
    room_label: 'A-101 · Lecture Hall (Block A)',
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
      present: 2,
      late: 1,
      pending_review: 1,
      guest: 0,
      rejected: 0,
    },
    total_scans: 4,
    records: [
      {
        id: 'rec-1',
        user_id: 'user-robiyaxon',
        student_name: 'KADIROVA ROBIYAXON SHOIRJON QIZI',
        student_id: '202590207',
        group_no: 'I25D',
        department: 'Electrical and Computer Engineering',
        state: 'present',
        scanned_at: new Date(Date.now() - 9 * 60 * 1000).toISOString(),
      },
      {
        id: 'rec-2',
        user_id: 'user-munisa',
        student_name: 'TURSUNOVA MUNISA ANVAR QIZI',
        student_id: '202590112',
        group_no: 'I25C',
        department: 'Electrical and Computer Engineering',
        state: 'present',
        scanned_at: new Date(Date.now() - 8 * 60 * 1000).toISOString(),
      },
      {
        id: 'rec-3',
        user_id: 'user-bobur',
        student_name: 'KARIMOV BOBURJON RUSTAM O‘G‘LI',
        student_id: '202590145',
        group_no: 'I25D',
        department: 'Electrical and Computer Engineering',
        state: 'late',
        scanned_at: new Date(Date.now() - 2 * 60 * 1000).toISOString(),
        review_reason: 'Scan after 15m late threshold',
      },
      {
        id: 'rec-4',
        user_id: 'user-guest-99',
        student_name: 'ISLOMOV JAVOHIRBEK BAXTIYOR O‘G‘LI',
        student_id: '202590188',
        group_no: 'I25B',
        department: 'Architecture',
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
    room_label: 'C-201 · Conference Hall (Block C)',
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
      present: 2,
      late: 0,
      pending_review: 0,
      guest: 0,
      rejected: 0,
    },
    total_scans: 2,
    records: [
      {
        id: 'rec-c201-1',
        user_id: 'user-munisa',
        student_name: 'TURSUNOVA MUNISA ANVAR QIZI',
        student_id: '202590112',
        group_no: 'I25C',
        department: 'Electrical and Computer Engineering',
        state: 'present',
        scanned_at: new Date(Date.now() - 4 * 60 * 1000).toISOString(),
      },
      {
        id: 'rec-c201-2',
        user_id: 'user-2',
        student_name: 'ABDULLAYEV SARDORBEK ULUG‘BEK O‘G‘LI',
        student_id: '202590104',
        group_no: 'I25C',
        department: 'Electrical and Computer Engineering',
        state: 'present',
        scanned_at: new Date(Date.now() - 3 * 60 * 1000).toISOString(),
      },
    ],
  },
];

function loadLocalSessions(): AttendanceSessionInfo[] {
  const raw = getRawStorageItem(STORAGE_SESSIONS_KEY);
  if (!raw) {
    setJsonStorageItem(STORAGE_SESSIONS_KEY, INITIAL_DEMO_SESSIONS);
    return INITIAL_DEMO_SESSIONS;
  }
  return getJsonStorageItem<AttendanceSessionInfo[]>(STORAGE_SESSIONS_KEY, INITIAL_DEMO_SESSIONS);
}

function saveLocalSessions(sessions: AttendanceSessionInfo[]) {
  setJsonStorageItem(STORAGE_SESSIONS_KEY, sessions);
}

function loadLocalMyRecords(): StudentAttendanceRecord[] {
  const all = getJsonStorageItem<StudentAttendanceRecord[]>(STORAGE_MY_RECORDS_KEY, []);
  const currentUser = getStoredUser();
  if (!currentUser?.user_id) {
    return all;
  }
  return all.filter((r) => !r.user_id || r.user_id === currentUser.user_id);
}

function saveLocalMyRecord(record: StudentAttendanceRecord) {
  const currentUser = getStoredUser();
  const enrichedRecord: StudentAttendanceRecord = {
    ...record,
    user_id: record.user_id || currentUser?.user_id || null,
  };
  const existing = getJsonStorageItem<StudentAttendanceRecord[]>(STORAGE_MY_RECORDS_KEY, []).filter(
    (r) =>
      r.id !== enrichedRecord.id &&
      !(r.session_id === enrichedRecord.session_id && r.user_id === enrichedRecord.user_id),
  );
  existing.unshift(enrichedRecord);
  setJsonStorageItem(STORAGE_MY_RECORDS_KEY, existing.slice(0, 100));
}

function computeLocalWindowToken(sessionId: string, windowIndex: number): string {
  let sessionHash = 0;
  for (let i = 0; i < sessionId.length; i++) {
    sessionHash = (sessionHash * 31 + sessionId.charCodeAt(i)) | 0;
  }
  return Math.abs(((windowIndex * 2654435761) ^ 0x5f3759df ^ sessionHash) | 0)
    .toString(16)
    .padStart(8, '0')
    .slice(0, 8);
}

/**
 * Generate a real ISO-18004 scannable SVG QR code for any payload string.
 */
export function generateDeterministicQrSvg(payload: string): string {
  try {
    const qr = QRCode.create(payload || 'aut-att:default:00000000', {
      errorCorrectionLevel: 'M',
    });
    const size = qr.modules.size;
    const moduleSize = 8;
    const padding = 24;
    const totalDim = size * moduleSize + padding * 2;

    let rects = '';
    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        if (qr.modules.get(r, c)) {
          const x = padding + c * moduleSize;
          const y = padding + r * moduleSize;
          rects += `<rect x="${x}" y="${y}" width="${moduleSize}" height="${moduleSize}" fill="#1e293b"/>`;
        }
      }
    }

    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${totalDim} ${totalDim}" width="100%" height="100%" style="background:#ffffff;border-radius:12px;">${rects}</svg>`;
  } catch {
    const totalDim = 200;
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${totalDim} ${totalDim}" width="100%" height="100%" style="background:#ffffff;border-radius:12px;"><rect x="20" y="20" width="56" height="56" fill="#1e293b"/></svg>`;
  }
}

/**
 * List active or past attendance sessions
 */
export async function listAttendanceSessions(
  status: 'open' | 'closed' | 'all' = 'all',
  roomId?: string,
  token?: string | null,
): Promise<AttendanceSessionInfo[]> {
  if (isBackendEnabled) {
    try {
      const queryParams: Record<string, string | undefined> = {
        status: status !== 'all' ? status : undefined,
        room_id: roomId || undefined,
      };

      const res = await apiGet<{ count: number; sessions: AttendanceSessionInfo[] }>(
        '/academic/attendance/sessions',
        queryParams,
        undefined,
        token,
      );
      if (res?.sessions && Array.isArray(res.sessions)) {
        // Also merge any locally created fallback sessions so nothing is lost
        const localCustom = loadLocalSessions().filter((s) => s.id.startsWith('local-session-'));
        let merged = [...res.sessions];
        for (const loc of localCustom) {
          if (!merged.some((m) => m.id === loc.id)) {
            merged.push(loc);
          }
        }
        if (status === 'open') {
          merged = merged.filter((s) => s.is_open);
        } else if (status === 'closed') {
          merged = merged.filter((s) => !s.is_open);
        }
        if (roomId) {
          merged = merged.filter((s) => s.room_id === roomId);
        }
        return merged;
      }
    } catch {
      // Fallback to local store when backend is unreachable
    }
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
export async function getAttendanceSession(
  sessionId: string,
  token?: string | null,
): Promise<AttendanceSessionInfo | null> {
  if (isBackendEnabled && UUID_REGEX.test(sessionId)) {
    try {
      const res = await apiGet<AttendanceSessionInfo>(
        `/academic/attendance/sessions/${sessionId}`,
        undefined,
        undefined,
        token,
      );
      if (res?.id) {
        return {
          ...res,
          is_open: res.is_open ?? res.closed_at === null,
        };
      }
    } catch {
      // Fallback to local store
    }
  }

  const local = loadLocalSessions().find((s) => s.id === sessionId);
  return local || null;
}

/**
 * Fetch rotating QR code token and SVG
 */
export async function getAttendanceQr(
  sessionId: string,
  token?: string | null,
): Promise<RotatingQrTokenData> {
  if (isBackendEnabled && UUID_REGEX.test(sessionId)) {
    try {
      const res = await apiGet<RotatingQrTokenData>(
        `/academic/attendance/sessions/${sessionId}/qr`,
        undefined,
        undefined,
        token,
      );
      if (res?.token) {
        return {
          ...res,
          qr_svg: res.qr_svg || generateDeterministicQrSvg(res.qr_payload),
        };
      }
    } catch {
      // Fallback to local simulated rotating token
    }
  }

  const localSession = loadLocalSessions().find((s) => s.id === sessionId);
  const stepSeconds = localSession?.token_step_seconds || 20;
  const nowMs = Date.now();
  const windowIndex = Math.floor(nowMs / (stepSeconds * 1000));
  const pseudoToken = computeLocalWindowToken(sessionId, windowIndex);
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

interface OpenAttendanceSessionResponse {
  id: string;
  meeting_id?: string | null;
  room_id?: string | null;
  room_label?: string | null;
  subject?: string | null;
  group_label?: string | null;
  teacher_label?: string | null;
  opened_at: string;
  token_step_seconds: number;
  late_after_minutes: number;
  expected_count: number;
}

/**
 * Open a new attendance session (Teacher/Admin)
 */
export async function openAttendanceSession(
  params: OpenAttendanceSessionParams,
  token?: string | null,
): Promise<AttendanceSessionInfo> {
  const currentUser = getStoredUser();
  const fallbackSubject =
    params.subject?.trim() ||
    `Active Class Session (${(params.room_label || params.room_id).replace(/^room-/, '').toUpperCase()})`;

  if (isBackendEnabled) {
    try {
      const res = await apiPost<OpenAttendanceSessionResponse>(
        '/academic/attendance/sessions',
        {
          room_id: params.room_id,
          room_label: params.room_label || null,
          subject: fallbackSubject,
          group_label: params.group_label || null,
          meeting_id: params.meeting_id || null,
          token_step_seconds: params.token_step_seconds ?? 20,
          late_after_minutes: params.late_after_minutes ?? 20,
          expected_count: params.expected_count ?? 30,
        },
        undefined,
        token,
      );
      if (res?.id) {
        return {
          id: res.id,
          meeting_id: res.meeting_id ?? null,
          room_id: res.room_id ?? params.room_id,
          room_label: res.room_label ?? params.room_label ?? params.room_id,
          subject: res.subject ?? fallbackSubject,
          group_label: res.group_label ?? params.group_label ?? null,
          teacher_label: res.teacher_label ?? currentUser?.display_name ?? 'Instructor',
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
    } catch {
      // Fallback to local session creation when backend is offline
    }
  }

  // Local demo fallback
  const newSession: AttendanceSessionInfo = {
    id: `local-session-${Date.now()}`,
    meeting_id: params.meeting_id || null,
    room_id: params.room_id,
    room_label: params.room_label || params.room_id,
    subject: fallbackSubject,
    group_label: params.group_label || null,
    teacher_label: currentUser?.display_name || 'Current Instructor',
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
  token?: string | null,
): Promise<AttendanceScanResult> {
  const currentUser = getStoredUser();
  let cleanSessionId = (sessionId || params.session_id || '').trim();
  let cleanToken = params.token.trim();

  if (cleanToken.startsWith('aut-att:')) {
    const parts = cleanToken.split(':');
    if (parts.length >= 3) {
      cleanSessionId = parts[1].trim();
      cleanToken = parts.slice(2).join(':').trim();
    }
  }

  if (isBackendEnabled) {
    try {
      const isUuidSession = UUID_REGEX.test(cleanSessionId);
      const endpoint = isUuidSession
        ? `/academic/attendance/sessions/${cleanSessionId}/scan`
        : '/academic/attendance/scan';

      const res = await apiPost<AttendanceScanResult>(
        endpoint,
        {
          token: cleanToken,
          ...(isUuidSession ? { session_id: cleanSessionId } : {}),
          device_id: params.device_id || 'web-browser',
          latitude: params.latitude,
          longitude: params.longitude,
          geofence_enabled: Boolean(params.geofence_enabled),
        },
        undefined,
        token,
      );
      if (res?.record_id) {
        saveLocalMyRecord({
          id: res.record_id,
          session_id: res.session_id,
          user_id: currentUser?.user_id || res.user_id,
          room_id: res.room_id || null,
          room_label: res.room_label || res.room_id || null,
          subject: res.subject || 'Class Lecture Session',
          teacher_label: res.teacher_label || null,
          group_label: res.group_label || currentUser?.group_no || null,
          state: res.state,
          scanned_at: res.scanned_at,
          review_reason: res.review_reason,
        });
        return res;
      }
    } catch (err) {
      // Rethrow explicit validation / duplicate / closed-session errors from the backend
      if (err instanceof ApiError && err.status !== undefined && [400, 401, 403, 409, 422].includes(err.status)) {
        // Only fall through to local sessions if the session is explicitly a local/demo session
        const isLocalOrDemo =
          cleanSessionId.startsWith('local-session-') || cleanSessionId.startsWith('demo-session-');
        if (!isLocalOrDemo) {
          throw err;
        }
      }
    }
  }

  // Fallback local registration
  const sessions = loadLocalSessions();
  let session = sessions.find((s) => s.id === cleanSessionId);

  // If token-only check-in in local mode, match open session by rotating token
  if (!session || !cleanSessionId) {
    const nowMs = Date.now();
    const matched = sessions.find((s) => {
      if (!s.is_open) return false;
      const step = s.token_step_seconds || 20;
      const win = Math.floor(nowMs / (step * 1000));
      return (
        computeLocalWindowToken(s.id, win) === cleanToken ||
        computeLocalWindowToken(s.id, win - 1) === cleanToken
      );
    });
    if (matched) {
      session = matched;
      cleanSessionId = matched.id;
    }
  }

  const isLate = session
    ? Date.now() - new Date(session.opened_at).getTime() >
      (session.late_after_minutes || 20) * 60 * 1000
    : false;

  const state: 'present' | 'late' = isLate ? 'late' : 'present';
  const recordId = `scan-${Date.now()}`;
  const scannedAt = new Date().toISOString();
  const resolvedUserId = currentUser?.user_id || 'current-user';
  const resolvedStudentName = currentUser?.display_name || 'Student';
  const resolvedStudentId = currentUser?.student_id || currentUser?.email || null;
  const resolvedGroupNo = currentUser?.group_no || session?.group_label || null;

  if (session) {
    const alreadyInSession = (session.records || []).some(
      (r) =>
        (r.user_id && r.user_id === resolvedUserId) ||
        (resolvedStudentId && r.student_id === resolvedStudentId),
    );
    if (!alreadyInSession) {
      session.counts[state] = (session.counts[state] || 0) + 1;
      session.total_scans = (session.total_scans || 0) + 1;
      session.records = session.records || [];
      const newRecordItem: AttendanceRecordItem = {
        id: recordId,
        user_id: resolvedUserId,
        student_name: resolvedStudentName,
        student_id: resolvedStudentId,
        group_no: resolvedGroupNo,
        department: currentUser?.department || null,
        state,
        scanned_at: scannedAt,
      };
      session.records.unshift(newRecordItem);
      saveLocalSessions(sessions);
    }
  }

  const result: AttendanceScanResult = {
    record_id: recordId,
    session_id: cleanSessionId,
    user_id: resolvedUserId,
    state,
    scanned_at: scannedAt,
    review_reason: isLate ? 'Scanned after late threshold' : null,
    is_late: isLate,
    counts_toward_occupancy: true,
    room_id: session?.room_id || null,
    room_label: session?.room_label || session?.room_id || null,
    subject: session?.subject || 'Class Lecture',
    teacher_label: session?.teacher_label || null,
    group_label: resolvedGroupNo,
    student_name: resolvedStudentName,
    student_id: resolvedStudentId,
    group_no: resolvedGroupNo,
  };

  saveLocalMyRecord({
    id: recordId,
    session_id: cleanSessionId,
    user_id: resolvedUserId,
    room_id: session?.room_id || null,
    room_label: session?.room_label || session?.room_id || null,
    subject: session?.subject || 'Class Lecture',
    teacher_label: session?.teacher_label || null,
    group_label: resolvedGroupNo,
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
  token?: string | null,
): Promise<void> {
  if (isBackendEnabled && UUID_REGEX.test(recordId)) {
    try {
      await apiPatch(
        `/academic/attendance/records/${recordId}/review`,
        {
          decision,
          note,
        },
        undefined,
        token,
      );
      return;
    } catch {
      // Fallback local update
    }
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
export async function closeAttendanceSession(
  sessionId: string,
  token?: string | null,
): Promise<void> {
  if (isBackendEnabled && UUID_REGEX.test(sessionId)) {
    try {
      await apiPost(`/academic/attendance/sessions/${sessionId}/close`, {}, undefined, token);
      return;
    } catch {
      // Fallback local update
    }
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
export async function listMyAttendanceRecords(
  token?: string | null,
): Promise<StudentAttendanceRecord[]> {
  const localRecords = loadLocalMyRecords();

  if (isBackendEnabled) {
    try {
      const res = await apiGet<{ count: number; records: StudentAttendanceRecord[] }>(
        '/academic/attendance/my-records',
        undefined,
        undefined,
        token,
      );
      if (res?.records && Array.isArray(res.records)) {
        const merged = [...res.records];
        for (const loc of localRecords) {
          const exists = merged.some(
            (r) => r.id === loc.id || (r.session_id && r.session_id === loc.session_id),
          );
          if (!exists) {
            merged.push(loc);
          }
        }
        return merged.sort(
          (a, b) => new Date(b.scanned_at).getTime() - new Date(a.scanned_at).getTime(),
        );
      }
    } catch {
      // Fallback to local records
    }
  }
  return localRecords;
}
