import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import jsQR from 'jsqr';
import { useAuth } from '../../state/AuthContext';
import { useMap } from '../../state/MapProvider';
import {
  AlertIcon,
  BriefcaseIcon,
  CameraIcon,
  CampusIcon,
  CheckCircleIcon,
  CheckIcon,
  ChevronDownIcon,
  ClockIcon,
  CloseIcon,
  GraduationIcon,
  MapNavIcon,
  QrCodeIcon,
  RefreshIcon,
  UsersIcon,
} from '../auth/AuthIcons';
import {
  closeAttendanceSession,
  doesStudentMatchSessionGroups,
  getAttendanceQr,
  getAttendanceSession,
  listAttendanceSessions,
  listMyAttendanceRecords,
  openAttendanceSession,
  reviewAttendanceRecord,
  scanAttendanceQr,
} from '../../services/attendance/attendanceService';
import type {
  AttendanceRecordItem,
  AttendanceScanResult,
  AttendanceSessionInfo,
  RotatingQrTokenData,
  StudentAttendanceRecord,
} from '../../services/attendance/attendanceTypes';
import './attendance.css';

interface AttendanceViewProps {
  onBackToMap: () => void;
}

type AttendanceTab = 'student' | 'history' | 'teacher' | 'stats';

const ACADEMIC_BUILDINGS: {
  id: string;
  code: string;
  name: string;
  subtitle: string;
  accent: string;
  bgTint: string;
}[] = [
  {
    id: 'ALL',
    code: 'ALL',
    name: 'All Buildings',
    subtitle: 'All academic blocks & facilities',
    accent: '#1b1c20',
    bgTint: 'rgba(20, 24, 35, 0.06)',
  },
  {
    id: 'bld-h',
    code: 'A',
    name: 'Block A',
    subtitle: 'Engineering & Technology',
    accent: '#2563eb',
    bgTint: 'rgba(37, 99, 235, 0.1)',
  },
  {
    id: 'bld-g',
    code: 'B',
    name: 'Block B',
    subtitle: 'Architecture & Science',
    accent: '#7c3aed',
    bgTint: 'rgba(124, 58, 237, 0.1)',
  },
  {
    id: 'bld-i',
    code: 'C',
    name: 'Block C',
    subtitle: 'Conference Hall & Studios',
    accent: '#d97706',
    bgTint: 'rgba(217, 119, 6, 0.1)',
  },
  {
    id: 'bld-c',
    code: 'D',
    name: 'Block D',
    subtitle: 'Civil Engineering Labs',
    accent: '#0284c7',
    bgTint: 'rgba(2, 132, 199, 0.1)',
  },
  {
    id: 'bld-b',
    code: 'E',
    name: 'Block E',
    subtitle: 'Architecture & Design Studios',
    accent: '#0d9488',
    bgTint: 'rgba(13, 148, 136, 0.1)',
  },
  {
    id: 'bld-d',
    code: 'F',
    name: 'Block F',
    subtitle: 'Library & Lecture Halls',
    accent: '#4f46e5',
    bgTint: 'rgba(79, 70, 229, 0.1)',
  },
  {
    id: 'bld-e',
    code: 'H',
    name: 'Halls',
    subtitle: 'Event Halls & Auditorium',
    accent: '#059669',
    bgTint: 'rgba(5, 150, 105, 0.1)',
  },
];

const BUILDING_LABELS: Record<string, string> = {
  'bld-h': 'Block A',
  'bld-g': 'Block B',
  'bld-i': 'Block C',
  'bld-c': 'Block D',
  'bld-b': 'Block E',
  'bld-d': 'Block F',
  'bld-e': 'Halls',
};

const BUILDING_ORDER: Record<string, number> = {
  'bld-h': 1,
  'bld-g': 2,
  'bld-i': 3,
  'bld-c': 4,
  'bld-b': 5,
  'bld-d': 6,
  'bld-e': 7,
};

const KNOWN_EXCLUDED_ROOM_IDS = new Set([
  'room-canteen',
  'bld-i-f1-wc',
  'bld-i-f1-stairs',
  'bld-i-f1-foyer',
  'bld-d-f1-f101',
  'bld-h-f1-a105',
  'bld-h-f1-a107',
  'bld-g-f1-lobby',
  'bld-g-f2-lobby',
  'bld-b-f1-lobby',
  'bld-b-f2-lobby',
  'bld-b-f1-e105',
  'bld-b-f2-e205',
  'bld-g-f1-wc-m',
  'bld-g-f1-wc-f',
  'bld-g-f2-wc-m',
  'bld-g-f2-wc-f',
  'bld-g-f3-r2',
  'bld-g-f3-r5',
  'bld-g-f4-r2',
  'bld-g-f4-r5',
]);

function isRawRoomIdentifier(val?: string | null): boolean {
  if (!val) return true;
  const trimmed = val.trim();
  return /^(bld-[a-z0-9-]+|room-[a-z0-9-]+)$/i.test(trimmed);
}

function isNonTeachingSpaceText(text: string): boolean {
  const s = text.toLowerCase();
  return (
    s.includes('toilet') ||
    s.includes('restroom') ||
    s.includes('wc') ||
    s.includes('washroom') ||
    s.includes('lavatory') ||
    s.includes('canteen') ||
    s.includes('cafeteria') ||
    s.includes('dining') ||
    s.includes('library') ||
    s.includes('reading') ||
    s.includes('office') ||
    s.includes('dean') ||
    s.includes('rector') ||
    s.includes('accounting') ||
    s.includes('admission') ||
    s.includes('lobby') ||
    s.includes('foyer') ||
    s.includes('stairs') ||
    s.includes('corridor') ||
    s.includes('storage') ||
    s.includes('dorm')
  );
}

interface AcademicRoomOption {
  id: string;
  buildingId: string;
  buildingName: string;
  floorNumber: number;
  roomNumber: string;
  roomName: string;
  displayName: string;
  capacity?: number;
  kind: string;
}

