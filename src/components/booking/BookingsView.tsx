import React, { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useAuth } from '../../state/AuthContext';
import { useMap } from '../../state/MapProvider';
import {
  TEACHING_WEEKDAYS,
  defaultSimulatedWeekday,
  type WeekdayIndex,
} from '../../hooks/useNow';
import type { Lesson } from '../../domain/schedule/types';
import {
  cancelBooking,
  checkInBooking,
  createBooking,
  listBookableResources,
  listMyBookings,
  listOccupiedSlots,
} from '../../services/booking/bookingService';
import type {
  BookableResource,
  Booking,
  CreateBookingPayload,
} from '../../services/booking/bookingTypes';
import {
  CalendarIcon,
  CheckIcon,
  ClockIcon,
  InfoIcon,
  AlertIcon,
  PlusIcon,
  CloseIcon,
  CampusIcon,
  ChevronDownIcon,
} from '../auth/AuthIcons';
import { AuthRequiredCard } from '../ui/AuthRequiredCard';

interface BookingsViewProps {
  onBackToMap?: () => void;
}

/** Campus working hours: 08:30 (8:30 AM) to 20:45 (8:45 PM) */
export const WORK_START_MINS = 8 * 60 + 30; // 510 (08:30)
export const WORK_END_MINS = 20 * 60 + 45; // 1245 (20:45)

/**
 * Official AUT teaching & booking periods within working hours (08:30 - 20:45).
 * 12:45-13:30 is lunch break; 15-min gaps between classes are transition breaks.
 */
const AUT_WORKING_PERIODS: readonly {
  start: number;
  end: number;
  startStr: string;
  endStr: string;
}[] = [
  { start: 8 * 60 + 30, end: 9 * 60 + 45, startStr: '08:30', endStr: '09:45' },
  { start: 10 * 60 + 0, end: 11 * 60 + 15, startStr: '10:00', endStr: '11:15' },
  { start: 11 * 60 + 30, end: 12 * 60 + 45, startStr: '11:30', endStr: '12:45' },
  { start: 13 * 60 + 30, end: 14 * 60 + 45, startStr: '13:30', endStr: '14:45' },
  { start: 15 * 60 + 0, end: 16 * 60 + 15, startStr: '15:00', endStr: '16:15' },
  { start: 16 * 60 + 30, end: 17 * 60 + 45, startStr: '16:30', endStr: '17:45' },
  { start: 18 * 60 + 0, end: 19 * 60 + 15, startStr: '18:00', endStr: '19:15' },
  { start: 19 * 60 + 30, end: 20 * 60 + 45, startStr: '19:30', endStr: '20:45' },
];

const KIND_OPTIONS = [
  { id: 'all', label: 'All Spaces' },
  { id: 'room', label: 'Classrooms & Labs' },
  { id: 'hall', label: 'Lecture Halls' },
];

export interface BookableBuildingOption {
  id: string;
  code: string;
  name: string;
  subtitle: string;
  accent: string;
  bgTint: string;
}

export const BOOKABLE_BUILDINGS: readonly BookableBuildingOption[] = [
  {
    id: 'all',
    code: 'ALL',
    name: 'All Buildings',
    subtitle: 'All academic blocks & facilities',
    accent: '#1b1c20',
    bgTint: 'rgba(20, 24, 35, 0.06)',
  },
  {
    id: 'bld-h',
    code: 'A',
    name: 'Block A',
    subtitle: 'Engineering & Technology',
    accent: '#2563eb',
    bgTint: 'rgba(37, 99, 235, 0.1)',
  },
  {
    id: 'bld-g',
    code: 'B',
    name: 'Block B',
    subtitle: 'Architecture & Science',
    accent: '#7c3aed',
    bgTint: 'rgba(124, 58, 237, 0.1)',
  },
  {
    id: 'bld-i',
    code: 'C',
    name: 'Block C',
    subtitle: 'Conference Hall & Studios',
    accent: '#d97706',
    bgTint: 'rgba(217, 119, 6, 0.1)',
  },
  {
    id: 'bld-c',
    code: 'D',
    name: 'Block D',
    subtitle: 'Civil Engineering Labs',
    accent: '#0284c7',
    bgTint: 'rgba(2, 132, 199, 0.1)',
  },
  {
    id: 'bld-b',
    code: 'E',
    name: 'Block E',
    subtitle: 'Architecture & Design Studios',
    accent: '#0d9488',
    bgTint: 'rgba(13, 148, 136, 0.1)',
  },
  {
    id: 'bld-d',
    code: 'F',
    name: 'Block F',
    subtitle: 'Library & Lecture Halls',
    accent: '#4f46e5',
    bgTint: 'rgba(79, 70, 229, 0.1)',
  },
  {
    id: 'bld-e',
    code: 'SC',
    name: 'Sports Complex',
    subtitle: 'Gymnasium & Athletic Court',
    accent: '#059669',
    bgTint: 'rgba(5, 150, 105, 0.1)',
  },
];

const BUILDING_NAMES: Record<string, string> = {
  'bld-h': 'Block A (Engineering & Tech)',
  'bld-g': 'Block B (Architecture & Science)',
  'bld-i': 'Block C (Amphitheater & Cafeteria)',
  'bld-c': 'Block D (Civil Engineering Labs)',
  'bld-b': 'Block E (Architecture & Design)',
  'bld-d': 'Block F (Library & Lecture Halls)',
  'bld-e': 'Sports Complex & Gymnasium',
};

/**
 * Accurately categorizes spaces into 'hall' (Lecture Halls, Amphitheatres, Auditoriums)
 * versus 'room' (Classrooms & Labs).
 * Resolves Tiered Lecture Halls in Block F second floor (F-201, F-202) and Conference Hall.
 */
export function resolveResourceKind(
  res: BookableResource,
  roomLoc?: { room: { number?: string; name?: string; kind?: string } },
): 'hall' | 'room' {
  if (res.kind === 'hall' || roomLoc?.room.kind === 'hall') return 'hall';

  const resName = (res.name || '').toLowerCase();
  const roomName = (roomLoc?.room.name || '').toLowerCase();
  const roomNumber = (roomLoc?.room.number || '').toLowerCase();

  if (
    resName.includes('lecture hall') ||
    resName.includes('amphitheatre') ||
    resName.includes('amphitheater') ||
    resName.includes('conference hall') ||
    resName.includes('reading hall') ||
    resName.includes('auditorium') ||
    roomName.includes('lecture hall') ||
    roomName.includes('amphitheatre') ||
    roomName.includes('amphitheater') ||
    roomName.includes('conference hall') ||
    roomName.includes('reading hall') ||
    roomName.includes('auditorium')
  ) {
    return 'hall';
  }

  // Known lecture halls in university CAD inventory
  const knownHalls = new Set([
    'bld-d-f2-f201', // F-201 Tiered Lecture Hall (Amphitheatre West)
    'bld-d-f2-f202', // F-202 Tiered Lecture Hall (Amphitheatre East)
    'room-c-conf',   // Block C Conference Hall (C-201)
    'bld-b-f1-e101', // Block E Main Lecture Hall / Design Studio (166 seats)
  ]);
  if (res.room_id && knownHalls.has(res.room_id)) {
    return 'hall';
  }

  return 'room';
}

