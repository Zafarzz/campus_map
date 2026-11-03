import { Leva } from 'leva';
import { Suspense, lazy, useEffect, useState } from 'react';
import { CampusMap } from './components/3d/CampusMap';
import { isDevOrDebugMode } from './components/3d/tuning/useVisualTuning';
import { Breadcrumbs } from './components/ui/Breadcrumbs';
import { BackendLivePanel } from './components/ui/BackendLivePanel';
import { BuildingList } from './components/ui/BuildingList';
import {
  InitialCampusLoader,
  SceneActivityIndicator,
  WalkthroughLoadingOverlay,
} from './components/ui/CampusLoadingOverlay';
import { FloorRoomList } from './components/ui/FloorRoomList';
import { FloorSelector } from './components/ui/FloorSelector';
import { DataNotice, Legend, TimeControl } from './components/ui/MapControls';
import { RoomDetails } from './components/ui/RoomDetails';
import { SearchBox } from './components/ui/SearchBox';
import { ViewportNavigationTools } from './components/ui/ViewportNavigationTools';
import { CinematicButton, CinematicOverlay, useCinematicClean } from './cinematic/CinematicMode';
import { isGameRoute, navigateToGame } from './game/config/gameConfig';
import { MapProvider, useMap } from './state/MapProvider';

const LazyEditorPage = lazy(() =>
  import('./editor/components/EditorPage').then((m) => ({ default: m.EditorPage })),
);
const LazyGameScene = lazy(() =>
  import('./game/GameScene').then((m) => ({ default: m.GameScene })),
);

function isEditorRoute(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    window.location.pathname === '/editor' ||
    window.location.pathname.startsWith('/editor/') ||
    window.location.hash === '#/editor' ||
    window.location.hash.startsWith('#/editor')
  );
}

type MobileSheetSnap = 'collapsed' | 'half' | 'expanded';

