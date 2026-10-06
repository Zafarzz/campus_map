import { useMap } from '../../state/MapProvider';

/** Campus › Building › Floor › Room — every level is clickable. */
export function Breadcrumbs() {
  const { index, selection, clearSelection, selectBuilding, selectFloor } = useMap();
  const building = selection.buildingId ? index.buildings.get(selection.buildingId) : undefined;
  const floor = selection.floorId ? index.floors.get(selection.floorId)?.floor : undefined;
  const room = selection.roomId ? index.rooms.get(selection.roomId)?.room : undefined;

  return (
    <nav className="crumbs" aria-label="Location">
      <button type="button" onClick={clearSelection} disabled={!building}>
        Campus
      </button>
      {building && (
        <>
          <span>›</span>
          <button type="button" onClick={() => selectBuilding(building.id)} disabled={!floor && !room}>
            {building.name}
          </button>
        </>
      )}
      {floor && (
        <>
          <span>›</span>
          <button type="button" onClick={() => selectFloor(floor.id)} disabled={!room}>
            {floor.name}
          </button>
        </>
      )}
      {room && (
        <>
          <span>›</span>
          <button type="button" disabled>
            {room.number}
          </button>
        </>
      )}
    </nav>
  );
}
