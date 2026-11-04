import React, { useEffect, useId, useState } from 'react';
import { useAuth } from '../../state/AuthContext';
import { validatePasswordStrength } from '../../services/auth/authService';
import {
  AlertIcon,
  ArrowLeftIcon,
  BriefcaseIcon,
  CampusIcon,
  CheckIcon,
  CloseIcon,
  EyeIcon,
  EyeOffIcon,
  GraduationIcon,
  InfoIcon,
  KeyIcon,
  LockIcon,
  LogoutIcon,
  ShieldIcon,
  TicketIcon,
  UserIcon,
} from './AuthIcons';
import './authModal.css';

/* ---------------------------------------------------------------------------
   Small presentational helpers (module level so inputs never remount)
   --------------------------------------------------------------------------- */
interface TextFieldProps {
  id: string;
  label: string;
  value: string;
  placeholder: string;
  icon: React.ReactNode;
  onChange: (value: string) => void;
  autoComplete?: string;
}

function TextField({ id, label, value, placeholder, icon, onChange, autoComplete }: TextFieldProps) {
  return (
    <div className="auth-field">
      <label htmlFor={id} className="auth-label">
        {label}
      </label>
      <div className="auth-input-wrapper">
        <span className="auth-input-icon">{icon}</span>
        <input
          id={id}
          type="text"
          className="auth-input"
          placeholder={placeholder}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          autoComplete={autoComplete}
          spellCheck={false}
        />
      </div>
    </div>
  );
}

interface PasswordFieldProps {
  id: string;
  label: string;
  value: string;
  placeholder: string;
  onChange: (value: string) => void;
  autoComplete?: string;
  icon?: React.ReactNode;
  labelAside?: React.ReactNode;
  hint?: React.ReactNode;
}

function PasswordField({
  id,
  label,
  value,
  placeholder,
  onChange,
  autoComplete,
  icon,
  labelAside,
  hint,
}: PasswordFieldProps) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="auth-field">
      <div className="auth-label">
        <label htmlFor={id}>{label}</label>
        {labelAside}
      </div>
      <div className="auth-input-wrapper">
        <span className="auth-input-icon">{icon ?? <LockIcon />}</span>
        <input
          id={id}
          type={visible ? 'text' : 'password'}
          className="auth-input"
          placeholder={placeholder}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          autoComplete={autoComplete}
        />
        <button
          type="button"
          className="auth-password-toggle"
          onClick={() => setVisible((prev) => !prev)}
          aria-label={visible ? 'Hide password' : 'Show password'}
          tabIndex={-1}
        >
          {visible ? <EyeOffIcon size={17} /> : <EyeIcon size={17} />}
        </button>
      </div>
      {hint}
    </div>
  );
}

function RuleChecklist({ rules }: { rules: { ok: boolean; label: string }[] }) {
  return (
    <ul className="auth-checklist" aria-label="Password requirements">
      {rules.map((rule) => (
        <li
          key={rule.label}
          className={`auth-checklist__item${rule.ok ? ' auth-checklist__item--valid' : ''}`}
        >
          <span className="auth-checklist__check" aria-hidden="true">
            {rule.ok ? <CheckIcon size={10} /> : null}
          </span>
          <span>{rule.label}</span>
        </li>
      ))}
    </ul>
  );
}

function ErrorBanner({ message }: { message: string }) {
  return (
    <div className="auth-error-banner" role="alert">
      <AlertIcon size={16} />
      <span>{message}</span>
    </div>
  );
}

