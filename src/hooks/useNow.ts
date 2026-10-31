import { useEffect, useState } from 'react';
import { mapConfig } from '../config/mapConfig';

/** 0 = Monday .. 4 = Friday (teaching days on AUT EduPage). */
export type WeekdayIndex = 0 | 1 | 2 | 3 | 4;

export const TEACHING_WEEKDAYS: readonly { index: WeekdayIndex; label: string }[] = [
  { index: 0, label: 'Mon' },
  { index: 1, label: 'Tue' },
  { index: 2, label: 'Wed' },
  { index: 3, label: 'Thu' },
  { index: 4, label: 'Fri' },
];

export type TimeMode =
  | { mode: 'live' }
  | { mode: 'simulated'; minutes: number; weekday?: WeekdayIndex };

export function defaultSimulatedWeekday(d: Date): WeekdayIndex {
  const day = d.getDay(); // 0 = Sun, 1 = Mon .. 5 = Fri, 6 = Sat
  if (day >= 1 && day <= 5) return (day - 1) as WeekdayIndex;
  return 0; // Default weekends to Monday so real timetable classes are visible immediately
}

export function resolveSimulatedDate(anchor: Date, minutes: number, weekday?: WeekdayIndex): Date {
  const d = new Date(anchor);
  const targetWeekday = weekday ?? defaultSimulatedWeekday(anchor);
  const currentIsoWeekday = (d.getDay() + 6) % 7; // 0 = Mon .. 6 = Sun
  d.setDate(d.getDate() + (targetWeekday - currentIsoWeekday));
  d.setHours(Math.floor(minutes / 60), minutes % 60, 0, 0);
  return d;
}

function isWithinClassHours(d: Date) {
  const day = d.getDay();
  if (day === 0 || day === 6) return false;
  const m = d.getHours() * 60 + d.getMinutes();
  const [from, to] = mapConfig.schedule.simulatedRange;
  return m >= from && m <= to;
}

/** Live clock outside Mon?Fri class hours shows an empty campus, so default to simulated time then. */
export function initialTimeMode(now: Date = new Date()): TimeMode {
  return isWithinClassHours(now)
    ? { mode: 'live' }
    : {
        mode: 'simulated',
        minutes: mapConfig.schedule.defaultSimulatedMinutes,
        weekday: defaultSimulatedWeekday(now),
      };
}

/** Current "observed" time: real clock, or the selected weekday at a simulated time. */
export function useNow(time: TimeMode): Date {
  const [tick, setTick] = useState(() => new Date());

  useEffect(() => {
    if (time.mode !== 'live') return;
    setTick(new Date());
    const id = setInterval(() => setTick(new Date()), mapConfig.schedule.liveTickMs);
    return () => clearInterval(id);
  }, [time.mode]);

  if (time.mode === 'live') return tick;
  return resolveSimulatedDate(tick, time.minutes, time.weekday);
}
