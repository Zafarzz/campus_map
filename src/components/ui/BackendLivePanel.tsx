import { useBackendLive } from '../../hooks/useBackendLive';
import { useMap } from '../../state/MapProvider';

const LEVEL_COLOR: Record<string, string> = {
  empty: '#22c55e',
  quiet: '#22c55e',
  moderate: '#f59e0b',
  busy: '#f97316',
  full: '#ef4444',
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
    <section className="section" aria-label="Backend status">
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
        <span style={{ width: 9, height: 9, borderRadius: '50%', background: dot, display: 'inline-block' }} />
        <strong>{label}</strong>
        {live.status === 'online' && (
          <span style={{ opacity: 0.7 }}>
            v{live.version} · {live.latencyMs} ms
          </span>
        )}
      </div>
      {live.status === 'online' && (
        <>
          {top.length > 0 ? (
            <ul style={{ listStyle: 'none', margin: '8px 0 0', padding: 0, fontSize: 12 }}>
              {top.map((p) => (
                <li key={p.place_id} style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0' }}>
                  <span>{p.name}</span>
                  <span style={{ color: LEVEL_COLOR[p.level] ?? '#94a3b8', fontWeight: 600 }}>
                    {p.level.replace('_', ' ')} · {Math.round(p.percentage_of_capacity ?? 0)}%
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <div style={{ fontSize: 12, opacity: 0.7, marginTop: 6 }}>No crowd data for this time.</div>
          )}
          {live.updatedAt && (
            <div style={{ fontSize: 11, opacity: 0.55, marginTop: 6 }}>Updated {fmtClock(live.updatedAt)}</div>
          )}
        </>
      )}
    </section>
  );
}
