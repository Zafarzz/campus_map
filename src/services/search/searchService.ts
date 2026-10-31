import type { CampusIndex } from '../../domain/campus/campusIndex';
import type { Lesson } from '../../domain/schedule/types';
import type { WeekdayIndex } from '../../hooks/useNow';
import type { TimetableCatalog } from '../schedule/scheduleService';

export type SearchResult = {
  key: string;
  roomId: string;
  kind: 'room' | 'lesson';
  title: string;
  subtitle: string;
  lesson?: Lesson;
};

export type EmptySearchEntityKind = 'professor' | 'subject' | 'group' | 'none';

export type EmptySearchDiagnosis = {
  kind: EmptySearchEntityKind;
  matchedLabel?: string;
  title: string;
  message: string;
  availableDays: WeekdayIndex[];
};

const WEEKDAY_FULL_NAMES: Record<WeekdayIndex, string> = {
  0: 'Monday',
  1: 'Tuesday',
  2: 'Wednesday',
  3: 'Thursday',
  4: 'Friday',
};

const ROLE_PREFIX_RE =
  /^(?:room|rm|group|grp|cohort|professor|prof\.?|teacher|instructor|lecturer|dr\.?|subject|course)\s*:?\s+/i;

export type ParsedQuery = {
  cleaned: string;
  tokens: string[];
  compact: string;
};

function foldText(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '');
}

