type Props = {
  hasSelection: boolean;
  onResetView: () => void;
};

/**
 * Accessible 3D viewport navigation controls (Zoom In, Zoom Out, Reset / Overview).
 * Works seamlessly on both desktop and mobile touch devices without conflicting with canvas gestures.
 */
export function ViewportNavigationTools({ hasSelection, onResetView }: Props) {
  const getControls = () => {
    if (typeof window === 'undefined') return null;
    return (
      window as unknown as {
        __cameraControls?: {
          dolly?: (distance: number, enableTransition?: boolean) => Promise<void>;
          rotate?: (azimuthAngle: number, polarAngle: number, enableTransition?: boolean) => Promise<void>;
        };
      }
    ).__cameraControls;
  };

  const handleZoomIn = () => {
    const c = getControls();
    void c?.dolly?.(28, true);
  };

  const handleZoomOut = () => {
    const c = getControls();
    void c?.dolly?.(-28, true);
  };

  const handleRotateLeft = () => {
    const c = getControls();
    void c?.rotate?.(Math.PI / 6, 0, true);
  };

  const handleRotateRight = () => {
    const c = getControls();
    void c?.rotate?.(-Math.PI / 6, 0, true);
  };

  return (
    <div className="viewport-tools" role="group" aria-label="3D Viewport Camera Controls">
      <button
        type="button"
        className="viewport-tools__btn"
        onClick={handleZoomIn}
        title="Zoom in"
        aria-label="Zoom in"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
          <line x1="12" y1="5" x2="12" y2="19" />
          <line x1="5" y1="12" x2="19" y2="12" />
        </svg>
      </button>
      <button
        type="button"
        className="viewport-tools__btn"
        onClick={handleZoomOut}
        title="Zoom out"
        aria-label="Zoom out"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
          <line x1="5" y1="12" x2="19" y2="12" />
        </svg>
      </button>
      <button
        type="button"
        className="viewport-tools__btn viewport-tools__btn--hide-xs"
        onClick={handleRotateLeft}
        title="Rotate camera left"
        aria-label="Rotate camera left"
      >
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
          <path d="M3 3v5h5" />
        </svg>
      </button>
      <button
        type="button"
        className="viewport-tools__btn viewport-tools__btn--hide-xs"
        onClick={handleRotateRight}
        title="Rotate camera right"
        aria-label="Rotate camera right"
      >
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8" />
          <path d="M21 3v5h-5" />
        </svg>
      </button>
      <button
        type="button"
        className={`viewport-tools__btn${hasSelection ? ' viewport-tools__btn--accent' : ''}`}
        onClick={onResetView}
        title={hasSelection ? 'Reset camera to full campus overview' : 'Recenter campus view'}
        aria-label="Reset camera to campus overview"
      >
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
          <polyline points="9 22 9 12 15 12 15 22" />
        </svg>
      </button>
    </div>
  );
}
