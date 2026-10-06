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
      {lesson.teacher && <div>Teacher: {lesson.teacher}</div>}
      {lesson.group && <div>Group: {lesson.group}</div>}
    </div>
  );
}

/** Details card for the selected room. */
export function RoomDetails() {
  const { index, geometry, selection, roomStates, now } = useMap();
  const loc = selection.roomId ? index.rooms.get(selection.roomId) : undefined;
  if (!loc) return null;

  const { room, floor, building } = loc;
  const state = roomStates.get(room.id);
  const status = state?.status ?? 'AVAILABLE';
  const approx = geometry.rooms[room.id]?.precision !== 'surveyed';

  return (
    <section className="section room-card">
      <header className="room-card__header">
        <div>
          <h2 className="room-card__title">Room {room.number}</h2>
          <div className="muted">
            {room.name ? `${room.name} · ` : ''}
            {building.name} · {floor.name}
          </div>
        </div>
        <span className="pill" style={{ background: mapConfig.colors.status[status] }}>
          {statusLabels[status]}
        </span>
      </header>

      {state?.current && <LessonBlock lesson={state.current} label="Now" />}
      {state?.next && <LessonBlock lesson={state.next} label="Next" />}
      {!state?.current && !state?.next && <p className="muted">No more lessons today.</p>}

      {state && state.lessons.length > 0 && (
        <details className="today">
          <summary>Today ({state.lessons.length})</summary>
          <ul>
            {state.lessons.map((l) => (
              <li
                key={l.id}
                className={`${l.cancelled ? 'lesson--cancelled' : ''} ${new Date(l.endsAt) <= now ? 'muted' : ''}`}
              >
                {formatTime(l.startsAt)}–{formatTime(l.endsAt)} {l.subject}
                {l.group ? ` · ${l.group}` : ''}
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
