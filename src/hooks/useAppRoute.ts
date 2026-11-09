import { useEffect, useState } from 'react';

export function isEditorRoute(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    window.location.pathname === '/editor' ||
    window.location.pathname.startsWith('/editor/') ||
    window.location.hash === '#/editor' ||
    window.location.hash.startsWith('#/editor')
  );
}

export function isGameRoute(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    window.location.pathname === '/game' ||
    window.location.pathname.startsWith('/game/') ||
    window.location.hash === '#/game' ||
    window.location.hash.startsWith('#/game')
  );
}

export function navigateToEditor(): void {
  if (typeof window === 'undefined') return;
  window.location.hash = '#/editor';
  window.dispatchEvent(new HashChangeEvent('hashchange'));
}

export function navigateToGame(): void {
  if (typeof window === 'undefined') return;
  window.location.hash = '#/game';
  window.dispatchEvent(new HashChangeEvent('hashchange'));
}

export function navigateToMap(): void {
  if (typeof window === 'undefined') return;
  if (typeof document !== 'undefined' && document.pointerLockElement) {
    document.exitPointerLock?.();
  }
  if (
    window.location.pathname.startsWith('/game') ||
    window.location.pathname.startsWith('/editor')
  ) {
    window.history.pushState({}, '', '/');
  }
  if (window.location.hash) {
    window.location.hash = '';
  }
  window.dispatchEvent(new PopStateEvent('popstate'));
  window.dispatchEvent(new HashChangeEvent('hashchange'));
}

export function useAppRoute(): { inEditor: boolean; inGame: boolean } {
  const [inEditor, setInEditor] = useState<boolean>(isEditorRoute);
  const [inGame, setInGame] = useState<boolean>(isGameRoute);

  useEffect(() => {
    const handleLocationChange = () => {
      setInEditor(isEditorRoute());
      setInGame(isGameRoute());
    };

    window.addEventListener('popstate', handleLocationChange);
    window.addEventListener('hashchange', handleLocationChange);

    return () => {
      window.removeEventListener('popstate', handleLocationChange);
      window.removeEventListener('hashchange', handleLocationChange);
    };
  }, []);

  return { inEditor, inGame };
}
