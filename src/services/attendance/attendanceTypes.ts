export interface AttendanceSessionInfo {
  id: string;
  meeting_id: string | null;
  room_id: string | null;
  room_label?: string | null;
  subject?: string | null;
  teacher_label?: string | null;
  group_label?: string | null;
  opened_at: string;
  closed_at: string | null;
  is_open: boolean;
  token_step_seconds: number;
  late_after_minutes: number;
  expected_count: number | null;
  counts: {
    present: number;
    late: number;
    pending_review: number;
    guest: number;
    rejected: number;
  };
  total_scans: number;
  records?: AttendanceRecordItem[];
}

export interface AttendanceRecordItem {
  id: string;
  user_id: string | null;
  student_name?: string | null;
  student_id?: string | null;
  group_no?: string | null;
  department?: string | null;
  state: 'present' | 'late' | 'pending_review' | 'guest' | 'rejected';
  scanned_at: string;
  review_reason?: string | null;
}

export interface StudentAttendanceRecord {
  id: string;
  session_id: string;
  user_id?: string | null;
  room_id: string | null;
  room_label?: string | null;
  subject?: string | null;
  teacher_label?: string | null;
  group_label?: string | null;
  state: 'present' | 'late' | 'pending_review' | 'guest' | 'rejected';
  scanned_at: string;
  review_reason?: string | null;
}

export interface RotatingQrTokenData {
  session_id: string;
  token: string;
  window_index: number;
  step_seconds: number;
  valid_from: string;
  valid_until: string;
  qr_payload: string;
  qr_svg?: string;
}

export interface AttendanceScanResult {
  record_id: string;
  session_id: string;
  user_id: string;
  state: 'present' | 'late' | 'pending_review' | 'guest' | 'rejected';
  scanned_at: string;
  review_reason?: string | null;
  is_late: boolean;
  counts_toward_occupancy: boolean;
  room_id?: string | null;
  room_label?: string | null;
  subject?: string | null;
  teacher_label?: string | null;
  group_label?: string | null;
  student_name?: string | null;
  student_id?: string | null;
  group_no?: string | null;
}

export interface OpenAttendanceSessionParams {
  room_id: string;
  room_label?: string | null;
  subject?: string | null;
  group_label?: string | null;
  meeting_id?: string | null;
  token_step_seconds?: number;
  late_after_minutes?: number;
  expected_count?: number | null;
}

export interface ScanAttendanceParams {
  token: string;
  session_id?: string | null;
  device_id?: string;
  latitude?: number;
  longitude?: number;
  geofence_enabled?: boolean;
}
