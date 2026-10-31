import { afterEach, describe, expect, it, vi } from 'vitest';
import { demoCampus } from '../data/demo-campus';
import { createCampusIndex } from '../domain/campus/campusIndex';
import type { Campus } from '../domain/campus/types';
import type { Lesson } from '../domain/schedule/types';
import type { WeekdayIndex } from '../hooks/useNow';
import { loadTimetableCatalog, type TimetableCatalog } from '../services/schedule/scheduleService';
import { diagnoseEmptySearch, parseSearchQuery, search } from '../services/search/searchService';

const okJson = (body: unknown) =>
  Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(body) } as Response);

afterEach(() => vi.unstubAllGlobals());

const fixtureCampus: Campus = {
  id: 'test-campus',
  name: 'Test University Campus',
  buildings: [
    {
      id: 'bld-a',
      name: 'Building A',
      shortName: 'A',
      provenance: 'confirmed',
      floors: [
        {
          id: 'bld-a-f1',
          level: 1,
          name: 'Floor 1',
          rooms: [
            { id: 'rm-a101', number: 'A-101', name: 'Lecture Room', kind: 'classroom', provenance: 'confirmed' },
            { id: 'rm-a104', number: 'A-104', kind: 'classroom', provenance: 'confirmed' },
          ],
        },
      ],
    },
    {
      id: 'bld-c',
      name: 'Building C',
      shortName: 'C',
      provenance: 'confirmed',
      floors: [
        {
          id: 'bld-c-f1',
          level: 1,
          name: 'Floor 1',
          rooms: [
            { id: 'rm-cconf', number: 'C-conF', name: 'Conference Hall', kind: 'hall', provenance: 'confirmed' },
          ],
        },
      ],
    },
    {
      id: 'bld-d',
      name: 'Building D',
      shortName: 'D',
      provenance: 'confirmed',
      floors: [
        {
          id: 'bld-d-f1',
          level: 1,
          name: 'Floor 1',
          rooms: [
            { id: 'rm-d101', number: 'D-101', kind: 'classroom', provenance: 'confirmed' },
            { id: 'rm-d202', number: 'D-202', kind: 'lab', provenance: 'confirmed' },
          ],
        },
      ],
    },
  ],
};

const fixtureIndex = createCampusIndex(fixtureCampus);

const mondayLessons: Lesson[] = [
  {
    id: 'mon-1',
    roomId: 'rm-a104',
    subject: 'English 5',
    teacher: 'Synthetic Karimov',
    group: 'I25D',
    startsAt: '2026-10-26T08:30:00',
    endsAt: '2026-10-26T09:45:00',
  },
  {
    id: 'mon-2',
    roomId: 'rm-a101',
    subject: 'English 5',
    teacher: 'Kim S.H.',
    group: 'A25D',
    startsAt: '2026-10-26T10:00:00',
    endsAt: '2026-10-26T11:15:00',
  },
  {
    id: 'mon-3',
    roomId: 'rm-d101',
    subject: 'C++ Programming',
    teacher: 'Nurmurodov Synthetic',
    group: 'I25A, I25B',
    startsAt: '2026-10-26T13:30:00',
    endsAt: '2026-10-26T14:45:00',
  },
];

const tuesdayLessons: Lesson[] = [
  {
    id: 'tue-1',
    roomId: 'rm-d101',
    subject: 'Principles of Economics',
    teacher: 'Lee Synthetic',
    group: 'B25A',
    startsAt: '2026-10-27T11:30:00',
    endsAt: '2026-10-27T12:45:00',
  },
];

const wednesdayLessons: Lesson[] = [
  {
    id: 'wed-1',
    roomId: 'rm-d202',
    subject: 'Capstone 1: System Analysis and Design',
    teacher: 'Synthetic Karimov',
    group: 'I25C, I25D',
    startsAt: '2026-10-28T15:00:00',
    endsAt: '2026-10-28T16:15:00',
  },
];

const weekLessons = new Map<WeekdayIndex, Lesson[]>([
  [0, mondayLessons],
  [1, tuesdayLessons],
  [2, wednesdayLessons],
  [3, []],
  [4, []],
]);

const catalog: TimetableCatalog = {
  subjects: [
    'English 5',
    'C++ Programming',
    'Principles of Economics',
    'Economics', // unplaced catalog entry to verify active weekly schedule wins
    'Capstone 1: System Analysis and Design',
    'Advanced Architecture Seminar',
  ],
  professors: [
    'Synthetic Karimov',
    'Kim S.H.',
    'Nurmurodov Synthetic',
    'Lee Synthetic',
    'Unscheduled Professor Alpha', // in EduPage teachers table, 0 exam cards this week
  ],
  groups: ['I25A', 'I25B', 'I25C', 'I25D', 'A25D', 'B25A', 'I25Z'],
};

