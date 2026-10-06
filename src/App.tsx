import { CampusMap } from './components/3d/CampusMap';
import { Breadcrumbs } from './components/ui/Breadcrumbs';
import { BuildingList } from './components/ui/BuildingList';
import { FloorRoomList } from './components/ui/FloorRoomList';
import { FloorSelector } from './components/ui/FloorSelector';
import { DataNotice, Legend, TimeControl } from './components/ui/MapControls';
import { RoomDetails } from './components/ui/RoomDetails';
import { SearchBox } from './components/ui/SearchBox';
import { MapProvider, useMap } from './state/MapProvider';

function AppLayout() {
  const { selection } = useMap();

  return (
    <div className="layout">
      <main className="layout__3d">
        <CampusMap />
        {selection.buildingId && <FloorSelector />}
      </main>

      <aside className="layout__ui">
        <header className="header">
          <h1>Campus Map</h1>
          <Breadcrumbs />
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
  return (
    <MapProvider fallback={<div className="loading">Loading campus data...</div>}>
      <AppLayout />
    </MapProvider>
  );
}