function AppLayout() {
  const { selection, clearSelection } = useMap();
  const isDev = isDevOrDebugMode();
  const cinematicClean = useCinematicClean();
  const [showTuning, setShowTuning] = useState(isDev);
  const [mobileSnap, setMobileSnap] = useState<MobileSheetSnap>('half');
  const [footerExpanded, setFooterExpanded] = useState(false);
  const [isLaunchingWalk, setIsLaunchingWalk] = useState(false);

  // Auto-open sheet to at least half when user selects a building or room on mobile
  useEffect(() => {
    if (selection.buildingId || selection.roomId) {
      setMobileSnap((prev) => (prev === 'collapsed' ? 'half' : prev));
    }
  }, [selection.buildingId, selection.roomId]);

  // Global hotkey to toggle tuning panel in dev mode (Ctrl+Alt+T)
  useEffect(() => {
    if (!isDev) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.altKey && (e.key === 't' || e.key === 'T')) {
        e.preventDefault();
        setShowTuning((prev) => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isDev]);

  const cycleMobileSnap = () => {
    setMobileSnap((prev) =>
      prev === 'collapsed' ? 'half' : prev === 'half' ? 'expanded' : 'half',
    );
  };

  const handleSelect3DWalk = () => {
    if (isLaunchingWalk) return;
    setIsLaunchingWalk(true);
    window.requestAnimationFrame(() => {
      navigateToGame();
    });
  };

  return (
    <div
      className={`layout layout--sheet-${mobileSnap}${cinematicClean ? ' layout--cinematic' : ''}`}
    >
      {/* Visual Tuning Panel via Leva */}
      <Leva hidden={!showTuning} collapsed={true} />

      {isLaunchingWalk && (
        <WalkthroughLoadingOverlay
          title="Loading 3D Walk Mode"
          stageMessage="Preparing first-person campus scene & physics engine..."
        />
      )}

      <main className="layout__3d">
        <CampusMap />
        {!cinematicClean && <SceneActivityIndicator />}
        {!cinematicClean && (
          <ViewportNavigationTools
            hasSelection={Boolean(selection.buildingId || selection.roomId)}
            onResetView={clearSelection}
          />
        )}
        {selection.buildingId && !cinematicClean && <FloorSelector />}
        <CinematicOverlay />
      </main>

      <aside className="layout__ui" aria-label="Campus navigation and schedule">
        {/* Mobile sheet drag/tap handle bar */}
        <div className="mobile-sheet-bar">
          <button
            type="button"
            className="mobile-sheet-handle"
            onClick={cycleMobileSnap}
            aria-label="Toggle panel height"
            title="Tap to expand or collapse panel"
          >
            <span className="mobile-sheet-pill" />
          </button>
          <div className="mobile-sheet-snaps" role="group" aria-label="Panel size">
            <button
              type="button"
              className={`mobile-sheet-snap-btn${mobileSnap === 'collapsed' ? ' active' : ''}`}
              onClick={() => setMobileSnap('collapsed')}
            >
              Map
            </button>
            <button
              type="button"
              className={`mobile-sheet-snap-btn${mobileSnap === 'half' ? ' active' : ''}`}
              onClick={() => setMobileSnap('half')}
            >
              Split
            </button>
            <button
              type="button"
              className={`mobile-sheet-snap-btn${mobileSnap === 'expanded' ? ' active' : ''}`}
              onClick={() => setMobileSnap('expanded')}
            >
              Full
            </button>
          </div>
        </div>

        <header className="header">
          <div className="header__top">
            <div className="header__brand">
              <span className="header__logo" aria-hidden="true">AUT</span>
              <div>
                <h1 className="header__title">Campus Map</h1>
                <Breadcrumbs />
              </div>
            </div>
          </div>

          <div className="header__actions" role="toolbar" aria-label="Platform modes">
            {isDev && (
              <button
                type="button"
                className={`mode-btn mode-btn--secondary${showTuning ? ' is-active' : ''}`}
                onClick={() => setShowTuning((prev) => !prev)}
                title="Show/hide visual tuning panel (Ctrl+Alt+T)"
              >
                🎛️ {showTuning ? 'Hide Tuning' : 'Tuning'}
              </button>
            )}
            <CinematicButton />
            <button
              type="button"
              className="mode-btn mode-btn--walk"
              onClick={handleSelect3DWalk}
              disabled={isLaunchingWalk}
              aria-busy={isLaunchingWalk}
              title="First-person 3D walkthrough mode (/game)"
            >
              {isLaunchingWalk ? (
                <>
                  <span
                    className="scene-loader-pill__spinner"
                    style={{ width: 12, height: 12, borderWidth: 2 }}
                    aria-hidden="true"
                  />
                  <span>Loading Walk…</span>
                </>
              ) : (
                '🎮 3D Walk'
              )}
            </button>
            <button
              type="button"
              className="mode-btn mode-btn--editor"
              onClick={() => {
                window.location.hash = '#/editor';
                window.dispatchEvent(new HashChangeEvent('hashchange'));
              }}
              title="Open 2D Campus Floorplan & Map Editor (/editor)"
            >
              ✏️ 2D Editor
            </button>
          </div>
        </header>

        <div className="scrollable" onFocusCapture={() => {
          if (mobileSnap === 'collapsed') setMobileSnap('half');
        }}>
          <SearchBox />
          {!selection.buildingId && <BuildingList />}
          {selection.floorId && !selection.roomId && <FloorRoomList />}
          {selection.roomId && <RoomDetails />}
        </div>

        <footer className={`footer${footerExpanded ? ' footer--expanded' : ''}`}>
          <div className="footer__mobile-toggle-row">
            <TimeControl />
            <button
              type="button"
              className="footer__more-btn"
              onClick={() => setFooterExpanded((prev) => !prev)}
              aria-expanded={footerExpanded}
            >
              {footerExpanded ? 'Hide Legend & Info ▾' : 'Legend & Map Info ▴'}
            </button>
          </div>
          <div className="footer__collapsible">
            <BackendLivePanel />
            <Legend />
            <DataNotice />
          </div>
        </footer>
      </aside>
    </div>
  );
}

export default function App() {
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

  if (inEditor) {
    return (
      <Suspense fallback={<InitialCampusLoader stageMessage="Loading 2D Vector Editor..." />}>
        <Leva hidden={true} />
        <LazyEditorPage />
      </Suspense>
    );
  }

  if (inGame) {
    return (
      <MapProvider
        fallback={
          <WalkthroughLoadingOverlay
            title="Loading 3D Walk Mode"
            stageMessage="Loading campus world geometry..."
          />
        }
      >
        <Suspense
          fallback={
            <WalkthroughLoadingOverlay
              title="Loading 3D Walk Mode"
              stageMessage="Initializing 3D Physics & Walkthrough Engine..."
            />
          }
        >
          <Leva hidden={true} />
          <LazyGameScene />
        </Suspense>
      </MapProvider>
    );
  }

  return (
    <MapProvider fallback={<InitialCampusLoader stageMessage="Initializing campus digital twin..." />}>
      <AppLayout />
    </MapProvider>
  );
}