/**
 * Returns true if a resource corresponds to a public amenity (toilet, restroom, wc)
 * or dormitory facilities. In AUT university, toilets are open to all and never bookable,
 * and dorm services are managed separately.
 */
export function isToiletOrDormResource(
  res: BookableResource,
  roomLoc?: { room: { number?: string; name?: string; kind?: string } },
): boolean {
  if (res.room_id === 'room-c-conf' || res.room_id === 'bld-i-f2-r1') return false;
  if (res.kind === 'laundry' || res.kind === 'dorm') return true;
  if (res.building_id === 'bld-j') return true;
  if (res.room_id?.startsWith('bld-j')) return true;

  const codeLower = (res.code || '').toLowerCase();
  const nameLower = (res.name || '').toLowerCase();
  const roomIdLower = (res.room_id || '').toLowerCase();
  const roomNumberLower = (roomLoc?.room.number || '').toLowerCase();
  const roomNameLower = (roomLoc?.room.name || '').toLowerCase();

  const isExcludedPublicOrRestroomText = (s: string) =>
    s.includes('toilet') ||
    s.includes('restroom') ||
    s.includes('wc') ||
    s.includes('washroom') ||
    s.includes('lavatory') ||
    s.includes('canteen') ||
    s.includes('cafeteria') ||
    s.includes('dining') ||
    s.includes('library') ||
    s.includes('reading');

  if (
    isExcludedPublicOrRestroomText(codeLower) ||
    isExcludedPublicOrRestroomText(nameLower) ||
    isExcludedPublicOrRestroomText(roomIdLower) ||
    isExcludedPublicOrRestroomText(roomNumberLower) ||
    isExcludedPublicOrRestroomText(roomNameLower)
  ) {
    return true;
  }

  // Known public amenities / restrooms / libraries / open lounges
  const knownExcludedRoomIds = new Set([
    'room-canteen',
    'bld-d-f1-f101',
    'bld-h-f1-a105',
    'bld-h-f1-a107',
    'bld-g-f1-lobby',
    'bld-g-f2-lobby',
    'bld-g-f1-wc-m',
    'bld-g-f1-wc-f',
    'bld-g-f2-wc-m',
    'bld-g-f2-wc-f',
    'bld-g-f3-r2',
    'bld-g-f3-r5',
    'bld-g-f4-r2',
    'bld-g-f4-r5',
  ]);
  if (res.room_id && knownExcludedRoomIds.has(res.room_id)) {
    return true;
  }

  return false;
}

export function getBookingWeekday(isoStr: string): WeekdayIndex | -1 {
  try {
    const match = isoStr.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (match) {
      const y = Number(match[1]);
      const m = Number(match[2]);
      const d = Number(match[3]);
      const date = new Date(Date.UTC(y, m - 1, d));
      const day = date.getUTCDay(); // 0 = Sun, 1 = Mon ... 5 = Fri, 6 = Sat
      const isoDay = (day + 6) % 7; // 0 = Mon, 1 = Tue, 2 = Wed, 3 = Thu, 4 = Fri, 5 = Sat, 6 = Sun
      if (isoDay >= 0 && isoDay <= 4) {
        return isoDay as WeekdayIndex;
      }
    }
  } catch {
    // ignore
  }
  return -1;
}

export interface FreeTimeWindow {
  startMins: number;
  endMins: number;
  startStr: string;
  endStr: string;
  durationMins: number;
}

const pad2 = (n: number) => String(n).padStart(2, '0');

export function minsToTimeStr(mins: number): string {
  const clamped = Math.max(0, Math.min(24 * 60, Math.round(mins)));
  return `${pad2(Math.floor(clamped / 60))}:${pad2(clamped % 60)}`;
}

export function timeStrToMins(timeStr: string): number {
  const [h, m] = timeStr.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

export function formatDurationLabel(mins: number): string {
  if (mins <= 0) return '0m';
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h > 0 && m > 0) return `${h}h ${m}m`;
  if (h > 0) return `${h}h`;
  return `${m}m`;
}

function isoToMinutesOfDay(isoStr: string): number {
  const match = isoStr.match(/T(\d{2}):(\d{2})/);
  if (match && (!isoStr.endsWith('Z') || isoStr.includes('+05:00'))) {
    return Number(match[1]) * 60 + Number(match[2]);
  }
  const d = new Date(isoStr);
  return d.getHours() * 60 + d.getMinutes();
}

function formatIsoTime(isoStr: string): string {
  try {
    return minsToTimeStr(isoToMinutesOfDay(isoStr));
  } catch {
    return isoStr;
  }
}

function formatIsoDate(isoStr: string): string {
  try {
    const d = new Date(isoStr);
    return d.toLocaleDateString([], { month: 'short', day: 'numeric', weekday: 'short' });
  } catch {
    return isoStr;
  }
}

/**
 * Pure arithmetic for Asia/Tashkent (+05:00) without client browser timezone skew.
 */
function computeTashkentPeriod(
  dateStr: string,
  timeStr: string,
  durationMinutes: number,
): { startsAt: string; endsAt: string } {
  const [y, m, d] = dateStr.split('-').map(Number);
  const [h, min] = timeStr.split(':').map(Number);
  const startsAt = `${dateStr}T${timeStr}:00+05:00`;
  const totalMins = h * 60 + min + durationMinutes;
  const extraDays = Math.floor(totalMins / 1440);
  const remMins = totalMins % 1440;
  const endH = pad2(Math.floor(remMins / 60));
  const endMin = pad2(remMins % 60);
  let endDateStr = dateStr;
  if (extraDays > 0) {
    const next = new Date(Date.UTC(y, m - 1, d + extraDays));
    endDateStr = `${next.getUTCFullYear()}-${pad2(next.getUTCMonth() + 1)}-${pad2(next.getUTCDate())}`;
  }
  const endsAt = `${endDateStr}T${endH}:${endMin}:00+05:00`;
  return { startsAt, endsAt };
}

/**
 * Resolves the upcoming YYYY-MM-DD date for a given weekday (0 = Mon .. 4 = Fri)
 * so bookings are never rejected by the backend as being in the past.
 */
function resolveUpcomingWeekdayDateStr(weekday: WeekdayIndex, endMins: number): string {
  const realNow = new Date();
  const currentIsoWeekday = (realNow.getDay() + 6) % 7; // 0 = Mon .. 6 = Sun
  const realNowMins = realNow.getHours() * 60 + realNow.getMinutes();

  let daysAhead = (weekday - currentIsoWeekday + 7) % 7;
  if (daysAhead === 0 && endMins <= realNowMins + 5) {
    daysAhead = 7;
  }

  const target = new Date(realNow);
  target.setDate(realNow.getDate() + daysAhead);
  return `${target.getFullYear()}-${pad2(target.getMonth() + 1)}-${pad2(target.getDate())}`;
}

/**
 * Computes exact free windows for a room on a given weekday within campus working hours (08:30 - 20:45).
 * Consecutive free AUT periods merge into a single continuous window (e.g. 16:30 - 20:45).
 */