describe('University search engine accuracy (rooms, groups, subjects, professors)', () => {
  it('normalises role prefixes and spaced/hyphenated codes in parseSearchQuery', () => {
    expect(parseSearchQuery('Room D-101').tokens).toEqual(['d101']);
    expect(parseSearchQuery('d 101').tokens).toEqual(['d101']);
    expect(parseSearchQuery('Group I-25D').tokens).toEqual(['i25d']);
    expect(parseSearchQuery('i 25 d').tokens).toEqual(['i25d']);
    expect(parseSearchQuery('Prof. Synthetic Karimov').tokens).toEqual(['synthetic', 'karimov']);
    expect(parseSearchQuery('Professor: Karimov').tokens).toEqual(['karimov']);
  });

  it('finds student groups accurately across exact, hyphenated, spaced, prefix, and merged groups without false positives', () => {
    for (const q of ['I25D', 'i25d', 'I-25D', 'i 25d', 'Group I25D']) {
      const res = search(q, fixtureIndex, mondayLessons);
      expect(res.map((r) => r.key)).toEqual(['lesson-mon-1']);
      expect(res[0]!.subtitle).toContain('Group: I25D');
      expect(res[0]!.subtitle).toContain('Professor: Synthetic Karimov');
      expect(res[0]!.subtitle).not.toContain('Teacher');
    }

    // Merged comma-separated group string "I25C, I25D" on Wednesday
    const wedRes = search('I25D', fixtureIndex, wednesdayLessons);
    expect(wedRes.map((r) => r.key)).toEqual(['lesson-wed-1']);

    // Cohort prefix "I25" matches I25D and I25A/I25B, but NEVER A25D
    const cohortRes = search('I25', fixtureIndex, mondayLessons);
    expect(cohortRes.map((r) => r.key)).toEqual(['lesson-mon-1', 'lesson-mon-3']);
  });

  it('matches rooms across D101, D-101, d 101, Room D-101 without falsely matching A-101 in Building A', () => {
    for (const q of ['D-101', 'D101', 'd 101', 'Room D-101']) {
      const res = search(q, fixtureIndex, mondayLessons);
      const roomHits = res.filter((r) => r.kind === 'room');
      expect(roomHits.map((r) => r.roomId)).toEqual(['rm-d101']);
      // Also includes Monday lessons held inside D-101, and never lessons in A-101
      const lessonHits = res.filter((r) => r.kind === 'lesson');
      expect(lessonHits.map((r) => r.key)).toEqual(['lesson-mon-3']);
    }

    // Pure room number suffix "101" matches both A-101 and D-101
    const byNumber = search('101', fixtureIndex, []);
    expect(byNumber.map((r) => r.roomId).sort()).toEqual(['rm-a101', 'rm-d101']);

    // Special named room C-conF
    expect(search('C-conf', fixtureIndex, []).map((r) => r.roomId)).toEqual(['rm-cconf']);
    expect(search('Conference Hall', fixtureIndex, []).map((r) => r.roomId)).toEqual(['rm-cconf']);
  });

  it('matches subjects by keyword, non-adjacent words, C++, and exact course numbers without matching room digits', () => {
    // Non-adjacent multi-word subject search
    const capstone = search('Capstone System', fixtureIndex, wednesdayLessons);
    expect(capstone.map((r) => r.key)).toEqual(['lesson-wed-1']);

    // Partial subject title
    const econ = search('Economics', fixtureIndex, tuesdayLessons);
    expect(econ.map((r) => r.key)).toEqual(['lesson-tue-1']);

    // C++ symbol preservation
    const cpp = search('C++', fixtureIndex, mondayLessons);
    expect(cpp.map((r) => r.key)).toEqual(['lesson-mon-3']);

    // Searching "English 1" must NOT falsely match "English 5" in Room A-101!
    const english1 = search('English 1', fixtureIndex, mondayLessons);
    expect(english1).toEqual([]);
  });

  it('matches professors in any name order, with initials, and with Prof./Professor prefixes', () => {
    // Reversed Firstname Lastname vs stored string
    expect(search('Karimov Synthetic', fixtureIndex, mondayLessons).map((r) => r.key)).toEqual(['lesson-mon-1']);
    expect(search('Prof. Karimov', fixtureIndex, mondayLessons).map((r) => r.key)).toEqual(['lesson-mon-1']);
    expect(search('Professor Nurmurodov', fixtureIndex, mondayLessons).map((r) => r.key)).toEqual(['lesson-mon-3']);

    // Dot-separated initials "Kim S.H."
    expect(search('Kim S', fixtureIndex, mondayLessons).map((r) => r.key)).toEqual(['lesson-mon-2']);
    expect(search('Kim H', fixtureIndex, mondayLessons).map((r) => r.key)).toEqual(['lesson-mon-2']);
  });

  it('works cleanly against the full production demoCampus index', () => {
    const campusIdx = createCampusIndex(demoCampus);
    const d101 = search('D101', campusIdx, []);
    expect(d101.length).toBeGreaterThan(0);
    expect(d101[0]!.title).toContain('D-101');
  });
});