export function AttendanceView({ onBackToMap }: AttendanceViewProps) {
  const { user, openLogin } = useAuth();
  const { index, selectRoom } = useMap();

  const currentUserKey = user?.user_id || user?.student_id || user?.email || 'guest';

  const isTeacherOrAdmin = Boolean(
    user &&
      (user.is_admin ||
        user.account_type === 'staff' ||
        user.roles?.some((r) => r === 'teacher' || r === 'staff' || r === 'admin') ||
        user.effective_roles?.some((r) => r === 'teacher' || r === 'staff' || r === 'admin')),
  );

  const [activeTab, setActiveTab] = useState<AttendanceTab>(() =>
    isTeacherOrAdmin ? 'teacher' : 'student',
  );

  // Enforce strict role separation between Student tabs and Teacher tabs
  useEffect(() => {
    if (isTeacherOrAdmin) {
      if (activeTab === 'student' || activeTab === 'history') {
        setActiveTab('teacher');
      }
    } else {
      if (activeTab === 'teacher' || activeTab === 'stats') {
        setActiveTab('student');
      }
    }
  }, [isTeacherOrAdmin, activeTab]);

  const [sessions, setSessions] = useState<AttendanceSessionInfo[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState<string>('');
  const [activeTeacherSession, setActiveTeacherSession] = useState<AttendanceSessionInfo | null>(
    null,
  );
  const [selectedStatsSessionId, setSelectedStatsSessionId] = useState<string>('');
  const [statsSessionDetail, setStatsSessionDetail] = useState<AttendanceSessionInfo | null>(null);
  const [statsSearchQuery, setStatsSearchQuery] = useState<string>('');
  const [statsGroupFilter, setStatsGroupFilter] = useState<string>('ALL');
  const [statsSessionStatusFilter, setStatsSessionStatusFilter] = useState<'ALL' | 'CLOSED' | 'OPEN'>('ALL');

  const [currentQr, setCurrentQr] = useState<RotatingQrTokenData | null>(null);
  const [qrRemainingSeconds, setQrRemainingSeconds] = useState<number>(20);
  const [myRecords, setMyRecords] = useState<StudentAttendanceRecord[]>([]);

  // Scan input states
  const [tokenInput, setTokenInput] = useState<string>('');
  const [isSubmittingScan, setIsSubmittingScan] = useState<boolean>(false);
  const [scanResult, setScanResult] = useState<AttendanceScanResult | null>(null);
  const [scanError, setScanError] = useState<string | null>(null);

  // Camera scanner states
  const [isCameraActive, setIsCameraActive] = useState<boolean>(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const scanCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const isDecodingFrameRef = useRef<boolean>(false);
  const photoInputRef = useRef<HTMLInputElement | null>(null);

  // Teacher open session form
  const [selectedBuildingFilter, setSelectedBuildingFilter] = useState<string>('ALL');
  const [isBuildingMenuOpen, setIsBuildingMenuOpen] = useState<boolean>(false);
  const [isRoomMenuOpen, setIsRoomMenuOpen] = useState<boolean>(false);
  const [roomSearchQuery, setRoomSearchQuery] = useState<string>('');
  const buildingMenuRef = useRef<HTMLDivElement | null>(null);
  const roomMenuRef = useRef<HTMLDivElement | null>(null);
  const [formRoomId, setFormRoomId] = useState<string>('');
  const [formSubject, setFormSubject] = useState<string>('');
  const [formSelectedGroups, setFormSelectedGroups] = useState<string[]>([]);
  const [formCustomGroupInput, setFormCustomGroupInput] = useState<string>('');
  const [formExpectedCount, setFormExpectedCount] = useState<number>(30);
  const [formLateAfter, setFormLateAfter] = useState<number>(15);
  const [formStepSeconds, setFormStepSeconds] = useState<number>(20);
  const [isCreatingSession, setIsCreatingSession] = useState<boolean>(false);

  // Close building / room dropdowns when clicking outside
  useEffect(() => {
    if (!isBuildingMenuOpen && !isRoomMenuOpen) return;
    const handleClickOutside = (event: MouseEvent) => {
      if (
        isBuildingMenuOpen &&
        buildingMenuRef.current &&
        !buildingMenuRef.current.contains(event.target as Node)
      ) {
        setIsBuildingMenuOpen(false);
      }
      if (
        isRoomMenuOpen &&
        roomMenuRef.current &&
        !roomMenuRef.current.contains(event.target as Node)
      ) {
        setIsRoomMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isBuildingMenuOpen, isRoomMenuOpen]);

  // Fullscreen projector mode
  const [isProjectorOpen, setIsProjectorOpen] = useState<boolean>(false);

  // Curated academic classrooms, labs & lecture halls (organized like Booking Rooms, excluding Dormitory & non-teaching buildings)
  const availableRooms = useMemo<AcademicRoomOption[]>(() => {
    const list: AcademicRoomOption[] = [];
    index.rooms.forEach((loc) => {
      const bldId = loc.building.id;
      // Exclude Dormitory (bld-j), North Building (bld-a), Block F Annexes (bld-f), etc.
      if (!BUILDING_LABELS[bldId]) return;
      if (KNOWN_EXCLUDED_ROOM_IDS.has(loc.room.id)) return;

      const kind = loc.room.kind || 'classroom';
      if (kind !== 'classroom' && kind !== 'lab' && kind !== 'hall') return;

      const roomNumber = (loc.room.number || '').trim();
      const roomName = (loc.room.name || '').trim();
      // Exclude unnamed procedural placeholder rooms (e.g. bld-a-f1-r1)
      if (!roomNumber && !roomName) return;

      if (
        isNonTeachingSpaceText(loc.room.id) ||
        isNonTeachingSpaceText(roomNumber) ||
        isNonTeachingSpaceText(roomName)
      ) {
        return;
      }

      const kindLabel =
        kind === 'hall' ? 'Lecture Hall' : kind === 'lab' ? 'Laboratory' : 'Classroom';

      let displayName = '';
      if (roomNumber && roomName) {
        if (roomName.toLowerCase().startsWith(roomNumber.toLowerCase())) {
          displayName = roomName;
        } else {
          displayName = `${roomNumber} · ${roomName}`;
        }
      } else if (roomNumber) {
        displayName = `${roomNumber} · ${kindLabel}`;
      } else {
        displayName = roomName;
      }

      list.push({
        id: loc.room.id,
        buildingId: bldId,
        buildingName: BUILDING_LABELS[bldId],
        floorNumber: loc.floor.level || 1,
        roomNumber,
        roomName,
        displayName,
        capacity: loc.room.capacity,
        kind,
      });
    });

    return list.sort((a, b) => {
      const orderDiff = (BUILDING_ORDER[a.buildingId] || 99) - (BUILDING_ORDER[b.buildingId] || 99);
      if (orderDiff !== 0) return orderDiff;
      if (a.floorNumber !== b.floorNumber) return a.floorNumber - b.floorNumber;
      return a.displayName.localeCompare(b.displayName, undefined, { numeric: true });
    });
  }, [index]);

  const filteredRoomsForSelector = useMemo(() => {
    if (selectedBuildingFilter === 'ALL') return availableRooms;
    return availableRooms.filter((r) => r.buildingId === selectedBuildingFilter);
  }, [availableRooms, selectedBuildingFilter]);

  const activeBuildingOption = useMemo(
    () =>
      ACADEMIC_BUILDINGS.find((b) => b.id === selectedBuildingFilter) || ACADEMIC_BUILDINGS[0],
    [selectedBuildingFilter],
  );

  const selectedRoomOption = useMemo(
    () =>
      filteredRoomsForSelector.find((r) => r.id === formRoomId) ||
      availableRooms.find((r) => r.id === formRoomId) ||
      filteredRoomsForSelector[0] ||
      null,
    [filteredRoomsForSelector, availableRooms, formRoomId],
  );

  const searchableRoomsForMenu = useMemo(() => {
    const q = roomSearchQuery.trim().toLowerCase();
    if (!q) return filteredRoomsForSelector;
    return filteredRoomsForSelector.filter(
      (r) =>
        r.displayName.toLowerCase().includes(q) ||
        r.buildingName.toLowerCase().includes(q) ||
        r.roomNumber.toLowerCase().includes(q) ||
        r.roomName.toLowerCase().includes(q),
    );
  }, [filteredRoomsForSelector, roomSearchQuery]);

  // Ensure formRoomId always points to a valid room in the current building filter
  useEffect(() => {
    if (filteredRoomsForSelector.length === 0) return;
    if (!formRoomId || !filteredRoomsForSelector.some((r) => r.id === formRoomId)) {
      setFormRoomId(filteredRoomsForSelector[0].id);
    }
  }, [filteredRoomsForSelector, formRoomId]);

  const formatRoomDisplay = useCallback(
    (roomId?: string | null, roomLabel?: string | null) => {
      if (roomLabel && !isRawRoomIdentifier(roomLabel)) {
        return roomLabel;
      }
      const lookupId = (roomId || roomLabel || '').trim();
      if (!lookupId) return 'Campus Classroom';

      const found = availableRooms.find((r) => r.id === lookupId);
      if (found) {
        return `${found.displayName} (${found.buildingName})`;
      }

      const loc = index.rooms.get(lookupId);
      if (loc) {
        const bldName = BUILDING_LABELS[loc.building.id] || loc.building.name;
        const num = (loc.room.number || '').trim();
        const nm = (loc.room.name || '').trim();
        if (num && nm) return `${num} · ${nm} (${bldName})`;
        if (num) return `Room ${num} (${bldName})`;
        if (nm) return `${nm} (${bldName})`;
      }

      // Parse legacy raw IDs like bld-c-f1-d102 into "Room D-102 (Block D)"
      const bldMatch = lookupId.match(/^bld-([a-z])-f(\d+)-([a-z0-9-]+)$/i);
      if (bldMatch) {
        const bldKey = `bld-${bldMatch[1].toLowerCase()}`;
        const bldLabel = BUILDING_LABELS[bldKey] || `Block ${bldMatch[1].toUpperCase()}`;
        const rawCode = bldMatch[3].toUpperCase().replace(/^([A-Z])(\d+)$/, '$1-$2');
        return `Room ${rawCode} (${bldLabel})`;
      }

      return lookupId.replace(/^room-/i, '').toUpperCase();
    },
    [availableRooms, index],
  );

  const formatSessionTitle = useCallback(
    (sess: { subject?: string | null; room_id?: string | null; room_label?: string | null }) => {
      const subj = (sess.subject || '').trim();
      if (
        subj &&
        !isRawRoomIdentifier(subj) &&
        !/^Active Class Session \(BLD-/i.test(subj)
      ) {
        return subj;
      }
      return `Lecture · ${formatRoomDisplay(sess.room_id, sess.room_label)}`;
    },
    [formatRoomDisplay],
  );

  // Load all sessions
  const loadSessionsData = useCallback(async () => {
    const list = await listAttendanceSessions('all');
    setSessions(list);
    const openSessions = list.filter((s) => s.is_open && !s.closed_at);

    setSelectedSessionId((prev) => {
      if (prev && openSessions.some((s) => s.id === prev)) {
        return prev;
      }
      return openSessions[0]?.id || '';
    });

    if (list.length > 0) {
      setSelectedStatsSessionId((prev) => {
        if (prev && list.some((s) => s.id === prev)) return prev;
        return openSessions[0]?.id || list[0].id;
      });
    }
  }, []);

  // Load student check-in history (isolated per user)
  const loadMyRecordsData = useCallback(async () => {
    const list = await listMyAttendanceRecords();
    setMyRecords(list);
  }, []);

  // Whenever the signed-in user changes, immediately clear previous user's state & reload
  useEffect(() => {
    setScanResult(null);
    setScanError(null);
    setTokenInput('');
    setMyRecords([]);
    loadSessionsData();
    if (!isTeacherOrAdmin) {
      loadMyRecordsData();
    }
  }, [currentUserKey, isTeacherOrAdmin, loadSessionsData, loadMyRecordsData]);

  // Student live polling: refresh open sessions every 3s & on window focus so closed sessions disappear immediately
  useEffect(() => {
    if (isTeacherOrAdmin || activeTab !== 'student') return;
    const poll = setInterval(() => {
      loadSessionsData();
    }, 3000);
    const onFocusOrVisible = () => {
      if (document.visibilityState === 'visible') {
        loadSessionsData();
      }
    };
    window.addEventListener('focus', onFocusOrVisible);
    document.addEventListener('visibilitychange', onFocusOrVisible);
    return () => {
      clearInterval(poll);
      window.removeEventListener('focus', onFocusOrVisible);
      document.removeEventListener('visibilitychange', onFocusOrVisible);
    };
  }, [isTeacherOrAdmin, activeTab, loadSessionsData]);

  // Sync active teacher session & fetch its full student records
  const refreshActiveTeacherSession = useCallback(async (sessionId: string) => {
    const detail = await getAttendanceSession(sessionId);
    if (detail) {
      setActiveTeacherSession(detail.is_open && !detail.closed_at ? detail : null);
    }
  }, []);

  useEffect(() => {
    if (!isTeacherOrAdmin) return;
    const openSession = sessions.find((s) => s.is_open && !s.closed_at);
    if (openSession) {
      setActiveTeacherSession((prev) => {
        if (!prev || prev.id !== openSession.id) {
          refreshActiveTeacherSession(openSession.id);
          return openSession;
        }
        return {
          ...prev,
          ...openSession,
          records: openSession.records?.length ? openSession.records : prev.records,
        };
      });
    } else {
      setActiveTeacherSession(null);
    }
  }, [isTeacherOrAdmin, sessions, refreshActiveTeacherSession]);

  // Poll live check-ins every 3 seconds while teacher has an open session
  useEffect(() => {
    if (!isTeacherOrAdmin || !activeTeacherSession?.id || !activeTeacherSession.is_open) {
      return;
    }
    const poll = setInterval(() => {
      refreshActiveTeacherSession(activeTeacherSession.id);
      loadSessionsData();
    }, 3000);
    return () => clearInterval(poll);
  }, [
    isTeacherOrAdmin,
    activeTeacherSession?.id,
    activeTeacherSession?.is_open,
    refreshActiveTeacherSession,
    loadSessionsData,
  ]);

  // Load selected session detail for Teacher Statistics view
  useEffect(() => {
    if (!isTeacherOrAdmin || !selectedStatsSessionId) {
      setStatsSessionDetail(null);
      return;
    }
    let cancelled = false;
    const fallback = sessions.find((s) => s.id === selectedStatsSessionId) || null;
    if (fallback) {
      setStatsSessionDetail(fallback);
    }
    getAttendanceSession(selectedStatsSessionId).then((detail) => {
      if (!cancelled && detail) {
        setStatsSessionDetail(detail);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [isTeacherOrAdmin, selectedStatsSessionId, sessions]);

  // Fetch rotating QR code for the active teacher session
  const activeSessionForQr =
    isTeacherOrAdmin && activeTab === 'teacher' && activeTeacherSession?.is_open
      ? activeTeacherSession
      : null;

  const refreshQrToken = useCallback(async (sessionId: string) => {
    try {
      const qrData = await getAttendanceQr(sessionId);
      setCurrentQr(qrData);
      setQrRemainingSeconds(qrData.step_seconds || 20);
    } catch (err) {
      console.warn('Failed to refresh rotating QR token', err);
    }
  }, []);

  useEffect(() => {
    if (!activeSessionForQr?.id) {
      setCurrentQr(null);
      return;
    }

    refreshQrToken(activeSessionForQr.id);

    const interval = setInterval(() => {
      setQrRemainingSeconds((prev) => {
        if (prev <= 1) {
          refreshQrToken(activeSessionForQr.id);
          return activeSessionForQr.token_step_seconds || 20;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [activeSessionForQr?.id, activeSessionForQr?.token_step_seconds, refreshQrToken]);

  const stopCamera = useCallback(() => {
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setIsCameraActive(false);
    isDecodingFrameRef.current = false;
  }, []);

  useEffect(() => {
    return () => {
      stopCamera();
    };
  }, [stopCamera]);

  // Handle student scan check-in
  const handlePerformScan = useCallback(
    async (targetSessionId: string, tokenToScan: string) => {
      const rawInput = tokenToScan.trim();
      if (!rawInput) {
        setScanError('Please scan a QR code or enter a valid attendance token.');
        return;
      }
      setIsSubmittingScan(true);
      setScanError(null);
      setScanResult(null);

      let parsedSessionId = targetSessionId;
      let cleanToken = rawInput;

      if (rawInput.startsWith('aut-att:')) {
        const parts = rawInput.split(':');
        if (parts.length >= 3) {
          parsedSessionId = parts[1].trim();
          cleanToken = parts.slice(2).join(':').trim();
        }
      }

      // Pre-check target group restriction if the target session is in our loaded list
      const targetSessObj =
        sessions.find((s) => s.id === parsedSessionId) ||
        sessions.find((s) => s.is_open && !s.closed_at);
      if (targetSessObj?.group_label && user?.group_no) {
        const grpCheck = doesStudentMatchSessionGroups(user.group_no, targetSessObj.group_label);
        if (!grpCheck.matches) {
          setScanError(
            `Access denied: This class session is only for group(s) ${grpCheck.allowedGroups.join(
              ', ',
            )}. Students from group ${user.group_no} cannot check in.`,
          );
          setIsSubmittingScan(false);
          return;
        }
      }

      try {
        const res = await scanAttendanceQr(parsedSessionId, {
          token: cleanToken,
          session_id: parsedSessionId || null,
        });
        setScanResult(res);
        setTokenInput('');
        stopCamera();

        const matchedSess = sessions.find((s) => s.id === res.session_id);
        const immediateRecord: StudentAttendanceRecord = {
          id: res.record_id,
          session_id: res.session_id,
          room_id: res.room_id || matchedSess?.room_id || null,
          room_label: res.room_label || matchedSess?.room_label || null,
          subject: res.subject || matchedSess?.subject || 'Class Lecture Session',
          teacher_label: res.teacher_label || matchedSess?.teacher_label || null,
          group_label: res.group_label || matchedSess?.group_label || user?.group_no || null,
          state: res.state,
          scanned_at: res.scanned_at,
          review_reason: res.review_reason,
        };
        setMyRecords((prev) => [
          immediateRecord,
          ...prev.filter((r) => r.id !== immediateRecord.id && r.session_id !== immediateRecord.session_id),
        ]);

        await Promise.all([loadSessionsData(), loadMyRecordsData()]);
      } catch (err: unknown) {
        const msg =
          err instanceof Error
            ? err.message
            : 'Check-in failed. Please verify the QR code or token.';
        setScanError(msg);
        await loadSessionsData();
      } finally {
        setIsSubmittingScan(false);
      }
    },
    [stopCamera, sessions, user?.group_no, loadSessionsData, loadMyRecordsData],
  );

  // Camera startup and live frame QR decoding loop
  const startCamera = async () => {
    setScanError(null);
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setScanError(
        'Live video camera requires HTTPS or localhost. Use "Scan QR from Camera Photo" below to scan with your phone camera!',
      );
      photoInputRef.current?.click();
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: false,
      });
      mediaStreamRef.current = stream;
      setIsCameraActive(true);
    } catch (err) {
      console.warn('Camera access denied or unavailable:', err);
      setIsCameraActive(false);
      setScanError(
        'Live camera stream unavailable on this connection. Tap "Scan QR from Camera Photo" or enter the 8-character token.',
      );
    }
  };

  // Attach MediaStream once <video> mounts and decode QR frames every 200ms
  useEffect(() => {
    if (!isCameraActive) return;

    const videoEl = videoRef.current;
    if (videoEl && mediaStreamRef.current) {
      videoEl.srcObject = mediaStreamRef.current;
      videoEl.setAttribute('playsinline', 'true');
      videoEl.play().catch(() => {});
    }

    if (!scanCanvasRef.current) {
      scanCanvasRef.current = document.createElement('canvas');
    }

    // Prepare native BarcodeDetector if supported by the browser
    let nativeDetector: { detect: (source: HTMLVideoElement) => Promise<{ rawValue?: string }[]> } | null = null;
    const BarcodeDetectorCtor = (
      window as unknown as {
        BarcodeDetector?: new (opts: { formats: string[] }) => {
          detect: (source: HTMLVideoElement) => Promise<{ rawValue?: string }[]>;
        };
      }
    ).BarcodeDetector;
    if (BarcodeDetectorCtor) {
      try {
        nativeDetector = new BarcodeDetectorCtor({ formats: ['qr_code'] });
      } catch {
        nativeDetector = null;
      }
    }

    const scanInterval = setInterval(async () => {
      const vid = videoRef.current;
      if (!vid || vid.readyState < 2 || isDecodingFrameRef.current) return;
      isDecodingFrameRef.current = true;

      try {
        // 1. Try native BarcodeDetector first if available
        if (nativeDetector) {
          try {
            const barcodes = await nativeDetector.detect(vid);
            if (barcodes && barcodes.length > 0 && barcodes[0].rawValue) {
              const detectedValue = barcodes[0].rawValue;
              stopCamera();
              await handlePerformScan(selectedSessionId, detectedValue);
              return;
            }
          } catch {
            // Fall through to jsQR canvas decoder
          }
        }

        // 2. Universal jsQR frame decoder
        const vw = vid.videoWidth;
        const vh = vid.videoHeight;
        if (vw > 0 && vh > 0 && scanCanvasRef.current) {
          const maxDim = 720;
          const scale = Math.min(1, maxDim / Math.max(vw, vh));
          const cw = Math.max(1, Math.floor(vw * scale));
          const ch = Math.max(1, Math.floor(vh * scale));

          const canvas = scanCanvasRef.current;
          canvas.width = cw;
          canvas.height = ch;
          const ctx = canvas.getContext('2d', { willReadFrequently: true });
          if (ctx) {
            ctx.drawImage(vid, 0, 0, cw, ch);
            const imageData = ctx.getImageData(0, 0, cw, ch);
            const qrCode = jsQR(imageData.data, cw, ch, {
              inversionAttempts: 'attemptBoth',
            });
            if (qrCode?.data) {
              stopCamera();
              await handlePerformScan(selectedSessionId, qrCode.data);
              return;
            }
          }
        }
      } finally {
        isDecodingFrameRef.current = false;
      }
    }, 200);

    return () => clearInterval(scanInterval);
  }, [isCameraActive, selectedSessionId, stopCamera, handlePerformScan]);

  // Decode QR code from a captured phone camera photo (<input type="file" capture="environment">)
  const handlePhotoFileScan = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    setScanError(null);
    setIsSubmittingScan(true);

    try {
      const bitmapUrl = URL.createObjectURL(file);
      const img = await new Promise<HTMLImageElement>((resolve, reject) => {
        const image = new Image();
        image.onload = () => resolve(image);
        image.onerror = (err) => reject(err);
        image.src = bitmapUrl;
      });

      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      let decodedPayload: string | null = null;

      // Try multiple resolutions so high-MP phone photos decode accurately
      for (const maxDim of [900, 1400, 500]) {
        const scale = Math.min(1, maxDim / Math.max(img.width || 1, img.height || 1));
        const w = Math.max(1, Math.floor(img.width * scale));
        const h = Math.max(1, Math.floor(img.height * scale));
        canvas.width = w;
        canvas.height = h;
        if (ctx) {
          ctx.drawImage(img, 0, 0, w, h);
          const imageData = ctx.getImageData(0, 0, w, h);
          const code = jsQR(imageData.data, w, h, { inversionAttempts: 'attemptBoth' });
          if (code?.data) {
            decodedPayload = code.data;
            break;
          }
        }
      }

      URL.revokeObjectURL(bitmapUrl);

      if (decodedPayload) {
        await handlePerformScan(selectedSessionId, decodedPayload);
      } else {
        setScanError(
          'Could not detect a QR code in the photo. Move closer to the screen or enter the 8-character token below.',
        );
      }
    } catch {
      setScanError('Could not read the selected image. Please try again or enter the token.');
    } finally {
      setIsSubmittingScan(false);
    }
  };

  const toggleGroupSelection = (groupCode: string) => {
    const normalized = groupCode.trim().toUpperCase();
    if (!normalized) return;
    setFormSelectedGroups((prev) =>
      prev.includes(normalized) ? prev.filter((g) => g !== normalized) : [...prev, normalized],
    );
  };

  const addCustomGroupsFromInput = () => {
    const raw = formCustomGroupInput.trim();
    if (!raw) return;
    const tokens = raw
      .split(/[,;\s]+/)
      .map((t) => t.trim().toUpperCase())
      .filter(Boolean);
    if (tokens.length > 0) {
      setFormSelectedGroups((prev) => {
        const merged = [...prev];
        for (const t of tokens) {
          if (!merged.includes(t)) merged.push(t);
        }
        return merged;
      });
    }
    setFormCustomGroupInput('');
  };

  // Teacher actions
  const handleCreateSession = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formRoomId) return;
    setIsCreatingSession(true);
    setScanError(null);
    try {
      const selectedRoomObj = availableRooms.find((r) => r.id === formRoomId);
      const roomLabel = selectedRoomObj
        ? `${selectedRoomObj.displayName} (${selectedRoomObj.buildingName})`
        : formatRoomDisplay(formRoomId, null);

      const extraTypedGroups = formCustomGroupInput
        .split(/[,;\s]+/)
        .map((t) => t.trim().toUpperCase())
        .filter(Boolean);
      const allChosenGroups = Array.from(new Set([...formSelectedGroups, ...extraTypedGroups]));
      const combinedGroupLabel = allChosenGroups.length > 0 ? allChosenGroups.join(', ') : undefined;

      const newSession = await openAttendanceSession({
        room_id: formRoomId,
        room_label: roomLabel,
        subject: formSubject.trim() || undefined,
        group_label: combinedGroupLabel,
        token_step_seconds: formStepSeconds,
        late_after_minutes: formLateAfter,
        expected_count: formExpectedCount,
      });
      setFormCustomGroupInput('');
      setActiveTeacherSession(newSession);
      setSelectedStatsSessionId(newSession.id);
      await loadSessionsData();
    } catch (err: unknown) {
      setScanError(
        `Could not start attendance session: ${err instanceof Error ? err.message : 'Error'}`,
      );
    } finally {
      setIsCreatingSession(false);
    }
  };

  const handleCloseActiveSession = async () => {
    if (!activeTeacherSession) return;
    const closingId = activeTeacherSession.id;
    await closeAttendanceSession(closingId);
    const closedDetail = await getAttendanceSession(closingId);
    setActiveTeacherSession(null);
    await loadSessionsData();
    if (closedDetail) {
      setStatsSessionDetail({ ...closedDetail, is_open: false });
    }
    setSelectedStatsSessionId(closingId);
    // Automatically switch to the whole statistics & student roster view once closed
    setActiveTab('stats');
  };

  const handleReviewRecord = async (
    recordId: string,
    decision: 'present' | 'late' | 'rejected',
  ) => {
    await reviewAttendanceRecord(recordId, decision);
    if (activeTeacherSession) {
      const refreshed = await getAttendanceSession(activeTeacherSession.id);
      if (refreshed) setActiveTeacherSession(refreshed);
    }
    if (selectedStatsSessionId) {
      const refreshedStats = await getAttendanceSession(selectedStatsSessionId);
      if (refreshedStats) setStatsSessionDetail(refreshedStats);
    }
    await loadSessionsData();
  };

  // Navigate to room in 3D Map
  const handleLocateRoomOnMap = (roomId: string) => {
    selectRoom(roomId);
    onBackToMap();
  };

  // Clean & deduplicate session recordings for the Teacher Statistics tab
  const dedupedStatsSessions = useMemo(() => {
    const seenZeroDuplicateKeys = new Set<string>();
    const result: AttendanceSessionInfo[] = [];
    for (const s of sessions) {
      const attended = (s.counts?.present || 0) + (s.counts?.late || 0);
      const isClosedZero = (!s.is_open || Boolean(s.closed_at)) && attended === 0 && (s.total_scans || 0) === 0;
      if (isClosedZero && s.id !== selectedStatsSessionId) {
        const key = `${s.room_id || ''}::${formatSessionTitle(s)}::${s.group_label || ''}`;
        if (seenZeroDuplicateKeys.has(key)) {
          continue;
        }
        seenZeroDuplicateKeys.add(key);
      }
      result.push(s);
    }
    return result;
  }, [sessions, selectedStatsSessionId, formatSessionTitle]);

  const filteredRecordingSessions = useMemo(() => {
    if (statsSessionStatusFilter === 'OPEN') {
      return dedupedStatsSessions.filter((s) => s.is_open && !s.closed_at);
    }
    if (statsSessionStatusFilter === 'CLOSED') {
      return dedupedStatsSessions.filter((s) => !s.is_open || Boolean(s.closed_at));
    }
    return dedupedStatsSessions;
  }, [dedupedStatsSessions, statsSessionStatusFilter]);

  // Computed statistics for the Teacher Statistics tab
  const currentStatsSession = useMemo(() => {
    return (
      statsSessionDetail ||
      sessions.find((s) => s.id === selectedStatsSessionId) ||
      activeTeacherSession ||
      dedupedStatsSessions[0] ||
      null
    );
  }, [statsSessionDetail, sessions, selectedStatsSessionId, activeTeacherSession, dedupedStatsSessions]);

  const attendedRecords = useMemo(() => {
    if (!currentStatsSession?.records) return [];
    return currentStatsSession.records.filter((r) => r.state !== 'rejected');
  }, [currentStatsSession]);

  const groupBreakdown = useMemo(() => {
    const map = new Map<string, number>();
    for (const rec of attendedRecords) {
      const grp = (rec.group_no || currentStatsSession?.group_label || 'Unassigned').trim();
      map.set(grp, (map.get(grp) || 0) + 1);
    }
    return Array.from(map.entries()).sort((a, b) => b[1] - a[1]);
  }, [attendedRecords, currentStatsSession?.group_label]);

  const filteredStatsRecords = useMemo(() => {
    const q = statsSearchQuery.trim().toLowerCase();
    return attendedRecords.filter((rec) => {
      const grp = (rec.group_no || currentStatsSession?.group_label || 'Unassigned').trim();
      if (statsGroupFilter !== 'ALL' && grp !== statsGroupFilter) {
        return false;
      }
      if (!q) return true;
      const name = (rec.student_name || rec.user_id || '').toLowerCase();
      const sid = (rec.student_id || '').toLowerCase();
      return name.includes(q) || grp.toLowerCase().includes(q) || sid.includes(q);
    });
  }, [attendedRecords, currentStatsSession?.group_label, statsGroupFilter, statsSearchQuery]);

  const totalAttendedCount = currentStatsSession
    ? (currentStatsSession.counts?.present || 0) + (currentStatsSession.counts?.late || 0)
    : 0;
  const expectedStudentsCount = currentStatsSession?.expected_count || 30;
  const attendanceRatePct = Math.min(
    100,
    Math.round((totalAttendedCount / Math.max(1, expectedStudentsCount)) * 100),
  );

  return (
    <div className="att-view">
      {/* Role Banner */}
      <div className="att-role-banner">
        <div className="att-role-badge">
          {isTeacherOrAdmin ? <BriefcaseIcon size={16} /> : <GraduationIcon size={16} />}
          <span>
            {user
              ? `${user.display_name} • ${
                  isTeacherOrAdmin
                    ? 'Faculty / Instructor Mode'
                    : `Student${user.group_no ? ` (${user.group_no})` : ''}`
                }`
              : 'Guest Mode (Sign in to record attendance)'}
          </span>
        </div>
        {!user && (
          <button
            type="button"
            className="att-role-switch-btn"
            onClick={() => openLogin('student')}
          >
            Sign In with ID
          </button>
        )}
      </div>

      {/* Role-Specific Navigation Tabs */}
      {isTeacherOrAdmin ? (
        <div className="att-tabs" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'teacher'}
            className={`att-tab-btn${activeTab === 'teacher' ? ' is-active' : ''}`}
            onClick={() => setActiveTab('teacher')}
          >
            <QrCodeIcon size={16} />
            Live QR Session
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'stats'}
            className={`att-tab-btn${activeTab === 'stats' ? ' is-active' : ''}`}
            onClick={() => {
              setActiveTab('stats');
              loadSessionsData();
              if (selectedStatsSessionId) {
                getAttendanceSession(selectedStatsSessionId).then((d) => {
                  if (d) setStatsSessionDetail(d);
                });
              }
            }}
          >
            <UsersIcon size={16} />
            Attendance Statistics ({totalAttendedCount})
          </button>
        </div>
      ) : (
        <div className="att-tabs" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'student'}
            className={`att-tab-btn${activeTab === 'student' ? ' is-active' : ''}`}
            onClick={() => setActiveTab('student')}
          >
            <CameraIcon size={16} />
            Student Check-In
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'history'}
            className={`att-tab-btn${activeTab === 'history' ? ' is-active' : ''}`}
            onClick={() => {
              setActiveTab('history');
              loadMyRecordsData();
            }}
          >
            <ClockIcon size={16} />
            My History ({myRecords.length})
          </button>
        </div>
      )}

      {/* Result feedback banner */}
      {scanResult && (
        <div
          className={`att-result-banner att-result-banner--${
            scanResult.state === 'rejected'
              ? 'error'
              : scanResult.state === 'late' || scanResult.state === 'pending_review'
              ? 'warning'
              : 'success'
          }`}
        >
          <CheckCircleIcon size={20} />
          <div>
            <strong>
              {scanResult.state === 'present'
                ? 'Check-In Verified!'
                : scanResult.state === 'late'
                ? 'Checked In (Late)'
                : scanResult.state === 'pending_review'
                ? 'Pending Instructor Review'
                : 'Check-In Rejected'}
            </strong>
            <p style={{ margin: '2px 0 0', fontSize: 12 }}>
              {scanResult.state === 'present'
                ? `You have been marked present${
                    scanResult.subject ? ` for ${scanResult.subject}` : ' for this class session'
                  }. Recorded in My History.`
                : scanResult.review_reason || 'Recorded into campus attendance ledger.'}
            </p>
          </div>
          <button
            type="button"
            className="att-result-close"
            onClick={() => setScanResult(null)}
            aria-label="Dismiss banner"
          >
            <CloseIcon size={16} />
          </button>
        </div>
      )}

      {scanError && (
        <div className="att-result-banner att-result-banner--error">
          <AlertIcon size={20} />
          <div>
            <strong>Attendance Notice</strong>
            <p style={{ margin: '2px 0 0', fontSize: 12 }}>{scanError}</p>
          </div>
          <button
            type="button"
            className="att-result-close"
            onClick={() => setScanError(null)}
            aria-label="Dismiss banner"
          >
            <CloseIcon size={16} />
          </button>
        </div>
      )}

      {/* ============================================================== */}
      {/* STUDENT TAB 1: STUDENT CHECK-IN                                */}
      {/* ============================================================== */}
      {!isTeacherOrAdmin && activeTab === 'student' && (
        <>
          {/* Active Campus Classes to Check In */}
          <div className="att-card">
            <div className="att-card__header">
              <h3 className="att-card__title">
                <UsersIcon size={16} />
                Live Classroom Sessions
              </h3>
              <button
                type="button"
                className="att-btn att-btn--secondary"
                style={{ padding: '4px 8px', fontSize: 11 }}
                onClick={loadSessionsData}
                title="Refresh active classes"
              >
                <RefreshIcon size={12} /> Refresh
              </button>
            </div>

            <p style={{ fontSize: 12, color: '#64748b', margin: 0 }}>
              Select your current lecture hall or scan the rotating QR code projected on the
              classroom board.
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {sessions.filter((s) => s.is_open && !s.closed_at).length === 0 ? (
                <div
                  style={{
                    padding: '20px 0',
                    textAlign: 'center',
                    color: '#94a3b8',
                    fontSize: 13,
                  }}
                >
                  No open attendance sessions right now. Ask your professor to launch a session!
                </div>
              ) : (
                sessions
                  .filter((s) => s.is_open && !s.closed_at)
                  .map((sess) => {
                    const isSelected = selectedSessionId === sess.id;
                    const groupEligibility = doesStudentMatchSessionGroups(
                      user?.group_no,
                      sess.group_label,
                    );
                    const isRestrictedFromStudent =
                      Boolean(user?.group_no && sess.group_label) && !groupEligibility.matches;
                    return (
                      <div
                        key={sess.id}
                        className="att-session-item"
                        style={
                          isSelected
                            ? {
                                borderColor: '#002c6c',
                                background: 'rgba(0, 44, 108, 0.02)',
                              }
                            : undefined
                        }
                        onClick={() => setSelectedSessionId(sess.id)}
                      >
                        <div className="att-session-title-row">
                          <span className="att-session-title">{formatSessionTitle(sess)}</span>
                          <span
                            className={`att-badge ${
                              isRestrictedFromStudent ? 'att-badge--rejected' : 'att-badge--open'
                            }`}
                          >
                            {isRestrictedFromStudent
                              ? `Only Group ${groupEligibility.allowedGroups.join(', ')}`
                              : 'Live Session'}
                          </span>
                        </div>

                        <div className="att-meta-row">
                          <span>🏛️ {formatRoomDisplay(sess.room_id, sess.room_label)}</span>
                          {sess.teacher_label && <span>👨‍🏫 {sess.teacher_label}</span>}
                          {sess.group_label && <span>👥 Group {sess.group_label}</span>}
                          <span>
                            ✅ {sess.counts.present + sess.counts.late} /{' '}
                            {sess.expected_count || 30} present
                          </span>
                        </div>

                        <div className="att-actions-row">
                          <button
                            type="button"
                            className="att-btn att-btn--primary"
                            disabled={isRestrictedFromStudent}
                            style={isRestrictedFromStudent ? { opacity: 0.5, cursor: 'not-allowed' } : undefined}
                            onClick={(e) => {
                              e.stopPropagation();
                              if (isRestrictedFromStudent) {
                                setScanError(
                                  `Access denied: This class session is only for group(s) ${groupEligibility.allowedGroups.join(
                                    ', ',
                                  )}. Students from group ${user?.group_no} cannot check in.`,
                                );
                                return;
                              }
                              setSelectedSessionId(sess.id);
                              startCamera();
                            }}
                          >
                            <CameraIcon size={14} />{' '}
                            {isRestrictedFromStudent ? 'Not Your Group' : 'Scan with Camera'}
                          </button>
                          {sess.room_id && (
                            <button
                              type="button"
                              className="att-btn att-btn--map"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleLocateRoomOnMap(sess.room_id!);
                              }}
                              title="Locate classroom in 3D"
                            >
                              <MapNavIcon size={14} /> Locate in 3D
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })
              )}
            </div>
          </div>

          {/* Scanner or Manual Code Submission */}
          <div className="att-card">
            <h3 className="att-card__title">
              <CameraIcon size={16} />
              Scan QR Code or Enter Token
            </h3>

            {/* Hidden file input for mobile camera photo QR decoding */}
            <input
              ref={photoInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              onChange={handlePhotoFileScan}
              style={{ display: 'none' }}
            />

            {isCameraActive ? (
              <div className="att-scanner-box">
                <video ref={videoRef} className="att-scanner-video" playsInline muted autoPlay />
                <div className="att-scanner-overlay">
                  <div className="att-scanner-target">
                    <div className="att-scanner-laser" />
                  </div>
                </div>
                <div
                  style={{
                    position: 'absolute',
                    top: 10,
                    left: 12,
                    right: 12,
                    textAlign: 'center',
                    fontSize: 11,
                    fontWeight: 600,
                    background: 'rgba(15, 23, 42, 0.7)',
                    padding: '4px 8px',
                    borderRadius: 6,
                  }}
                >
                  Point camera at the classroom QR code — auto-detecting…
                </div>
                <button
                  type="button"
                  className="att-btn att-btn--danger"
                  style={{ position: 'absolute', bottom: 12, zIndex: 10 }}
                  onClick={stopCamera}
                >
                  <CloseIcon size={14} /> Close Camera
                </button>
              </div>
            ) : (
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button
                  type="button"
                  className="att-btn att-btn--primary"
                  style={{ flex: 1, minWidth: 160, height: 42 }}
                  onClick={startCamera}
                >
                  <CameraIcon size={18} /> Live Camera QR Scanner
                </button>
                <button
                  type="button"
                  className="att-btn att-btn--secondary"
                  style={{ flex: 1, minWidth: 160, height: 42 }}
                  onClick={() => photoInputRef.current?.click()}
                  disabled={isSubmittingScan}
                >
                  📷 Scan QR from Camera Photo
                </button>
              </div>
            )}

            <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
              <input
                type="text"
                placeholder="Enter 8-char token or aut-att:... code"
                value={tokenInput}
                onChange={(e) => setTokenInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && tokenInput.trim()) {
                    e.preventDefault();
                    handlePerformScan(
                      selectedSessionId || sessions.find((s) => s.is_open)?.id || '',
                      tokenInput,
                    );
                  }
                }}
                style={{
                  flex: 1,
                  padding: '9px 12px',
                  borderRadius: 8,
                  border: '1px solid #cbd5e1',
                  fontSize: 13,
                  outline: 'none',
                }}
              />
              <button
                type="button"
                className="att-btn att-btn--primary"
                onClick={() =>
                  handlePerformScan(
                    selectedSessionId || sessions.find((s) => s.is_open)?.id || '',
                    tokenInput,
                  )
                }
                disabled={isSubmittingScan || !tokenInput.trim()}
              >
                {isSubmittingScan ? 'Checking in…' : 'Submit Check-in'}
              </button>
            </div>
          </div>
        </>
      )}

      {/* ============================================================== */}
      {/* STUDENT TAB 2: MY ATTENDANCE HISTORY                           */}
      {/* ============================================================== */}
      {!isTeacherOrAdmin && activeTab === 'history' && (
        <div className="att-card">
          <div className="att-card__header">
            <h3 className="att-card__title">
              <ClockIcon size={16} />
              My Attendance Records
            </h3>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: '#002c6c' }}>
                {myRecords.length} recorded check-ins
              </span>
              <button
                type="button"
                className="att-btn att-btn--secondary"
                style={{ padding: '4px 8px', fontSize: 11 }}
                onClick={loadMyRecordsData}
              >
                <RefreshIcon size={12} />
              </button>
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {myRecords.length === 0 ? (
              <div
                style={{ padding: '24px 0', textAlign: 'center', color: '#94a3b8', fontSize: 13 }}
              >
                No attendance check-in records yet. Scan an active class QR code or submit a token
                to record attendance!
              </div>
            ) : (
              myRecords.map((rec) => (
                <div key={rec.id} className="att-session-item">
                  <div className="att-session-title-row">
                    <span className="att-session-title">{rec.subject || 'Lecture Session'}</span>
                    <span
                      className={`att-badge att-badge--${
                        rec.state === 'present'
                          ? 'present'
                          : rec.state === 'late'
                          ? 'late'
                          : rec.state === 'pending_review'
                          ? 'pending'
                          : 'rejected'
                      }`}
                    >
                      {rec.state === 'present'
                        ? 'Present'
                        : rec.state === 'late'
                        ? 'Late'
                        : rec.state === 'pending_review'
                        ? 'Pending Review'
                        : 'Rejected'}
                    </span>
                  </div>

                  <div className="att-meta-row">
                    {(rec.room_id || rec.room_label) && (
                      <span>🏛️ {formatRoomDisplay(rec.room_id, rec.room_label)}</span>
                    )}
                    {rec.teacher_label && <span>👨‍🏫 {rec.teacher_label}</span>}
                    {rec.group_label && <span>👥 Group {rec.group_label}</span>}
                    <span>
                      📅{' '}
                      {new Date(rec.scanned_at).toLocaleDateString([], {
                        month: 'short',
                        day: 'numeric',
                      })}{' '}
                      at{' '}
                      {new Date(rec.scanned_at).toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                  </div>

                  {rec.room_id && (
                    <div className="att-actions-row">
                      <button
                        type="button"
                        className="att-btn att-btn--map"
                        onClick={() => handleLocateRoomOnMap(rec.room_id!)}
                      >
                        <MapNavIcon size={14} /> Locate in 3D
                      </button>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* TEACHER TAB 1: LIVE QR SESSION                                 */}
      {/* ============================================================== */}
      {isTeacherOrAdmin && activeTab === 'teacher' && (
        <>
          {activeTeacherSession && activeTeacherSession.is_open ? (
            <div className="att-card">
              <div className="att-card__header">
                <div>
                  <h3 className="att-card__title" style={{ fontSize: 16 }}>
                    {activeTeacherSession.subject || 'Active Class Attendance'}
                  </h3>
                  <span style={{ fontSize: 12, color: '#64748b' }}>
                    {formatRoomDisplay(
                      activeTeacherSession.room_id,
                      activeTeacherSession.room_label,
                    )}
                    {activeTeacherSession.group_label
                      ? ` · Group ${activeTeacherSession.group_label}`
                      : ''}{' '}
                    · {activeTeacherSession.teacher_label || user?.display_name || 'Professor'}
                  </span>
                </div>
                <span className="att-badge att-badge--open">Live Session</span>
              </div>

              {/* Rotating QR Box */}
              <div className="att-qr-box">
                <div className="att-qr-canvas" title="Dynamic Rotating QR Code">
                  {currentQr?.qr_svg && currentQr.qr_svg.trim().startsWith('<svg') && (
                    <img
                      src={`data:image/svg+xml;utf8,${encodeURIComponent(currentQr.qr_svg)}`}
                      alt="Dynamic Rotating QR Code"
                      style={{ width: '100%', height: '100%', display: 'block' }}
                    />
                  )}
                </div>

                <div className="att-qr-timer-row">
                  <div className="att-qr-timer-info">
                    <span>🔄 Rotating Security Token</span>
                    <span>{qrRemainingSeconds}s remaining</span>
                  </div>
                  <div className="att-qr-progress-bar">
                    <div
                      className="att-qr-progress-fill"
                      style={{
                        width: `${Math.max(
                          0,
                          Math.min(
                            100,
                            (qrRemainingSeconds / (activeTeacherSession.token_step_seconds || 20)) *
                              100,
                          ),
                        )}%`,
                      }}
                    />
                  </div>
                </div>

                {currentQr?.token && (
                  <div className="att-token-badge">
                    <span>Token: {currentQr.token}</span>
                  </div>
                )}

                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
                  <button
                    type="button"
                    className="att-btn att-btn--primary"
                    onClick={() => setIsProjectorOpen(true)}
                  >
                    📽️ Fullscreen Projector Mode
                  </button>
                  {activeTeacherSession.room_id && (
                    <button
                      type="button"
                      className="att-btn att-btn--map"
                      onClick={() => handleLocateRoomOnMap(activeTeacherSession.room_id!)}
                    >
                      <MapNavIcon size={14} /> Locate in 3D
                    </button>
                  )}
                  <button
                    type="button"
                    className="att-btn att-btn--danger"
                    onClick={handleCloseActiveSession}
                  >
                    Close Attendance & Show Statistics
                  </button>
                </div>
              </div>

              {/* Live Checked-In Students Roster (Full Name + Group Number) */}
              <div style={{ marginTop: 8 }}>
                <div className="att-card__header" style={{ marginBottom: 10 }}>
                  <h4 style={{ margin: 0, fontSize: 13, fontWeight: 700, color: '#1e293b' }}>
                    Students Checked In (
                    {activeTeacherSession.counts.present + activeTeacherSession.counts.late} /{' '}
                    {activeTeacherSession.expected_count || 30})
                  </h4>
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    <span className="att-badge att-badge--present">
                      {activeTeacherSession.counts.present} Present
                    </span>
                    <span className="att-badge att-badge--late">
                      {activeTeacherSession.counts.late} Late
                    </span>
                    {activeTeacherSession.counts.pending_review > 0 && (
                      <span className="att-badge att-badge--pending">
                        {activeTeacherSession.counts.pending_review} Pending
                      </span>
                    )}
                    <button
                      type="button"
                      className="att-btn att-btn--secondary"
                      style={{ padding: '3px 7px', fontSize: 11 }}
                      onClick={() => refreshActiveTeacherSession(activeTeacherSession.id)}
                      title="Refresh checked-in students"
                    >
                      <RefreshIcon size={12} />
                    </button>
                  </div>
                </div>

                <div className="att-roster-list">
                  {(activeTeacherSession.records || []).length === 0 ? (
                    <div
                      style={{
                        padding: '18px 0',
                        textAlign: 'center',
                        color: '#94a3b8',
                        fontSize: 12,
                      }}
                    >
                      No student scans yet. As students scan the QR code or submit the token, their
                      full name and group number will appear here live.
                    </div>
                  ) : (
                    (activeTeacherSession.records || []).map(
                      (rec: AttendanceRecordItem, idx: number) => (
                        <div key={rec.id} className="att-roster-row">
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <span className="att-roster-index">{idx + 1}</span>
                            <div>
                              <div
                                style={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: 6,
                                  flexWrap: 'wrap',
                                }}
                              >
                                <strong style={{ color: '#0f172a', fontSize: 13 }}>
                                  {rec.student_name ||
                                    (rec.user_id ? rec.user_id.replace(/^user-/, '') : 'Student')}
                                </strong>
                                <span className="att-group-pill">
                                  Group{' '}
                                  {rec.group_no || activeTeacherSession.group_label || 'General'}
                                </span>
                              </div>
                              <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>
                                {rec.student_id && <span>ID: {rec.student_id} · </span>}
                                Checked in at{' '}
                                {new Date(rec.scanned_at).toLocaleTimeString([], {
                                  hour: '2-digit',
                                  minute: '2-digit',
                                  second: '2-digit',
                                })}
                              </div>
                              {rec.review_reason && (
                                <div style={{ fontSize: 11, color: '#b45309', marginTop: 2 }}>
                                  ⚠️ {rec.review_reason}
                                </div>
                              )}
                            </div>
                          </div>

                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <span
                              className={`att-badge att-badge--${
                                rec.state === 'present'
                                  ? 'present'
                                  : rec.state === 'late'
                                  ? 'late'
                                  : rec.state === 'pending_review'
                                  ? 'pending'
                                  : 'rejected'
                              }`}
                            >
                              {rec.state === 'present'
                                ? 'Present'
                                : rec.state === 'late'
                                ? 'Late'
                                : rec.state === 'pending_review'
                                ? 'Pending'
                                : 'Rejected'}
                            </span>

                            {rec.state === 'pending_review' && (
                              <>
                                <button
                                  type="button"
                                  className="att-btn att-btn--primary"
                                  style={{ padding: '2px 6px', fontSize: 10 }}
                                  onClick={() => handleReviewRecord(rec.id, 'present')}
                                >
                                  Approve
                                </button>
                                <button
                                  type="button"
                                  className="att-btn att-btn--danger"
                                  style={{ padding: '2px 6px', fontSize: 10 }}
                                  onClick={() => handleReviewRecord(rec.id, 'rejected')}
                                >
                                  Reject
                                </button>
                              </>
                            )}
                          </div>
                        </div>
                      ),
                    )
                  )}
                </div>
              </div>
            </div>
          ) : (
            /* Form to Open New Session */
            <div className="att-card">
              <h3 className="att-card__title">
                <QrCodeIcon size={16} />
                Launch New Attendance Session
              </h3>
              <p style={{ fontSize: 12, color: '#64748b', margin: 0 }}>
                Set up a secure time-rotating QR check-in session for your university course.
              </p>

              <form
                onSubmit={handleCreateSession}
                style={{ display: 'flex', flexDirection: 'column', gap: 14 }}
              >
                {/* 1. Academic Building & Classroom Selector (Scrollable like Booking Rooms) */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <div>
                    <label
                      style={{
                        display: 'block',
                        fontSize: 12,
                        fontWeight: 600,
                        color: '#334155',
                        marginBottom: 5,
                      }}
                    >
                      1. Select University Building
                    </label>
                    <div className="bookings-view__bld-selector-wrap" ref={buildingMenuRef}>
                      <button
                        type="button"
                        className={`bookings-view__bld-trigger${isBuildingMenuOpen ? ' is-open' : ''}`}
                        onClick={() => {
                          setIsBuildingMenuOpen((prev) => !prev);
                          setIsRoomMenuOpen(false);
                        }}
                        aria-haspopup="listbox"
                        aria-expanded={isBuildingMenuOpen}
                      >
                        <div className="bookings-view__bld-trigger-left">
                          <span
                            className="bookings-view__bld-badge"
                            style={{
                              backgroundColor: activeBuildingOption.bgTint,
                              color: activeBuildingOption.accent,
                            }}
                          >
                            {activeBuildingOption.id === 'ALL' ? (
                              <CampusIcon size={14} />
                            ) : (
                              activeBuildingOption.code
                            )}
                          </span>
                          <div className="bookings-view__bld-trigger-meta">
                            <span className="bookings-view__bld-trigger-name">
                              {activeBuildingOption.name}
                            </span>
                            <span className="bookings-view__bld-trigger-sub">
                              {activeBuildingOption.subtitle}
                            </span>
                          </div>
                        </div>

                        <div className="bookings-view__bld-trigger-right">
                          <span className="bookings-view__bld-count-pill">
                            {filteredRoomsForSelector.length} rooms
                          </span>
                          <span
                            className={`bookings-view__bld-chevron${
                              isBuildingMenuOpen ? ' is-flipped' : ''
                            }`}
                          >
                            <ChevronDownIcon size={15} />
                          </span>
                        </div>
                      </button>

                      {isBuildingMenuOpen && (
                        <div
                          className="bookings-view__bld-popover"
                          role="listbox"
                          aria-label="Campus academic buildings"
                        >
                          <div className="bookings-view__bld-popover-header">
                            <span>SELECT UNIVERSITY BUILDING</span>
                            <span className="bookings-view__bld-popover-badge">
                              {availableRooms.length} total rooms
                            </span>
                          </div>

                          <div
                            className="bookings-view__bld-popover-list"
                            style={{ maxHeight: 210, overflowY: 'auto' }}
                          >
                            {ACADEMIC_BUILDINGS.map((bld) => {
                              const count =
                                bld.id === 'ALL'
                                  ? availableRooms.length
                                  : availableRooms.filter((r) => r.buildingId === bld.id).length;
                              if (bld.id !== 'ALL' && count === 0) return null;
                              const isSelected = selectedBuildingFilter === bld.id;
                              return (
                                <button
                                  key={bld.id}
                                  type="button"
                                  role="option"
                                  aria-selected={isSelected}
                                  className={`bookings-view__bld-item${
                                    isSelected ? ' is-selected' : ''
                                  }`}
                                  onClick={() => {
                                    setSelectedBuildingFilter(bld.id);
                                    setIsBuildingMenuOpen(false);
                                  }}
                                >
                                  <div className="bookings-view__bld-item-left">
                                    <span
                                      className="bookings-view__bld-item-badge"
                                      style={{
                                        backgroundColor: bld.bgTint,
                                        color: bld.accent,
                                      }}
                                    >
                                      {bld.id === 'ALL' ? <CampusIcon size={14} /> : bld.code}
                                    </span>
                                    <div className="bookings-view__bld-item-text">
                                      <span className="bookings-view__bld-item-title">
                                        {bld.name}
                                      </span>
                                      <span className="bookings-view__bld-item-desc">
                                        {bld.subtitle}
                                      </span>
                                    </div>
                                  </div>

                                  <div className="bookings-view__bld-item-right">
                                    <span className="bookings-view__bld-item-count has-avail">
                                      {count} rooms
                                    </span>
                                    {isSelected && (
                                      <span className="bookings-view__bld-item-check">
                                        <CheckIcon size={14} />
                                      </span>
                                    )}
                                  </div>
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  <div>
                    <label
                      style={{
                        display: 'block',
                        fontSize: 12,
                        fontWeight: 600,
                        color: '#334155',
                        marginBottom: 5,
                      }}
                    >
                      2. Select Classroom / Lecture Hall
                    </label>
                    <div className="bookings-view__bld-selector-wrap" ref={roomMenuRef}>
                      <button
                        type="button"
                        className={`bookings-view__bld-trigger${isRoomMenuOpen ? ' is-open' : ''}`}
                        onClick={() => {
                          setIsRoomMenuOpen((prev) => !prev);
                          setIsBuildingMenuOpen(false);
                        }}
                        aria-haspopup="listbox"
                        aria-expanded={isRoomMenuOpen}
                      >
                        {selectedRoomOption ? (
                          <>
                            <div className="bookings-view__bld-trigger-left">
                              {(() => {
                                const bldMeta =
                                  ACADEMIC_BUILDINGS.find(
                                    (b) => b.id === selectedRoomOption.buildingId,
                                  ) || ACADEMIC_BUILDINGS[1];
                                return (
                                  <span
                                    className="bookings-view__bld-badge"
                                    style={{
                                      backgroundColor: bldMeta.bgTint,
                                      color: bldMeta.accent,
                                    }}
                                  >
                                    {bldMeta.code}
                                  </span>
                                );
                              })()}
                              <div className="bookings-view__bld-trigger-meta">
                                <span className="bookings-view__bld-trigger-name">
                                  {selectedRoomOption.displayName}
                                </span>
                                <span className="bookings-view__bld-trigger-sub">
                                  {selectedRoomOption.buildingName} • Floor{' '}
                                  {selectedRoomOption.floorNumber}
                                </span>
                              </div>
                            </div>

                            <div className="bookings-view__bld-trigger-right">
                              <span className="bookings-view__bld-count-pill">
                                {selectedRoomOption.capacity
                                  ? `${selectedRoomOption.capacity} seats`
                                  : selectedRoomOption.kind === 'hall'
                                  ? 'Hall'
                                  : selectedRoomOption.kind === 'lab'
                                  ? 'Lab'
                                  : 'Room'}
                              </span>
                              <span
                                className={`bookings-view__bld-chevron${
                                  isRoomMenuOpen ? ' is-flipped' : ''
                                }`}
                              >
                                <ChevronDownIcon size={15} />
                              </span>
                            </div>
                          </>
                        ) : (
                          <span style={{ fontSize: 13, color: '#64748b' }}>
                            Choose classroom…
                          </span>
                        )}
                      </button>

                      {isRoomMenuOpen && (
                        <div
                          className="bookings-view__bld-popover"
                          role="listbox"
                          aria-label="Classrooms and lecture halls"
                        >
                          <div className="bookings-view__bld-popover-header">
                            <span>SELECT CLASSROOM / LECTURE HALL</span>
                            <span className="bookings-view__bld-popover-badge">
                              {searchableRoomsForMenu.length} available
                            </span>
                          </div>

                          <div style={{ padding: '4px 6px 6px' }}>
                            <input
                              type="text"
                              value={roomSearchQuery}
                              onChange={(e) => setRoomSearchQuery(e.target.value)}
                              placeholder="Filter room number or name…"
                              style={{
                                width: '100%',
                                padding: '6px 9px',
                                borderRadius: 8,
                                border: '1px solid #cbd5e1',
                                fontSize: 12,
                                boxSizing: 'border-box',
                                outline: 'none',
                              }}
                            />
                          </div>

                          <div
                            className="bookings-view__bld-popover-list"
                            style={{ maxHeight: 210, overflowY: 'auto' }}
                          >
                            {searchableRoomsForMenu.map((rm) => {
                              const isSelected = formRoomId === rm.id;
                              const bldMeta =
                                ACADEMIC_BUILDINGS.find((b) => b.id === rm.buildingId) ||
                                ACADEMIC_BUILDINGS[1];
                              return (
                                <button
                                  key={rm.id}
                                  type="button"
                                  role="option"
                                  aria-selected={isSelected}
                                  className={`bookings-view__bld-item${
                                    isSelected ? ' is-selected' : ''
                                  }`}
                                  onClick={() => {
                                    setFormRoomId(rm.id);
                                    setIsRoomMenuOpen(false);
                                    setRoomSearchQuery('');
                                  }}
                                >
                                  <div className="bookings-view__bld-item-left">
                                    <span
                                      className="bookings-view__bld-item-badge"
                                      style={{
                                        backgroundColor: bldMeta.bgTint,
                                        color: bldMeta.accent,
                                      }}
                                    >
                                      {bldMeta.code}
                                    </span>
                                    <div className="bookings-view__bld-item-text">
                                      <span className="bookings-view__bld-item-title">
                                        {rm.displayName}
                                      </span>
                                      <span className="bookings-view__bld-item-desc">
                                        {rm.buildingName} • Floor {rm.floorNumber}
                                      </span>
                                    </div>
                                  </div>

                                  <div className="bookings-view__bld-item-right">
                                    {rm.capacity && (
                                      <span className="bookings-view__bld-item-count has-avail">
                                        {rm.capacity} seats
                                      </span>
                                    )}
                                    {isSelected && (
                                      <span className="bookings-view__bld-item-check">
                                        <CheckIcon size={14} />
                                      </span>
                                    )}
                                  </div>
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* 2. Course Subject / Title (no example placeholder) */}
                <div>
                  <label
                    style={{
                      display: 'block',
                      fontSize: 12,
                      fontWeight: 600,
                      color: '#334155',
                      marginBottom: 4,
                    }}
                  >
                    Course Subject / Title
                  </label>
                  <input
                    type="text"
                    value={formSubject}
                    onChange={(e) => setFormSubject(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '8px 10px',
                      borderRadius: 8,
                      border: '1px solid #cbd5e1',
                      fontSize: 13,
                      boxSizing: 'border-box',
                    }}
                  />
                </div>

                {/* 3. Target Group(s) — clean empty input space for single or combined groups */}
                <div>
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      marginBottom: 4,
                    }}
                  >
                    <label
                      style={{
                        fontSize: 12,
                        fontWeight: 600,
                        color: '#334155',
                      }}
                    >
                      Target Group(s)
                    </label>
                    {formSelectedGroups.length > 0 && (
                      <button
                        type="button"
                        onClick={() => setFormSelectedGroups([])}
                        style={{
                          background: 'none',
                          border: 'none',
                          color: '#64748b',
                          fontSize: 11,
                          cursor: 'pointer',
                          textDecoration: 'underline',
                          padding: 0,
                        }}
                      >
                        Clear ({formSelectedGroups.length})
                      </button>
                    )}
                  </div>

                  {formSelectedGroups.length > 0 && (
                    <div className="att-multigroup-selected" style={{ marginBottom: 6 }}>
                      {formSelectedGroups.map((grp) => (
                        <span key={grp} className="att-multigroup-tag">
                          {grp}
                          <button
                            type="button"
                            onClick={() => toggleGroupSelection(grp)}
                            aria-label={`Remove group ${grp}`}
                          >
                            ×
                          </button>
                        </span>
                      ))}
                    </div>
                  )}

                  <div style={{ display: 'flex', gap: 6 }}>
                    <input
                      type="text"
                      value={formCustomGroupInput}
                      onChange={(e) => setFormCustomGroupInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ',') {
                          e.preventDefault();
                          addCustomGroupsFromInput();
                        }
                      }}
                      style={{
                        flex: 1,
                        padding: '8px 10px',
                        borderRadius: 8,
                        border: '1px solid #cbd5e1',
                        fontSize: 13,
                        background: '#ffffff',
                        boxSizing: 'border-box',
                      }}
                    />
                    {formCustomGroupInput.trim().length > 0 && (
                      <button
                        type="button"
                        className="att-btn att-btn--secondary"
                        style={{ padding: '6px 10px', fontSize: 11 }}
                        onClick={addCustomGroupsFromInput}
                      >
                        + Add
                      </button>
                    )}
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
                  <div>
                    <label
                      style={{
                        display: 'block',
                        fontSize: 11,
                        fontWeight: 600,
                        color: '#334155',
                        marginBottom: 4,
                      }}
                    >
                      Expected Students
                    </label>
                    <input
                      type="number"
                      min={1}
                      max={200}
                      value={formExpectedCount}
                      onChange={(e) => setFormExpectedCount(Number(e.target.value))}
                      style={{
                        width: '100%',
                        padding: '8px 10px',
                        borderRadius: 8,
                        border: '1px solid #cbd5e1',
                        fontSize: 13,
                        boxSizing: 'border-box',
                      }}
                    />
                  </div>

                  <div>
                    <label
                      style={{
                        display: 'block',
                        fontSize: 11,
                        fontWeight: 600,
                        color: '#334155',
                        marginBottom: 4,
                      }}
                    >
                      Late After
                    </label>
                    <select
                      value={formLateAfter}
                      onChange={(e) => setFormLateAfter(Number(e.target.value))}
                      style={{
                        width: '100%',
                        padding: '8px 6px',
                        borderRadius: 8,
                        border: '1px solid #cbd5e1',
                        fontSize: 13,
                      }}
                    >
                      <option value={10}>10 min</option>
                      <option value={15}>15 min</option>
                      <option value={20}>20 min</option>
                      <option value={30}>30 min</option>
                    </select>
                  </div>

                  <div>
                    <label
                      style={{
                        display: 'block',
                        fontSize: 11,
                        fontWeight: 600,
                        color: '#334155',
                        marginBottom: 4,
                      }}
                    >
                      QR Rotation
                    </label>
                    <select
                      value={formStepSeconds}
                      onChange={(e) => setFormStepSeconds(Number(e.target.value))}
                      style={{
                        width: '100%',
                        padding: '8px 6px',
                        borderRadius: 8,
                        border: '1px solid #cbd5e1',
                        fontSize: 13,
                      }}
                    >
                      <option value={15}>15 sec</option>
                      <option value={20}>20 sec</option>
                      <option value={30}>30 sec</option>
                    </select>
                  </div>
                </div>

                <button
                  type="submit"
                  className="att-btn att-btn--primary"
                  style={{ height: 40, marginTop: 4 }}
                  disabled={isCreatingSession}
                >
                  {isCreatingSession ? 'Starting Session…' : 'Start QR Attendance Session'}
                </button>
              </form>
            </div>
          )}
        </>
      )}

      {/* ============================================================== */}
      {/* TEACHER TAB 2: ATTENDANCE STATISTICS & STUDENT ROSTER          */}
      {/* ============================================================== */}
      {isTeacherOrAdmin && activeTab === 'stats' && (
        <>
          <div className="att-card">
            <div className="att-card__header">
              <h3 className="att-card__title">
                <UsersIcon size={16} />
                Class Attendance Statistics
              </h3>
              <button
                type="button"
                className="att-btn att-btn--secondary"
                style={{ padding: '4px 8px', fontSize: 11 }}
                onClick={() => {
                  loadSessionsData();
                  if (selectedStatsSessionId) {
                    getAttendanceSession(selectedStatsSessionId).then((d) => {
                      if (d) setStatsSessionDetail(d);
                    });
                  }
                }}
              >
                <RefreshIcon size={12} /> Refresh
              </button>
            </div>

            {/* Class Session Recordings Selector (Interactive Cards) */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  flexWrap: 'wrap',
                  gap: 6,
                }}
              >
                <span
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    color: '#475569',
                    textTransform: 'uppercase',
                    letterSpacing: '0.3px',
                  }}
                >
                  Class Recordings ({filteredRecordingSessions.length})
                </span>
                <div style={{ display: 'flex', gap: 4 }}>
                  {(
                    [
                      { key: 'ALL', label: 'All' },
                      { key: 'CLOSED', label: 'Completed' },
                      { key: 'OPEN', label: 'Live' },
                    ] as const
                  ).map((tab) => (
                    <button
                      key={tab.key}
                      type="button"
                      className={`att-building-pill${
                        statsSessionStatusFilter === tab.key ? ' is-active' : ''
                      }`}
                      style={{ padding: '3px 9px', fontSize: 11 }}
                      onClick={() => setStatsSessionStatusFilter(tab.key)}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="att-recordings-list">
                {filteredRecordingSessions.length === 0 ? (
                  <div
                    style={{
                      padding: '16px 0',
                      textAlign: 'center',
                      color: '#94a3b8',
                      fontSize: 12,
                    }}
                  >
                    No class recordings match this filter.
                  </div>
                ) : (
                  filteredRecordingSessions.map((s) => {
                    const isSelected = currentStatsSession?.id === s.id;
                    const isOpen = Boolean(s.is_open && !s.closed_at);
                    const attended = (s.counts?.present || 0) + (s.counts?.late || 0);
                    const expected = s.expected_count || 30;
                    return (
                      <button
                        key={s.id}
                        type="button"
                        className={`att-recording-card${isSelected ? ' is-selected' : ''}`}
                        onClick={() => {
                          setSelectedStatsSessionId(s.id);
                          setStatsGroupFilter('ALL');
                        }}
                      >
                        <div className="att-recording-card__main">
                          <div className="att-recording-card__title">{formatSessionTitle(s)}</div>
                          <div className="att-recording-card__meta">
                            <span>🏛️ {formatRoomDisplay(s.room_id, s.room_label)}</span>
                            {s.group_label && <span>👥 {s.group_label}</span>}
                            <span>
                              📅{' '}
                              {new Date(s.opened_at).toLocaleString([], {
                                month: 'short',
                                day: 'numeric',
                                hour: '2-digit',
                                minute: '2-digit',
                              })}
                            </span>
                          </div>
                        </div>

                        <div className="att-recording-card__right">
                          <span
                            className={`att-badge ${
                              isOpen ? 'att-badge--open' : 'att-badge--present'
                            }`}
                          >
                            {isOpen ? 'Live' : 'Completed'}
                          </span>
                          <span className="att-recording-card__count">
                            {attended} / {expected} present
                          </span>
                        </div>
                      </button>
                    );
                  })
                )}
              </div>
            </div>

            {currentStatsSession ? (
              <>
                {/* Selected Recording Banner */}
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    flexWrap: 'wrap',
                    gap: 8,
                    padding: '12px 14px',
                    background: 'linear-gradient(135deg, #f8fafc, #eff6ff)',
                    borderRadius: 12,
                    border: '1px solid rgba(0, 44, 108, 0.12)',
                  }}
                >
                  <div>
                    <div style={{ fontSize: 15, fontWeight: 800, color: '#0f172a' }}>
                      {formatSessionTitle(currentStatsSession)}
                    </div>
                    <div
                      style={{
                        display: 'flex',
                        flexWrap: 'wrap',
                        gap: '6px 10px',
                        alignItems: 'center',
                        fontSize: 12,
                        color: '#475569',
                        marginTop: 4,
                      }}
                    >
                      <span>
                        🏛️{' '}
                        {formatRoomDisplay(
                          currentStatsSession.room_id,
                          currentStatsSession.room_label,
                        )}
                      </span>
                      {currentStatsSession.group_label && (
                        <span>👥 Group(s): {currentStatsSession.group_label}</span>
                      )}
                      {currentStatsSession.teacher_label && (
                        <span>👨‍🏫 {currentStatsSession.teacher_label}</span>
                      )}
                    </div>
                    <div style={{ fontSize: 11, color: '#64748b', marginTop: 4 }}>
                      Opened:{' '}
                      {new Date(currentStatsSession.opened_at).toLocaleString([], {
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                      {currentStatsSession.closed_at &&
                        ` · Closed: ${new Date(currentStatsSession.closed_at).toLocaleTimeString(
                          [],
                          {
                            hour: '2-digit',
                            minute: '2-digit',
                          },
                        )}`}
                    </div>
                  </div>
                  <span
                    className={`att-badge ${
                      currentStatsSession.is_open && !currentStatsSession.closed_at
                        ? 'att-badge--open'
                        : 'att-badge--present'
                    }`}
                  >
                    {currentStatsSession.is_open && !currentStatsSession.closed_at
                      ? 'Session Live'
                      : 'Session Completed'}
                  </span>
                </div>

                {/* Balanced 4-Card Statistics Grid */}
                <div className="att-stats-grid">
                  <div className="att-stat-card att-stat-card--primary">
                    <span className="att-stat-label">Students Attended</span>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                      <span className="att-stat-value">
                        {totalAttendedCount} / {expectedStudentsCount}
                      </span>
                      <span style={{ fontSize: 12, fontWeight: 700, color: '#002c6c' }}>
                        ({attendanceRatePct}%)
                      </span>
                    </div>
                    <div className="att-qr-progress-bar" style={{ marginTop: 4 }}>
                      <div
                        className="att-qr-progress-fill"
                        style={{ width: `${attendanceRatePct}%` }}
                      />
                    </div>
                  </div>

                  <div className="att-stat-card">
                    <span className="att-stat-label">On Time (Present)</span>
                    <span className="att-stat-value" style={{ color: '#15803d' }}>
                      {currentStatsSession.counts.present}
                    </span>
                    <span className="att-stat-sub">Checked in on time</span>
                  </div>

                  <div className="att-stat-card">
                    <span className="att-stat-label">Late Check-Ins</span>
                    <span className="att-stat-value" style={{ color: '#b45309' }}>
                      {currentStatsSession.counts.late}
                    </span>
                    <span className="att-stat-sub">
                      After {currentStatsSession.late_after_minutes || 15} min threshold
                    </span>
                  </div>

                  <div className="att-stat-card">
                    <span className="att-stat-label">Absent</span>
                    <span className="att-stat-value" style={{ color: '#64748b' }}>
                      {Math.max(0, expectedStudentsCount - totalAttendedCount)}
                    </span>
                    <span className="att-stat-sub">Not checked in</span>
                  </div>
                </div>

                {/* Group Breakdown */}
                {groupBreakdown.length > 0 && (
                  <div>
                    <div
                      style={{
                        fontSize: 11,
                        fontWeight: 700,
                        color: '#475569',
                        textTransform: 'uppercase',
                        marginBottom: 6,
                      }}
                    >
                      Attendance by Group Number
                    </div>
                    <div className="att-group-chips">
                      <button
                        type="button"
                        className="att-group-chip"
                        style={{
                          cursor: 'pointer',
                          background: statsGroupFilter === 'ALL' ? '#002c6c' : '#eff6ff',
                          color: statsGroupFilter === 'ALL' ? '#ffffff' : '#002c6c',
                        }}
                        onClick={() => setStatsGroupFilter('ALL')}
                      >
                        All Groups ({attendedRecords.length})
                      </button>
                      {groupBreakdown.map(([grp, count]) => (
                        <button
                          key={grp}
                          type="button"
                          className="att-group-chip"
                          style={{
                            cursor: 'pointer',
                            background: statsGroupFilter === grp ? '#002c6c' : '#eff6ff',
                            color: statsGroupFilter === grp ? '#ffffff' : '#002c6c',
                          }}
                          onClick={() => setStatsGroupFilter(grp)}
                        >
                          Group {grp}: {count} {count === 1 ? 'student' : 'students'}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Full Student Roster List with Full Name and Group Number */}
                <div>
                  <div
                    className="att-card__header"
                    style={{ marginBottom: 8, gap: 8, flexWrap: 'wrap' }}
                  >
                    <h4 style={{ margin: 0, fontSize: 13, fontWeight: 700, color: '#0f172a' }}>
                      Attended Students List ({filteredStatsRecords.length})
                    </h4>
                    <input
                      type="text"
                      placeholder="Search by full name, group, or ID…"
                      value={statsSearchQuery}
                      onChange={(e) => setStatsSearchQuery(e.target.value)}
                      style={{
                        padding: '6px 10px',
                        borderRadius: 8,
                        border: '1px solid #cbd5e1',
                        fontSize: 12,
                        minWidth: 200,
                      }}
                    />
                  </div>

                  <div className="att-roster-list">
                    {filteredStatsRecords.length === 0 ? (
                      <div
                        style={{
                          padding: '20px 0',
                          textAlign: 'center',
                          color: '#94a3b8',
                          fontSize: 12,
                        }}
                      >
                        No attended students match this filter yet.
                      </div>
                    ) : (
                      filteredStatsRecords.map((rec, idx) => (
                        <div key={rec.id} className="att-roster-row">
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <span className="att-roster-index">{idx + 1}</span>
                            <div>
                              <div
                                style={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: 6,
                                  flexWrap: 'wrap',
                                }}
                              >
                                <strong style={{ color: '#0f172a', fontSize: 13 }}>
                                  {rec.student_name ||
                                    (rec.user_id ? rec.user_id.replace(/^user-/, '') : 'Student')}
                                </strong>
                                <span className="att-group-pill">
                                  Group {rec.group_no || currentStatsSession.group_label || '—'}
                                </span>
                              </div>
                              <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>
                                {rec.student_id && <span>Student ID: {rec.student_id} · </span>}
                                {rec.department && <span>{rec.department} · </span>}
                                Checked in at{' '}
                                {new Date(rec.scanned_at).toLocaleTimeString([], {
                                  hour: '2-digit',
                                  minute: '2-digit',
                                  second: '2-digit',
                                })}
                              </div>
                            </div>
                          </div>

                          <span
                            className={`att-badge att-badge--${
                              rec.state === 'present'
                                ? 'present'
                                : rec.state === 'late'
                                ? 'late'
                                : 'pending'
                            }`}
                          >
                            {rec.state === 'present'
                              ? 'Present'
                              : rec.state === 'late'
                              ? 'Late'
                              : 'Pending'}
                          </span>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </>
            ) : (
              <div
                style={{ padding: '20px 0', textAlign: 'center', color: '#94a3b8', fontSize: 13 }}
              >
                No attendance sessions recorded yet.
              </div>
            )}
          </div>
        </>
      )}

      {/* Fullscreen Projector Modal for Lecture Halls */}
      {isProjectorOpen && activeTeacherSession && isTeacherOrAdmin && (
        <div className="att-projector-modal" onClick={() => setIsProjectorOpen(false)}>
          <div className="att-projector-content" onClick={(e) => e.stopPropagation()}>
            <div
              style={{
                width: '100%',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <div style={{ textAlign: 'left' }}>
                <h2 style={{ margin: 0, fontSize: 20, color: '#002c6c' }}>
                  {activeTeacherSession.subject || 'Class Lecture'}
                </h2>
                <span style={{ fontSize: 14, color: '#64748b' }}>
                  {formatRoomDisplay(
                    activeTeacherSession.room_id,
                    activeTeacherSession.room_label,
                  )}
                  {activeTeacherSession.group_label
                    ? ` · Group ${activeTeacherSession.group_label}`
                    : ''}{' '}
                  · {activeTeacherSession.teacher_label || 'Ajou University in Tashkent'}
                </span>
              </div>
              <button
                type="button"
                className="att-btn att-btn--secondary"
                onClick={() => setIsProjectorOpen(false)}
              >
                ✕ Close
              </button>
            </div>

            <div className="att-projector-qr">
              {currentQr?.qr_svg && currentQr.qr_svg.trim().startsWith('<svg') && (
                <img
                  src={`data:image/svg+xml;utf8,${encodeURIComponent(currentQr.qr_svg)}`}
                  alt="Projector Rotating QR Code"
                  style={{ width: '100%', height: '100%', display: 'block' }}
                />
              )}
            </div>

            <div style={{ width: '100%', maxWidth: 300 }}>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  fontSize: 13,
                  fontWeight: 600,
                  color: '#64748b',
                  marginBottom: 6,
                }}
              >
                <span>Dynamic Rotating Token</span>
                <span>{qrRemainingSeconds}s remaining</span>
              </div>
              <div className="att-qr-progress-bar" style={{ height: 8 }}>
                <div
                  className="att-qr-progress-fill"
                  style={{
                    width: `${Math.max(
                      0,
                      Math.min(
                        100,
                        (qrRemainingSeconds / (activeTeacherSession.token_step_seconds || 20)) *
                          100,
                      ),
                    )}%`,
                  }}
                />
              </div>
            </div>

            <div style={{ fontSize: 13, color: '#475569' }}>
              Open Campus Map on your phone &rarr; Tap <strong>QR Attendance</strong> &rarr; Scan
              screen or enter token:{' '}
              <strong style={{ fontFamily: 'monospace', fontSize: 15 }}>
                {currentQr?.token}
              </strong>
            </div>

            <div style={{ fontSize: 12, fontWeight: 700, color: '#002c6c' }}>
              Live Checked-In Students:{' '}
              {activeTeacherSession.counts.present + activeTeacherSession.counts.late} /{' '}
              {activeTeacherSession.expected_count || 30}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
