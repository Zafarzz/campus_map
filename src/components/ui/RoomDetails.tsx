import { mapConfig, statusLabels } from '../../config/mapConfig';
import type { Lesson } from '../../domain/schedule/types';
import { formatTime } from '../../services/schedule/scheduleService';
import { useMap } from '../../state/MapProvider';

function LessonBlock({ lesson, label }: { lesson: Lesson; label: string }) {
  return (
    <div className={`lesson${lesson.cancelled ? ' lesson--cancelled' : ''}`}>
      <div className="lesson__label">{label}</div>
      <div className="lesson__subject">{lesson.subject}</div>
      <div className="lesson__time">
        {formatTime(lesson.startsAt)} — {formatTime(lesson.endsAt)}
        {lesson.cancelled && ' · Cancelled'}
      </div>
      {lesson.teacher && <div className="lesson__meta">Professor: <strong>{lesson.teacher}</strong></div>}
      {lesson.group && <div className="lesson__meta">Group: <strong>{lesson.group}</strong></div>}
    </div>
  );
}

/** Details card for the selected room. */
export function RoomDetails() {
  const { index, geometry, selection, roomStates, now, selectFloor } = useMap();
  const loc = selection.roomId ? index.rooms.get(selection.roomId) : undefined;
  if (!loc) return null;

  const { room, floor, building } = loc;
  const state = roomStates.get(room.id);
  const status = state?.status ?? 'AVAILABLE';
  const approx = geometry.rooms[room.id]?.precision !== 'surveyed';

  return (
    <section className="section room-card">
      <div className="room-card__top-nav">
        <button
          type="button"
          className="btn-link"
          onClick={() => selectFloor(floor.id)}
          title={`Back to ${floor.name}`}
        >
          ← Back to {building.shortName} · {floor.name}
        </button>
      </div>

      <header className="room-card__header">
        <div>
          <h2 className="room-card__title">Room {room.number}</h2>
          <div className="room-card__subtitle">
            {room.name ? `${room.name} · ` : ''}
            {building.name} · {floor.name}
          </div>
        </div>
        <span className="pill" style={{ background: mapConfig.colors.status[status] }}>
          {statusLabels[status]}
        </span>
      </header>

      {(room.capacity || room.kind) && (
        <div className="room-card__specs">
          {room.kind && (
            <div className="room-card__spec">
              <span className="room-card__spec-label">Type</span>
              <span className="room-card__spec-value">{room.kind}</span>
            </div>
          )}
          {room.capacity && (
            <div className="room-card__spec">
              <span className="room-card__spec-label">Capacity</span>
              <span className="room-card__spec-value">{room.capacity} seats</span>
            </div>
          )}
        </div>
      )}

      {state?.current && <LessonBlock lesson={state.current} label="Now" />}
      {state?.next && <LessonBlock lesson={state.next} label="Next" />}
      {!state?.current && !state?.next && (
        <div className="empty-state empty-state--compact">No more lessons scheduled for today.</div>
      )}

      {state && state.lessons.length > 0 && (
        <details className="today" open={state.lessons.length <= 4}>
          <summary>Today’s Schedule ({state.lessons.length})</summary>
          <ul className="today__list">
            {state.lessons.map((l) => (
              <li
                key={l.id}
                className={`today__item ${l.cancelled ? 'lesson--cancelled' : ''} ${new Date(l.endsAt) <= now ? 'muted' : ''}`}
              >
                <span className="today__time">{formatTime(l.startsAt)}–{formatTime(l.endsAt)}</span>
                <span className="today__subject">
                  {l.subject}
                  {l.group ? <small> · {l.group}</small> : ''}
                </span>
              </li>
            ))}
          </ul>
        </details>
      )}

      <div className="tags">
        {room.provenance === 'demo' && <span className="tag">Demo room</span>}
        {approx && <span className="tag">Approximate position</span>}
      </div>
    </section>
  );
}