function compactCode(s: string): string {
  return foldText(s).replace(/[^a-z0-9+#]+/g, '');
}

/**
 * Tokenize target text into normalized words while preserving both compact forms
 * of hyphenated/underscored codes (e.g. `D-101` -> `d101` + `101`, `C-conF` -> `cconf`)
 * and individual words of compound titles (`Object-Oriented` -> `object`, `oriented`).
 */
function extractTargetWords(s: string, includeCodeNumberSuffix = false): string[] {
  const folded = foldText(s);
  const rawChunks = folded.replace(/[,;:()[\]/\\]+/g, ' ').split(/\s+/).filter(Boolean);
  const words: string[] = [];

  for (const chunk of rawChunks) {
    const cleanedChunk = chunk.replace(/^[^a-z0-9+#]+|[^a-z0-9+#]+$/g, '');
    if (!cleanedChunk) continue;

    if (/[-_.]/.test(cleanedChunk)) {
      const parts = cleanedChunk.split(/[-_.]+/).filter(Boolean);
      const joined = parts.join('');
      const hasDigit = /\d/.test(cleanedChunk);
      const startsWithSingleChar = parts.length >= 2 && parts[0]!.length === 1;

      if (joined.length >= 2) {
        words.push(joined);
      }

      if (cleanedChunk.includes('.') && !hasDigit && !/[-_]/.test(cleanedChunk)) {
        for (const p of parts) words.push(p);
      } else if (!hasDigit && !startsWithSingleChar) {
        for (const p of parts) words.push(p);
      } else if (startsWithSingleChar && !hasDigit) {
        for (const p of parts.slice(1)) {
          if (p.length >= 2) words.push(p);
        }
      }

      if (includeCodeNumberSuffix && hasDigit) {
        const trailingDigits = joined.match(/(\d+)$/);
        if (trailingDigits && trailingDigits[1]!.length >= 2) {
          words.push(trailingDigits[1]!);
        }
      }
    } else {
      words.push(cleanedChunk);
      if (includeCodeNumberSuffix && /^[a-z]+\d+$/.test(cleanedChunk)) {
        const trailingDigits = cleanedChunk.match(/(\d+)$/);
        if (trailingDigits && trailingDigits[1]!.length >= 2) {
          words.push(trailingDigits[1]!);
        }
      }
    }
  }

  return words;
}

/**
 * Parse a user search query:
 * - Strips optional leading entity prefixes (`Room `, `Prof. `, `Group `, `Subject `, etc.)
 * - Keeps hyphenated codes (`D-101`, `I-25D`, `C-conF`) intact as single tokens (`d101`, `i25d`, `cconf`)
 * - Collapses spaced building/group codes (`D 101` -> `d101`, `I 25D` -> `i25d`, `I 25 D` -> `i25d`)
 * - Splits multi-word compound phrases (`Object-Oriented` -> `object`, `oriented`)
 */
export function parseSearchQuery(raw: string): ParsedQuery {
  const trimmed = raw.trim();
  const stripped = ROLE_PREFIX_RE.test(trimmed) ? trimmed.replace(ROLE_PREFIX_RE, '').trim() : trimmed;
  const effective = stripped || trimmed;

  // Collapse spaced room/group codes like "D 101", "I 25D", or "I 25 D" before splitting.
  const collapsedSpacedCodes = foldText(effective)
    .replace(/\b([a-z])\s+(\d+)\s+([a-z])\b/g, '$1$2$3')
    .replace(/\b([a-z])\s+(\d[a-z0-9]+)\b/g, '$1$2');

  const rawChunks = collapsedSpacedCodes.replace(/[,;:()[\]/\\]+/g, ' ').split(/\s+/).filter(Boolean);
  const tokens: string[] = [];

  for (const chunk of rawChunks) {
    const cleaned = chunk.replace(/^[^a-z0-9+#]+|[^a-z0-9+#]+$/g, '');
    if (!cleaned) continue;

    if (/[-_.]/.test(cleaned)) {
      const parts = cleaned.split(/[-_.]+/).filter(Boolean);
      const hasDigit = /\d/.test(cleaned);
      const startsWithSingleChar = parts.length >= 2 && parts[0]!.length === 1;
      if (hasDigit || startsWithSingleChar) {
        const joined = parts.join('');
        if (joined) tokens.push(joined);
      } else {
        for (const p of parts) {
          if (p) tokens.push(p);
        }
      }
    } else {
      tokens.push(cleaned);
    }
  }

  return {
    cleaned: effective,
    tokens,
    compact: compactCode(effective),
  };
}

function tokenMatchesWords(tok: string, words: readonly string[], allowCodeSuffix: boolean): boolean {
  // Pure numbers (e.g. "1" in "Calculus 1" or "101" for room 101) require an exact number token match.
  if (/^\d+$/.test(tok)) {
    return words.some((w) => w === tok);
  }
  // Single-letter tokens (e.g. "A" in "Building A" or initial "J") require an exact single-letter token.
  if (tok.length === 1) {
    return words.some((w) => w === tok);
  }
  // Short tokens (2-3 chars, e.g. "kim", "lee", "i25", "c++") match word prefixes.
  if (tok.length <= 3) {
    return words.some((w) => w.startsWith(tok));
  }
  // 4+ char pure-alphabetic tokens (e.g. "economics" -> "microeconomics", "akmal") match word prefix or substring.
  if (/^[a-z]+$/.test(tok)) {
    return words.some((w) => w.startsWith(tok) || w.includes(tok));
  }
  // 4+ char alphanumeric codes (e.g. "i25d", "d101", "sc101") match prefix (or suffix for single-token code queries).
  return words.some((w) => w.startsWith(tok) || (allowCodeSuffix && w.endsWith(tok)));
}

/**
 * Match a parsed query against target words and optional discrete codes
 * (such as room numbers `D-101` or student group codes `I25D`).
 */
export function matchesQuery(
  pq: ParsedQuery,
  text: string,
  codes: readonly string[] = [],
  includeCodeNumberSuffix = false,
): boolean {
  if (pq.tokens.length === 0) return false;
  const words = [
    ...extractTargetWords(text, includeCodeNumberSuffix),
    ...codes.flatMap((c) => extractTargetWords(c, includeCodeNumberSuffix)),
  ];
  if (words.length === 0) return false;

  const allowCodeSuffix = pq.tokens.length === 1 && pq.tokens[0]!.length >= 3;
  if (pq.tokens.every((tok) => tokenMatchesWords(tok, words, allowCodeSuffix))) {
    return true;
  }

  if (pq.tokens.length === 1 && pq.compact.length >= 3) {
    for (const code of codes) {
      const cc = compactCode(code);
      if (cc && (cc === pq.compact || cc.startsWith(pq.compact) || cc.endsWith(pq.compact))) {
        return true;
      }
    }
  }
  return false;
}

function scoreEntityMatch(pq: ParsedQuery, candidate: string, isCode: boolean): number {
  const candFolded = foldText(candidate).trim();
  const candCompact = compactCode(candidate);
  if (!candFolded || pq.tokens.length === 0) return 0;

  if (isCode && pq.compact.length >= 2) {
    if (candCompact === pq.compact) return 100;
    if ( pq.tokens.length === 1 && candCompact.startsWith(pq.compact)) return 85;
    if (pq.tokens.length === 1 && pq.compact.length >= 3 && candCompact.endsWith(pq.compact)) return 72;
    return 0;
  }

  const words = extractTargetWords(candidate, false);
  const queryJoined = pq.tokens.join(' ');
  if (candFolded === queryJoined || words.join(' ') === queryJoined) return 95;

  // Check if all query tokens match words in candidate (allowing initials like "Kim D" -> "Kim Dakhong")
  const allExactWords = pq.tokens.every((t) => words.includes(t));
  if (allExactWords) return 90;

  const allPrefixWords = pq.tokens.every((t) => {
    if (/^\d+$/.test(t)) return words.includes(t);
    if (t.length === 1) return pq.tokens.length >= 2 ? words.some((w) => w.startsWith(t)) : words.includes(t);
    return words.some((w) => w.startsWith(t));
  });
  if (allPrefixWords) return 80;

  if (matchesQuery(pq, candidate, isCode ? [candidate] : [], false)) return 68;

  return 0;
}

function splitListField(raw?: string): string[] {
  if (!raw) return [];
  return raw
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function formatProfessorDisplay(name: string): string {
  const trimmed = name.trim();
  if (/^(?:prof\.?|professor|dr\.?)\b/i.test(trimmed)) return trimmed;
  return `Professor ${trimmed}`;
}

function formatDayNames(days: readonly WeekdayIndex[]): string {
  const names = days.map((d) => WEEKDAY_FULL_NAMES[d]);
  if (names.length === 0) return '';
  if (names.length === 1) return names[0]!;
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names.slice(0, -1).join(', ')}, and ${names[names.length - 1]}`;
}

/** Search rooms (number/name/building) and lessons (subject/professor/group). */
export function search(query: string, index: CampusIndex, lessons: Lesson[], limit = 25): SearchResult[] {
  const pq = parseSearchQuery(query);
  if (pq.tokens.length === 0) return [];

  const roomMatches: { item: SearchResult; rank: number }[] = [];
  for (const { building, floor, room } of index.rooms.values()) {
    const roomText = `${room.number} ${room.name ?? ''} ${building.name} ${building.shortName}`;
    if (!matchesQuery(pq, roomText, [room.number], true)) continue;
    const roomCompact = compactCode(room.number);
    const rank =
      roomCompact === pq.compact
        ? 3
        : roomCompact.startsWith(pq.compact) && pq.compact.length >= 2
          ? 2
          : 1;
    roomMatches.push({
      rank,
      item: {
        key: `room-${room.id}`,
        roomId: room.id,
        kind: 'room',
        title: `Room ${room.number}${room.name ? ` · ${room.name}` : ''}`,
        subtitle: `${building.name} · ${floor.name}`,
      },
    });
  }
  roomMatches.sort((a, b) => b.rank - a.rank || a.item.title.localeCompare(b.item.title));

  const lessonMatches: { item: SearchResult; rank: number }[] = [];
  for (const lesson of lessons) {
    const loc = index.rooms.get(lesson.roomId);
    if (!loc) continue;
    const groupCodes = splitListField(lesson.group);
    const profNames = splitListField(lesson.teacher);

    // Match either a specific entity field (including initials on professor names) or combined lesson fields.
    const exactProfScore = Math.max(0, ...profNames.map((p) => scoreEntityMatch(pq, p, false)));
    const exactGroupScore = Math.max(0, ...groupCodes.map((g) => scoreEntityMatch(pq, g, true)));
    const exactSubjScore = scoreEntityMatch(pq, lesson.subject, false);

    const combinedText = `${lesson.subject} ${lesson.teacher ?? ''} ${lesson.group ?? ''}`;
    const codes = [loc.room.number, ...groupCodes];
    const matchedSingleEntity = exactProfScore > 0 || exactGroupScore > 0 || exactSubjScore > 0;

    if (!matchedSingleEntity && !matchesQuery(pq, combinedText, codes, true)) continue;

    const bestEntityScore = Math.max(exactGroupScore, exactProfScore, exactSubjScore);
    const rank = bestEntityScore >= 88 ? 3 : bestEntityScore >= 75 ? 2 : 1;

    lessonMatches.push({
      rank,
      item: {
        key: `lesson-${lesson.id}`,
        roomId: lesson.roomId,
        kind: 'lesson',
        title: lesson.subject,
        subtitle: [
          `Room ${loc.room.number}`,
          lesson.teacher ? `Professor: ${lesson.teacher}` : '',
          lesson.group ? `Group: ${lesson.group}` : '',
        ]
          .filter(Boolean)
          .join(' · '),
        lesson,
      },
    });
  }
  lessonMatches.sort(
    (a, b) =>
      b.rank - a.rank ||
      (a.item.lesson!.startsAt < b.item.lesson!.startsAt
        ? -1
        : a.item.lesson!.startsAt > b.item.lesson!.startsAt
          ? 1
          : 0),
  );

  return [...roomMatches.map((r) => r.item), ...lessonMatches.map((l) => l.item)].slice(0, limit);
}

/**
 * Build a helpful, day-aware explanation when `search()` finds 0 results on the
 * currently observed day, checking other weekdays and the university catalog.
 */
export function diagnoseEmptySearch(
  query: string,
  options: {
    currentDayName: string;
    excludeWeekday?: WeekdayIndex | null;
    weekLessons?: ReadonlyMap<WeekdayIndex, Lesson[]>;
    catalog?: TimetableCatalog;
  },
): EmptySearchDiagnosis {
  const pq = parseSearchQuery(query);
  const { currentDayName, excludeWeekday = null, weekLessons, catalog } = options;

  type CandidateHit = {
    kind: Exclude<EmptySearchEntityKind, 'none'>;
    label: string;
    score: number;
    days: Set<WeekdayIndex>;
  };

  const hits = new Map<string, CandidateHit>();

  const register = (
    kind: Exclude<EmptySearchEntityKind, 'none'>,
    rawLabel: string,
    isCode: boolean,
    day?: WeekdayIndex,
  ) => {
    const label = rawLabel.trim();
    if (!label) return;
    const score = scoreEntityMatch(pq, label, isCode);
    if (score <= 0) return;
    const key = `${kind}:${foldText(label)}`;
    const existing = hits.get(key);
    if (existing) {
      if (score > existing.score) existing.score = score;
      if (day !== undefined && day !== excludeWeekday) existing.days.add(day);
    } else {
      const days = new Set<WeekdayIndex>();
      if (day !== undefined && day !== excludeWeekday) days.add(day);
      hits.set(key, { kind, label, score, days });
    }
  };

  if (weekLessons) {
    for (const [dayIdx, dayLessons] of weekLessons.entries()) {
      for (const lesson of dayLessons) {
        register('subject', lesson.subject, false, dayIdx);
        for (const prof of splitListField(lesson.teacher)) {
          register('professor', prof, false, dayIdx);
        }
        for (const grp of splitListField(lesson.group)) {
          register('group', grp, true, dayIdx);
        }
      }
    }
  }

  if (catalog) {
    for (const subj of catalog.subjects) register('subject', subj, false);
    for (const prof of catalog.professors) register('professor', prof, false);
    for (const grp of catalog.groups) register('group', grp, true);
  }

  if (hits.size === 0) {
    return {
      kind: 'none',
      title: 'No matching results',
      message: `No rooms, subjects, professors, or student groups matched “${query.trim()}”. Please check the spelling or try another keyword.`,
      availableDays: [],
    };
  }

  // Prefer entities that actually have scheduled classes on other weekdays over unplaced catalog entries.
  const best = [...hits.values()].sort((a, b) => {
    const aActive = a.days.size > 0 ? 1 : 0;
    const bActive = b.days.size > 0 ? 1 : 0;
    if (bActive !== aActive) return bActive - aActive;
    return b.score - a.score || b.days.size - a.days.size || a.label.localeCompare(b.label);
  })[0]!;

  const availableDays = ([0, 1, 2, 3, 4] as WeekdayIndex[]).filter((d) => best.days.has(d));
  const title = `No classes scheduled on ${currentDayName}`;

  if (best.kind === 'professor') {
    const profLabel = formatProfessorDisplay(best.label);
    const message =
      availableDays.length > 0
        ? `${profLabel} has no classes scheduled on ${currentDayName}. Classes are scheduled on ${formatDayNames(availableDays)} — please select another day.`
        : `${profLabel} has no classes scheduled on ${currentDayName} in the current timetable. Please check other days.`;
    return { kind: 'professor', matchedLabel: best.label, title, message, availableDays };
  }

  if (best.kind === 'group') {
    const message =
      availableDays.length > 0
        ? `Group ${best.label} has no classes scheduled on ${currentDayName}. Sessions take place on ${formatDayNames(availableDays)} — please select another day.`
        : `Group ${best.label} has no classes scheduled on ${currentDayName} in the current timetable. Please check other days.`;
    return { kind: 'group', matchedLabel: best.label, title, message, availableDays };
  }

  const message =
    availableDays.length > 0
      ? `“${best.label}” is not scheduled on ${currentDayName}. Sessions take place on ${formatDayNames(availableDays)} — please select another day.`
      : `“${best.label}” has no sessions scheduled on ${currentDayName} in the current timetable. Please check other days.`;
  return { kind: 'subject', matchedLabel: best.label, title, message, availableDays };
}
