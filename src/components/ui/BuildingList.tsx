import { useMap } from '../../state/MapProvider';

/** Campus-level list of buildings (alternative to clicking in 3D). */
export function BuildingList() {
  const { campus, roomStates, selectBuilding } = useMap();

  return (
    <section className="section">
      <h2 className="section__title">Buildings</h2>
      <ul className="list">
        {campus.buildings.map((b) => {
          const live = b.floors.reduce(
            (n, f) => n + f.rooms.filter((r) => roomStates.get(r.id)?.status === 'CURRENT').length,
            0,
          );
          return (
            <li key={b.id}>
              <button type="button" className="list__item" onClick={() => selectBuilding(b.id)}>
                <span className="badge-letter">{b.shortName}</span>
                <span className="list__main">
                  <span>{b.name}</span>
                  <small>
                    {b.floors.length} floor{b.floors.length === 1 ? '' : 's'}
                    {b.description ? ` · ${b.description}` : ''}
                  </small>
                </span>
                {live > 0 && <span className="pill pill--live">{live} live</span>}
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
