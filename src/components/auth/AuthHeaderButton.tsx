import { useAuth } from '../../state/AuthContext';

export function AuthHeaderButton() {
  const { user, isAuthenticated, openLogin, openProfile } = useAuth();

  if (!isAuthenticated || !user) {
    return (
      <button
        type="button"
        className="auth-header-btn auth-header-btn--primary"
        onClick={() => openLogin('student')}
        title="Sign in to Campus Portal (Student or Staff)"
        aria-label="Sign in to Campus Portal"
      >
        <span className="auth-header-btn__icon" aria-hidden="true">🔐</span>
        <span className="auth-header-btn__text">Log In</span>
      </button>
    );
  }

  // Logged-in state
  const isStudent = user.account_type === 'student';
  const roleIcon = isStudent ? '🎓' : user.is_admin ? '🛡️' : '💼';
  
  // Format short name: "ROBIYAXON M." or "Admin"
  const shortName = user.first_name
    ? `${user.first_name}${user.last_name ? ` ${user.last_name.charAt(0)}.` : ''}`
    : user.student_id || user.email?.split('@')[0] || user.display_name;

  return (
    <button
      type="button"
      className="auth-header-btn"
      onClick={openProfile}
      title={`Logged in as ${user.display_name}. Click to view profile or sign out.`}
      aria-label={`User profile for ${user.display_name}`}
    >
      <span className="auth-header-btn__icon" aria-hidden="true">{roleIcon}</span>
      <span className="auth-header-btn__text">{shortName}</span>
      {user.group_no && (
        <span className="auth-header-btn__badge">{user.group_no}</span>
      )}
      {!user.group_no && user.is_admin && (
        <span className="auth-header-btn__badge">Admin</span>
      )}
    </button>
  );
}
