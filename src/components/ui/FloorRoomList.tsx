import { mapConfig, statusLabels } from '../../config/mapConfig';
import { formatTime } from '../../services/schedule/scheduleService';
import { useMap } from '../../state/MapProvider';

/** Rooms of the selected floor (list alternative to clicking rooms in 3D). */
export function FloorRoomList() {
  const { index, selection, roomStates, selectRoom } = useMap();
  const loc = selection.floorId ? index.floors.get(selection.floorId) : undefined;
  if (!loc) return null;

  return (
    <section className="section">
      <h2 className="section__title">
        {loc.building.name} · {loc.floor.name}
      </h2>
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
                  <span>
                    {room.number}
                    {room.name ? ` · ${room.name}` : ''}
                  </span>
                  <small>
                    {statusLabels[status]}
                    {lesson ? ` · ${lesson.subject} ${formatTime(lesson.startsAt)}` : ''}
                  </small>
                </span>
              </button>
            </li>
          );
        })}
        {loc.floor.rooms.length === 0 && <li className="muted">No rooms on this floor yet.</li>}
      </ul>
    </section>
  );
}
