import { sortedFloors } from '../../domain/campus/campusIndex';
import { useMap } from '../../state/MapProvider';

/** Vertical floor switcher shown over the map when a building is selected. */
export function FloorSelector() {
  const { index, selection, selectFloor, clearSelection } = useMap();
  const building = selection.buildingId ? index.buildings.get(selection.buildingId) : undefined;
  if (!building) return null;
  const floors = sortedFloors(building).reverse(); // top floor first

  return (
    <div className="floor-selector" role="group" aria-label="Floors">
      <div className="floor-selector__title">{building.shortName}</div>
      {floors.map((f) => (
        <button
          key={f.id}
          type="button"
          className={f.id === selection.floorId ? 'active' : ''}
          onClick={() => selectFloor(f.id)}
          aria-pressed={f.id === selection.floorId}
          title={f.name}
        >
          {f.level}
        </button>
      ))}
      <button type="button" className="floor-selector__exit" onClick={clearSelection} title="Back to campus">
        ✕
      </button>
    </div>
  );
}
