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

export type CampusDataContextValue = {
  campus: Campus;
  index: CampusIndex;
  geometry: CampusGeometry;
  showReference: boolean;
  setShowReference: (v: boolean) => void;
};

export type SelectionContextValue = {
  selection: Selection;
  selectBuilding: (buildingId: string) => void;
  selectFloor: (floorId: string) => void;
  selectRoom: (roomId: string) => void;
  clearSelection: () => void;
};

export type TimeOccupancyContextValue = {
  lessons: Lesson[];
  weekLessons: ReadonlyMap<WeekdayIndex, Lesson[]>;
  catalog: TimetableCatalog;
  roomStates: Map<string, RoomScheduleState>;
  now: Date;
  time: TimeMode;
  setTime: (time: TimeMode) => void;
  scheduleLoading?: boolean;
};

type MapContextValue = CampusDataContextValue & SelectionContextValue & TimeOccupancyContextValue;

const MapContext = createContext<MapContextValue | null>(null);
const CampusDataContext = createContext<CampusDataContextValue | null>(null);
const SelectionContext = createContext<SelectionContextValue | null>(null);
const TimeOccupancyContext = createContext<TimeOccupancyContextValue | null>(null);

export function useMap(): MapContextValue {
  const ctx = useContext(MapContext);
  if (!ctx) throw new Error('useMap must be used inside <MapProvider>');
  return ctx;
}

export function useCampusData(): CampusDataContextValue {
  const ctx = useContext(CampusDataContext);
  if (!ctx) throw new Error('useCampusData must be used inside <MapProvider>');
  return ctx;
}

export function useMapSelection(): SelectionContextValue {
  const ctx = useContext(SelectionContext);
  if (!ctx) throw new Error('useMapSelection must be used inside <MapProvider>');
  return ctx;
}

export function useMapTime(): TimeOccupancyContextValue {
  const ctx = useContext(TimeOccupancyContext);
  if (!ctx) throw new Error('useMapTime must be used inside <MapProvider>');
  return ctx;
}

function areLessonsEqual(a: Lesson[], b: Lesson[]): boolean {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    const la = a[i];
    const lb = b[i];
    if (
      la.id !== lb.id ||
      la.roomId !== lb.roomId ||
      la.startsAt !== lb.startsAt ||
      la.endsAt !== lb.endsAt ||
      la.subject !== lb.subject ||
      la.teacher !== lb.teacher ||
      la.group !== lb.group ||
      la.cancelled !== lb.cancelled
    ) {
      return false;
    }
  }
  return true;
}

function areCatalogsEqual(a: TimetableCatalog, b: TimetableCatalog): boolean {
  if (a === b) return true;
  return (
    a.subjects.length === b.subjects.length &&
    a.professors.length === b.professors.length &&
    a.groups.length === b.groups.length
  );
}

function areCampusesEqual(a: Campus, b: Campus): boolean {
  if (a === b) return true;
  if (a.id !== b.id || a.name !== b.name || a.buildings.length !== b.buildings.length) return false;
  for (let i = 0; i < a.buildings.length; i++) {
    const ba = a.buildings[i];
    const bb = b.buildings[i];
    if (ba.id !== bb.id || ba.name !== bb.name || ba.floors.length !== bb.floors.length) {
      return false;
    }
    for (let j = 0; j < ba.floors.length; j++) {
      if (ba.floors[j].rooms.length !== bb.floors[j].rooms.length) return false;
    }
  }
  return true;
}

type LoadedCampus = { campus: Campus; index: CampusIndex; geometry: CampusGeometry };

