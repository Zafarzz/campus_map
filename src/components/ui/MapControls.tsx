import { mapConfig, statusLabels } from '../../config/mapConfig';
import type { RoomStatus } from '../../domain/schedule/types';
import { useMap } from '../../state/MapProvider';

const pad = (n: number) => String(n).padStart(2, '0');
const fmtMinutes = (m: number) => `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;

export function TimeControl() {
  const { time, setTime, now } = useMap();
  const [from, to] = mapConfig.schedule.simulatedRange;
  const minutes = now.getHours() * 60 + now.getMinutes();

  return (
    <section className="section time">
      <div className="time__row">
        <span className="time__now">{fmtMinutes(minutes)}</span>
        <div className="segmented" role="group" aria-label="Time mode">
          <button type="button" className={time.mode === 'live' ? 'active' : ''} onClick={() => setTime({ mode: 'live' })}>
            Live
          </button>
          <button
            type="button"
            className={time.mode === 'simulated' ? 'active' : ''}
            onClick={() =>
              setTime({ mode: 'simulated', minutes: Math.min(to, Math.max(from, minutes)) })
            }
          >
            Simulate
          </button>
        </div>
      </div>
      {time.mode === 'simulated' && (
        <input
          type="range"
          min={from}
          max={to}
          step={5}
          value={time.minutes}
          onChange={(e) => setTime({ mode: 'simulated', minutes: Number(e.target.value) })}
          aria-label="Simulated time"
        />
      )}
    </section>
  );
}

export function Legend() {
  return (
    <ul className="legend">
      {(Object.keys(statusLabels) as RoomStatus[]).map((s) => (
        <li key={s}>
          <span className="status-dot" style={{ background: mapConfig.colors.status[s] }} />
          {statusLabels[s]}
        </li>
      ))}
    </ul>
  );
}

export function DataNotice() {
  const { showReference, setShowReference } = useMap();
  return (
    <section className="notice">
      <p>
        <strong>Prototype.</strong> Building positions are traced approximately from satellite imagery; floor counts
        are confirmed. Rooms and schedule are demo data.
      </p>
      <label className="checkbox">
        <input type="checkbox" checked={showReference} onChange={(e) => setShowReference(e.target.checked)} />
        Show satellite reference
      </label>
    </section>
  );
}