export function computeRoomFreeWindows(
  roomLessons: Lesson[],
  roomBookings: Booking[],
): FreeTimeWindow[] {
  const activeLessons = roomLessons.filter((l) => !l.cancelled);

  const periodFreeFlags = AUT_WORKING_PERIODS.map((p) => {
    const hasLesson = activeLessons.some((l) => {
      const lStart = isoToMinutesOfDay(l.startsAt);
      const lEnd = isoToMinutesOfDay(l.endsAt);
      return lStart < p.end && lEnd > p.start;
    });
    return !hasLesson;
  });

  const rawWindows: { startMins: number; endMins: number }[] = [];
  let i = 0;
  while (i < AUT_WORKING_PERIODS.length) {
    if (!periodFreeFlags[i]) {
      i++;
      continue;
    }
    const startMins = AUT_WORKING_PERIODS[i].start;
    let endMins = AUT_WORKING_PERIODS[i].end;
    let j = i + 1;
    while (j < AUT_WORKING_PERIODS.length && periodFreeFlags[j]) {
      endMins = AUT_WORKING_PERIODS[j].end;
      j++;
    }
    rawWindows.push({ startMins, endMins });
    i = j;
  }

  const activeBookings = roomBookings.filter(
    (b) => b.status === 'confirmed' || b.status === 'pending',
  );
  let refined = rawWindows;
  for (const b of activeBookings) {
    const bStart = isoToMinutesOfDay(b.starts_at);
    const bEnd = isoToMinutesOfDay(b.ends_at);
    const nextRefined: { startMins: number; endMins: number }[] = [];
    for (const w of refined) {
      if (bEnd <= w.startMins || bStart >= w.endMins) {
        nextRefined.push(w);
      } else {
        if (bStart - w.startMins >= 15) {
          nextRefined.push({ startMins: w.startMins, endMins: bStart });
        }
        if (w.endMins - bEnd >= 15) {
          nextRefined.push({ startMins: bEnd, endMins: w.endMins });
        }
      }
    }
    refined = nextRefined;
  }

  return refined
    .filter((w) => w.endMins - w.startMins >= 15)
    .map((w) => ({
      startMins: w.startMins,
      endMins: w.endMins,
      startStr: minsToTimeStr(w.startMins),
      endStr: minsToTimeStr(w.endMins),
      durationMins: w.endMins - w.startMins,
    }));
}

/**
 * Compact human-readable summary of free windows for the card footer (Red Area 2):
 * e.g. "13:30–14:45 · after 16:30" or "08:30–20:45"
 */
function formatDayWindowsSummary(windows: FreeTimeWindow[]): string {
  if (windows.length === 0) return 'Busy all day';
  if (
    windows.length === 1 &&
    windows[0].startMins <= WORK_START_MINS &&
    windows[0].endMins >= WORK_END_MINS
  ) {
    return '08:30–20:45 (All day)';
  }
  return windows
    .map((w, idx) => {
      if (idx === windows.length - 1 && w.endMins >= WORK_END_MINS && w.startMins > WORK_START_MINS) {
        return `after ${w.startStr}`;
      }
      return `${w.startStr}–${w.endStr}`;
    })
    .join(', ');
}