export function MapProvider({ children, fallback }: { children: ReactNode; fallback?: ReactNode }) {
  const [loaded, setLoaded] = useState<LoadedCampus | null>(null);
  const [loadingStage, setLoadingStage] = useState<string>('Initializing campus...');
  const [loadError, setLoadError] = useState<string | null>(null);
  const [scheduleLoading, setScheduleLoading] = useState<boolean>(true);
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [weekLessons, setWeekLessons] = useState<ReadonlyMap<WeekdayIndex, Lesson[]>>(() => new Map());
  const [catalog, setCatalog] = useState<TimetableCatalog>(EMPTY_TIMETABLE_CATALOG);
  const [selection, setSelection] = useState<Selection>({});
  const [time, setTime] = useState<TimeMode>(initialTimeMode);
  const [showReference, setShowReference] = useState(false);
  const now = useNow(time);
  const dateKey = toLocalDateKey(now);
  const weekMondayKey = toLocalDateKey(resolveSimulatedDate(now, 0, 0));

  const syncCampus = useCallback(() => {
    setLoadError(null);
    setLoadingStage('Loading campus structure & building footprints...');
    loadCampus()
      .then((campus) => {
        setLoadingStage('Preparing 3D building geometry & floors...');
        setLoaded((prev) =>
          prev && areCampusesEqual(prev.campus, campus)
            ? prev
            : { campus, index: createCampusIndex(campus), geometry: geometryProvider.build(campus) },
        );
      })
      .catch((err) => {
        setLoadError(err instanceof Error ? err.message : 'Failed to initialize campus data.');
      });
  }, []);

  useEffect(() => {
    syncCampus();
    window.addEventListener('campus:backend-updated', syncCampus);
    return () => {
      window.removeEventListener('campus:backend-updated', syncCampus);
    };
  }, [syncCampus]);

  useEffect(() => {
    if (!loaded) return;
    let alive = true;
    setScheduleLoading(true);
    const refresh = () =>
      loadLessonsForDate(loaded.campus, dateKey)
        .then((l) => {
          if (!alive) return;
          setLessons((prev) => (areLessonsEqual(prev, l) ? prev : l));
          setScheduleLoading(false);
        })
        .catch(() => {
          if (alive) setScheduleLoading(false);
        });
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
        setCatalog((prev) => (areCatalogsEqual(prev, cat) ? prev : cat));
      });
    };
    refreshWeekAndCatalog();
    window.addEventListener('campus:backend-updated', refreshWeekAndCatalog);
    return () => {
      alive = false;
      window.removeEventListener('campus:backend-updated', refreshWeekAndCatalog);
    };
  }, [loaded, weekMondayKey]);

  const nowMs = now.getTime();
  const roomStates = useMemo(
    () =>
      loaded
        ? computeRoomStates(loaded.index.rooms.keys(), lessons, now, {
            upcomingWindowMinutes: mapConfig.schedule.upcomingWindowMinutes,
          })
        : new Map<string, RoomScheduleState>(),
    // `now` changes identity every render in simulated mode; depend on its timestamp value.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [loaded, lessons, nowMs],
  );

  const selectBuilding = useCallback(
    (buildingId: string) => {
      if (buildingId === 'amph-hall' || buildingId === 'conn-bld-h-bld-i') {
        setSelection({ buildingId, floorId: undefined });
        return;
      }
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

  const campusDataValue = useMemo<CampusDataContextValue | null>(
    () =>
      loaded
        ? {
            campus: loaded.campus,
            index: loaded.index,
            geometry: loaded.geometry,
            showReference,
            setShowReference,
          }
        : null,
    [loaded, showReference],
  );

  const selectionValue = useMemo<SelectionContextValue>(
    () => ({
      selection,
      selectBuilding,
      selectFloor,
      selectRoom,
      clearSelection,
    }),
    [selection, selectBuilding, selectFloor, selectRoom, clearSelection],
  );

  const timeValue = useMemo<TimeOccupancyContextValue>(
    () => ({
      lessons,
      weekLessons,
      catalog,
      roomStates,
      now,
      time,
      setTime,
      scheduleLoading,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [lessons, weekLessons, catalog, roomStates, nowMs, time, scheduleLoading],
  );

  const combinedValue = useMemo<MapContextValue | null>(
    () =>
      campusDataValue
        ? {
            ...campusDataValue,
            ...selectionValue,
            ...timeValue,
          }
        : null,
    [campusDataValue, selectionValue, timeValue],
  );

  if (loadError) {
    return (
      <div className="campus-init-loader" role="alert">
        <div className="campus-init-loader__card">
          <div className="campus-init-loader__error-title">Unable to Load Campus Data</div>
          <p className="campus-init-loader__error-desc">{loadError}</p>
          <button type="button" className="btn-primary" onClick={syncCampus}>
            Retry Loading
          </button>
        </div>
      </div>
    );
  }

  if (!loaded || !campusDataValue || !combinedValue) {
    return <>{fallback ?? <div className="loading">{loadingStage}</div>}</>;
  }

  return (
    <CampusDataContext.Provider value={campusDataValue}>
      <SelectionContext.Provider value={selectionValue}>
        <TimeOccupancyContext.Provider value={timeValue}>
          <MapContext.Provider value={combinedValue}>{children}</MapContext.Provider>
        </TimeOccupancyContext.Provider>
      </SelectionContext.Provider>
    </CampusDataContext.Provider>
  );
}
