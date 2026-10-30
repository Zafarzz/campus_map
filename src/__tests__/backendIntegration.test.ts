import { afterEach, describe, expect, it, vi } from 'vitest';
import { demoCampus } from '../data/demo-campus';
import { reconcileBuildVersion, toCampusIsoMinute } from '../hooks/useBackendLive';
import { fetchBuildVersion, isBackendEnabled } from '../services/api/apiClient';
import { loadCampus } from '../services/campus/campusService';
import { loadLessonsForDate } from '../services/schedule/scheduleService';

const okJson = (body: unknown) => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(body) } as Response);

afterEach(() => vi.unstubAllGlobals());

describe('backend integration seams', () => {
  it('enables backend integration by default unless explicitly disabled', () => {
    expect(isBackendEnabled).toBe(true);
  });

  it('formats /busyness timestamps with explicit +05:00 Asia/Tashkent offset', () => {
    const sample = new Date(2026, 9, 31, 10, 30, 45);
    expect(toCampusIsoMinute(sample)).toBe('2026-10-31T10:30:00+05:00');
  });

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

  it('parses /version.json when valid and returns null in dev/404 mode', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() => okJson({ commit: '25fa250', buildId: 'a1b2c3d4e5f6', builtAt: '2026-10-29T15:00:00Z' })),
    );
    const info = await fetchBuildVersion();
    expect(info).toEqual({ commit: '25fa250', buildId: 'a1b2c3d4e5f6', builtAt: '2026-10-29T15:00:00Z' });

    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({ ok: false, status: 404 } as Response)));
    expect(await fetchBuildVersion()).toBeNull();
  });

  it('distinguishes backend-only deploys from frontend bundle updates', () => {
    const v1 = { commit: '25fa250', buildId: 'bundle-aaa111' };
    expect(reconcileBuildVersion(null, v1)).toEqual({ action: 'init', current: v1 });
    expect(reconcileBuildVersion(v1, v1)).toEqual({ action: 'none', current: v1 });

    const backendOnly = { commit: '89bc012', buildId: 'bundle-aaa111' };
    expect(reconcileBuildVersion(v1, backendOnly)).toEqual({ action: 'backend-updated', current: backendOnly });

    const frontendChanged = { commit: '99de345', buildId: 'bundle-bbb222' };
    expect(reconcileBuildVersion(backendOnly, frontendChanged)).toEqual({
      action: 'frontend-updated',
      current: frontendChanged,
    });
  });
});
