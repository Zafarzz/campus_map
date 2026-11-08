import type { ReactNode, SVGProps } from 'react';

/**
 * Minimal stroke icons for the auth UI (24x24 grid, 1.8 stroke, `currentColor`).
 * Replaces platform emoji so the login / reset screens look identical on every OS.
 */
type IconProps = Omit<SVGProps<SVGSVGElement>, 'children'> & { size?: number };

function Icon({ size = 18, children, ...rest }: IconProps & { children: ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...rest}
    >
      {children}
    </svg>
  );
}

export const UserIcon = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="12" cy="8" r="3.6" />
    <path d="M4.5 20c.9-3.6 3.9-5.4 7.5-5.4s6.6 1.8 7.5 5.4" />
  </Icon>
);

export const LockIcon = (p: IconProps) => (
  <Icon {...p}>
    <rect x="5" y="10.5" width="14" height="9.5" rx="2.6" />
    <path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5" />
  </Icon>
);

export const KeyIcon = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="8" cy="15" r="3.6" />
    <path d="M10.6 12.4 19 4m-3 3 2.4 2.4M13.2 9.8l1.8 1.8" />
  </Icon>
);

export const TicketIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M4 8.5A1.5 1.5 0 0 1 5.5 7h13A1.5 1.5 0 0 1 20 8.5V10a2 2 0 0 0 0 4v1.5a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 15.5V14a2 2 0 0 0 0-4Z" />
    <path d="M10 9.5v5" strokeDasharray="1.6 2" />
  </Icon>
);

export const EyeIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z" />
    <circle cx="12" cy="12" r="2.8" />
  </Icon>
);

export const EyeOffIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M9.9 5.7A9.6 9.6 0 0 1 12 5.5c6 0 9.5 6.5 9.5 6.5a16 16 0 0 1-3 3.8M6.3 7.4A16 16 0 0 0 2.5 12S6 18.5 12 18.5c1.6 0 3-.4 4.2-1" />
    <path d="M9.9 9.9a2.8 2.8 0 0 0 4.2 3.7M3.5 3.5l17 17" />
  </Icon>
);

export const GraduationIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="m2.8 9.4 9.2-4.6 9.2 4.6-9.2 4.6Z" />
    <path d="M6.6 11.7v4.4c0 1.3 2.4 2.7 5.4 2.7s5.4-1.4 5.4-2.7v-4.4M21.2 9.4v5.2" />
  </Icon>
);

export const BriefcaseIcon = (p: IconProps) => (
  <Icon {...p}>
    <rect x="3.5" y="7.5" width="17" height="12" rx="2.6" />
    <path d="M9 7.5V6a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v1.5M3.5 13h17" />
  </Icon>
);

export const ShieldIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M12 3.2 5 6v5.6c0 4.2 2.9 7.6 7 9.2 4.1-1.6 7-5 7-9.2V6Z" />
    <path d="m9.2 12.2 2.1 2.1 3.6-3.8" />
  </Icon>
);

export const CampusIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M3.5 9.5 12 4.5l8.5 5" />
    <path d="M5.5 10v8M9.5 10v8M14.5 10v8M18.5 10v8M3.5 20h17" />
  </Icon>
);

export const CheckIcon = (p: IconProps) => (
  <Icon {...p} strokeWidth={2.4}>
    <path d="m5 12.5 4.2 4.2L19 7" />
  </Icon>
);

export const InfoIcon = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 11v5.2M12 7.7v.1" />
  </Icon>
);

export const AlertIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M12 4 2.8 19.5h18.4Z" />
    <path d="M12 10v4.6M12 17.4v.1" />
  </Icon>
);

export const CloseIcon = (p: IconProps) => (
  <Icon {...p} strokeWidth={2}>
    <path d="m6 6 12 12M18 6 6 18" />
  </Icon>
);

export const LogoutIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M14 4.5h3.5A2 2 0 0 1 19.5 6.5v11a2 2 0 0 1-2 2H14M10 8l-4 4 4 4M6 12h9.5" />
  </Icon>
);

export const ArrowLeftIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M19 12H5.5M11 6.5 5.5 12l5.5 5.5" />
  </Icon>
);

export const MapNavIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M3 6.5 9 4l6 2.5 6-2.5v13.5l-6 2.5-6-2.5-6 2.5Z" />
    <path d="M9 4v13.5M15 6.5V20" />
  </Icon>
);

export const CalendarIcon = (p: IconProps) => (
  <Icon {...p}>
    <rect x="3.5" y="4.5" width="17" height="15.5" rx="2.5" />
    <path d="M16 2.5v4M8 2.5v4M3.5 9.5h17" />
  </Icon>
);

export const PackageIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="m12 3.5 8 4.5-8 4.5-8-4.5Z" />
    <path d="m4 8 8 4.5v8.5L4 16.5Z" />
    <path d="m20 8-8 4.5v8.5l8-4.5Z" />
  </Icon>
);

export const ClockIcon = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5l3 2" />
  </Icon>
);

export const PlusIcon = (p: IconProps) => (
  <Icon {...p} strokeWidth={2.2}>
    <path d="M12 5v14M5 12h14" />
  </Icon>
);

export const SparklesIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="m12 3 2.5 5.5L20 11l-5.5 2.5L12 19l-2.5-5.5L4 11l5.5-2.5Z" />
  </Icon>
);

export const UsersIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
    <circle cx="9" cy="7" r="4" />
    <path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
  </Icon>
);

export const ChevronDownIcon = (p: IconProps) => (
  <Icon {...p} strokeWidth={2}>
    <path d="m6 9 6 6 6-6" />
  </Icon>
);

export const PhoneIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92Z" />
  </Icon>
);

export const TelegramIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="m21.5 2.5-19 9 7.5 3 2.5 7 3.5-4.5 5.5 4.5Z" />
    <path d="m10 14.5 11.5-12" />
  </Icon>
);

export const CameraIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2Z" />
    <circle cx="12" cy="13" r="4" />
  </Icon>
);
export const QrCodeIcon = (p: IconProps) => (
  <Icon {...p}>
    <rect x="3" y="3" width="7" height="7" rx="1.5" />
    <rect x="14" y="3" width="7" height="7" rx="1.5" />
    <rect x="3" y="14" width="7" height="7" rx="1.5" />
    <path d="M7 7h.01M18 7h.01M7 18h.01M14 14h3v3h-3zM18 18h3v3h-3zM14 18v3h-3" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
  </Icon>
);

export const RefreshIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M21.5 2v6h-6M2.5 22v-6h6M21.5 8A10 10 0 0 0 4.1 6.1L2.5 8M2.5 16a10 10 0 0 0 17.4 1.9l1.6-1.9" />
  </Icon>
);

export const CheckCircleIcon = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="10" />
    <path d="m9 12 2 2 4-4" strokeWidth={2.2} />
  </Icon>
);
