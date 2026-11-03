import { mapConfig, statusLabels } from '../../config/mapConfig';
import { sortedFloors } from '../../domain/campus/campusIndex';
import { formatTime } from '../../services/schedule/scheduleService';
import { useMap } from '../../state/MapProvider';

/** Rooms of the selected floor (list alternative to clicking rooms in 3D). */
export function FloorRoomList() {
  const { index, selection, roomStates, selectFloor, selectRoom, clearSelection } = useMap();
  const loc = selection.floorId ? index.floors.get(selection.floorId) : undefined;
  if (!loc) return null;

  const floors = sortedFloors(loc.building);

  return (
    <section className="section">
      <div className="section__header">
        <div>
          <h2 className="section__title">
            {loc.building.name} · {loc.floor.name}
          </h2>
          <div className="section__subtitle">
            {loc.floor.rooms.length} room{loc.floor.rooms.length === 1 ? '' : 's'} on this floor
          </div>
        </div>
        <button
          type="button"
          className="btn-link"
          onClick={clearSelection}
          title="Back to all campus buildings"
        >
          ← All Buildings
        </button>
      </div>

      {floors.length > 1 && (
        <div className="floor-tabs" role="tablist" aria-label="Switch Floor">
          {floors.map((f) => {
            const active = f.id === loc.floor.id;
            return (
              <button
                key={f.id}
                type="button"
                role="tab"
                aria-selected={active}
                className={`floor-tabs__btn${active ? ' floor-tabs__btn--active' : ''}`}
                onClick={() => selectFloor(f.id)}
              >
                Floor {f.level}
              </button>
            );
          })}
        </div>
      )}

      <ul className="list">
        {loc.floor.rooms.map((room) => {
          const state = roomStates.get(room.id);
          const status = state?.status ?? 'AVAILABLE';
          const lesson = state?.current ?? state?.next;
          return (
            <li key={room.id}>
              <button
                type="button"
                className={`list__item${selection.roomId === room.id ? ' list__item--active' : ''}`}
                onClick={() => selectRoom(room.id)}
              >
                <span className="status-dot" style={{ background: mapConfig.colors.status[status] }} />
                <span className="list__main">
                  <span className="list__title">
                    {room.number}
                    {room.name ? ` · ${room.name}` : ''}
                  </span>
                  <small className="list__meta">
                    {statusLabels[status]}
                    {lesson ? ` · ${lesson.subject} ${formatTime(lesson.startsAt)}` : ''}
                  </small>
                </span>
                <span className="list__chevron" aria-hidden="true">›</span>
              </button>
            </li>
          );
        })}
        {loc.floor.rooms.length === 0 && (
          <li className="empty-state">No rooms configured on this floor yet.</li>
        )}
      </ul>
    </section>
  );
}
