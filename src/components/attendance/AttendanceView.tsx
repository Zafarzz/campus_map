import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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

export function AttendanceView({ onBackToMap }: AttendanceViewProps) {
  const { user, openLogin } = useAuth();
  const { index, selectRoom } = useMap();

  const isTeacherOrAdmin = Boolean(
    user?.is_admin ||
      user?.account_type === 'staff' ||
      user?.effective_roles?.includes('teacher') ||
      user?.effective_roles?.includes('admin'),
  );

  const [activeTab, setActiveTab] = useState<'student' | 'teacher' | 'history'>(() =>
    isTeacherOrAdmin ? 'teacher' : 'student',
  );

  const [sessions, setSessions] = useState<AttendanceSessionInfo[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState<string>('');
  const [activeTeacherSession, setActiveTeacherSession] = useState<AttendanceSessionInfo | null>(null);
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

  // Teacher open session form
  const [formRoomId, setFormRoomId] = useState<string>('room-a-101');
  const [formSubject, setFormSubject] = useState<string>('');
  const [formExpectedCount, setFormExpectedCount] = useState<number>(30);
  const [formLateAfter, setFormLateAfter] = useState<number>(15);
  const [formStepSeconds, setFormStepSeconds] = useState<number>(20);
  const [isCreatingSession, setIsCreatingSession] = useState<boolean>(false);

  // Fullscreen projector mode
  const [isProjectorOpen, setIsProjectorOpen] = useState<boolean>(false);

  // Load all sessions
  const loadSessionsData = useCallback(async () => {
    const list = await listAttendanceSessions('all');
    setSessions(list);
    if (list.length > 0 && !selectedSessionId) {
      const openOne = list.find((s) => s.is_open);
      setSelectedSessionId(openOne ? openOne.id : list[0].id);
    }
  }, [selectedSessionId]);

  // Load student check-in history
  const loadMyRecordsData = useCallback(async () => {
    const list = await listMyAttendanceRecords();
    setMyRecords(list);
  }, []);

  useEffect(() => {
    loadSessionsData();
    loadMyRecordsData();
  }, [loadSessionsData, loadMyRecordsData]);

  // Sync active teacher session
  useEffect(() => {
    if (activeTab === 'teacher') {
      const openSession = sessions.find((s) => s.is_open);
      if (openSession) {
        setActiveTeacherSession(openSession);
      }
    }
  }, [activeTab, sessions]);

  // Fetch rotating QR code for the active session
  const activeSessionForQr = activeTab === 'teacher' ? activeTeacherSession : null;

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

    // Refresh QR token every token_step_seconds
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

  // Camera scanner handling
  const startCamera = async () => {
    try {
      setIsCameraActive(true);
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
      });
      mediaStreamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play().catch(() => {});
      }
    } catch (err) {
      console.warn('Camera access denied or unavailable:', err);
      setIsCameraActive(false);
      setScanError('Camera unavailable. You can enter or paste the token directly.');
    }
  };

  const stopCamera = () => {
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;
    }
    setIsCameraActive(false);
  };

  useEffect(() => {
    return () => {
      stopCamera();
    };
  }, []);

  // Handle student scan check-in
  const handlePerformScan = async (targetSessionId: string, tokenToScan: string) => {
    if (!tokenToScan.trim()) {
      setScanError('Please enter a valid attendance QR token.');
      return;
    }
    setIsSubmittingScan(true);
    setScanError(null);
    setScanResult(null);

    // Parse aut-att:<session_id>:<token> if full payload was entered/scanned
    let parsedSessionId = targetSessionId;
    let cleanToken = tokenToScan.trim();

    if (cleanToken.startsWith('aut-att:')) {
      const parts = cleanToken.split(':');
      if (parts.length >= 3) {
        parsedSessionId = parts[1];
        cleanToken = parts[2];
      }
    }

    try {
      const res = await scanAttendanceQr(parsedSessionId, { token: cleanToken });
      setScanResult(res);
      setTokenInput('');
      stopCamera();
      await loadSessionsData();
      await loadMyRecordsData();
    } catch (err: any) {
      setScanError(err?.message || 'Check-in failed. Please verify the QR token.');
    } finally {
      setIsSubmittingScan(false);
    }
  };

  // Quick 1-click test check-in for an active session
  const handleFastCheckIn = async (session: AttendanceSessionInfo) => {
    const qr = await getAttendanceQr(session.id);
    await handlePerformScan(session.id, qr.token);
  };

  // Teacher actions
  const [confirmingCloseSession, setConfirmingCloseSession] = useState<boolean>(false);

  const handleCreateSession = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formRoomId) return;
    setIsCreatingSession(true);
    try {
      const newSession = await openAttendanceSession({
        room_id: formRoomId,
        token_step_seconds: formStepSeconds,
        late_after_minutes: formLateAfter,
        expected_count: formExpectedCount,
      });
      if (formSubject) {
        newSession.subject = formSubject;
      }
      setActiveTeacherSession(newSession);
      setConfirmingCloseSession(false);
      await loadSessionsData();
    } catch (err: unknown) {
      setScanError(`Could not start attendance session: ${err instanceof Error ? err.message : 'Error'}`);
    } finally {
      setIsCreatingSession(false);
    }
  };

  const handleCloseActiveSession = async () => {
    if (!activeTeacherSession) return;
    await closeAttendanceSession(activeTeacherSession.id);
    setActiveTeacherSession(null);
    setConfirmingCloseSession(false);
    await loadSessionsData();
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
    await loadSessionsData();
  };

  // Navigate to room in 3D Map
  const handleLocateRoomOnMap = (roomId: string) => {
    selectRoom(roomId);
    onBackToMap();
  };

  // All bookable and study rooms from campus index
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

  return (
    <div className="att-view">
      {/* Role Banner / Profile Quick Switch */}
      <div className="att-role-banner">
        <div className="att-role-badge">
          {isTeacherOrAdmin ? <BriefcaseIcon size={16} /> : <GraduationIcon size={16} />}
          <span>
            {user ? `${user.display_name} (${user.account_type})` : 'Guest / Demo Mode'}
          </span>
        </div>
        {!user ? (
          <button type="button" className="att-role-switch-btn" onClick={() => openLogin("student")}>
            Sign In with ID
          </button>
        ) : (
          <button
            type="button"
            className="att-role-switch-btn"
            onClick={() => {
              setActiveTab((prev) => (prev === 'teacher' ? 'student' : 'teacher'));
            }}
          >
            Switch to {activeTab === 'teacher' ? 'Student View' : 'Teacher View'}
          </button>
        )}
      </div>

      {/* Tabs */}
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
          aria-selected={activeTab === 'teacher'}
          className={`att-tab-btn${activeTab === 'teacher' ? ' is-active' : ''}`}
          onClick={() => setActiveTab('teacher')}
        >
          <QrCodeIcon size={16} />
          Teacher QR Session
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
                ? 'You have been marked present for this class session.'
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
            <strong>Attendance Error</strong>
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
      {/* TAB 1: STUDENT CHECK-IN                                        */}
      {/* ============================================================== */}
      {activeTab === 'student' && (
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
              Select your current lecture hall or scan the rotating QR code projected on the classroom board.
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {sessions.filter((s) => s.is_open).length === 0 ? (
                <div style={{ padding: '20px 0', textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>
                  No open attendance sessions right now. Ask your professor to launch a session!
                </div>
              ) : (
                sessions
                  .filter((s) => s.is_open)
                  .map((sess) => (
                    <div key={sess.id} className="att-session-item">
                      <div className="att-session-title-row">
                        <span className="att-session-title">
                          {sess.subject || `Class in ${sess.room_id || 'Room'}`}
                        </span>
                        <span className="att-badge att-badge--open">Live Session</span>
                      </div>

                      <div className="att-meta-row">
                        <span>🏛️ {sess.room_id ? sess.room_id.replace(/^room-/, '').toUpperCase() : 'Campus'}</span>
                        {sess.teacher_label && <span>👨‍🏫 {sess.teacher_label}</span>}
                        {sess.group_label && <span>👥 {sess.group_label}</span>}
                        <span>
                          👥 {sess.counts.present + sess.counts.late} / {sess.expected_count || 30} present
                        </span>
                      </div>

                      <div className="att-actions-row">
                        <button
                          type="button"
                          className="att-btn att-btn--primary"
                          onClick={() => handleFastCheckIn(sess)}
                          disabled={isSubmittingScan}
                        >
                          ⚡ 1-Click Check-in
                        </button>
                        {sess.room_id && (
                          <button
                            type="button"
                            className="att-btn att-btn--map"
                            onClick={() => handleLocateRoomOnMap(sess.room_id!)}
                            title="Locate classroom in 3D"
                          >
                            <MapNavIcon size={14} /> Locate in 3D
                          </button>
                        )}
                      </div>
                    </div>
                  ))
              )}
            </div>
          </div>

          {/* Scanner or Manual Code Submission */}
          <div className="att-card">
            <h3 className="att-card__title">
              <CameraIcon size={16} />
              Scan QR Code or Enter Token
            </h3>

            {isCameraActive ? (
              <div className="att-scanner-box">
                <video ref={videoRef} className="att-scanner-video" playsInline />
                <div className="att-scanner-overlay">
                  <div className="att-scanner-target">
                    <div className="att-scanner-laser" />
                  </div>
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
              <button
                type="button"
                className="att-btn att-btn--secondary"
                style={{ height: 42 }}
                onClick={startCamera}
              >
                <CameraIcon size={18} /> Open Device Camera Scanner
              </button>
            )}

            <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
              <input
                type="text"
                placeholder="Paste QR token (e.g. aut-att:... or token code)"
                value={tokenInput}
                onChange={(e) => setTokenInput(e.target.value)}
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
                onClick={() => handlePerformScan(selectedSessionId || sessions[0]?.id || 'demo', tokenInput)}
                disabled={isSubmittingScan || !tokenInput.trim()}
              >
                {isSubmittingScan ? 'Checking in…' : 'Submit Check-in'}
              </button>
            </div>
          </div>
        </>
      )}

      {/* ============================================================== */}
      {/* TAB 2: TEACHER QR SESSION                                      */}
      {/* ============================================================== */}
      {activeTab === 'teacher' && (
        <>
          {activeTeacherSession ? (
            <div className="att-card">
              <div className="att-card__header">
                <div>
                  <h3 className="att-card__title" style={{ fontSize: 16 }}>
                    {activeTeacherSession.subject || 'Active Class Attendance'}
                  </h3>
                  <span style={{ fontSize: 12, color: '#64748b' }}>
                    Room: {activeTeacherSession.room_id?.replace(/^room-/, '').toUpperCase()} ·{' '}
                    {activeTeacherSession.teacher_label || 'Professor'}
                  </span>
                </div>
                <span className="att-badge att-badge--open">Active Session</span>
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
                            (qrRemainingSeconds / (activeTeacherSession.token_step_seconds || 20)) * 100,
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

                <div style={{ display: 'flex', gap: 8 }}>
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
                    Close Session
                  </button>
                </div>
              </div>

              {/* Live Attendee Roster */}
              <div style={{ marginTop: 8 }}>
                <div className="att-card__header" style={{ marginBottom: 10 }}>
                  <h4 style={{ margin: 0, fontSize: 13, fontWeight: 700, color: '#1e293b' }}>
                    Live Attendees ({activeTeacherSession.counts.present + activeTeacherSession.counts.late} /{' '}
                    {activeTeacherSession.expected_count || 30})
                  </h4>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <span className="att-badge att-badge--present">
                      {activeTeacherSession.counts.present} Present
                    </span>
                    <span className="att-badge att-badge--late">
                      {activeTeacherSession.counts.late} Late
                    </span>
                    {activeTeacherSession.counts.pending_review > 0 && (
                      <span className="att-badge att-badge--pending">
                        {activeTeacherSession.counts.pending_review} Pending Review
                      </span>
                    )}
                  </div>
                </div>

                <div style={{ maxHeight: 240, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {(activeTeacherSession.records || []).length === 0 ? (
                    <div style={{ padding: '16px 0', textAlign: 'center', color: '#94a3b8', fontSize: 12 }}>
                      No student scans yet. Waiting for students to check in…
                    </div>
                  ) : (
                    (activeTeacherSession.records || []).map((rec: AttendanceRecordItem) => (
                      <div
                        key={rec.id}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          padding: '8px 10px',
                          background: '#f8fafc',
                          borderRadius: 8,
                          fontSize: 12,
                        }}
                      >
                        <div>
                          <strong style={{ color: '#1e293b' }}>
                            {rec.user_id ? rec.user_id.replace(/^user-/, '') : 'Student'}
                          </strong>
                          <span style={{ color: '#64748b', marginLeft: 8 }}>
                            {new Date(rec.scanned_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                          {rec.review_reason && (
                            <div style={{ fontSize: 11, color: '#b45309', marginTop: 2 }}>
                              ⚠️ {rec.review_reason}
                            </div>
                          )}
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
                            {rec.state}
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
                    ))
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

              <form onSubmit={handleCreateSession} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#334155', marginBottom: 4 }}>
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

                <div>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: '#334155', marginBottom: 4 }}>
                    Course Subject / Title
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. Computer Graphics & Visual Computing"
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

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
                  <div>
                    <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: '#334155', marginBottom: 4 }}>
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
                    <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: '#334155', marginBottom: 4 }}>
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
                    <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: '#334155', marginBottom: 4 }}>
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
      {/* TAB 3: MY ATTENDANCE HISTORY                                   */}
      {/* ============================================================== */}
      {activeTab === 'history' && (
        <div className="att-card">
          <div className="att-card__header">
            <h3 className="att-card__title">
              <ClockIcon size={16} />
              My Attendance Records
            </h3>
            <span style={{ fontSize: 12, fontWeight: 600, color: '#002c6c' }}>
              {myRecords.length} recorded check-ins
            </span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {myRecords.length === 0 ? (
              <div style={{ padding: '24px 0', textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>
                No attendance check-in records yet. Scan any active class QR code to record attendance!
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
                    {rec.room_id && <span>🏛️ {rec.room_id.replace(/^room-/, '').toUpperCase()}</span>}
                    {rec.teacher_label && <span>👨‍🏫 {rec.teacher_label}</span>}
                    <span>
                      📅 {new Date(rec.scanned_at).toLocaleDateString([], { month: 'short', day: 'numeric' })} at{' '}
                      {new Date(rec.scanned_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
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

      {/* Fullscreen Projector Modal for Lecture Halls */}
      {isProjectorOpen && activeTeacherSession && (
        <div className="att-projector-modal" onClick={() => setIsProjectorOpen(false)}>
          <div className="att-projector-content" onClick={(e) => e.stopPropagation()}>
            <div style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ textAlign: 'left' }}>
                <h2 style={{ margin: 0, fontSize: 20, color: '#002c6c' }}>
                  {activeTeacherSession.subject || 'Class Lecture'}
                </h2>
                <span style={{ fontSize: 14, color: '#64748b' }}>
                  Room {activeTeacherSession.room_id?.replace(/^room-/, '').toUpperCase()} ·{' '}
                  {activeTeacherSession.teacher_label || 'Ajou University in Tashkent'}
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
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, fontWeight: 600, color: '#64748b', marginBottom: 6 }}>
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
                        (qrRemainingSeconds / (activeTeacherSession.token_step_seconds || 20)) * 100,
                      ),
                    )}%`,
                  }}
                />
              </div>
            </div>

            <div style={{ fontSize: 13, color: '#475569' }}>
              Open Campus Map on your phone &rarr; Tap <strong>QR Attendance</strong> &rarr; Scan screen or enter token:{' '}
              <strong style={{ fontFamily: 'monospace' }}>{currentQr?.token}</strong>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
