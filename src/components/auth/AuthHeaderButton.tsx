import { useAuth } from '../../state/AuthContext';
import { BriefcaseIcon, GraduationIcon, ShieldIcon, UserIcon } from './AuthIcons';

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
        <span className="auth-header-btn__icon">
          <UserIcon size={15} />
        </span>
        <span className="auth-header-btn__text">Log In</span>
      </button>
    );
  }

  const isStudent = user.account_type === 'student';
  const RoleIcon = isStudent ? GraduationIcon : user.is_admin ? ShieldIcon : BriefcaseIcon;

  // Short name: "Robiyaxon M." or the login handle for accounts without a name.
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
      <span className="auth-header-btn__icon">
        <RoleIcon size={15} />
      </span>
      <span className="auth-header-btn__text">{shortName}</span>
      {user.group_no && <span className="auth-header-btn__badge">{user.group_no}</span>}
      {!user.group_no && user.is_admin && <span className="auth-header-btn__badge">Admin</span>}
    </button>
  );
}
