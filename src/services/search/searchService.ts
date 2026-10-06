import type { CampusIndex } from '../../domain/campus/campusIndex';
import type { Lesson } from '../../domain/schedule/types';

export type SearchResult = {
  key: string;
  roomId: string;
  kind: 'room' | 'lesson';
  title: string;
  subtitle: string;
  lesson?: Lesson;
};

const norm = (s: string) => s.toLowerCase().normalize('NFKD').replace(/\s+/g, ' ').trim();

/** Search rooms (number/name) and lessons (subject/teacher/group). */
export function search(query: string, index: CampusIndex, lessons: Lesson[], limit = 25): SearchResult[] {
  const q = norm(query);
  if (!q) return [];
  const results: SearchResult[] = [];

  for (const { building, floor, room } of index.rooms.values()) {
    const haystack = norm(`${room.number} ${room.name ?? ''}`);
    if (haystack.includes(q)) {
      results.push({
        key: `room-${room.id}`,
        roomId: room.id,
        kind: 'room',
        title: `Room ${room.number}${room.name ? ` · ${room.name}` : ''}`,
        subtitle: `${building.name} · ${floor.name}`,
      });
    }
  }
  // Exact room-number match first.
  results.sort((a, b) => Number(b.title === `Room ${query.trim()}`) - Number(a.title === `Room ${query.trim()}`));

  const lessonResults: SearchResult[] = [];
  for (const lesson of lessons) {
    const fields = [lesson.subject, lesson.teacher ?? '', lesson.group ?? ''];
    if (!fields.some((f) => norm(f).includes(q))) continue;
    const loc = index.rooms.get(lesson.roomId);
    if (!loc) continue;
    lessonResults.push({
      key: `lesson-${lesson.id}`,
      roomId: lesson.roomId,
      kind: 'lesson',
      title: lesson.subject,
      subtitle: [loc.room.number, lesson.teacher, lesson.group].filter(Boolean).join(' · '),
      lesson,
    });
  }
  lessonResults.sort((a, b) => (a.lesson!.startsAt < b.lesson!.startsAt ? -1 : 1));

  return [...results, ...lessonResults].slice(0, limit);
}
