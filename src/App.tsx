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
import { AuthHeaderButton } from './components/auth/AuthHeaderButton';
import { AuthModal } from './components/auth/AuthModal';
import { CampusNavRail, type CampusNavSection } from './components/ui/CampusNavRail';
import { navigateToEditor, navigateToGame, useAppRoute } from './hooks/useAppRoute';
import { AuthProvider } from './state/AuthContext';
import { MapProvider, useCampusData, useMapSelection } from './state/MapProvider';
import './components/ui/panelMinimal.css';

const LazyEditorPage = lazy(() =>
  import('./editor/components/EditorPage').then((m) => ({ default: m.EditorPage })),
);
const LazyGameScene = lazy(() =>
  import('./game/GameScene').then((m) => ({ default: m.GameScene })),
);
const LazyCrowdedPlacesView = lazy(() =>
  import('./components/crowds/CrowdedPlacesView').then((m) => ({ default: m.CrowdedPlacesView })),
);
const LazyBookingsView = lazy(() =>
  import('./components/booking/BookingsView').then((m) => ({ default: m.BookingsView })),
);
const LazyLostFoundView = lazy(() =>
  import('./components/lostfound/LostFoundView').then((m) => ({ default: m.LostFoundView })),
);
const LazyAttendanceView = lazy(() =>
  import('./components/attendance/AttendanceView').then((m) => ({ default: m.AttendanceView })),
);

type MobileSheetSnap = 'collapsed' | 'half' | 'expanded';

const SECTION_HEADERS: Record<CampusNavSection, { title: string; desc: string }> = {
  map: {
    title: 'Campus Map & Schedule',
    desc: 'Explore 3D buildings, lecture halls, and live timetable',
  },
  crowds: {
    title: 'Busyness & Crowded Places',
    desc: 'Real-time library occupancy, study hubs, and cafeteria rush',
  },
  bookings: {
    title: 'Space & Facility Booking',
    desc: 'Reserve classrooms, computer labs, and dorm facilities',
  },
  lostfound: {
    title: 'Campus Lost & Found',
    desc: 'Community recovery registry and verified ownership claims',
  },  attendance: {
    title: 'Class Attendance (QR)',
    desc: 'Dynamic rotating QR code check-in & attendance verification',
  },
};

function AppLayout() {
  const { index } = useCampusData();
  const { selection, clearSelection } = useMapSelection();
  const isDev = isDevOrDebugMode();
  const cinematicClean = useCinematicClean();
  const [showTuning, setShowTuning] = useState(false);
  const [mobileSnap, setMobileSnap] = useState<MobileSheetSnap>('half');
  const [footerExpanded, setFooterExpanded] = useState(false);
  const [isLaunchingWalk, setIsLaunchingWalk] = useState(false);
  const [activeSection, setActiveSection] = useState<CampusNavSection>('map');

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

        <div className="layout__panel-container">
          {/* Main Panel Content on the Left */}
          <div className="layout__panel-content">
            <header className="header">
              {/* Row 1: Logo on the left, User profile/login button on the right */}
              <div className="header__top-row">
                <img
                  src="/assets/aut-seal.png"
                  alt="Ajou University in Tashkent"
                  className="header__logo"
                  width="38"
                  height="38"
                />
                <AuthHeaderButton />
              </div>

              {/* Row 2: Title (one line) and Row 3: Description (one line right below) */}
              <div className="header__title-block">
                <h1 className="header__title-line">
                  {activeSection === 'map' && selection.buildingId
                    ? (index.buildings.get(selection.buildingId)?.name ?? SECTION_HEADERS.map.title)
                    : SECTION_HEADERS[activeSection].title}
                </h1>
                {activeSection === 'map' && selection.buildingId ? (
                  <Breadcrumbs />
                ) : (
                  <p className="header__desc-line">{SECTION_HEADERS[activeSection].desc}</p>
                )}
              </div>

              {activeSection === 'map' && (
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
                    onClick={navigateToEditor}
                    title="Open 2D Campus Floorplan & Map Editor (/editor)"
                  >
                    ✏️ 2D Editor
                  </button>
                </div>
              )}
            </header>

            <div
              className="scrollable"
              onFocusCapture={() => {
                if (mobileSnap === 'collapsed') setMobileSnap('half');
              }}
            >
              {activeSection === 'map' && (
                <>
                  <SearchBox />
                  {!selection.buildingId && <BuildingList />}
                  {selection.floorId && !selection.roomId && <FloorRoomList />}
                  {selection.roomId && <RoomDetails />}
                </>
              )}
              {activeSection !== 'map' && (
                <Suspense fallback={<div className="panel-loading">Loading section…</div>}>
                  {activeSection === 'crowds' && (
                    <LazyCrowdedPlacesView onNavigateToMap={() => setActiveSection('map')} />
                  )}
                  {activeSection === 'bookings' && (
                    <LazyBookingsView onBackToMap={() => setActiveSection('map')} />
                  )}
                  {activeSection === 'lostfound' && (
                    <LazyLostFoundView onBackToMap={() => setActiveSection('map')} />
                  )}
                  {activeSection === 'attendance' && (
                    <LazyAttendanceView onBackToMap={() => setActiveSection('map')} />
                  )}
                </Suspense>
              )}
            </div>

            {activeSection === 'map' && (
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
                  <Legend />
                  <DataNotice />
                </div>
              </footer>
            )}
          </div>

          {/* Menu placed in the right side bar as requested */}
          <CampusNavRail
            activeSection={activeSection}
            onSelectSection={(sec) => {
              setActiveSection(sec);
              if (mobileSnap === 'collapsed') setMobileSnap('half');
            }}
          />
        </div>
      </aside>
      <AuthModal />
    </div>
  );
}

export default function App() {
  const { inEditor, inGame } = useAppRoute();

  return (
    <AuthProvider>
      {inEditor ? (
        <Suspense fallback={<InitialCampusLoader stageMessage="Loading 2D Vector Editor..." />}>
          <Leva hidden={true} />
          <LazyEditorPage />
        </Suspense>
      ) : inGame ? (
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
      ) : (
        <MapProvider fallback={<InitialCampusLoader stageMessage="Initializing campus digital twin..." />}>
          <AppLayout />
        </MapProvider>
      )}
    </AuthProvider>
  );
}
