import React, { useState, useEffect, useId } from 'react';
import { useAuth } from '../../state/AuthContext';
import { validatePasswordStrength } from '../../services/auth/authService';
import './authModal.css';

export function AuthModal() {
  const {
    user,
    isAuthModalOpen,
    authModalMode,
    activeTab,
    openLogin,
    openReset,
    closeAuthModal,
    setActiveTab,
    login,
    changePassword,
    logout,
  } = useAuth();

  // Form states
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [examinationNo, setExaminationNo] = useState('');
  
  // Visibility toggles
  const [showPassword, setShowPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  // Status & errors
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const studentIdInputId = useId();
  const staffInputId = useId();
  const passwordInputId = useId();
  const currentPasswordInputId = useId();
  const newPasswordInputId = useId();
  const confirmPasswordInputId = useId();
  const examNoInputId = useId();

  // Reset local state when modal mode changes
  useEffect(() => {
    setErrorMessage(null);
    setSuccessMessage(null);
    setShowPassword(false);
    setShowNewPassword(false);
    setShowConfirmPassword(false);

    if (authModalMode === 'set_new_password' && user) {
      setIdentifier(user.student_id || user.email || '');
    }
  }, [authModalMode, user]);

  // Close on Escape key
  useEffect(() => {
    if (!isAuthModalOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (!user?.must_change_password) {
          closeAuthModal();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isAuthModalOpen, closeAuthModal, user?.must_change_password]);

  if (!isAuthModalOpen) return null;

  // Handle backdrop click
  const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget && !user?.must_change_password) {
      closeAuthModal();
    }
  };

  // Submit Sign In
  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);

    const cleanIdent = identifier.trim();
    if (!cleanIdent) {
      setErrorMessage(
        activeTab === 'student' ? 'Please enter your Student ID.' : 'Please enter your Staff Email or Username.',
      );
      return;
    }
    if (!password) {
      setErrorMessage('Please enter your password.');
      return;
    }

    setIsLoading(true);
    try {
      await login({
        account_type: activeTab,
        student_id: activeTab === 'student' ? cleanIdent : undefined,
        email: activeTab === 'staff' ? cleanIdent : undefined,
        login: cleanIdent,
        password,
      });
      // Context handles closing or redirecting to set_new_password
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Invalid credentials. Please verify and try again.';
      setErrorMessage(msg);
    } finally {
      setIsLoading(false);
    }
  };

  // Live password policy check for reset / change password
  const targetIdent = identifier || user?.student_id || user?.email || '';
  const policy = validatePasswordStrength(newPassword, targetIdent, confirmPassword);

  // Submit Password Change / Reset
  const handleChangePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);

    if (!policy.isValid) {
      setErrorMessage('Please ensure all password security requirements are met.');
      return;
    }

    setIsLoading(true);
    try {
      await changePassword({
        student_id: user?.student_id || (activeTab === 'student' ? targetIdent : undefined),
        email: user?.email || (activeTab === 'staff' ? targetIdent : undefined),
        login: targetIdent,
        current_password: currentPassword || undefined,
        examination_no: examinationNo.trim() || undefined,
        new_password: newPassword,
        confirm_password: confirmPassword,
      });
      setSuccessMessage('Password changed successfully!');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to update password. Please check your credentials.';
      setErrorMessage(msg);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div
      className="auth-overlay"
      onClick={handleBackdropClick}
      role="dialog"
      aria-modal="true"
      aria-label="Campus Authentication"
    >
      <div className="auth-card" role="document">
        {/* Close Button (Hidden if forced password change) */}
        {!user?.must_change_password && (
          <button
            type="button"
            className="auth-card__close"
            onClick={closeAuthModal}
            aria-label="Close dialog"
            title="Close"
          >
            ✕
          </button>
        )}

        {/* -------------------------------------------------------------
            MODE: LOGIN (Reference Design Photo 4 + Architecture Photo 3)
           ------------------------------------------------------------- */}
        {authModalMode === 'login' && (
          <>
            <div className="auth-card__header">
              <div className="auth-card__badge-icon" aria-hidden="true">
                🏛️
              </div>
              <h2 className="auth-card__title">Sign in to Campus</h2>
              <p className="auth-card__subtitle">
                Access your real-time schedule, room details, and campus services.
              </p>
            </div>

            {/* Segmented Tab Switch (Student vs Staff) */}
            <div className="auth-tabs" role="tablist" aria-label="Account Type">
              <button
                type="button"
                role="tab"
                aria-selected={activeTab === 'student'}
                className={`auth-tab-btn${activeTab === 'student' ? ' auth-tab-btn--active' : ''}`}
                onClick={() => {
                  setActiveTab('student');
                  setErrorMessage(null);
                }}
              >
                🎓 Student
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={activeTab === 'staff'}
                className={`auth-tab-btn${activeTab === 'staff' ? ' auth-tab-btn--active' : ''}`}
                onClick={() => {
                  setActiveTab('staff');
                  setErrorMessage(null);
                }}
              >
                💼 Staff / Admin
              </button>
            </div>

            {errorMessage && (
              <div className="auth-error-banner" role="alert">
                <span>⚠️</span>
                <span>{errorMessage}</span>
              </div>
            )}

            <form className="auth-form" onSubmit={handleLoginSubmit} noValidate>
              {activeTab === 'student' ? (
                <div className="auth-field">
                  <label htmlFor={studentIdInputId} className="auth-label">
                    Student ID
                  </label>
                  <div className="auth-input-wrapper">
                    <span className="auth-input-icon" aria-hidden="true">👤</span>
                    <input
                      id={studentIdInputId}
                      type="text"
                      className="auth-input"
                      placeholder="e.g. 202590207"
                      value={identifier}
                      onChange={(e) => setIdentifier(e.target.value)}
                      autoComplete="username"
                      required
                    />
                  </div>
                </div>
              ) : (
                <div className="auth-field">
                  <label htmlFor={staffInputId} className="auth-label">
                    Staff Email or Username
                  </label>
                  <div className="auth-input-wrapper">
                    <span className="auth-input-icon" aria-hidden="true">💼</span>
                    <input
                      id={staffInputId}
                      type="text"
                      className="auth-input"
                      placeholder="e.g. admin@ajou.uz"
                      value={identifier}
                      onChange={(e) => setIdentifier(e.target.value)}
                      autoComplete="username"
                      required
                    />
                  </div>
                </div>
              )}

              <div className="auth-field">
                <div className="auth-label">
                  <label htmlFor={passwordInputId}>Password</label>
                  <button
                    type="button"
                    className="auth-forgot-link"
                    onClick={openReset}
                  >
                    Forgot password?
                  </button>
                </div>
                <div className="auth-input-wrapper">
                  <span className="auth-input-icon" aria-hidden="true">🔒</span>
                  <input
                    id={passwordInputId}
                    type={showPassword ? 'text' : 'password'}
                    className="auth-input"
                    placeholder="Enter your password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete="current-password"
                    required
                  />
                  <button
                    type="button"
                    className="auth-password-toggle"
                    onClick={() => setShowPassword((prev) => !prev)}
                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                    tabIndex={-1}
                  >
                    {showPassword ? '👁️' : '👁️‍🗨️'}
                  </button>
                </div>
              </div>

              {activeTab === 'student' ? (
                <div className="auth-helper-pill">
                  <span>💡</span>
                  <span>
                    <strong>First time?</strong> Use your 9-digit Student ID as both login and password.
                  </span>
                </div>
              ) : (
                <div className="auth-helper-pill">
                  <span>ℹ️</span>
                  <span>
                    Faculty professors and staff may sign in with their university email address.
                  </span>
                </div>
              )}

              <button
                type="submit"
                className="auth-submit-btn"
                disabled={isLoading}
              >
                {isLoading ? 'Signing in…' : 'Log In'}
              </button>
            </form>
          </>
        )}

        {/* -------------------------------------------------------------
            MODE: RESET PASSWORD (Reference Design Photo 4)
           ------------------------------------------------------------- */}
        {authModalMode === 'reset' && (
          <>
            <div className="auth-card__header">
              <div className="auth-card__badge-icon" aria-hidden="true">
                🔑
              </div>
              <h2 className="auth-card__title">Reset Password</h2>
              <p className="auth-card__subtitle">
                Enter your account details and choose a secure new password.
              </p>
            </div>

            {errorMessage && (
              <div className="auth-error-banner" role="alert">
                <span>⚠️</span>
                <span>{errorMessage}</span>
              </div>
            )}
            {successMessage && (
              <div className="auth-helper-pill" style={{ background: '#ecfdf5', borderColor: '#a7f3d0', color: '#047857' }}>
                <span>✅</span>
                <span>{successMessage}</span>
              </div>
            )}

            <form className="auth-form" onSubmit={handleChangePasswordSubmit} noValidate>
              <div className="auth-field">
                <label htmlFor={studentIdInputId} className="auth-label">
                  Student ID or Staff Email
                </label>
                <div className="auth-input-wrapper">
                  <span className="auth-input-icon" aria-hidden="true">👤</span>
                  <input
                    id={studentIdInputId}
                    type="text"
                    className="auth-input"
                    placeholder="e.g. 202590207 or admin@ajou.uz"
                    value={identifier}
                    onChange={(e) => setIdentifier(e.target.value)}
                    required
                  />
                </div>
              </div>

              <div className="auth-field">
                <label htmlFor={examNoInputId} className="auth-label">
                  Examination Number or Current Password
                </label>
                <div className="auth-input-wrapper">
                  <span className="auth-input-icon" aria-hidden="true">🎫</span>
                  <input
                    id={examNoInputId}
                    type="text"
                    className="auth-input"
                    placeholder="e.g. EXAM-202590207 or current password"
                    value={examinationNo || currentPassword}
                    onChange={(e) => {
                      setExaminationNo(e.target.value);
                      setCurrentPassword(e.target.value);
                    }}
                    required
                  />
                </div>
              </div>

              <div className="auth-field">
                <label htmlFor={newPasswordInputId} className="auth-label">
                  New Password
                </label>
                <div className="auth-input-wrapper">
                  <span className="auth-input-icon" aria-hidden="true">🔒</span>
                  <input
                    id={newPasswordInputId}
                    type={showNewPassword ? 'text' : 'password'}
                    className="auth-input"
                    placeholder="Enter new password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    required
                  />
                  <button
                    type="button"
                    className="auth-password-toggle"
                    onClick={() => setShowNewPassword((prev) => !prev)}
                    aria-label={showNewPassword ? 'Hide password' : 'Show password'}
                    tabIndex={-1}
                  >
                    {showNewPassword ? '👁️' : '👁️‍🗨️'}
                  </button>
                </div>
              </div>

              <div className="auth-field">
                <label htmlFor={confirmPasswordInputId} className="auth-label">
                  Confirm Password
                </label>
                <div className="auth-input-wrapper">
                  <span className="auth-input-icon" aria-hidden="true">🔒</span>
                  <input
                    id={confirmPasswordInputId}
                    type={showConfirmPassword ? 'text' : 'password'}
                    className="auth-input"
                    placeholder="Re-enter new password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    required
                  />
                  <button
                    type="button"
                    className="auth-password-toggle"
                    onClick={() => setShowConfirmPassword((prev) => !prev)}
                    aria-label={showConfirmPassword ? 'Hide password' : 'Show password'}
                    tabIndex={-1}
                  >
                    {showConfirmPassword ? '👁️' : '👁️‍🗨️'}
                  </button>
                </div>
              </div>

              {/* Live 6-Rule Checklist */}
              <div className="auth-checklist">
                <div className="auth-checklist__title">Password Security Requirements:</div>
                <div className={`auth-checklist__item${policy.minLength ? ' auth-checklist__item--valid' : ''}`}>
                  <span className="auth-checklist__check">{policy.minLength ? '✓' : '○'}</span>
                  <span>At least 6 characters long</span>
                </div>
                <div className={`auth-checklist__item${policy.hasUppercase ? ' auth-checklist__item--valid' : ''}`}>
                  <span className="auth-checklist__check">{policy.hasUppercase ? '✓' : '○'}</span>
                  <span>At least one uppercase letter (A-Z)</span>
                </div>
                <div className={`auth-checklist__item${policy.hasLowercase ? ' auth-checklist__item--valid' : ''}`}>
                  <span className="auth-checklist__check">{policy.hasLowercase ? '✓' : '○'}</span>
                  <span>At least one lowercase letter (a-z)</span>
                </div>
                <div className={`auth-checklist__item${policy.hasDigit ? ' auth-checklist__item--valid' : ''}`}>
                  <span className="auth-checklist__check">{policy.hasDigit ? '✓' : '○'}</span>
                  <span>At least one number (0-9)</span>
                </div>
                <div className={`auth-checklist__item${policy.hasSpecialChar ? ' auth-checklist__item--valid' : ''}`}>
                  <span className="auth-checklist__check">{policy.hasSpecialChar ? '✓' : '○'}</span>
                  <span>At least one special character (!@#$%^&*)</span>
                </div>
                <div className={`auth-checklist__item${policy.passwordsMatch && confirmPassword ? ' auth-checklist__item--valid' : ''}`}>
                  <span className="auth-checklist__check">{policy.passwordsMatch && confirmPassword ? '✓' : '○'}</span>
                  <span>Passwords match and not identical to login ID</span>
                </div>
              </div>

              <button
                type="submit"
                className="auth-submit-btn"
                disabled={isLoading || !policy.isValid}
              >
                {isLoading ? 'Updating…' : 'Update Password'}
              </button>

              <button
                type="button"
                className="auth-secondary-btn"
                onClick={() => openLogin()}
              >
                ← Back to Sign In
              </button>
            </form>
          </>
        )}

        {/* -------------------------------------------------------------
            MODE: SET NEW PASSWORD (Security requirement on first login)
           ------------------------------------------------------------- */}
        {authModalMode === 'set_new_password' && (
          <>
            <div className="auth-card__header">
              <div className="auth-card__badge-icon auth-card__badge-icon--warning" aria-hidden="true">
                🛡️
              </div>
              <h2 className="auth-card__title">Set New Password</h2>
              <p className="auth-card__subtitle">
                For security, please replace your initial temporary password with a personal secure password.
              </p>
            </div>

            <div className="auth-helper-pill auth-helper-pill--warning">
              <span>⚠️</span>
              <span>
                <strong>Action Required:</strong> University policy requires setting a personal password before continuing.
              </span>
            </div>

            {errorMessage && (
              <div className="auth-error-banner" role="alert">
                <span>⚠️</span>
                <span>{errorMessage}</span>
              </div>
            )}

            <form className="auth-form" onSubmit={handleChangePasswordSubmit} noValidate>
              <div className="auth-field">
                <label htmlFor={currentPasswordInputId} className="auth-label">
                  Current / Temporary Password
                </label>
                <div className="auth-input-wrapper">
                  <span className="auth-input-icon" aria-hidden="true">🔑</span>
                  <input
                    id={currentPasswordInputId}
                    type="password"
                    className="auth-input"
                    placeholder="Enter current password"
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    required
                  />
                </div>
              </div>

              <div className="auth-field">
                <label htmlFor={newPasswordInputId} className="auth-label">
                  New Secure Password
                </label>
                <div className="auth-input-wrapper">
                  <span className="auth-input-icon" aria-hidden="true">🔒</span>
                  <input
                    id={newPasswordInputId}
                    type={showNewPassword ? 'text' : 'password'}
                    className="auth-input"
                    placeholder="Enter new password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    required
                  />
                  <button
                    type="button"
                    className="auth-password-toggle"
                    onClick={() => setShowNewPassword((prev) => !prev)}
                    aria-label={showNewPassword ? 'Hide password' : 'Show password'}
                    tabIndex={-1}
                  >
                    {showNewPassword ? '👁️' : '👁️‍🗨️'}
                  </button>
                </div>
              </div>

              <div className="auth-field">
                <label htmlFor={confirmPasswordInputId} className="auth-label">
                  Confirm New Password
                </label>
                <div className="auth-input-wrapper">
                  <span className="auth-input-icon" aria-hidden="true">🔒</span>
                  <input
                    id={confirmPasswordInputId}
                    type={showConfirmPassword ? 'text' : 'password'}
                    className="auth-input"
                    placeholder="Re-enter new password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    required
                  />
                  <button
                    type="button"
                    className="auth-password-toggle"
                    onClick={() => setShowConfirmPassword((prev) => !prev)}
                    aria-label={showConfirmPassword ? 'Hide password' : 'Show password'}
                    tabIndex={-1}
                  >
                    {showConfirmPassword ? '👁️' : '👁️‍🗨️'}
                  </button>
                </div>
              </div>

              {/* 6 Rules Checklist */}
              <div className="auth-checklist">
                <div className="auth-checklist__title">Password Security Requirements:</div>
                <div className={`auth-checklist__item${policy.minLength ? ' auth-checklist__item--valid' : ''}`}>
                  <span className="auth-checklist__check">{policy.minLength ? '✓' : '○'}</span>
                  <span>At least 6 characters</span>
                </div>
                <div className={`auth-checklist__item${policy.hasUppercase ? ' auth-checklist__item--valid' : ''}`}>
                  <span className="auth-checklist__check">{policy.hasUppercase ? '✓' : '○'}</span>
                  <span>At least one uppercase letter (A-Z)</span>
                </div>
                <div className={`auth-checklist__item${policy.hasLowercase ? ' auth-checklist__item--valid' : ''}`}>
                  <span className="auth-checklist__check">{policy.hasLowercase ? '✓' : '○'}</span>
                  <span>At least one lowercase letter (a-z)</span>
                </div>
                <div className={`auth-checklist__item${policy.hasDigit ? ' auth-checklist__item--valid' : ''}`}>
                  <span className="auth-checklist__check">{policy.hasDigit ? '✓' : '○'}</span>
                  <span>At least one number (0-9)</span>
                </div>
                <div className={`auth-checklist__item${policy.hasSpecialChar ? ' auth-checklist__item--valid' : ''}`}>
                  <span className="auth-checklist__check">{policy.hasSpecialChar ? '✓' : '○'}</span>
                  <span>At least one special symbol (!@#$%^&*)</span>
                </div>
                <div className={`auth-checklist__item${policy.passwordsMatch && confirmPassword ? ' auth-checklist__item--valid' : ''}`}>
                  <span className="auth-checklist__check">{policy.passwordsMatch && confirmPassword ? '✓' : '○'}</span>
                  <span>Passwords match</span>
                </div>
              </div>

              <button
                type="submit"
                className="auth-submit-btn"
                disabled={isLoading || !policy.isValid}
              >
                {isLoading ? 'Saving…' : 'Save Password & Continue'}
              </button>
            </form>
          </>
        )}

        {/* -------------------------------------------------------------
            MODE: PROFILE (Logged in overview)
           ------------------------------------------------------------- */}
        {authModalMode === 'profile' && user && (
          <>
            <div className="auth-card__header">
              <div className="auth-card__badge-icon auth-card__badge-icon--profile" aria-hidden="true">
                {user.account_type === 'student' ? '🎓' : user.is_admin ? '🛡️' : '💼'}
              </div>
              <h2 className="auth-card__title">{user.display_name}</h2>
              <p className="auth-card__subtitle">
                {user.account_type === 'student' ? 'Ajou University Student' : 'Staff / Faculty Member'}
              </p>
            </div>

            <div className="auth-profile-details">
              {user.student_id && (
                <div className="auth-profile-row">
                  <span className="auth-profile-label">Student ID</span>
                  <span className="auth-profile-value">{user.student_id}</span>
                </div>
              )}
              {user.email && (
                <div className="auth-profile-row">
                  <span className="auth-profile-label">Email</span>
                  <span className="auth-profile-value">{user.email}</span>
                </div>
              )}
              {user.department && (
                <div className="auth-profile-row">
                  <span className="auth-profile-label">Department</span>
                  <span className="auth-profile-value">{user.department}</span>
                </div>
              )}
              {user.group_no && (
                <div className="auth-profile-row">
                  <span className="auth-profile-label">Academic Group</span>
                  <span className="auth-profile-value">{user.group_no}</span>
                </div>
              )}
              <div className="auth-profile-row">
                <span className="auth-profile-label">Role</span>
                <span className="auth-profile-value">
                  {user.is_admin ? 'Administrator' : user.roles.join(', ') || 'Student'}
                </span>
              </div>
            </div>

            <div className="auth-profile-actions">
              <button
                type="button"
                className="auth-secondary-btn"
                onClick={openReset}
              >
                🔑 Change Password
              </button>
              <button
                type="button"
                className="auth-secondary-btn auth-logout-btn"
                onClick={logout}
              >
                🚪 Sign Out
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