describe('Day-aware empty search diagnostics', () => {
  it('explains when a subject has no session on Monday and points to Tuesday', () => {
    const diag = diagnoseEmptySearch('Economics', {
      currentDayName: 'Monday',
      excludeWeekday: 0,
      weekLessons,
      catalog,
    });
    expect(diag.kind).toBe('subject');
    expect(diag.matchedLabel).toBe('Principles of Economics');
    expect(diag.availableDays).toEqual([1]);
    expect(diag.title).toBe('No classes scheduled on Monday');
    expect(diag.message).toContain('Principles of Economics');
    expect(diag.message).toContain('Monday');
    expect(diag.message).toContain('Tuesday');
  });

  it('explains when a student group (I25D) has no classes on Tuesday and points to Monday and Wednesday', () => {
    const diag = diagnoseEmptySearch('I25D', {
      currentDayName: 'Tuesday',
      excludeWeekday: 1,
      weekLessons,
      catalog,
    });
    expect(diag.kind).toBe('group');
    expect(diag.matchedLabel).toBe('I25D');
    expect(diag.availableDays).toEqual([0, 2]);
    expect(diag.title).toBe('No classes scheduled on Tuesday');
    expect(diag.message).toBe(
      'Group I25D has no classes scheduled on Tuesday. Sessions take place on Monday and Wednesday — please select another day.',
    );
  });

  it('recognises a catalog professor with 0 exam cards this week and shows a day-specific professor message', () => {
    const diag = diagnoseEmptySearch('Alpha', {
      currentDayName: 'Monday',
      excludeWeekday: 0,
      weekLessons,
      catalog,
    });
    expect(diag.kind).toBe('professor');
    expect(diag.matchedLabel).toBe('Unscheduled Professor Alpha');
    expect(diag.availableDays).toEqual([]);
    expect(diag.title).toBe('No classes scheduled on Monday');
    expect(diag.message).toBe(
      'Professor Unscheduled Professor Alpha has no classes scheduled on Monday in the current timetable. Please check other days.',
    );
  });

  it('explains when a professor teaches on other weekdays and lists those days', () => {
    const diag = diagnoseEmptySearch('Lee Synthetic', {
      currentDayName: 'Monday',
      excludeWeekday: 0,
      weekLessons,
      catalog,
    });
    expect(diag.kind).toBe('professor');
    expect(diag.availableDays).toEqual([1]);
    expect(diag.message).toBe(
      'Professor Lee Synthetic has no classes scheduled on Monday. Classes are scheduled on Tuesday — please select another day.',
    );
  });

  it('returns a polite no-match message for unknown gibberish queries', () => {
    const diag = diagnoseEmptySearch('xyz999nonexistent', {
      currentDayName: 'Monday',
      excludeWeekday: 0,
      weekLessons,
      catalog,
    });
    expect(diag.kind).toBe('none');
    expect(diag.availableDays).toEqual([]);
    expect(diag.title).toBe('No matching results');
  });

  it('loads timetable catalog from /api/v1/compat/catalog and falls back safely on network error', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        okJson({
          subjects: ['English 5'],
          professors: ['Synthetic Karimov'],
          groups: ['I25D'],
        }),
      ),
    );
    const loaded = await loadTimetableCatalog();
    expect(loaded).toEqual({
      subjects: ['English 5'],
      professors: ['Synthetic Karimov'],
      groups: ['I25D'],
    });

    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('offline'))));
    const fallback = await loadTimetableCatalog();
    expect(fallback).toEqual({ subjects: [], professors: [], groups: [] });
  });
});
