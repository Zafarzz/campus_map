import { mapConfig, statusLabels } from '../../config/mapConfig';
import type { RoomStatus } from '../../domain/schedule/types';
import { TEACHING_WEEKDAYS, defaultSimulatedWeekday } from '../../hooks/useNow';
import { isBackendEnabled } from '../../services/api/apiClient';
import { useMap } from '../../state/MapProvider';

const pad = (n: number) => String(n).padStart(2, '0');
const fmtMinutes = (m: number) => `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;

export function TimeControl() {
  const { time, setTime, now } = useMap();
  const [from, to] = mapConfig.schedule.simulatedRange;
  const minutes = now.getHours() * 60 + now.getMinutes();
  const activeWeekday =
    time.mode === 'simulated' ? (time.weekday ?? defaultSimulatedWeekday(now)) : defaultSimulatedWeekday(now);

  return (
    <section className="section time">
      <div className="time__row">
        <span className="time__now">
          {DAY_NAMES[now.getDay()]} {fmtMinutes(minutes)}
        </span>
        <div className="segmented" role="group" aria-label="Time mode">
          <button type="button" className={time.mode === 'live' ? 'active' : ''} onClick={() => setTime({ mode: 'live' })}>
            Live
          </button>
          <button
            type="button"
            className={time.mode === 'simulated' ? 'active' : ''}
            onClick={() =>
              setTime({
                mode: 'simulated',
                minutes: Math.min(to, Math.max(from, minutes)),
                weekday: defaultSimulatedWeekday(now),
              })
            }
          >
            Simulate
          </button>
        </div>
      </div>
      {time.mode === 'simulated' && (
        <>
          <div className="segmented segmented--days" role="group" aria-label="Simulated weekday">
            {TEACHING_WEEKDAYS.map((d) => (
              <button
                key={d.index}
                type="button"
                className={activeWeekday === d.index ? 'active' : ''}
                onClick={() => setTime({ mode: 'simulated', minutes: time.minutes, weekday: d.index })}
              >
                {d.label}
              </button>
            ))}
          </div>
          <input
            type="range"
            min={from}
            max={to}
            step={5}
            value={time.minutes}
            onChange={(e) =>
              setTime({ mode: 'simulated', minutes: Number(e.target.value), weekday: activeWeekday })
            }
            aria-label="Simulated time"
          />
        </>
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
        <strong>Campus Digital Twin.</strong> Building positions are traced from satellite &amp; CAD plans;{' '}
        {isBackendEnabled
          ? 'timetable is synced from the official AUT EduPage schedule.'
          : 'offline mode uses demo schedule.'}
      </p>
      <label className="checkbox">
        <input type="checkbox" checked={showReference} onChange={(e) => setShowReference(e.target.checked)} />
        Show satellite reference
      </label>
    </section>
  );
}
