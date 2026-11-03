import { useMap } from '../../state/MapProvider';

/** Campus › Building › Floor › Room — every level is clickable with clear visual hierarchy. */
export function Breadcrumbs() {
  const { index, selection, clearSelection, selectBuilding, selectFloor } = useMap();
  const building = selection.buildingId ? index.buildings.get(selection.buildingId) : undefined;
  const floor = selection.floorId ? index.floors.get(selection.floorId)?.floor : undefined;
  const room = selection.roomId ? index.rooms.get(selection.roomId)?.room : undefined;

  return (
    <nav className="crumbs" aria-label="Location">
      <button
        type="button"
        className="crumbs__item"
        onClick={clearSelection}
        disabled={!building}
      >
        Campus
      </button>
      {building && (
        <>
          <span className="crumbs__sep" aria-hidden="true">›</span>
          <button
            type="button"
            className="crumbs__item"
            onClick={() => selectBuilding(building.id)}
            disabled={!floor && !room}
          >
            {building.name}
          </button>
        </>
      )}
      {floor && (
        <>
          <span className="crumbs__sep" aria-hidden="true">›</span>
          <button
            type="button"
            className="crumbs__item"
            onClick={() => selectFloor(floor.id)}
            disabled={!room}
          >
            {floor.name}
          </button>
        </>
      )}
      {room && (
        <>
          <span className="crumbs__sep" aria-hidden="true">›</span>
          <button type="button" className="crumbs__item" disabled>
            {room.number}
          </button>
        </>
      )}
    </nav>
  );
}
