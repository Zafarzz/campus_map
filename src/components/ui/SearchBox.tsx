import { useMemo, useState } from 'react';
import { search } from '../../services/search/searchService';
import { formatTime } from '../../services/schedule/scheduleService';
import { useMap } from '../../state/MapProvider';

/** Search rooms, subjects, teachers and groups. Selecting a result focuses the room. */
export function SearchBox() {
  const { index, lessons, selectRoom } = useMap();
  const [query, setQuery] = useState('');
  const results = useMemo(() => search(query, index, lessons), [query, index, lessons]);

  return (
    <div className="search">
      <input
        type="search"
        className="search__input"
        placeholder="Search room, subject, teacher, group…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        aria-label="Search"
      />
      {query.trim() && (
        <ul className="search__results" role="listbox">
          {results.length === 0 && <li className="search__empty">No matches</li>}
          {results.map((r) => (
            <li key={r.key}>
              <button
                type="button"
                className="search__result"
                onClick={() => {
                  selectRoom(r.roomId);
                  setQuery('');
                }}
              >
                <span className="search__title">
                  {r.title}
                  {r.lesson && (
                    <span className="search__time">
                      {formatTime(r.lesson.startsAt)}–{formatTime(r.lesson.endsAt)}
                    </span>
                  )}
                </span>
                <span className="search__subtitle">{r.subtitle}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
