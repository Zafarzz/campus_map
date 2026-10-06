import { useEffect, useState } from 'react';
import { mapConfig } from '../config/mapConfig';

export type TimeMode = { mode: 'live' } | { mode: 'simulated'; minutes: number };

function isWithinClassHours(d: Date) {
  const m = d.getHours() * 60 + d.getMinutes();
  const [from, to] = mapConfig.schedule.simulatedRange;
  return m >= from && m <= to;
}

/** Live clock outside class hours shows an empty campus, so default to a simulated time then. */
export function initialTimeMode(): TimeMode {
  return isWithinClassHours(new Date())
    ? { mode: 'live' }
    : { mode: 'simulated', minutes: mapConfig.schedule.defaultSimulatedMinutes };
}

/** Current "observed" time: real clock, or today at a simulated time. */
export function useNow(time: TimeMode): Date {
  const [tick, setTick] = useState(() => new Date());

  useEffect(() => {
    if (time.mode !== 'live') return;
    setTick(new Date());
    const id = setInterval(() => setTick(new Date()), mapConfig.schedule.liveTickMs);
    return () => clearInterval(id);
  }, [time.mode]);

  if (time.mode === 'live') return tick;
  const d = new Date(tick);
  d.setHours(Math.floor(time.minutes / 60), time.minutes % 60, 0, 0);
  return d;
}
