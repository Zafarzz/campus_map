import { gameConfig } from '../config/gameConfig';

export type PlayerInputState = {
  // Desktop keyboard state
  moveForward: boolean;
  moveBackward: boolean;
  moveLeft: boolean;
  moveRight: boolean;
  keySprint: boolean;
  keyJump: boolean;

  // Mobile touch state
  touchForward: number; // -1 to 1
  touchRight: number;   // -1 to 1
  touchSprint: boolean;
  touchJump: boolean;

  // Accumulated camera look deltas (radians) consumed each frame
  lookDeltaX: number;
  lookDeltaY: number;
};

export function createInitialInputState(): PlayerInputState {
  return {
    moveForward: false,
    moveBackward: false,
    moveLeft: false,
    moveRight: false,
    keySprint: false,
    keyJump: false,
    touchForward: 0,
    touchRight: 0,
    touchSprint: false,
    touchJump: false,
    lookDeltaX: 0,
    lookDeltaY: 0,
  };
}

export function resetInputState(state: PlayerInputState): void {
  state.moveForward = false;
  state.moveBackward = false;
  state.moveLeft = false;
  state.moveRight = false;
  state.keySprint = false;
  state.keyJump = false;
  state.touchForward = 0;
  state.touchRight = 0;
  state.touchSprint = false;
  state.touchJump = false;
  state.lookDeltaX = 0;
  state.lookDeltaY = 0;
}

export function detectMobileOrTouch(): boolean {
  if (typeof window === 'undefined') return false;
  const hasTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
  const coarsePointer = window.matchMedia?.('(pointer: coarse)').matches ?? false;
  return hasTouch && (coarsePointer || window.innerWidth <= 900);
}

export type DesktopControlsOptions = {
  input: PlayerInputState;
  isPlayingRef: { readonly current: boolean };
  onPauseRequest: () => void;
  onInteractRequest?: () => void;
  onPointerLockChange?: (locked: boolean) => void;
};

/**
 * Attaches keyboard, mouse-look, and pointer-lock listeners for desktop gameplay.
 * Returns a cleanup function.
 */
export function attachDesktopControls({
  input,
  isPlayingRef,
  onPauseRequest,
  onInteractRequest,
  onPointerLockChange,
}: DesktopControlsOptions): () => void {
  let isMouseDragging = false;
  let lastMouseX = 0;
  let lastMouseY = 0;

  const setKey = (code: string, pressed: boolean): boolean => {
    switch (code) {
      case 'KeyW':
      case 'ArrowUp':
        input.moveForward = pressed;
        return true;
      case 'KeyS':
      case 'ArrowDown':
        input.moveBackward = pressed;
        return true;
      case 'KeyA':
      case 'ArrowLeft':
        input.moveLeft = pressed;
        return true;
      case 'KeyD':
      case 'ArrowRight':
        input.moveRight = pressed;
        return true;
      case 'ShiftLeft':
      case 'ShiftRight':
        input.keySprint = pressed;
        return true;
      case 'Space':
        input.keyJump = pressed;
        return true;
      default:
        return false;
    }
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.code === 'Escape') {
      if (isPlayingRef.current) {
        onPauseRequest();
      }
      return;
    }
    if (!isPlayingRef.current) return;
    if (e.code === 'KeyE' && !e.repeat) {
      onInteractRequest?.();
      return;
    }
    if (setKey(e.code, true) && e.code === 'Space') {
      e.preventDefault();
    }
  };

  const handleKeyUp = (e: KeyboardEvent) => {
    setKey(e.code, false);
  };

  const handleMouseMove = (e: MouseEvent) => {
    if (!isPlayingRef.current) return;

    if (document.pointerLockElement) {
      input.lookDeltaX -= e.movementX * gameConfig.camera.mouseSensitivity;
      input.lookDeltaY -= e.movementY * gameConfig.camera.mouseSensitivity;
    } else if (isMouseDragging) {
      const dx = e.clientX - lastMouseX;
      const dy = e.clientY - lastMouseY;
      lastMouseX = e.clientX;
      lastMouseY = e.clientY;
      input.lookDeltaX -= dx * gameConfig.camera.mouseSensitivity;
      input.lookDeltaY -= dy * gameConfig.camera.mouseSensitivity;
    }
  };

  const handleMouseDown = (e: MouseEvent) => {
    if (!isPlayingRef.current || e.button !== 0) return;
    const target = e.target as HTMLElement | null;
    if (target && target.closest('[data-game-ui="true"]')) return;

    isMouseDragging = true;
    lastMouseX = e.clientX;
    lastMouseY = e.clientY;

    if (!document.pointerLockElement && !detectMobileOrTouch()) {
      const canvas = document.querySelector('canvas');
      if (canvas && target === canvas) {
        try {
          const promise = canvas.requestPointerLock?.() as Promise<void> | undefined;
          promise?.catch(() => {
            // Pointer lock may fail in sandboxed or automated environments; drag fallback remains active.
          });
        } catch {
          // Ignore pointer lock errors
        }
      }
    }
  };

  const handleMouseUp = () => {
    isMouseDragging = false;
  };

  const handlePointerLockChange = () => {
    const locked = Boolean(document.pointerLockElement);
    onPointerLockChange?.(locked);
    if (!locked && isPlayingRef.current && !detectMobileOrTouch()) {
      onPauseRequest();
    }
  };

  const handleBlur = () => {
    resetInputState(input);
    isMouseDragging = false;
  };

  window.addEventListener('keydown', handleKeyDown);
  window.addEventListener('keyup', handleKeyUp);
  window.addEventListener('mousemove', handleMouseMove);
  window.addEventListener('mousedown', handleMouseDown);
  window.addEventListener('mouseup', handleMouseUp);
  window.addEventListener('blur', handleBlur);
  document.addEventListener('pointerlockchange', handlePointerLockChange);

  return () => {
    window.removeEventListener('keydown', handleKeyDown);
    window.removeEventListener('keyup', handleKeyUp);
    window.removeEventListener('mousemove', handleMouseMove);
    window.removeEventListener('mousedown', handleMouseDown);
    window.removeEventListener('mouseup', handleMouseUp);
    window.removeEventListener('blur', handleBlur);
    document.removeEventListener('pointerlockchange', handlePointerLockChange);
  };
}

export function requestCanvasPointerLock(): void {
  if (typeof document === 'undefined' || detectMobileOrTouch()) return;
  const canvas = document.querySelector('canvas');
  if (!canvas || document.pointerLockElement === canvas) return;
  try {
    const promise = canvas.requestPointerLock?.() as Promise<void> | undefined;
    promise?.catch(() => {
      // Ignore if rejected by browser
    });
  } catch {
    // Ignore
  }
}
