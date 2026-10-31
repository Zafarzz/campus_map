import type { ReactNode } from 'react';
import type { PresetId } from './presets';

const Svg = ({ children, size = 16 }: { children: ReactNode; size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    {children}
  </svg>
);

export const IconPlay = () => (<Svg><polygon points="6 4 20 12 6 20 6 4" fill="currentColor" /></Svg>);
export const IconPause = () => (<Svg><rect x="6" y="4" width="4" height="16" fill="currentColor" /><rect x="14" y="4" width="4" height="16" fill="currentColor" /></Svg>);
export const IconStop = () => (<Svg><rect x="5" y="5" width="14" height="14" rx="1" fill="currentColor" /></Svg>);
export const IconRecord = () => (<Svg><circle cx="12" cy="12" r="7" fill="currentColor" /></Svg>);
export const IconClose = () => (<Svg><path d="M18 6 6 18M6 6l12 12" /></Svg>);
export const IconPlus = () => (<Svg><path d="M12 5v14M5 12h14" /></Svg>);
export const IconCopy = () => (<Svg><rect x="9" y="9" width="11" height="11" rx="2" /><path d="M5 15V6a2 2 0 0 1 2-2h9" /></Svg>);
export const IconTrash = () => (<Svg><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" /></Svg>);
export const IconUp = () => (<Svg><path d="m6 15 6-6 6 6" /></Svg>);
export const IconDown = () => (<Svg><path d="m6 9 6 6 6-6" /></Svg>);
export const IconEye = () => (<Svg><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" /></Svg>);
export const IconFilm = () => (<Svg><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M7 4v16M17 4v16M3 9h4M3 15h4M17 9h4M17 15h4" /></Svg>);
export const IconCamera = () => (<Svg><path d="M3 8h4l2-3h6l2 3h4v11H3z" /><circle cx="12" cy="13" r="3.5" /></Svg>);

export const PRESET_ICONS: Record<PresetId, ReactNode> = {
  flyover: (<Svg size={20}><path d="M3 17c4-8 8 2 12-6 2-4 4-3 6-5" /><path d="m17 6 4 0 0 4" /></Svg>),
  orbit: (<Svg size={20}><ellipse cx="12" cy="12" rx="9" ry="4.5" /><circle cx="12" cy="12" r="2" fill="currentColor" /><path d="m19 8 2 .5-.5 2" /></Svg>),
  dollyIn: (<Svg size={20}><path d="M4 4l5 5M20 4l-5 5M4 20l5-5M20 20l-5-5" /><rect x="9" y="9" width="6" height="6" /></Svg>),
  dollyOut: (<Svg size={20}><path d="M9 9 4 4M15 9l5-5M9 15l-5 5M15 15l5 5" /><rect x="9" y="9" width="6" height="6" /></Svg>),
  tracking: (<Svg size={20}><path d="M3 18h18M5 18l2-6h4l2 6" /><circle cx="17" cy="9" r="2.5" /><path d="M3 6h6m-2-2 2 2-2 2" /></Svg>),
  reveal: (<Svg size={20}><path d="M3 20V10l5-3v13M10 20V6l4-3v17M16 20V9l5 3v8" /></Svg>),
  topDown: (<Svg size={20}><rect x="4" y="4" width="16" height="16" rx="2" /><path d="M4 12h16M12 4v16" /></Svg>),
  freeFlight: (<Svg size={20}><path d="M12 3l3 7 7 2-7 2-3 7-3-7-7-2 7-2z" /></Svg>),
};