/* ---------------------------------------------------------------------------
   Modal
   --------------------------------------------------------------------------- */
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

  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const studentIdInputId = useId();
  const staffInputId = useId();
  const passwordInputId = useId();
  const currentPasswordInputId = useId();
  const newPasswordInputId = useId();
  const confirmPasswordInputId = useId();
  const resetIdInputId = useId();
  const resetProofInputId = useId();

  const mustChange = Boolean(user?.must_change_password);

  // Clear transient state (errors + sensitive fields) whenever the view changes.
  useEffect(() => {
    setErrorMessage(null);
    setPassword('');
    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
  }, [authModalMode]);

  // Pre-fill the account identifier when a signed-in user must set a new password.
  useEffect(() => {
    if (authModalMode === 'set_new_password' && user) {
      setIdentifier(user.student_id || user.email || '');
    }
  }, [authModalMode, user]);

  // Close on Escape (never while a password change is mandatory).
  useEffect(() => {
    if (!isAuthModalOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !mustChange) closeAuthModal();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isAuthModalOpen, closeAuthModal, mustChange]);

  if (!isAuthModalOpen) return null;

  const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget && !mustChange) closeAuthModal();
  };

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    const cleanIdent = identifier.trim();
    if (!cleanIdent) {
      setErrorMessage(
        activeTab === 'student'
          ? 'Please enter your Student ID.'
          : 'Please enter your Staff Email or Username.',
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
      // AuthContext closes the modal or switches to the "set new password" view.
    } catch (err: unknown) {
      setErrorMessage(
        err instanceof Error ? err.message : 'Invalid credentials. Please verify and try again.',
      );
    } finally {
      setIsLoading(false);
    }
  };

  const targetIdent = identifier || user?.student_id || user?.email || '';
  const policy = validatePasswordStrength(newPassword, targetIdent, confirmPassword);
  const rules = [
    { ok: policy.minLength, label: '6+ characters' },
    { ok: policy.hasUppercase, label: 'Uppercase (A-Z)' },
    { ok: policy.hasLowercase, label: 'Lowercase (a-z)' },
    { ok: policy.hasDigit, label: 'Number (0-9)' },
    { ok: policy.hasSpecialChar, label: 'Symbol (!@#$%)' },
    { ok: policy.notIdentifier && newPassword.length > 0, label: 'Not your login ID' },
  ];
  const matchHint =
    confirmPassword.length > 0 ? (
      <span
        className={`auth-match-hint${policy.passwordsMatch ? ' auth-match-hint--ok' : ' auth-match-hint--bad'}`}
      >
        {policy.passwordsMatch ? 'Passwords match' : 'Passwords do not match'}
      </span>
    ) : null;

  const handleChangePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    if (!policy.isValid) {
      setErrorMessage('Please meet all password requirements and confirm the new password.');
      return;
    }

    setIsLoading(true);
    try {
      await changePassword({
        student_id: user?.student_id || (activeTab === 'student' ? targetIdent : undefined),
        email: user?.email || (activeTab === 'staff' ? targetIdent : undefined),
        login: targetIdent,
        current_password: currentPassword || undefined,
        // Only the public "reset" form accepts an examination number as proof of identity.
        examination_no: authModalMode === 'reset' ? currentPassword.trim() || undefined : undefined,
        new_password: newPassword,
        confirm_password: confirmPassword,
      });
    } catch (err: unknown) {
      setErrorMessage(
        err instanceof Error
          ? err.message
          : 'Failed to update password. Please check your credentials.',
      );
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
      aria-label="Campus authentication"
    >
      <div className="auth-card" role="document">
        {!mustChange && (
          <button
            type="button"
            className="auth-card__close"
            onClick={closeAuthModal}
            aria-label="Close dialog"
            title="Close"
          >
            <CloseIcon size={16} />
          </button>
        )}

        <div className="auth-card__scroll">
          {/* ------------------------------ LOGIN ------------------------------ */}
          {authModalMode === 'login' && (
            <>
              <div className="auth-card__header">
                <div className="auth-card__badge-icon" aria-hidden="true">
                  <CampusIcon size={22} />
                </div>
                <h2 className="auth-card__title">Sign in to Campus</h2>
                <p className="auth-card__subtitle">
                  Your schedule, rooms and campus services in one place.
                </p>
              </div>

              <div className="auth-tabs" role="tablist" aria-label="Account type">
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
                  <GraduationIcon size={16} />
                  Student
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
                  <BriefcaseIcon size={16} />
                  Staff / Admin
                </button>
              </div>

              {errorMessage && <ErrorBanner message={errorMessage} />}

              <form className="auth-form" onSubmit={handleLoginSubmit} noValidate>
                {activeTab === 'student' ? (
                  <TextField
                    id={studentIdInputId}
                    label="Student ID"
                    placeholder="e.g. 202590123"
                    value={identifier}
                    onChange={setIdentifier}
                    autoComplete="username"
                    icon={<UserIcon />}
                  />
                ) : (
                  <TextField
                    id={staffInputId}
                    label="Staff Email or Username"
                    placeholder="e.g. admin@ajou.uz"
                    value={identifier}
                    onChange={setIdentifier}
                    autoComplete="username"
                    icon={<BriefcaseIcon />}
                  />
                )}

                <PasswordField
                  id={passwordInputId}
                  label="Password"
                  placeholder="Enter your password"
                  value={password}
                  onChange={setPassword}
                  autoComplete="current-password"
                  labelAside={
                    <button type="button" className="auth-forgot-link" onClick={openReset}>
                      Forgot password?
                    </button>
                  }
                />

                <p className="auth-helper">
                  <InfoIcon size={15} />
                  {activeTab === 'student' ? (
                    <span>
                      <strong>First time?</strong> Use your 9-digit Student ID as both login and
                      password.
                    </span>
                  ) : (
                    <span>Sign in with your university staff or administrator account.</span>
                  )}
                </p>

                <button type="submit" className="auth-submit-btn" disabled={isLoading}>
                  {isLoading ? 'Signing in…' : 'Log In'}
                </button>
              </form>
            </>
          )}

          {/* ------------------------------ RESET ------------------------------ */}
          {authModalMode === 'reset' && (
            <>
              <div className="auth-card__header auth-card__header--compact">
                <h2 className="auth-card__title">Reset password</h2>
                <p className="auth-card__subtitle">
                  Confirm your account and choose a new secure password.
                </p>
              </div>

              {errorMessage && <ErrorBanner message={errorMessage} />}

              <form className="auth-form" onSubmit={handleChangePasswordSubmit} noValidate>
                <TextField
                  id={resetIdInputId}
                  label="Student ID or Staff Email"
                  placeholder="e.g. 202590123 or admin@ajou.uz"
                  value={identifier}
                  onChange={setIdentifier}
                  autoComplete="username"
                  icon={<UserIcon />}
                />
                <TextField
                  id={resetProofInputId}
                  label="Examination Number or Current Password"
                  placeholder="Examination number or current password"
                  value={currentPassword}
                  onChange={setCurrentPassword}
                  icon={<TicketIcon />}
                />
                <div className="auth-field-row">
                  <PasswordField
                    id={newPasswordInputId}
                    label="New password"
                    placeholder="New password"
                    value={newPassword}
                    onChange={setNewPassword}
                    autoComplete="new-password"
                  />
                  <PasswordField
                    id={confirmPasswordInputId}
                    label="Confirm password"
                    placeholder="Repeat password"
                    value={confirmPassword}
                    onChange={setConfirmPassword}
                    autoComplete="new-password"
                  />
                </div>
                {matchHint}
                <RuleChecklist rules={rules} />

                <button
                  type="submit"
                  className="auth-submit-btn"
                  disabled={isLoading || !policy.isValid}
                >
                  {isLoading ? 'Updating…' : 'Update password'}
                </button>
                <button type="button" className="auth-text-btn" onClick={() => openLogin()}>
                  <ArrowLeftIcon size={15} />
                  Back to sign in
                </button>
              </form>
            </>
          )}

          {/* --------------------------- SET NEW PASSWORD --------------------------- */}
          {authModalMode === 'set_new_password' && (
            <>
              <div className="auth-card__header auth-card__header--compact">
                <h2 className="auth-card__title">Set your password</h2>
                <p className="auth-card__subtitle">
                  For security, replace your temporary password with a personal one to continue.
                </p>
              </div>

              {errorMessage && <ErrorBanner message={errorMessage} />}

              <form className="auth-form" onSubmit={handleChangePasswordSubmit} noValidate>
                <PasswordField
                  id={currentPasswordInputId}
                  label="Temporary password"
                  placeholder="Current password"
                  value={currentPassword}
                  onChange={setCurrentPassword}
                  autoComplete="current-password"
                  icon={<KeyIcon />}
                />
                <div className="auth-field-row">
                  <PasswordField
                    id={newPasswordInputId}
                    label="New password"
                    placeholder="New password"
                    value={newPassword}
                    onChange={setNewPassword}
                    autoComplete="new-password"
                  />
                  <PasswordField
                    id={confirmPasswordInputId}
                    label="Confirm password"
                    placeholder="Repeat password"
                    value={confirmPassword}
                    onChange={setConfirmPassword}
                    autoComplete="new-password"
                  />
                </div>
                {matchHint}
                <RuleChecklist rules={rules} />

                <button
                  type="submit"
                  className="auth-submit-btn"
                  disabled={isLoading || !policy.isValid}
                >
                  {isLoading ? 'Saving…' : 'Save password & continue'}
                </button>
              </form>
            </>
          )}

          {/* ------------------------------ PROFILE ------------------------------ */}
          {authModalMode === 'profile' && user && (
            <>
              <div className="auth-card__header">
                <div className="auth-card__badge-icon auth-card__badge-icon--profile" aria-hidden="true">
                  {user.account_type === 'student' ? (
                    <GraduationIcon size={22} />
                  ) : user.is_admin ? (
                    <ShieldIcon size={22} />
                  ) : (
                    <BriefcaseIcon size={22} />
                  )}
                </div>
                <h2 className="auth-card__title">{user.display_name}</h2>
                <p className="auth-card__subtitle">
                  {user.account_type === 'student' ? 'Ajou University Student' : 'Staff / Faculty Member'}
                </p>
              </div>

              <dl className="auth-profile-details">
                {user.student_id && (
                  <div className="auth-profile-row">
                    <dt className="auth-profile-label">Student ID</dt>
                    <dd className="auth-profile-value">{user.student_id}</dd>
                  </div>
                )}
                {user.email && (
                  <div className="auth-profile-row">
                    <dt className="auth-profile-label">Email</dt>
                    <dd className="auth-profile-value">{user.email}</dd>
                  </div>
                )}
                {user.department && (
                  <div className="auth-profile-row">
                    <dt className="auth-profile-label">Department</dt>
                    <dd className="auth-profile-value">{user.department}</dd>
                  </div>
                )}
                {user.group_no && (
                  <div className="auth-profile-row">
                    <dt className="auth-profile-label">Academic group</dt>
                    <dd className="auth-profile-value">{user.group_no}</dd>
                  </div>
                )}
                <div className="auth-profile-row">
                  <dt className="auth-profile-label">Role</dt>
                  <dd className="auth-profile-value">
                    {user.is_admin ? 'Administrator' : user.roles.join(', ') || 'Student'}
                  </dd>
                </div>
              </dl>

              <div className="auth-profile-actions">
                <button type="button" className="auth-secondary-btn" onClick={openReset}>
                  <KeyIcon size={16} />
                  Change password
                </button>
                <button type="button" className="auth-secondary-btn auth-logout-btn" onClick={logout}>
                  <LogoutIcon size={16} />
                  Sign out
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
