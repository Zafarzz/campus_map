import { useMemo, useState } from 'react';
import { mapConfig } from '../../config/mapConfig';
import type { WeekdayIndex } from '../../hooks/useNow';
import { formatTime } from '../../services/schedule/scheduleService';
import { diagnoseEmptySearch, search } from '../../services/search/searchService';
import { useMap } from '../../state/MapProvider';

const FULL_DAY_NAMES = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
] as const;

const TEACHING_DAY_NAMES: Record<WeekdayIndex, string> = {
  0: 'Monday',
  1: 'Tuesday',
  2: 'Wednesday',
  3: 'Thursday',
  4: 'Friday',
};

/** Search rooms, subjects, professors, and groups. Selecting a result focuses the room. */
export function SearchBox() {
  const { index, lessons, weekLessons, catalog, now, time, setTime, selectRoom } = useMap();
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState<number>(-1);
  const results = useMemo(() => search(query, index, lessons), [query, index, lessons]);

  const jsDay = now.getDay();
  const currentDayName = FULL_DAY_NAMES[jsDay] ?? 'today';
  const currentWeekday: WeekdayIndex | null =
    jsDay >= 1 && jsDay <= 5 ? ((jsDay - 1) as WeekdayIndex) : null;

  const emptyDiagnosis = useMemo(() => {
    if (!query.trim() || results.length > 0) return null;
    return diagnoseEmptySearch(query, {
      currentDayName,
      excludeWeekday: currentWeekday,
      weekLessons,
      catalog,
    });
  }, [query, results.length, currentDayName, currentWeekday, weekLessons, catalog]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!query.trim()) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (results.length > 0) {
        setActiveIndex((prev) => (prev + 1) % results.length);
      }
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (results.length > 0) {
        setActiveIndex((prev) => (prev <= 0 ? results.length - 1 : prev - 1));
      }
    } else if (e.key === 'Enter' && activeIndex >= 0 && activeIndex < results.length) {
      e.preventDefault();
      selectRoom(results[activeIndex].roomId);
      setQuery('');
      setActiveIndex(-1);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setQuery('');
      setActiveIndex(-1);
    }
  };

  return (
    <div className="search">
      <div className="search__input-wrap">
        <svg
          className="search__icon"
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <circle cx="11" cy="11" r="8" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
        <input
          type="search"
          className="search__input"
          placeholder="Search room, subject, professor, group…"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setActiveIndex(-1);
          }}
          onKeyDown={handleKeyDown}
          role="combobox"
          aria-expanded={Boolean(query.trim())}
          aria-controls="campus-search-results"
          aria-activedescendant={
            activeIndex >= 0 && results[activeIndex]
              ? `search-opt-${results[activeIndex].key}`
              : undefined
          }
          aria-label="Search room, subject, professor, or group"
        />
        {query && (
          <button
            type="button"
            className="search__clear"
            onClick={() => {
              setQuery('');
              setActiveIndex(-1);
            }}
            aria-label="Clear search"
            title="Clear search"
          >
            ✕
          </button>
        )}
      </div>

      {query.trim() && (
        <ul id="campus-search-results" className="search__results" role="listbox">
          {results.length === 0 && emptyDiagnosis && (
            <li className="search__empty" role="status">
              <div className="search__empty-title">{emptyDiagnosis.title}</div>
              <p className="search__empty-desc">{emptyDiagnosis.message}</p>
              {emptyDiagnosis.availableDays.length > 0 && (
                <div className="search__day-chips">
                  {emptyDiagnosis.availableDays.map((dayIdx) => (
                    <button
                      key={dayIdx}
                      type="button"
                      className="search__day-chip"
                      onClick={() =>
                        setTime({
                          mode: 'simulated',
                          minutes:
                            time.mode === 'simulated'
                              ? time.minutes
                              : mapConfig.schedule.defaultSimulatedMinutes,
                          weekday: dayIdx,
                        })
                      }
                    >
                      View {TEACHING_DAY_NAMES[dayIdx]}
                    </button>
                  ))}
                </div>
              )}
            </li>
          )}
          {results.map((r, idx) => (
            <li
              key={r.key}
              id={`search-opt-${r.key}`}
              role="option"
              aria-selected={idx === activeIndex}
            >
              <button
                type="button"
                className={`search__result${idx === activeIndex ? ' is-active' : ''}`}
                onClick={() => {
                  selectRoom(r.roomId);
                  setQuery('');
                  setActiveIndex(-1);
                }}
              >
                <span className="search__title">
                  <span>{r.title}</span>
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
