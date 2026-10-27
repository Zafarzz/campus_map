import { afterEach, describe, expect, it, vi } from 'vitest';
import { demoCampus } from '../data/demo-campus';
import { loadCampus } from '../services/campus/campusService';
import { loadLessonsForDate } from '../services/schedule/scheduleService';

const okJson = (body: unknown) => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(body) } as Response);

afterEach(() => vi.unstubAllGlobals());

describe('backend integration seams', () => {
  it('uses lessons from the backend when reachable', async () => {
    const lesson = {
      id: 'l1',
      roomId: 'bld-h-f1-a102',
      subject: 'From DB',
      startsAt: '2026-10-27T09:00:00',
      endsAt: '2026-10-27T10:20:00',
    };
    const fetchMock = vi.fn((_url: string) => okJson({ date: '2026-10-27', lessons: [lesson] }));
    vi.stubGlobal('fetch', fetchMock);
    const lessons = await loadLessonsForDate(demoCampus, '2026-10-27');
    expect(lessons).toEqual([lesson]);
    expect(String(fetchMock.mock.calls[0]![0])).toContain('/api/v1/compat/lessons?date=2026-10-27');
  });

  it('falls back to the demo schedule when the backend is down', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('connection refused'))));
    const lessons = await loadLessonsForDate(demoCampus, '2026-10-27');
    expect(lessons.length).toBeGreaterThan(0);
    expect(lessons[0]?.subject).not.toBe('From DB');
  });

  it('keeps demoCampus when the backend campus is incomplete', async () => {
    vi.stubGlobal('fetch', vi.fn(() => okJson({ id: 'x', name: 'x', buildings: [] })));
    const campus = await loadCampus();
    expect(campus.buildings.length).toBe(demoCampus.buildings.length);
  });

  it('accepts the backend campus when it covers every demo building and room', async () => {
    const remote = { ...demoCampus, name: 'Campus from DB' };
    vi.stubGlobal('fetch', vi.fn(() => okJson(remote)));
    const campus = await loadCampus();
    expect(campus.name).toBe('Campus from DB');
  });
});
