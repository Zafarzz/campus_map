import { useEffect, useRef, useState, type MutableRefObject } from 'react';
import { gameConfig } from '../config/gameConfig';
import type { PlayerInputState } from './DesktopControls';

type Props = {
  inputRef: MutableRefObject<PlayerInputState>;
  active: boolean;
};

/**
 * Responsive touch controls for mobile and tablet devices:
 * - Left virtual joystick for movement
 * - Right touch area for camera look rotation
 * - Sprint (toggle/hold) and Jump buttons
 * - Multi-touch safe using touch identifiers, zero per-frame React state updates
 */
export function MobileControls({ inputRef, active }: Props) {
  const joystickBaseRef = useRef<HTMLDivElement | null>(null);
  const joystickKnobRef = useRef<HTMLDivElement | null>(null);
  const lookZoneRef = useRef<HTMLDivElement | null>(null);

  const moveTouchIdRef = useRef<number | null>(null);
  const moveOriginRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const lookTouchIdRef = useRef<number | null>(null);
  const lastLookPosRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  const [sprintLocked, setSprintLocked] = useState(false);

  // Reset touch state on pause, resize, or orientation change
  useEffect(() => {
    const resetTouches = () => {
      moveTouchIdRef.current = null;
      lookTouchIdRef.current = null;
      inputRef.current.touchForward = 0;
      inputRef.current.touchRight = 0;
      inputRef.current.touchJump = false;
      if (joystickKnobRef.current) {
        joystickKnobRef.current.style.transform = 'translate3d(0px, 0px, 0px)';
      }
    };

    if (!active) {
      resetTouches();
    }

    window.addEventListener('resize', resetTouches);
    window.addEventListener('orientationchange', resetTouches);
    return () => {
      window.removeEventListener('resize', resetTouches);
      window.removeEventListener('orientationchange', resetTouches);
    };
  }, [active, inputRef]);

  useEffect(() => {
    inputRef.current.touchSprint = sprintLocked;
  }, [sprintLocked, inputRef]);

  // Attach non-passive touch listeners so preventDefault() stops page scrolling/gestures reliably
  useEffect(() => {
    const baseEl = joystickBaseRef.current;
    const lookEl = lookZoneRef.current;
    if (!baseEl || !lookEl || !active) return;

    const maxR = gameConfig.mobile.joystickRadiusPx;

    const updateJoystick = (clientX: number, clientY: number) => {
      const dx = clientX - moveOriginRef.current.x;
      const dy = clientY - moveOriginRef.current.y;
      const dist = Math.hypot(dx, dy);
      const clampedDist = Math.min(dist, maxR);
      const angle = dist > 0.0001 ? Math.atan2(dy, dx) : 0;
      const offsetX = Math.cos(angle) * clampedDist;
      const offsetY = Math.sin(angle) * clampedDist;

      if (joystickKnobRef.current) {
        joystickKnobRef.current.style.transform = `translate3d(${offsetX.toFixed(1)}px, ${offsetY.toFixed(1)}px, 0px)`;
      }

      inputRef.current.touchRight = offsetX / maxR;
      inputRef.current.touchForward = -offsetY / maxR;
    };

    const handleMoveStart = (e: TouchEvent) => {
      e.preventDefault();
      if (moveTouchIdRef.current !== null) return;
      const touch = e.changedTouches[0];
      if (!touch) return;
      moveTouchIdRef.current = touch.identifier;
      const rect = baseEl.getBoundingClientRect();
      moveOriginRef.current = {
        x: rect.left + rect.width / 2,
        y: rect.top + rect.height / 2,
      };
      updateJoystick(touch.clientX, touch.clientY);
    };

    const handleMoveMove = (e: TouchEvent) => {
      e.preventDefault();
      if (moveTouchIdRef.current === null) return;
      for (let i = 0; i < e.changedTouches.length; i++) {
        const t = e.changedTouches[i];
        if (t.identifier === moveTouchIdRef.current) {
          updateJoystick(t.clientX, t.clientY);
          break;
        }
      }
    };

    const handleMoveEnd = (e: TouchEvent) => {
      e.preventDefault();
      if (moveTouchIdRef.current === null) return;
      for (let i = 0; i < e.changedTouches.length; i++) {
        if (e.changedTouches[i].identifier === moveTouchIdRef.current) {
          moveTouchIdRef.current = null;
          inputRef.current.touchForward = 0;
          inputRef.current.touchRight = 0;
          if (joystickKnobRef.current) {
            joystickKnobRef.current.style.transform = 'translate3d(0px, 0px, 0px)';
          }
          break;
        }
      }
    };

    const handleLookStart = (e: TouchEvent) => {
      e.preventDefault();
      if (lookTouchIdRef.current !== null) return;
      const touch = e.changedTouches[0];
      if (!touch) return;
      lookTouchIdRef.current = touch.identifier;
      lastLookPosRef.current = { x: touch.clientX, y: touch.clientY };
    };

    const handleLookMove = (e: TouchEvent) => {
      e.preventDefault();
      if (lookTouchIdRef.current === null) return;
      for (let i = 0; i < e.changedTouches.length; i++) {
        const t = e.changedTouches[i];
        if (t.identifier === lookTouchIdRef.current) {
          const dx = t.clientX - lastLookPosRef.current.x;
          const dy = t.clientY - lastLookPosRef.current.y;
          lastLookPosRef.current = { x: t.clientX, y: t.clientY };
          inputRef.current.lookDeltaX -= dx * gameConfig.camera.touchLookSensitivity;
          inputRef.current.lookDeltaY -= dy * gameConfig.camera.touchLookSensitivity;
          break;
        }
      }
    };

    const handleLookEnd = (e: TouchEvent) => {
      e.preventDefault();
      if (lookTouchIdRef.current === null) return;
      for (let i = 0; i < e.changedTouches.length; i++) {
        if (e.changedTouches[i].identifier === lookTouchIdRef.current) {
          lookTouchIdRef.current = null;
          break;
        }
      }
    };

    baseEl.addEventListener('touchstart', handleMoveStart, { passive: false });
    baseEl.addEventListener('touchmove', handleMoveMove, { passive: false });
    baseEl.addEventListener('touchend', handleMoveEnd, { passive: false });
    baseEl.addEventListener('touchcancel', handleMoveEnd, { passive: false });

    lookEl.addEventListener('touchstart', handleLookStart, { passive: false });
    lookEl.addEventListener('touchmove', handleLookMove, { passive: false });
    lookEl.addEventListener('touchend', handleLookEnd, { passive: false });
    lookEl.addEventListener('touchcancel', handleLookEnd, { passive: false });

    return () => {
      baseEl.removeEventListener('touchstart', handleMoveStart);
      baseEl.removeEventListener('touchmove', handleMoveMove);
      baseEl.removeEventListener('touchend', handleMoveEnd);
      baseEl.removeEventListener('touchcancel', handleMoveEnd);

      lookEl.removeEventListener('touchstart', handleLookStart);
      lookEl.removeEventListener('touchmove', handleLookMove);
      lookEl.removeEventListener('touchend', handleLookEnd);
      lookEl.removeEventListener('touchcancel', handleLookEnd);
    };
  }, [active, inputRef]);

  if (!active) return null;

  return (
    <div
      data-game-ui="true"
      style={{
        position: 'absolute',
        inset: 0,
        pointerEvents: 'none',
        zIndex: 25,
        userSelect: 'none',
        WebkitUserSelect: 'none',
        touchAction: 'none',
      }}
    >
      {/* Right-half touch camera look zone */}
      <div
        ref={lookZoneRef}
        aria-label="Touch look zone"
        style={{
          position: 'absolute',
          top: 64,
          right: 0,
          bottom: 0,
          width: '55%',
          pointerEvents: 'auto',
          touchAction: 'none',
        }}
      />

      {/* Left Virtual Joystick */}
      <div
        ref={joystickBaseRef}
        aria-label="Movement joystick"
        style={{
          position: 'absolute',
          left: 'max(24px, env(safe-area-inset-left, 24px))',
          bottom: 'max(28px, env(safe-area-inset-bottom, 28px))',
          width: 124,
          height: 124,
          borderRadius: '50%',
          background: 'rgba(15, 23, 42, 0.42)',
          border: '2px solid rgba(255, 255, 255, 0.35)',
          backdropFilter: 'blur(4px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          pointerEvents: 'auto',
          touchAction: 'none',
          boxShadow: '0 6px 20px rgba(0, 0, 0, 0.25)',
        }}
      >
        <div
          ref={joystickKnobRef}
          style={{
            width: 52,
            height: 52,
            borderRadius: '50%',
            background: 'rgba(255, 255, 255, 0.85)',
            boxShadow: '0 2px 8px rgba(0, 0, 0, 0.35)',
            pointerEvents: 'none',
            willChange: 'transform',
          }}
        />
      </div>

      {/* Right Action Buttons (Sprint & Jump) */}
      <div
        style={{
          position: 'absolute',
          right: 'max(24px, env(safe-area-inset-right, 24px))',
          bottom: 'max(32px, env(safe-area-inset-bottom, 32px))',
          display: 'flex',
          gap: 14,
          alignItems: 'center',
          pointerEvents: 'auto',
          touchAction: 'none',
        }}
      >
        <button
          type="button"
          onClick={() => setSprintLocked((prev) => !prev)}
          onTouchStart={(e) => {
            e.preventDefault();
            e.stopPropagation();
            setSprintLocked((prev) => !prev);
          }}
          style={{
            width: 62,
            height: 62,
            borderRadius: '50%',
            background: sprintLocked ? 'rgba(37, 99, 235, 0.88)' : 'rgba(15, 23, 42, 0.55)',
            border: '2px solid rgba(255, 255, 255, 0.45)',
            color: '#ffffff',
            fontWeight: 700,
            fontSize: 12,
            backdropFilter: 'blur(4px)',
            boxShadow: '0 4px 12px rgba(0, 0, 0, 0.25)',
            touchAction: 'none',
          }}
        >
          RUN
        </button>

        <button
          type="button"
          onMouseDown={() => {
            inputRef.current.touchJump = true;
          }}
          onMouseUp={() => {
            inputRef.current.touchJump = false;
          }}
          onMouseLeave={() => {
            inputRef.current.touchJump = false;
          }}
          onTouchStart={(e) => {
            e.preventDefault();
            e.stopPropagation();
            inputRef.current.touchJump = true;
          }}
          onTouchEnd={(e) => {
            e.preventDefault();
            e.stopPropagation();
            inputRef.current.touchJump = false;
          }}
          onTouchCancel={(e) => {
            e.preventDefault();
            e.stopPropagation();
            inputRef.current.touchJump = false;
          }}
          style={{
            width: 72,
            height: 72,
            borderRadius: '50%',
            background: 'rgba(15, 23, 42, 0.65)',
            border: '2px solid rgba(255, 255, 255, 0.55)',
            color: '#ffffff',
            fontWeight: 700,
            fontSize: 13,
            backdropFilter: 'blur(4px)',
            boxShadow: '0 4px 14px rgba(0, 0, 0, 0.3)',
            touchAction: 'none',
          }}
        >
          JUMP
        </button>
      </div>
    </div>
  );
}
