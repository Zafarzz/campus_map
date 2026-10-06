/**
 * DEMO SCHEDULE — fully invented, deterministic per date.
 * Replace with a real schedule source (e.g. EduPage) via `services/schedule`.
 */
import type { Campus } from '../domain/campus/types';
import type { Lesson } from '../domain/schedule/types';

const subjects = [
  'Computer Science', 'Calculus', 'Linear Algebra', 'Physics', 'Data Structures',
  'English Academic Writing', 'Korean Language', 'Economics', 'Statistics',
  'Operating Systems', 'Databases', 'Digital Logic', 'Machine Learning', 'Discrete Math',
];
const teachers = [
  'Dr. Kim', 'Prof. Lee', 'Dr. Park', 'Ms. Karimova', 'Mr. Tashkentov',
  'Dr. Choi', 'Prof. Rahimov', 'Ms. Yusupova', 'Dr. Jung', 'Mr. Aliev',
];
const groups = ['CSE-21', 'CSE-22', 'CSE-23', 'ICE-21', 'ICE-22', 'BM-22', 'BM-23', 'ME-21', 'FIN-23', 'CIE-22'];

/** Small deterministic hash → [0, 1). */
function rand(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 100_000) / 100_000;
}

const pick = <T,>(list: T[], seed: string) => list[Math.floor(rand(seed) * list.length)];

/**
 * @param date local date `YYYY-MM-DD`
 * @param slots lesson slots `[['09:00','10:20'], ...]`
 */
export function createDemoSchedule(campus: Campus, date: string, slots: [string, string][]): Lesson[] {
  const lessons: Lesson[] = [];
  for (const building of campus.buildings) {
    for (const floor of building.floors) {
      for (const room of floor.rooms) {
        if (room.kind === 'office') continue;
        slots.forEach(([start, end], slotIndex) => {
          const seed = `${date}|${room.id}|${slotIndex}`;
          if (rand(seed) > 0.58) return;
          lessons.push({
            id: `demo-${room.id}-${date}-${slotIndex}`,
            roomId: room.id,
            subject: room.kind === 'hall' ? 'Physical Education' : pick(subjects, `${seed}|s`),
            teacher: pick(teachers, `${seed}|t`),
            group: pick(groups, `${seed}|g`),
            // Local time (no timezone suffix) — parsed as campus-local time.
            startsAt: `${date}T${start}:00`,
            endsAt: `${date}T${end}:00`,
            cancelled: rand(`${seed}|c`) < 0.06,
          });
        });
      }
    }
  }
  return lessons;
}
