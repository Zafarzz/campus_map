import { useBackendLive } from '../../hooks/useBackendLive';
import { useMap } from '../../state/MapProvider';

const LEVEL_COLOR: Record<string, string> = {
  empty: '#16a34a',
  quiet: '#16a34a',
  moderate: '#d97706',
  busy: '#ea580c',
  full: '#dc2626',
};

const pad = (n: number) => String(n).padStart(2, '0');
const fmtClock = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;

/**
 * Shows that the map is wired to the backend: connection status plus the live crowd/busyness feed
 * (`GET /api/v1/busyness`) for campus places, refreshed every few seconds and driven by the same
 * Live/Simulate clock as the map.
 */
export function BackendLivePanel() {
  const { now } = useMap();
  const live = useBackendLive(now);

  if (!live.enabled) return null;

  const dot = live.status === 'online' ? '#22c55e' : live.status === 'connecting' ? '#f59e0b' : '#ef4444';
  const label =
    live.status === 'online' ? 'Backend live' : live.status === 'connecting' ? 'Connecting…' : 'Backend offline (demo data)';

  const top = [...live.places]
    .filter((p) => p.percentage_of_capacity !== null)
    .sort((a, b) => (b.percentage_of_capacity ?? 0) - (a.percentage_of_capacity ?? 0))
    .slice(0, 5);

  return (
    <section className="backend-panel" aria-label="Backend status">
      <div className="backend-panel__head">
        <span className="backend-panel__dot" style={{ background: dot }} />
        <strong className="backend-panel__title">{label}</strong>
        {live.status === 'online' && (
          <span className="backend-panel__meta">
            v{live.version} · {live.latencyMs} ms
            {live.deployedCommit && live.deployedCommit !== 'dev' && live.deployedCommit !== 'unknown'
              ? ` · #${live.deployedCommit}`
              : ''}
          </span>
        )}
      </div>
      {live.updatingToCommit && (
        <div className="backend-panel__banner">
          New deploy #{live.updatingToCommit} live — refreshing…
        </div>
      )}
      {live.reloadPendingCommit && !live.updatingToCommit && (
        <button
          type="button"
          className="backend-panel__reload-btn"
          onClick={() => window.location.reload()}
        >
          Update #{live.reloadPendingCommit} ready — Reload now
        </button>
      )}
      {live.status === 'online' && (
        <>
          {top.length > 0 ? (
            <ul className="backend-panel__list">
              {top.map((p) => (
                <li key={p.place_id} className="backend-panel__item">
                  <span>{p.name}</span>
                  <span style={{ color: LEVEL_COLOR[p.level] ?? '#64748b', fontWeight: 600 }}>
                    {p.level.replace('_', ' ')} · {Math.round(p.percentage_of_capacity ?? 0)}%
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <div className="backend-panel__empty">No crowd data for this time.</div>
          )}
          {live.updatedAt && (
            <div className="backend-panel__timestamp">Updated {fmtClock(live.updatedAt)}</div>
          )}
        </>
      )}
    </section>
  );
}
