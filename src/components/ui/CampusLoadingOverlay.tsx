import { useProgress } from '@react-three/drei';
import { useEffect, useState } from 'react';
import { useMap } from '../../state/MapProvider';

/**
 * Unified loading and status feedback for the 3D Campus Platform.
 * - Full-screen initialization screen when MapProvider is bootstrapping campus data & geometry.
 * - Non-blocking 3D asset & transition toast (uses Drei's useProgress + selection transitions)
 *   without fake percentages or premature 100% completion.
 */
export function InitialCampusLoader({ stageMessage = 'Initializing campus...' }: { stageMessage?: string }) {
  return (
    <div className="campus-init-loader" role="status" aria-live="polite">
      <div className="campus-init-loader__card">
        <div className="campus-init-loader__brand">
          <span className="campus-init-loader__badge">AUT</span>
          <div>
            <div className="campus-init-loader__title">Ajou University in Tashkent</div>
            <div className="campus-init-loader__subtitle">3D Campus Digital Twin Platform</div>
          </div>
        </div>

        <div className="campus-init-loader__progress-bar" aria-hidden="true">
          <div className="campus-init-loader__progress-indeterminate" />
        </div>

        <div className="campus-init-loader__status">
          <span className="campus-init-loader__spinner" aria-hidden="true" />
          <span>{stageMessage}</span>
        </div>
      </div>
    </div>
  );
}

export function SceneActivityIndicator() {
  const { active, progress, item, loaded, total } = useProgress();
  const { selection } = useMap();
  const [transitionMessage, setTransitionMessage] = useState<string | null>(null);
  const [prevBuildingId, setPrevBuildingId] = useState<string | undefined>(selection.buildingId);
  const [prevFloorId, setPrevFloorId] = useState<string | undefined>(selection.floorId);

  useEffect(() => {
    let message: string | null = null;
    if (selection.buildingId !== prevBuildingId) {
      setPrevBuildingId(selection.buildingId);
      setPrevFloorId(selection.floorId);
      if (selection.buildingId) {
        message = 'Loading building interior...';
      }
    } else if (selection.floorId !== prevFloorId) {
      setPrevFloorId(selection.floorId);
      if (selection.floorId) {
        message = 'Switching floor...';
      }
    }

    if (message) {
      setTransitionMessage(message);
      const timer = window.setTimeout(() => {
        setTransitionMessage(null);
      }, 420);
      return () => window.clearTimeout(timer);
    }
  }, [selection.buildingId, selection.floorId, prevBuildingId, prevFloorId]);

  if (!active && !transitionMessage) return null;

  const hasDeterminateProgress = active && total > 0 && loaded < total;
  const safePercent = hasDeterminateProgress ? Math.min(99, Math.max(1, Math.round(progress))) : null;

  const formatAssetName = (url: string) => {
    if (!url) return 'Preparing campus assets...';
    const clean = url.split('?')[0].split('/').pop() ?? '';
    if (clean.endsWith('.jpg') || clean.endsWith('.png') || clean.endsWith('.webp')) {
      return `Loading texture (${clean})...`;
    }
    return 'Preparing 3D environment...';
  };

  const displayMessage = active ? formatAssetName(item) : transitionMessage;

  return (
    <div className="scene-loader-pill" role="status" aria-live="polite">
      <span className="scene-loader-pill__spinner" aria-hidden="true" />
      <div className="scene-loader-pill__body">
        <span className="scene-loader-pill__text">{displayMessage}</span>
        {safePercent !== null && (
          <span className="scene-loader-pill__pct">{safePercent}%</span>
        )}
      </div>
    </div>
  );
}

export type WalkthroughLoadingOverlayProps = {
  title?: string;
  stageMessage?: string;
  badgeText?: string;
};

/**
 * Full-screen loading overlay displayed when:
 * 1. The user selects "3D Walk" mode and the 3D Canvas + Rapier WASM physics world are initializing.
 * 2. The user clicks "Start Walkthrough" (or teleports / starts a wayfinding route) while physics colliders
 *    and first-person camera controls synchronize and render their initial frames.
 */
export function WalkthroughLoadingOverlay({
  title = 'Starting 3D Walkthrough',
  stageMessage = 'Initializing 3D physics colliders & first-person camera...',
  badgeText = '3D WALK MODE',
}: WalkthroughLoadingOverlayProps) {
  return (
    <div
      className="campus-init-loader walkthrough-loading-overlay"
      role="status"
      aria-live="polite"
      data-testid="walkthrough-loading-overlay"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 60,
        pointerEvents: 'none',
        background: 'rgba(15, 23, 42, 0.78)',
        backdropFilter: 'blur(8px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
      }}
    >
      <div
        className="campus-init-loader__card"
        style={{
          background: 'rgba(15, 23, 42, 0.95)',
          border: '1px solid rgba(59, 130, 246, 0.35)',
          color: '#f8fafc',
          boxShadow: '0 24px 48px rgba(0, 0, 0, 0.5)',
        }}
      >
        <div className="campus-init-loader__brand">
          <span
            className="campus-init-loader__badge"
            style={{
              width: 'auto',
              padding: '0 12px',
              fontSize: 11,
              letterSpacing: '0.06em',
              background: '#2563eb',
            }}
          >
            {badgeText}
          </span>
          <div>
            <div className="campus-init-loader__title" style={{ color: '#f8fafc' }}>
              {title}
            </div>
            <div className="campus-init-loader__subtitle" style={{ color: '#94a3b8' }}>
              Ajou University in Tashkent · First-Person Exploration
            </div>
          </div>
        </div>

        <div
          className="campus-init-loader__progress-bar"
          style={{ background: 'rgba(30, 41, 59, 0.9)' }}
          aria-hidden="true"
        >
          <div className="campus-init-loader__progress-indeterminate" />
        </div>

        <div className="campus-init-loader__status" style={{ color: '#e2e8f0' }}>
          <span
            className="campus-init-loader__spinner"
            style={{
              borderColor: 'rgba(147, 197, 253, 0.25)',
              borderTopColor: '#60a5fa',
            }}
            aria-hidden="true"
          />
          <span>{stageMessage}</span>
        </div>
      </div>
    </div>
  );
}

