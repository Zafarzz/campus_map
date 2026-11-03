import { useMap } from '../../state/MapProvider';

/** Campus-level list of buildings (alternative to clicking in 3D). */
export function BuildingList() {
  const { campus, roomStates, selectBuilding } = useMap();

  return (
    <section className="section">
      <div className="section__header">
        <h2 className="section__title">Buildings</h2>
        <span className="section__count">{campus.buildings.length} buildings</span>
      </div>
      <ul className="list">
        {campus.buildings.map((b) => {
          const totalRooms = b.floors.reduce((n, f) => n + f.rooms.length, 0);
          const live = b.floors.reduce(
            (n, f) => n + f.rooms.filter((r) => roomStates.get(r.id)?.status === 'CURRENT').length,
            0,
          );
          return (
            <li key={b.id}>
              <button type="button" className="list__item" onClick={() => selectBuilding(b.id)}>
                <span className="badge-letter">{b.shortName}</span>
                <span className="list__main">
                  <span className="list__title">{b.name}</span>
                  <small className="list__meta">
                    {b.floors.length} floor{b.floors.length === 1 ? '' : 's'}
                    {totalRooms > 0 ? ` · ${totalRooms} rooms` : ''}
                    {b.description ? ` · ${b.description}` : ''}
                  </small>
                </span>
                {live > 0 && <span className="pill pill--live">{live} live</span>}
                <span className="list__chevron" aria-hidden="true">›</span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
