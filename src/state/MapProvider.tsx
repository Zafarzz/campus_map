import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { mapConfig } from '../config/mapConfig';
import { createCampusIndex, defaultFloor, type CampusIndex } from '../domain/campus/campusIndex';
import type { Campus } from '../domain/campus/types';
import type { CampusGeometry } from '../domain/geometry/types';
import { computeRoomStates } from '../domain/schedule/roomStatus';
import type { Lesson, RoomScheduleState } from '../domain/schedule/types';
import {
  TEACHING_WEEKDAYS,
  initialTimeMode,
  resolveSimulatedDate,
  useNow,
  type TimeMode,
  type WeekdayIndex,
} from '../hooks/useNow';
import { isBackendEnabled } from '../services/api/apiClient';
import { loadCampus } from '../services/campus/campusService';
import { geometryProvider } from '../services/geometry';
import {
  EMPTY_TIMETABLE_CATALOG,
  loadLessonsForDate,
  loadTimetableCatalog,
  toLocalDateKey,
  type TimetableCatalog,
} from '../services/schedule/scheduleService';

/** How often the schedule is re-fetched from the backend (ms). */
const BACKEND_REFRESH_MS = 10_000;

export type Selection = { buildingId?: string; floorId?: string; roomId?: string };

type MapContextValue = {
  campus: Campus;
  index: CampusIndex;
  geometry: CampusGeometry;
  lessons: Lesson[];
  weekLessons: ReadonlyMap<WeekdayIndex, Lesson[]>;
  catalog: TimetableCatalog;
  roomStates: Map<string, RoomScheduleState>;
  now: Date;

  selection: Selection;
  selectBuilding: (buildingId: string) => void;
  selectFloor: (floorId: string) => void;
  selectRoom: (roomId: string) => void;
  clearSelection: () => void;

  time: TimeMode;
  setTime: (time: TimeMode) => void;

  showReference: boolean;
  setShowReference: (v: boolean) => void;
};

const MapContext = createContext<MapContextValue | null>(null);

export function useMap(): MapContextValue {
  const ctx = useContext(MapContext);
  if (!ctx) throw new Error('useMap must be used inside <MapProvider>');
  return ctx;
}

type LoadedCampus = { campus: Campus; index: CampusIndex; geometry: CampusGeometry };

export function MapProvider({ children, fallback }: { children: ReactNode; fallback?: ReactNode }) {
  const [loaded, setLoaded] = useState<LoadedCampus | null>(null);
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [weekLessons, setWeekLessons] = useState<ReadonlyMap<WeekdayIndex, Lesson[]>>(() => new Map());
  const [catalog, setCatalog] = useState<TimetableCatalog>(EMPTY_TIMETABLE_CATALOG);
  const [selection, setSelection] = useState<Selection>({});
  const [time, setTime] = useState<TimeMode>(initialTimeMode);
  const [showReference, setShowReference] = useState(false);
  const now = useNow(time);
  const dateKey = toLocalDateKey(now);
  const weekMondayKey = toLocalDateKey(resolveSimulatedDate(now, 0, 0));

  useEffect(() => {
    let alive = true;
    const syncCampus = () => {
      loadCampus().then((campus) => {
        if (!alive) return;
        setLoaded((prev) =>
          prev && JSON.stringify(prev.campus) === JSON.stringify(campus)
            ? prev
            : { campus, index: createCampusIndex(campus), geometry: geometryProvider.build(campus) },
        );
      });
    };
    syncCampus();
    window.addEventListener('campus:backend-updated', syncCampus);
    return () => {
      alive = false;
      window.removeEventListener('campus:backend-updated', syncCampus);
    };
  }, []);

  useEffect(() => {
    if (!loaded) return;
    let alive = true;
    const refresh = () =>
      loadLessonsForDate(loaded.campus, dateKey).then(
        (l) => alive && setLessons((prev) => (JSON.stringify(prev) === JSON.stringify(l) ? prev : l)),
      );
    refresh();
    // With the backend on, poll so schedule changes (imports, cancellations, bookings) show up live.
    const timer = isBackendEnabled ? window.setInterval(refresh, BACKEND_REFRESH_MS) : undefined;
    return () => {
      alive = false;
      if (timer !== undefined) window.clearInterval(timer);
    };
  }, [loaded, dateKey]);

  useEffect(() => {
    if (!loaded) return;
    let alive = true;
    const anchorMonday = new Date(`${weekMondayKey}T12:00:00`);
    const refreshWeekAndCatalog = () => {
      Promise.all(
        TEACHING_WEEKDAYS.map(async ({ index: wd }) => {
          const dayDate = resolveSimulatedDate(anchorMonday, 12 * 60, wd);
          const items = await loadLessonsForDate(loaded.campus, toLocalDateKey(dayDate));
          return [wd, items] as const;
        }),
      ).then((entries) => {
        if (!alive) return;
        setWeekLessons(new Map(entries));
      });
      loadTimetableCatalog().then((cat) => {
        if (!alive) return;
        setCatalog((prev) => (JSON.stringify(prev) === JSON.stringify(cat) ? prev : cat));
      });
    };
    refreshWeekAndCatalog();
    window.addEventListener('campus:backend-updated', refreshWeekAndCatalog);
    return () => {
      alive = false;
      window.removeEventListener('campus:backend-updated', refreshWeekAndCatalog);
    };
  }, [loaded, weekMondayKey]);

  const roomStates = useMemo(
    () =>
      loaded
        ? computeRoomStates(loaded.index.rooms.keys(), lessons, now, {
            upcomingWindowMinutes: mapConfig.schedule.upcomingWindowMinutes,
          })
        : new Map<string, RoomScheduleState>(),
    // `now` changes identity every render in simulated mode; depend on its value.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [loaded, lessons, now.getTime()],
  );

  const selectBuilding = useCallback(
    (buildingId: string) => {
      const building = loaded?.index.buildings.get(buildingId);
      if (!building) return;
      setSelection({ buildingId, floorId: defaultFloor(building)?.id });
    },
    [loaded],
  );

  const selectFloor = useCallback(
    (floorId: string) => {
      const loc = loaded?.index.floors.get(floorId);
      if (!loc) return;
      setSelection({ buildingId: loc.building.id, floorId });
    },
    [loaded],
  );

  const selectRoom = useCallback(
    (roomId: string) => {
      const loc = loaded?.index.rooms.get(roomId);
      if (!loc) return;
      setSelection({ buildingId: loc.building.id, floorId: loc.floor.id, roomId });
    },
    [loaded],
  );

  const clearSelection = useCallback(() => setSelection({}), []);

  if (!loaded) return <>{fallback}</>;

  const value: MapContextValue = {
    ...loaded,
    lessons,
    weekLessons,
    catalog,
    roomStates,
    now,
    selection,
    selectBuilding,
    selectFloor,
    selectRoom,
    clearSelection,
    time,
    setTime,
    showReference,
    setShowReference,
  };

  return <MapContext.Provider value={value}>{children}</MapContext.Provider>;
}
