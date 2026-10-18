import { Leva } from 'leva';
import { Suspense, lazy, useEffect, useState } from 'react';
import { CampusMap } from './components/3d/CampusMap';
import { isDevOrDebugMode } from './components/3d/tuning/useVisualTuning';
import { Breadcrumbs } from './components/ui/Breadcrumbs';
import { BuildingList } from './components/ui/BuildingList';
import { FloorRoomList } from './components/ui/FloorRoomList';
import { FloorSelector } from './components/ui/FloorSelector';
import { DataNotice, Legend, TimeControl } from './components/ui/MapControls';
import { RoomDetails } from './components/ui/RoomDetails';
import { SearchBox } from './components/ui/SearchBox';
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

function AppLayout() {
  const { selection } = useMap();
  const isDev = isDevOrDebugMode();
  const [showTuning, setShowTuning] = useState(isDev);

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

  return (
    <div className="layout">
      {/* Visual Tuning Panel via Leva */}
      <Leva hidden={!showTuning} collapsed={true} />

      <main className="layout__3d">
        <CampusMap />
        {selection.buildingId && <FloorSelector />}
      </main>

      <aside className="layout__ui">
        <header
          className="header"
          style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}
        >
          <div>
            <h1>Campus Map</h1>
            <Breadcrumbs />
          </div>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            {isDev && (
              <button
                onClick={() => setShowTuning((prev) => !prev)}
                style={{
                  backgroundColor: showTuning ? '#475569' : '#334155',
                  color: '#f8fafc',
                  border: '1px solid rgba(255,255,255,0.2)',
                  padding: '6px 10px',
                  borderRadius: 6,
                  fontSize: 12,
                  fontWeight: 500,
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                }}
                title="Показать/скрыть панель визуальной настройки (Ctrl+Alt+T)"
              >
                {showTuning ? '🎛️ Скрыть тюнинг' : '🎛️ Тюнинг'}
              </button>
            )}
            <button
              onClick={navigateToGame}
              style={{
                backgroundColor: '#059669',
                color: '#ffffff',
                border: 'none',
                padding: '6px 10px',
                borderRadius: 6,
                fontSize: 12,
                fontWeight: 600,
                cursor: 'pointer',
                whiteSpace: 'nowrap',
                boxShadow: '0 2px 4px rgba(0,0,0,0.2)',
              }}
              title="Режим прогулки от первого лица (/game)"
            >
              🎮 3D Walk
            </button>
            <button
              onClick={() => {
                window.location.hash = '#/editor';
                window.dispatchEvent(new HashChangeEvent('hashchange'));
              }}
              style={{
                backgroundColor: '#2563eb',
                color: '#ffffff',
                border: 'none',
                padding: '6px 12px',
                borderRadius: 6,
                fontSize: 12,
                fontWeight: 600,
                cursor: 'pointer',
                whiteSpace: 'nowrap',
                boxShadow: '0 2px 4px rgba(0,0,0,0.2)',
              }}
              title="Открыть 2D-редактор карты кампуса (/editor)"
            >
              ✏️ 2D Редактор
            </button>
          </div>
        </header>
        <div className="scrollable">
          <SearchBox />
          {!selection.buildingId && <BuildingList />}
          {selection.floorId && !selection.roomId && <FloorRoomList />}
          {selection.roomId && <RoomDetails />}
        </div>
        <footer className="footer">
          <TimeControl />
          <Legend />
          <DataNotice />
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
      <Suspense fallback={<div className="loading">Loading 2D Editor...</div>}>
        <Leva hidden={true} />
        <LazyEditorPage />
      </Suspense>
    );
  }

  if (inGame) {
    return (
      <MapProvider fallback={<div className="loading">Loading campus world...</div>}>
        <Suspense fallback={<div className="loading">Initializing 3D Physics...</div>}>
          <Leva hidden={true} />
          <LazyGameScene />
        </Suspense>
      </MapProvider>
    );
  }

  return (
    <MapProvider fallback={<div className="loading">Loading campus data...</div>}>
      <AppLayout />
    </MapProvider>
  );
}
