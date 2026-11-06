import { useAuth } from '../../state/AuthContext';
import { LockIcon, UserIcon, ArrowLeftIcon, SparklesIcon } from '../auth/AuthIcons';

interface AuthRequiredCardProps {
  title: string;
  subtitle: string;
  description: string;
  onBackToMap?: () => void;
}

export function AuthRequiredCard({
  title,
  subtitle,
  description,
  onBackToMap,
}: AuthRequiredCardProps) {
  const { openLogin } = useAuth();

  return (
    <div className="auth-required-card" role="region" aria-label="Authentication Required">
      <div className="auth-required-card__icon-badge">
        <LockIcon size={24} />
      </div>

      <div className="auth-required-card__header">
        <span className="auth-required-card__eyebrow">
          <SparklesIcon size={13} />
          <span>University Portal Services</span>
        </span>
        <h2 className="auth-required-card__title">{title}</h2>
        <p className="auth-required-card__subtitle">{subtitle}</p>
      </div>

      <div className="auth-required-card__body">
        <p className="auth-required-card__desc">{description}</p>
        <div className="auth-required-card__bullet-box">
          <div className="auth-required-card__bullet">
            <span className="auth-required-card__dot" />
            <span>Students: Sign in with your 9-digit Student ID</span>
          </div>
          <div className="auth-required-card__bullet">
            <span className="auth-required-card__dot" />
            <span>Staff & Faculty: Sign in with your university account</span>
          </div>
        </div>
      </div>

      <div className="auth-required-card__actions">
        <button
          type="button"
          className="auth-required-card__login-btn"
          onClick={() => openLogin('student')}
        >
          <UserIcon size={16} />
          <span>Log In to Continue</span>
        </button>

        {onBackToMap && (
          <button
            type="button"
            className="auth-required-card__back-btn"
            onClick={onBackToMap}
          >
            <ArrowLeftIcon size={14} />
            <span>Explore 3D Campus Map</span>
          </button>
        )}
      </div>
    </div>
  );
}