export function BookingsView({ onBackToMap }: BookingsViewProps) {
  const { isAuthenticated, token, user } = useAuth();
  const {
    index,
    lessons,
    weekLessons,
    time,
    setTime,
    now,
    selection,
    selectRoom,
    selectBuilding,
  } = useMap();

  const [activeTab, setActiveTab] = useState<'available' | 'my_bookings'>('available');
  const [resources, setResources] = useState<BookableResource[]>([]);
  const [myBookings, setMyBookings] = useState<Booking[]>([]);
  const [occupiedSlots, setOccupiedSlots] = useState<Booking[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  // Filter state
  const [selectedKind, setSelectedKind] = useState<string>('all');
  const [selectedBuilding, setSelectedBuilding] = useState<string>('all');

  // Active weekday (0 = Mon .. 4 = Fri) and active inspection time within working hours (08:30 - 20:45)
  const activeWeekday: WeekdayIndex =
    time.mode === 'simulated'
      ? (time.weekday ?? defaultSimulatedWeekday(now))
      : defaultSimulatedWeekday(now);

  const rawClockMins = now.getHours() * 60 + now.getMinutes();
  const inspectMins = useMemo(() => {
    if (time.mode === 'simulated') {
      return Math.max(WORK_START_MINS, Math.min(WORK_END_MINS - 15, time.minutes));
    }
    if (rawClockMins < WORK_START_MINS || rawClockMins > WORK_END_MINS - 15) {
      return WORK_START_MINS;
    }
    return rawClockMins;
  }, [time, rawClockMins]);

  const activeWeekdayLabel =
    TEACHING_WEEKDAYS.find((d) => d.index === activeWeekday)?.label ?? 'Mon';

  // Booking modal state
  const [selectedResource, setSelectedResource] = useState<BookableResource | null>(null);
  const [modalWeekday, setModalWeekday] = useState<WeekdayIndex>(activeWeekday);
  const [bookTime, setBookTime] = useState<string>('13:30');
  const [bookDuration, setBookDuration] = useState<number>(75);
  const [bookPurpose, setBookPurpose] = useState<string>('');
  const [attendeeCount, setAttendeeCount] = useState<number>(2);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  const refreshData = useCallback(async () => {
    if (!isAuthenticated) return;
    setIsLoading(true);
    try {
      const [resList, userBookings, slots] = await Promise.all([
        listBookableResources(token),
        listMyBookings(token),
        listOccupiedSlots(token),
      ]);
      setResources(resList);
      setMyBookings(userBookings);
      setOccupiedSlots(slots);
    } catch (err: unknown) {
      console.warn('Failed to load bookings data:', err);
    } finally {
      setIsLoading(false);
    }
  }, [isAuthenticated, token]);

  useEffect(() => {
    refreshData();
  }, [refreshData]);

  const allActiveBookings = useMemo(() => {
    const map = new Map<string, Booking>();
    for (const b of occupiedSlots) {
      map.set(b.id, b);
    }
    for (const b of myBookings) {
      map.set(b.id, b);
    }
    return Array.from(map.values());
  }, [occupiedSlots, myBookings]);

  const getLessonsForWeekday = useCallback(
    (wd: WeekdayIndex): Lesson[] => {
      const fromWeek = weekLessons.get(wd);
      if (fromWeek && fromWeek.length > 0) return fromWeek;
      if (wd === activeWeekday && lessons.length > 0) return lessons;
      return [];
    },
    [weekLessons, activeWeekday, lessons],
  );

  // Base list of all currently available resources (unfiltered by selectedBuilding)
  // Strictly excludes restrooms, toilets, and dorm services.
  const allAvailableResources = useMemo(() => {
    const dayLessons = getLessonsForWeekday(activeWeekday);
    const lessonsByRoom = new Map<string, Lesson[]>();
    for (const l of dayLessons) {
      const list = lessonsByRoom.get(l.roomId);
      if (list) list.push(l);
      else lessonsByRoom.set(l.roomId, [l]);
    }

    const results: Array<{
      resource: BookableResource;
      effectiveKind: 'hall' | 'room';
      displayTitle: string;
      buildingSubtitle: string;
      roomNumber: string;
      freeWindows: FreeTimeWindow[];
      activeWindow: FreeTimeWindow;
      remainingMinsNow: number;
      daySummary: string;
    }> = [];

    for (const res of resources) {
      const roomLoc = res.room_id ? index.rooms.get(res.room_id) : undefined;
      // Requirement 1: strictly delete toilets, restrooms, and dorm facilities
      if (isToiletOrDormResource(res, roomLoc)) continue;

      // Requirement 4: accurately classify Lecture Halls vs Classrooms & Labs
      const effectiveKind = resolveResourceKind(res, roomLoc);
      if (selectedKind !== 'all' && effectiveKind !== selectedKind) continue;

      const roomNumber = roomLoc?.room.number || '';
      const rawName = roomLoc?.room.name || res.name;
      const bldShort = roomLoc?.building.shortName
        ? `Block ${roomLoc.building.shortName}`
        : res.building_id
        ? BUILDING_NAMES[res.building_id]?.split(' (')[0] || 'Campus'
        : 'Campus';

      let displayTitle = res.name;
      if (res.room_id === 'room-c-conf') {
        displayTitle = 'Block C - C-201 Conference Hall';
      } else if (roomNumber) {
        if (rawName && !rawName.toLowerCase().includes(roomNumber.toLowerCase())) {
          displayTitle = `${bldShort} - ${roomNumber} ${rawName}`;
        } else {
          displayTitle = `${bldShort} - Room ${roomNumber}`;
        }
      }

      const buildingSubtitle = res.building_id
        ? BUILDING_NAMES[res.building_id] || bldShort
        : bldShort;

      const roomLessons = res.room_id ? lessonsByRoom.get(res.room_id) ?? [] : [];
      const resBookings = allActiveBookings.filter((b) => {
        if (b.status !== 'confirmed' && b.status !== 'pending') return false;
        const matchesRes =
          b.resource_id === res.id ||
          (Boolean(b.room_id) && Boolean(res.room_id) && b.room_id === res.room_id);
        if (!matchesRes) return false;
        const bWd = getBookingWeekday(b.starts_at);
        return bWd === activeWeekday;
      });
      const freeWindows = computeRoomFreeWindows(roomLessons, resBookings);

      const minRequired = Math.max(15, Math.min(30, res.min_duration_minutes || 15));
      const activeWindow = freeWindows.find(
        (w) => w.startMins <= inspectMins && inspectMins + minRequired <= w.endMins,
      );

      if (!activeWindow) {
        continue;
      }

      const remainingMinsNow = activeWindow.endMins - inspectMins;
      const daySummary = formatDayWindowsSummary(freeWindows);

      results.push({
        resource: res,
        effectiveKind,
        displayTitle,
        buildingSubtitle,
        roomNumber: roomNumber || displayTitle,
        freeWindows,
        activeWindow,
        remainingMinsNow,
        daySummary,
      });
    }

    return results;
  }, [
    resources,
    selectedKind,
    activeWeekday,
    inspectMins,
    getLessonsForWeekday,
    index.rooms,
    allActiveBookings,
  ]);

  // Dynamic counts for each building option in the modern selector
  const buildingAvailabilityCounts = useMemo(() => {
    const counts: Record<string, number> = { all: allAvailableResources.length };
    for (const bld of BOOKABLE_BUILDINGS) {
      if (bld.id !== 'all') {
        counts[bld.id] = allAvailableResources.filter(
          (item) => item.resource.building_id === bld.id,
        ).length;
      }
    }
    return counts;
  }, [allAvailableResources]);

  // Filtered and sorted resources for the card list
  const enrichedAvailableResources = useMemo(() => {
    let list = allAvailableResources;
    if (selectedBuilding !== 'all') {
      list = list.filter((item) => item.resource.building_id === selectedBuilding);
    }
    return [...list].sort((a, b) => {
      const aHasClasses = a.freeWindows.length > 1 || a.freeWindows[0]?.durationMins < 735 ? 0 : 1;
      const bHasClasses = b.freeWindows.length > 1 || b.freeWindows[0]?.durationMins < 735 ? 0 : 1;
      if (aHasClasses !== bHasClasses) return aHasClasses - bHasClasses;
      return a.roomNumber.localeCompare(b.roomNumber, undefined, { numeric: true });
    });
  }, [allAvailableResources, selectedBuilding]);

  // Modern building dropdown state
  const [isBuildingMenuOpen, setIsBuildingMenuOpen] = useState(false);
  const buildingDropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isBuildingMenuOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (
        buildingDropdownRef.current &&
        !buildingDropdownRef.current.contains(e.target as Node)
      ) {
        setIsBuildingMenuOpen(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsBuildingMenuOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isBuildingMenuOpen]);

  const activeBuildingOption = useMemo(
    () => BOOKABLE_BUILDINGS.find((b) => b.id === selectedBuilding) || BOOKABLE_BUILDINGS[0],
    [selectedBuilding],
  );

  // Navigate to room on 3D map when clicking a reservation card (Requirement 4)
  const handleLocateResourceOnMap = useCallback(
    (res: BookableResource) => {
      if (res.room_id && index.rooms.has(res.room_id)) {
        selectRoom(res.room_id);
        return;
      }
      if (res.building_id && index.buildings.has(res.building_id)) {
        selectBuilding(res.building_id);
      }
    },
    [index.rooms, index.buildings, selectRoom, selectBuilding],
  );

  const modalFreeWindows = useMemo<FreeTimeWindow[]>(() => {
    if (!selectedResource) return [];
    const dayLessons = getLessonsForWeekday(modalWeekday);
    const roomLessons = selectedResource.room_id
      ? dayLessons.filter((l) => l.roomId === selectedResource.room_id)
      : [];
    const resBookings = allActiveBookings.filter((b) => {
      if (b.status !== 'confirmed' && b.status !== 'pending') return false;
      const matchesRes =
        b.resource_id === selectedResource.id ||
        (Boolean(b.room_id) &&
          Boolean(selectedResource.room_id) &&
          b.room_id === selectedResource.room_id);
      if (!matchesRes) return false;
      const bWd = getBookingWeekday(b.starts_at);
      return bWd === modalWeekday;
    });
    return computeRoomFreeWindows(roomLessons, resBookings);
  }, [selectedResource, modalWeekday, getLessonsForWeekday, allActiveBookings]);

  const validModalStartTimes = useMemo(() => {
    if (!selectedResource) return [];
    const minDur = Math.max(15, selectedResource.min_duration_minutes || 15);
    const options: Array<{
      timeStr: string;
      mins: number;
      windowEndMins: number;
      windowEndStr: string;
    }> = [];
    for (const w of modalFreeWindows) {
      for (let m = w.startMins; m + minDur <= w.endMins; m += 15) {
        options.push({
          timeStr: minsToTimeStr(m),
          mins: m,
          windowEndMins: w.endMins,
          windowEndStr: w.endStr,
        });
      }
    }
    return options;
  }, [selectedResource, modalFreeWindows]);

  const currentModalWindowEndMins = useMemo(() => {
    const startMins = timeStrToMins(bookTime);
    const matching = modalFreeWindows.find(
      (w) => w.startMins <= startMins && startMins < w.endMins,
    );
    return matching ? matching.endMins : WORK_END_MINS;
  }, [bookTime, modalFreeWindows]);

  // Role detection: Staff, professors, admins have unrestricted duration for makeup classes
  const isStaffOrProfessor = useMemo(() => {
    return (
      user?.account_type === 'staff' ||
      user?.is_admin ||
      user?.roles?.some((r) => r === 'teacher' || r === 'staff' || r === 'admin')
    );
  }, [user]);

  const maxAllowedDurationForSlot = useMemo(() => {
    if (!selectedResource) return 75;
    const startMins = timeStrToMins(bookTime);
    const availableInWindow = Math.max(15, currentModalWindowEndMins - startMins);
    // Student rule (Requirement 2): maximum 75 minutes per room booking.
    // Professors/staff rule: allowed to book room without any limits for time (for makeup classes).
    const roleLimit = isStaffOrProfessor ? 480 : 75;
    const resourceLimit = selectedResource.max_duration_minutes || 240;
    return Math.min(
      roleLimit,
      isStaffOrProfessor ? resourceLimit : Math.min(75, resourceLimit),
      availableInWindow,
    );
  }, [selectedResource, bookTime, currentModalWindowEndMins, isStaffOrProfessor]);

  const availableDurationOptions = useMemo(() => {
    if (!selectedResource) return isStaffOrProfessor ? [30, 45, 60, 75, 90, 120] : [30, 45, 60, 75];
    const minDur = Math.max(15, selectedResource.min_duration_minutes || 15);
    const maxDur = maxAllowedDurationForSlot;
    // Students: capped at 75 minutes (30m, 45m, 60m, 75m)
    // Professors/staff: flexible multi-hour options (up to 4+ hours for makeup classes)
    const candidates = isStaffOrProfessor
      ? [30, 45, 60, 75, 90, 120, 150, 180, 240]
      : [30, 45, 60, 75];
    const valid = candidates.filter((d) => d >= minDur && d <= maxDur);
    if (!valid.includes(maxDur) && maxDur >= minDur && (isStaffOrProfessor || maxDur <= 75)) {
      valid.push(maxDur);
    }
    return valid.sort((a, b) => a - b);
  }, [selectedResource, maxAllowedDurationForSlot, isStaffOrProfessor]);

  if (!isAuthenticated) {
    return (
      <AuthRequiredCard
        title="Campus Room & Facility Booking"
        subtitle="Exclusive to Ajou University students, faculty and staff"
        description="Reserve study rooms, lecture halls, computer labs, or university spaces with real-time timetable conflict protection."
        onBackToMap={onBackToMap}
      />
    );
  }

  const handleOpenBookingModal = (
    res: BookableResource,
    activeWin: FreeTimeWindow,
    e?: React.MouseEvent,
  ) => {
    if (e) e.stopPropagation();
    handleLocateResourceOnMap(res);
    setSelectedResource(res);
    setModalWeekday(activeWeekday);
    setActionError(null);
    setActionSuccess(null);

    const startM =
      inspectMins >= activeWin.startMins && inspectMins + 15 <= activeWin.endMins
        ? Math.ceil(inspectMins / 15) * 15
        : activeWin.startMins;
    setBookTime(minsToTimeStr(startM));

    const remainingInWin = activeWin.endMins - startM;
    const maxForUser = isStaffOrProfessor ? 240 : 75;
    const idealDur = Math.min(
      res.max_duration_minutes || 240,
      remainingInWin,
      maxForUser,
    );
    setBookDuration(Math.max(15, Math.min(75, idealDur)));

    setBookPurpose(
      isStaffOrProfessor
        ? 'Academic lecture / Makeup class'
        : 'Student study & group project session',
    );
  };

  const handleSelectModalWeekday = (wd: WeekdayIndex) => {
    setModalWeekday(wd);
    if (!selectedResource) return;
    const dayLessons = getLessonsForWeekday(wd);
    const roomLessons = selectedResource.room_id
      ? dayLessons.filter((l) => l.roomId === selectedResource.room_id)
      : [];
    const resBookings = myBookings.filter((b) => b.resource_id === selectedResource.id);
    const wins = computeRoomFreeWindows(roomLessons, resBookings);
    if (wins.length > 0) {
      const first = wins[0];
      setBookTime(first.startStr);
      const maxD = Math.min(selectedResource.max_duration_minutes || 240, first.durationMins);
      setBookDuration(isStaffOrProfessor ? Math.min(120, maxD) : Math.min(75, maxD));
    }
  };

  const handleSelectQuickWindow = (w: FreeTimeWindow) => {
    setBookTime(w.startStr);
    const maxD = Math.min(selectedResource?.max_duration_minutes || 240, w.durationMins);
    setBookDuration(isStaffOrProfessor ? maxD : Math.min(75, maxD));
  };

  const handleCreateBooking = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedResource) return;

    setIsSubmitting(true);
    setActionError(null);
    setActionSuccess(null);

    try {
      const startMins = timeStrToMins(bookTime);
      const safeDuration = Math.min(bookDuration, maxAllowedDurationForSlot);
      const endMins = startMins + safeDuration;

      if (startMins < WORK_START_MINS || endMins > WORK_END_MINS) {
        throw new Error('Reservations are only permitted during working hours (08:30 – 20:45).');
      }

      const targetDateStr = resolveUpcomingWeekdayDateStr(modalWeekday, endMins);
      const { startsAt, endsAt } = computeTashkentPeriod(targetDateStr, bookTime, safeDuration);

      const payload: CreateBookingPayload = {
        resource_id: selectedResource.id,
        room_id: selectedResource.room_id || undefined,
        starts_at: startsAt,
        ends_at: endsAt,
        purpose: bookPurpose.trim() || undefined,
        attendee_count: attendeeCount,
      };

      const result = await createBooking(token, payload);
      const wdLabel = TEACHING_WEEKDAYS.find((d) => d.index === modalWeekday)?.label ?? '';
      setActionSuccess(
        result.awaiting_approval
          ? `Reservation requested for ${wdLabel} (${bookTime}–${minsToTimeStr(endMins)})! Awaiting approval.`
          : `Reserved successfully for ${wdLabel} (${bookTime}–${minsToTimeStr(endMins)})!`,
      );
      setSelectedResource(null);
      await refreshData();
      setActiveTab('my_bookings');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setActionError(msg || 'Unable to complete reservation. Please try another slot.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCheckIn = async (bookingId: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setActionError(null);
    try {
      await checkInBooking(token, bookingId);
      setActionSuccess('Checked in successfully! Room occupancy confirmed.');
      await refreshData();
    } catch (err: unknown) {
      setActionError(err instanceof Error ? err.message : 'Check-in failed');
    }
  };

  const handleCancel = async (bookingId: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    if (!window.confirm('Are you sure you want to cancel this reservation?')) return;
    setActionError(null);
    try {
      await cancelBooking(token, bookingId, 'User requested cancellation');
      setActionSuccess('Booking cancelled and slot released.');
      await refreshData();
    } catch (err: unknown) {
      setActionError(err instanceof Error ? err.message : 'Cancellation failed');
    }
  };

  const activeMyBookingsCount = myBookings.filter((b) => b.status !== 'cancelled').length;

  return (
    <div className="bookings-view" role="region" aria-label="Campus Facility Bookings">
      {/* Top Segmented Sub-Nav */}
      <div className="bookings-view__header">
        <div className="bookings-view__tabs" role="tablist">
          <button
            type="button"
            className={`bookings-view__tab-btn${activeTab === 'available' ? ' is-active' : ''}`}
            onClick={() => setActiveTab('available')}
            role="tab"
            aria-selected={activeTab === 'available'}
          >
            <CalendarIcon size={15} />
            <span>Available ({enrichedAvailableResources.length})</span>
          </button>
          <button
            type="button"
            className={`bookings-view__tab-btn${activeTab === 'my_bookings' ? ' is-active' : ''}`}
            onClick={() => setActiveTab('my_bookings')}
            role="tab"
            aria-selected={activeTab === 'my_bookings'}
          >
            <ClockIcon size={15} />
            <span>My Bookings ({activeMyBookingsCount})</span>
          </button>
        </div>
      </div>

      {/* Feedback Banners (Original styling) */}
      {actionError && (
        <div className="bookings-view__banner bookings-view__banner--error" role="alert">
          <AlertIcon size={16} />
          <span>{actionError}</span>
          <button
            type="button"
            className="bookings-view__banner-close"
            onClick={() => setActionError(null)}
            aria-label="Dismiss error"
          >
            <CloseIcon size={14} />
          </button>
        </div>
      )}

      {actionSuccess && (
        <div className="bookings-view__banner bookings-view__banner--success" role="status">
          <CheckIcon size={16} />
          <span>{actionSuccess}</span>
          <button
            type="button"
            className="bookings-view__banner-close"
            onClick={() => setActionSuccess(null)}
            aria-label="Dismiss notice"
          >
            <CloseIcon size={14} />
          </button>
        </div>
      )}

      {/* TAB 1: AVAILABLE SPACES */}
      {activeTab === 'available' && (
        <>
          {/* Schedule & Working Hours Simulator Bar (Mon-Fri, Live/Simulate, 08:30-20:45) */}
          <div className="bookings-sim-card">
            <div className="bookings-sim-card__top">
              <div className="bookings-sim-card__clock">
                <span
                  className="bookings-sim-card__dot"
                  style={{ background: time.mode === 'live' ? '#16a34a' : '#2563eb' }}
                />
                <strong className="bookings-sim-card__now">
                  {activeWeekdayLabel} {minsToTimeStr(inspectMins)}
                </strong>
                <span className="bookings-sim-card__hours-badge">08:30–20:45</span>
              </div>

              <div className="segmented bookings-sim-card__mode" role="group" aria-label="Time mode">
                <button
                  type="button"
                  className={time.mode === 'live' ? 'active' : ''}
                  onClick={() => setTime({ mode: 'live' })}
                >
                  Live
                </button>
                <button
                  type="button"
                  className={time.mode === 'simulated' ? 'active' : ''}
                  onClick={() =>
                    setTime({
                      mode: 'simulated',
                      minutes: inspectMins,
                      weekday: activeWeekday,
                    })
                  }
                >
                  Simulate
                </button>
              </div>
            </div>

            <div
              className="segmented segmented--days bookings-sim-card__days"
              role="group"
              aria-label="Select weekday (Monday to Friday)"
            >
              {TEACHING_WEEKDAYS.map((d) => (
                <button
                  key={d.index}
                  type="button"
                  className={activeWeekday === d.index ? 'active' : ''}
                  onClick={() =>
                    setTime({
                      mode: 'simulated',
                      minutes: inspectMins,
                      weekday: d.index,
                    })
                  }
                >
                  {d.label}
                </button>
              ))}
            </div>

            <div className="bookings-sim-card__slider-row">
              <span className="bookings-sim-card__bound">08:30</span>
              <input
                type="range"
                min={WORK_START_MINS}
                max={WORK_END_MINS - 15}
                step={15}
                value={inspectMins}
                onChange={(e) =>
                  setTime({
                    mode: 'simulated',
                    minutes: Number(e.target.value),
                    weekday: activeWeekday,
                  })
                }
                aria-label="Simulate reservation time between 08:30 and 20:45"
              />
              <span className="bookings-sim-card__bound">20:45</span>
            </div>
          </div>

          {/* Original Filter Bar (.bookings-view__filter-bar) */}
          <div className="bookings-view__filter-bar">
            <div className="bookings-view__filter-chips" role="group" aria-label="Space category">
              {KIND_OPTIONS.map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  className={`bookings-view__chip${selectedKind === opt.id ? ' is-active' : ''}`}
                  onClick={() => setSelectedKind(opt.id)}
                >
                  {opt.label}
                </button>
              ))}
            </div>

            {/* Modern University Building Selector */}
            <div className="bookings-view__bld-selector-wrap" ref={buildingDropdownRef}>
              <button
                type="button"
                className={`bookings-view__bld-trigger${isBuildingMenuOpen ? ' is-open' : ''}`}
                onClick={() => setIsBuildingMenuOpen((prev) => !prev)}
                aria-haspopup="listbox"
                aria-expanded={isBuildingMenuOpen}
                aria-label="Filter available rooms by building"
              >
                <div className="bookings-view__bld-trigger-left">
                  <span
                    className="bookings-view__bld-badge"
                    style={{
                      backgroundColor: activeBuildingOption.bgTint,
                      color: activeBuildingOption.accent,
                    }}
                  >
                    {activeBuildingOption.id === 'all' ? (
                      <CampusIcon size={14} />
                    ) : (
                      activeBuildingOption.code
                    )}
                  </span>
                  <div className="bookings-view__bld-trigger-meta">
                    <span className="bookings-view__bld-trigger-name">
                      {activeBuildingOption.name}
                    </span>
                    <span className="bookings-view__bld-trigger-sub">
                      {activeBuildingOption.subtitle}
                    </span>
                  </div>
                </div>

                <div className="bookings-view__bld-trigger-right">
                  <span className="bookings-view__bld-count-pill">
                    {buildingAvailabilityCounts[selectedBuilding] ?? 0} free
                  </span>
                  <span className={`bookings-view__bld-chevron${isBuildingMenuOpen ? ' is-flipped' : ''}`}>
                    <ChevronDownIcon size={15} />
                  </span>
                </div>
              </button>

              {isBuildingMenuOpen && (
                <div
                  className="bookings-view__bld-popover"
                  role="listbox"
                  aria-label="Campus buildings"
                >
                  <div className="bookings-view__bld-popover-header">
                    <span>SELECT UNIVERSITY BUILDING</span>
                    <span className="bookings-view__bld-popover-badge">
                      {allAvailableResources.length} total free
                    </span>
                  </div>

                  <div className="bookings-view__bld-popover-list">
                    {BOOKABLE_BUILDINGS.map((bld) => {
                      const isSelected = selectedBuilding === bld.id;
                      const count = buildingAvailabilityCounts[bld.id] ?? 0;
                      return (
                        <button
                          key={bld.id}
                          type="button"
                          role="option"
                          aria-selected={isSelected}
                          className={`bookings-view__bld-item${isSelected ? ' is-selected' : ''}`}
                          onClick={() => {
                            setSelectedBuilding(bld.id);
                            setIsBuildingMenuOpen(false);
                          }}
                        >
                          <div className="bookings-view__bld-item-left">
                            <span
                              className="bookings-view__bld-item-badge"
                              style={{
                                backgroundColor: bld.bgTint,
                                color: bld.accent,
                              }}
                            >
                              {bld.id === 'all' ? <CampusIcon size={14} /> : bld.code}
                            </span>
                            <div className="bookings-view__bld-item-text">
                              <span className="bookings-view__bld-item-title">
                                {bld.name}
                              </span>
                              <span className="bookings-view__bld-item-desc">
                                {bld.subtitle}
                              </span>
                            </div>
                          </div>

                          <div className="bookings-view__bld-item-right">
                            <span
                              className={`bookings-view__bld-item-count${
                                count > 0 ? ' has-avail' : ' is-zero'
                              }`}
                            >
                              {count} free
                            </span>
                            {isSelected && (
                              <span className="bookings-view__bld-item-check">
                                <CheckIcon size={14} />
                              </span>
                            )}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>

          {isLoading ? (
            <div className="bookings-view__loading">
              <span className="scene-loader-pill__spinner" />
              <span>Loading available campus spaces…</span>
            </div>
          ) : enrichedAvailableResources.length === 0 ? (
            <div className="bookings-view__empty">
              <CalendarIcon size={28} />
              <p>
                No free rooms match your filter at {activeWeekdayLabel} {minsToTimeStr(inspectMins)}.
              </p>
            </div>
          ) : (
            <div className="bookings-view__list">
              {enrichedAvailableResources.map(
                ({
                  resource: res,
                  effectiveKind,
                  displayTitle,
                  buildingSubtitle,
                  activeWindow,
                  remainingMinsNow,
                  daySummary,
                }) => {
                  const isMapSelected = Boolean(
                    (res.room_id && selection.roomId === res.room_id) ||
                      (!res.room_id && res.building_id && selection.buildingId === res.building_id),
                  );

                  return (
                    <div
                      key={res.id}
                      className={`booking-card resource-card--clickable${
                        isMapSelected ? ' is-selected' : ''
                      }`}
                      onClick={() => handleLocateResourceOnMap(res)}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          handleLocateResourceOnMap(res);
                        }
                      }}
                      title="Click card to locate this room on the 3D campus map"
                    >
                      <div className="booking-card__header">
                        <div className="booking-card__icon-box">
                          {effectiveKind === 'hall' ? (
                            <CampusIcon size={18} />
                          ) : (
                            <CalendarIcon size={18} />
                          )}
                        </div>
                        <div>
                          <h3 className="booking-card__title">{displayTitle}</h3>
                          <span className="booking-card__building">{buildingSubtitle}</span>
                        </div>
                      </div>

                      {/* Original .booking-card__meta with Dynamic Available Hours in the 2nd tag (Red Area 1) */}
                      <div className="booking-card__meta">
                        <span className="booking-card__tag">
                          {effectiveKind === 'hall' ? 'Lecture Hall' : 'Classroom / Lab'}
                        </span>
                        {res.capacity && (
                          <span className="booking-card__tag">
                            Capacity: <strong>{res.capacity}</strong>
                          </span>
                        )}
                        <span className="booking-card__tag">
                          Free: <strong>{formatDurationLabel(remainingMinsNow)}</strong> (to{' '}
                          {activeWindow.endStr})
                        </span>
                        {res.requires_approval ? (
                          <span className="booking-card__status-tag booking-card__status-tag--pending">
                            Approval Required
                          </span>
                        ) : (
                          <span className="booking-card__status-tag booking-card__status-tag--instant">
                            Instant Booking
                          </span>
                        )}
                      </div>

                      {/* Original .booking-card__footer with Available Windows on Left (Red Area 2) & + Reserve Space on Right */}
                      <div className="booking-card__footer booking-card__footer--split">
                        <div className="booking-card__avail-slot">
                          <span className="booking-card__avail-day">{activeWeekdayLabel}:</span>{' '}
                          <span className="booking-card__avail-hours">{daySummary}</span>
                        </div>

                        <button
                          type="button"
                          className="booking-card__reserve-btn"
                          onClick={(e) => handleOpenBookingModal(res, activeWindow, e)}
                        >
                          <PlusIcon size={14} />
                          <span>Reserve Space</span>
                        </button>
                      </div>
                    </div>
                  );
                },
              )}
            </div>
          )}
        </>
      )}

      {/* TAB 2: MY BOOKINGS (Original styling) */}
      {activeTab === 'my_bookings' && (
        <>
          {isLoading ? (
            <div className="bookings-view__loading">
              <span className="scene-loader-pill__spinner" />
              <span>Loading your reservations…</span>
            </div>
          ) : myBookings.length === 0 ? (
            <div className="bookings-view__empty">
              <ClockIcon size={28} />
              <p>You have no reservations yet.</p>
              <button
                type="button"
                className="bookings-view__browse-btn"
                onClick={() => setActiveTab('available')}
              >
                Browse Available Spaces
              </button>
            </div>
          ) : (
            <div className="bookings-view__list">
              {myBookings.map((b) => {
                const res = resources.find((r) => r.id === b.resource_id);
                const roomLoc = res?.room_id ? index.rooms.get(res.room_id) : undefined;
                const resName = roomLoc?.room.number
                  ? `Block ${roomLoc.building.shortName} - ${roomLoc.room.number} ${
                      roomLoc.room.name || res?.name || ''
                    }`
                  : res?.name || 'Campus Facility';
                const isConfirmed = b.status === 'confirmed';
                const isPending = b.status === 'pending' || b.awaiting_approval;
                const isCancelled = b.status === 'cancelled';

                const pillModifier = b.checked_in_at
                  ? 'checkedin'
                  : isCancelled
                  ? 'cancelled'
                  : isPending
                  ? 'pending'
                  : 'confirmed';

                return (
                  <div
                    key={b.id}
                    className={`booking-item-card resource-card--clickable${
                      isCancelled ? ' is-cancelled' : ''
                    }`}
                    onClick={() => res && handleLocateResourceOnMap(res)}
                    role="button"
                    tabIndex={0}
                    title="Click to locate reserved room on 3D map"
                  >
                    <div className="booking-item-card__top">
                      <span
                        className={`booking-item-card__status-pill booking-item-card__status-pill--${pillModifier}`}
                      >
                        {b.checked_in_at
                          ? 'Checked In'
                          : isCancelled
                          ? 'Cancelled'
                          : isPending
                          ? 'Pending Approval'
                          : 'Confirmed'}
                      </span>
                      <span className="booking-item-card__date">{formatIsoDate(b.starts_at)}</span>
                    </div>

                    <h4 className="booking-card__title">{resName}</h4>

                    <div className="booking-item-card__time">
                      <ClockIcon size={14} />
                      <span>
                        {formatIsoTime(b.starts_at)} – {formatIsoTime(b.ends_at)}
                      </span>
                    </div>

                    {b.purpose && <p className="booking-item-card__purpose">{b.purpose}</p>}

                    {!isCancelled && (
                      <div className="booking-item-card__actions">
                        {isConfirmed && !b.checked_in_at && (
                          <button
                            type="button"
                            className="booking-item-card__checkin-btn"
                            onClick={(e) => handleCheckIn(b.id, e)}
                          >
                            <CheckIcon size={13} />
                            <span>Check In</span>
                          </button>
                        )}
                        <button
                          type="button"
                          className="booking-item-card__cancel-btn"
                          onClick={(e) => handleCancel(b.id, e)}
                        >
                          Cancel
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* BOOKING MODAL OVERLAY (Rendered via Portal with original .booking-drawer-backdrop & .booking-drawer styling) */}
      {selectedResource &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            className="booking-drawer-backdrop"
            role="dialog"
            aria-modal="true"
            aria-label="Reserve Facility"
            onClick={() => setSelectedResource(null)}
          >
            <div className="booking-drawer" onClick={(e) => e.stopPropagation()}>
              <div className="booking-drawer__header">
                <div>
                  <h3 className="booking-drawer__title">
                    {(() => {
                      const loc = selectedResource.room_id
                        ? index.rooms.get(selectedResource.room_id)
                        : undefined;
                      return loc?.room.number
                        ? `Block ${loc.building.shortName} - ${loc.room.number} ${
                            loc.room.name || selectedResource.name
                          }`
                        : selectedResource.name;
                    })()}
                  </h3>
                  <span className="booking-drawer__subtitle">
                    Working hours: 08:30 – 20:45 ·{' '}
                    {selectedResource.building_id
                      ? BUILDING_NAMES[selectedResource.building_id]
                      : 'Campus Facility'}
                  </span>
                </div>
                <button
                  type="button"
                  className="booking-drawer__close-btn"
                  onClick={() => setSelectedResource(null)}
                  aria-label="Close reservation form"
                >
                  <CloseIcon size={18} />
                </button>
              </div>

              <form className="booking-drawer__form" onSubmit={handleCreateBooking}>
                {/* Weekday Selector (Monday - Friday) */}
                <div className="booking-drawer__field">
                  <label>Reservation Day (Monday – Friday)</label>
                  <div className="booking-drawer__duration-pills">
                    {TEACHING_WEEKDAYS.map((d) => (
                      <button
                        key={d.index}
                        type="button"
                        className={`booking-drawer__dur-btn${
                          modalWeekday === d.index ? ' is-active' : ''
                        }`}
                        onClick={() => handleSelectModalWeekday(d.index)}
                      >
                        {d.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Available Windows Quick-Select */}
                <div className="booking-drawer__field">
                  <label>
                    Available Free Windows on{' '}
                    {TEACHING_WEEKDAYS.find((d) => d.index === modalWeekday)?.label}
                  </label>
                  {modalFreeWindows.length === 0 ? (
                    <div className="booking-drawer__info-box">
                      <AlertIcon size={14} />
                      <span>No free windows on this day. Please pick another weekday.</span>
                    </div>
                  ) : (
                    <div className="booking-drawer__duration-pills" style={{ flexWrap: 'wrap' }}>
                      {modalFreeWindows.map((w) => {
                        const startMins = timeStrToMins(bookTime);
                        const isSelectedWin = startMins >= w.startMins && startMins < w.endMins;
                        return (
                          <button
                            key={`${w.startStr}-${w.endStr}`}
                            type="button"
                            className={`booking-drawer__dur-btn${isSelectedWin ? ' is-active' : ''}`}
                            onClick={() => handleSelectQuickWindow(w)}
                          >
                            {w.startStr}–{w.endStr} ({formatDurationLabel(w.durationMins)})
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>

                <div className="booking-drawer__field-row">
                  <div className="booking-drawer__field">
                    <label htmlFor="book-time">Start Time (08:30–20:45)</label>
                    <select
                      id="book-time"
                      className="booking-drawer__input"
                      value={bookTime}
                      onChange={(e) => {
                        const newTime = e.target.value;
                        setBookTime(newTime);
                        const newStart = timeStrToMins(newTime);
                        const win = modalFreeWindows.find(
                          (w) => w.startMins <= newStart && newStart < w.endMins,
                        );
                        if (win) {
                          const maxD = Math.min(
                            selectedResource.max_duration_minutes || 240,
                            win.endMins - newStart,
                          );
                          if (bookDuration > maxD) {
                            setBookDuration(maxD);
                          }
                        }
                      }}
                      disabled={validModalStartTimes.length === 0}
                      required
                    >
                      {validModalStartTimes.map((opt) => (
                        <option key={opt.timeStr} value={opt.timeStr}>
                          {opt.timeStr} (free until {opt.windowEndStr})
                        </option>
                      ))}
                    </select>
                  </div>

                  {selectedResource.capacity && selectedResource.capacity > 1 && (
                    <div className="booking-drawer__field">
                      <label htmlFor="book-attendees">
                        Attendees (Max {selectedResource.capacity})
                      </label>
                      <input
                        id="book-attendees"
                        type="number"
                        className="booking-drawer__input"
                        min={1}
                        max={selectedResource.capacity}
                        value={attendeeCount}
                        onChange={(e) => setAttendeeCount(Number(e.target.value))}
                        required
                      />
                    </div>
                  )}
                </div>

                {/* Duration Pills fitted strictly to the available window and role */}
                <div className="booking-drawer__field">
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px', marginBottom: '4px' }}>
                    <label style={{ margin: 0 }}>
                      Duration (Available until {minsToTimeStr(currentModalWindowEndMins)})
                    </label>
                    <span
                      style={{
                        fontSize: '0.68rem',
                        fontWeight: 650,
                        color: isStaffOrProfessor ? '#059669' : '#1e40af',
                        background: isStaffOrProfessor ? '#ecfdf5' : '#eff6ff',
                        padding: '1px 7px',
                        borderRadius: '999px',
                        border: isStaffOrProfessor ? '1px solid #a7f3d0' : '1px solid #bfdbfe',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {isStaffOrProfessor
                        ? 'Faculty: Extended (Makeup Classes)'
                        : 'Student Quota: Max 75m (1 class)'}
                    </span>
                  </div>
                  <div className="booking-drawer__duration-pills" style={{ flexWrap: 'wrap' }}>
                    {availableDurationOptions.map((mins) => {
                      const endStr = minsToTimeStr(timeStrToMins(bookTime) + mins);
                      return (
                        <button
                          key={mins}
                          type="button"
                          className={`booking-drawer__dur-btn${
                            bookDuration === mins ? ' is-active' : ''
                          }`}
                          onClick={() => setBookDuration(mins)}
                        >
                          {formatDurationLabel(mins)} (to {endStr})
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="booking-drawer__field">
                  <label htmlFor="book-purpose">Purpose / Activity</label>
                  <input
                    id="book-purpose"
                    type="text"
                    className="booking-drawer__input"
                    placeholder="e.g. Group project study, exam prep, consultation"
                    maxLength={150}
                    value={bookPurpose}
                    onChange={(e) => setBookPurpose(e.target.value)}
                    required
                  />
                </div>

                <div className="booking-drawer__info-box">
                  <InfoIcon size={15} />
                  <span>
                    Reserving for{' '}
                    <strong>
                      {TEACHING_WEEKDAYS.find((d) => d.index === modalWeekday)?.label} · {bookTime}{' '}
                      –{' '}
                      {minsToTimeStr(
                        timeStrToMins(bookTime) +
                          Math.min(bookDuration, maxAllowedDurationForSlot),
                      )}
                    </strong>{' '}
                    ({formatDurationLabel(Math.min(bookDuration, maxAllowedDurationForSlot))}).
                  </span>
                </div>

                <div className="booking-drawer__actions">
                  <button
                    type="button"
                    className="booking-drawer__cancel-action"
                    onClick={() => setSelectedResource(null)}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="booking-drawer__submit-action"
                    disabled={isSubmitting || validModalStartTimes.length === 0}
                  >
                    <CheckIcon size={15} />
                    <span>{isSubmitting ? 'Reserving…' : 'Confirm Reservation'}</span>
                  </button>
                </div>
              </form>
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}
