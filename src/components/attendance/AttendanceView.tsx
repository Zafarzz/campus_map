import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import jsQR from 'jsqr';
import { useAuth } from '../../state/AuthContext';
import { useMap } from '../../state/MapProvider';
import {
  AlertIcon,
  BriefcaseIcon,
  CameraIcon,
  CheckCircleIcon,
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

export function AttendanceView({ onBackToMap }: AttendanceViewProps) {
  const { user, openLogin } = useAuth();
  const { index, selectRoom } = useMap();

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
  const [formRoomId, setFormRoomId] = useState<string>('room-a-101');
  const [formSubject, setFormSubject] = useState<string>('');
  const [formGroupLabel, setFormGroupLabel] = useState<string>('I25C');
  const [formExpectedCount, setFormExpectedCount] = useState<number>(30);
  const [formLateAfter, setFormLateAfter] = useState<number>(15);
  const [formStepSeconds, setFormStepSeconds] = useState<number>(20);
  const [isCreatingSession, setIsCreatingSession] = useState<boolean>(false);

  // Fullscreen projector mode
  const [isProjectorOpen, setIsProjectorOpen] = useState<boolean>(false);

  // All classrooms and lecture halls from campus index
  const availableRooms = useMemo(() => {
    const list: { id: string; name: string; buildingName: string }[] = [];
    index.rooms.forEach((loc) => {
      list.push({
        id: loc.room.id,
        name: loc.room.name || loc.room.id,
        buildingName: loc.building.name,
      });
    });
    return list.sort((a, b) => a.name.localeCompare(b.name));
  }, [index]);

  const formatRoomDisplay = useCallback(
    (roomId?: string | null, roomLabel?: string | null) => {
      if (roomLabel) return roomLabel;
      if (!roomId) return 'Campus Classroom';
      const found = availableRooms.find((r) => r.id === roomId);
      if (found) return `${found.name} (${found.buildingName})`;
      return roomId.replace(/^room-/, '').toUpperCase();
    },
    [availableRooms],
  );

  // Load all sessions
  const loadSessionsData = useCallback(async () => {
    const list = await listAttendanceSessions('all');
    setSessions(list);
    if (list.length > 0) {
      const openOne = list.find((s) => s.is_open);
      setSelectedSessionId((prev) => prev || (openOne ? openOne.id : list[0].id));
      setSelectedStatsSessionId((prev) => prev || (openOne ? openOne.id : list[0].id));
    }
  }, []);

  // Load student check-in history
  const loadMyRecordsData = useCallback(async () => {
    const list = await listMyAttendanceRecords();
    setMyRecords(list);
  }, []);

  useEffect(() => {
    loadSessionsData();
    if (!isTeacherOrAdmin) {
      loadMyRecordsData();
    }
  }, [loadSessionsData, loadMyRecordsData, isTeacherOrAdmin]);

  // Sync active teacher session & fetch its full student records
  const refreshActiveTeacherSession = useCallback(async (sessionId: string) => {
    const detail = await getAttendanceSession(sessionId);
    if (detail) {
      setActiveTeacherSession(detail);
    }
  }, []);

  useEffect(() => {
    if (!isTeacherOrAdmin) return;
    const openSession = sessions.find((s) => s.is_open);
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

  // Teacher actions
  const handleCreateSession = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formRoomId) return;
    setIsCreatingSession(true);
    setScanError(null);
    try {
      const selectedRoomObj = availableRooms.find((r) => r.id === formRoomId);
      const roomLabel = selectedRoomObj
        ? `${selectedRoomObj.name} (${selectedRoomObj.buildingName})`
        : formRoomId;

      const newSession = await openAttendanceSession({
        room_id: formRoomId,
        room_label: roomLabel,
        subject: formSubject.trim() || undefined,
        group_label: formGroupLabel.trim() || undefined,
        token_step_seconds: formStepSeconds,
        late_after_minutes: formLateAfter,
        expected_count: formExpectedCount,
      });
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
      setStatsSessionDetail(closedDetail);
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

  // Computed statistics for the Teacher Statistics tab
  const currentStatsSession = useMemo(() => {
    return (
      statsSessionDetail ||
      sessions.find((s) => s.id === selectedStatsSessionId) ||
      activeTeacherSession ||
      sessions[0] ||
      null
    );
  }, [statsSessionDetail, sessions, selectedStatsSessionId, activeTeacherSession]);

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
              {sessions.filter((s) => s.is_open).length === 0 ? (
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
                  .filter((s) => s.is_open)
                  .map((sess) => {
                    const isSelected = selectedSessionId === sess.id;
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
                          <span className="att-session-title">
                            {sess.subject ||
                              `Class in ${formatRoomDisplay(sess.room_id, sess.room_label)}`}
                          </span>
                          <span className="att-badge att-badge--open">Live Session</span>
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
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedSessionId(sess.id);
                              startCamera();
                            }}
                          >
                            <CameraIcon size={14} /> Scan with Camera
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
                style={{ display: 'flex', flexDirection: 'column', gap: 12 }}
              >
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
                    Select Classroom / Lecture Hall
                  </label>
                  <select
                    value={formRoomId}
                    onChange={(e) => setFormRoomId(e.target.value)}
                    style={{
                      width: '100%',
                      padding: '8px 10px',
                      borderRadius: 8,
                      border: '1px solid #cbd5e1',
                      fontSize: 13,
                    }}
                  >
                    {availableRooms.map((rm) => (
                      <option key={rm.id} value={rm.id}>
                        {rm.name} ({rm.buildingName})
                      </option>
                    ))}
                  </select>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 8 }}>
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
                      placeholder="e.g. Organizational Behaviour"
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
                      Target Group
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. I25C"
                      value={formGroupLabel}
                      onChange={(e) => setFormGroupLabel(e.target.value)}
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

            {/* Session Selector */}
            <div>
              <label
                style={{
                  display: 'block',
                  fontSize: 11,
                  fontWeight: 600,
                  color: '#64748b',
                  marginBottom: 4,
                }}
              >
                Select Session (Active or Closed)
              </label>
              <select
                value={currentStatsSession?.id || ''}
                onChange={(e) => {
                  setSelectedStatsSessionId(e.target.value);
                  setStatsGroupFilter('ALL');
                }}
                style={{
                  width: '100%',
                  padding: '8px 10px',
                  borderRadius: 8,
                  border: '1px solid #cbd5e1',
                  fontSize: 13,
                }}
              >
                {sessions.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.subject || formatRoomDisplay(s.room_id, s.room_label)}{' '}
                    {s.group_label ? `(${s.group_label})` : ''} —{' '}
                    {s.is_open ? '🟢 Live' : '🔒 Closed'} ({s.counts.present + s.counts.late}/
                    {s.expected_count || 30} attended)
                  </option>
                ))}
              </select>
            </div>

            {currentStatsSession ? (
              <>
                {/* Session Metadata Summary */}
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    flexWrap: 'wrap',
                    gap: 8,
                    padding: '10px 12px',
                    background: '#f8fafc',
                    borderRadius: 10,
                    border: '1px solid rgba(15, 23, 42, 0.06)',
                  }}
                >
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: '#0f172a' }}>
                      {currentStatsSession.subject || 'University Class Session'}
                    </div>
                    <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>
                      🏛️{' '}
                      {formatRoomDisplay(
                        currentStatsSession.room_id,
                        currentStatsSession.room_label,
                      )}
                      {currentStatsSession.group_label &&
                        ` · 👥 Group ${currentStatsSession.group_label}`}
                      {currentStatsSession.teacher_label &&
                        ` · 👨‍🏫 ${currentStatsSession.teacher_label}`}
                    </div>
                    <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>
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
                      currentStatsSession.is_open ? 'att-badge--open' : 'att-badge--present'
                    }`}
                  >
                    {currentStatsSession.is_open ? 'Session Open' : 'Session Completed'}
                  </span>
                </div>

                {/* Whole Statistics Cards */}
                <div className="att-stats-grid">
                  <div className="att-stat-card att-stat-card--primary">
                    <span className="att-stat-label">Students Attended</span>
                    <span className="att-stat-value">
                      {totalAttendedCount} / {expectedStudentsCount}
                    </span>
                    <span className="att-stat-sub">Total verified students</span>
                  </div>

                  <div className="att-stat-card att-stat-card--primary">
                    <span className="att-stat-label">Attendance Rate</span>
                    <span className="att-stat-value">{attendanceRatePct}%</span>
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
                    <span className="att-stat-sub">Checked in before late threshold</span>
                  </div>

                  <div className="att-stat-card">
                    <span className="att-stat-label">Late / Absent</span>
                    <span className="att-stat-value" style={{ color: '#b45309' }}>
                      {currentStatsSession.counts.late} Late ·{' '}
                      {Math.max(0, expectedStudentsCount - totalAttendedCount)} Absent
                    </span>
                    <span className="att-stat-sub">
                      Late after {currentStatsSession.late_after_minutes || 15} min
                    </span>
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
