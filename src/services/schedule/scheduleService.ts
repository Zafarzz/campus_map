import { mapConfig } from '../../config/mapConfig';
import { createDemoSchedule } from '../../data/demo-schedule';
import type { Campus } from '../../domain/campus/types';
import type { Lesson } from '../../domain/schedule/types';
import { apiGet, isBackendEnabled } from '../api/apiClient';

/**
 * Schedule data source. Uses the backend (`GET /api/v1/compat/lessons`) when it is
 * reachable and falls back to the generated demo schedule otherwise;
 * the rest of the app only depends on `Lesson[]` keyed by `roomId`.
 *
 * @param date local date `YYYY-MM-DD`
 */
export async function loadLessonsForDate(campus: Campus, date: string): Promise<Lesson[]> {
  if (isBackendEnabled) {
    try {
      const res = await apiGet<{ date: string; lessons: Lesson[] }>('/compat/lessons', { date });
      return Array.isArray(res.lessons) ? res.lessons : [];
    } catch (err) {
      console.warn('[scheduleService] Backend schedule request failed; refusing to show fake mock lessons:', err);
      return [];
    }
  }
  return createDemoSchedule(campus, date, mapConfig.schedule.slots);
}

export function toLocalDateKey(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function formatTime(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}
