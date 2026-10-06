import type { Lesson, RoomScheduleState, RoomStatus } from './types';

export type RoomStatusOptions = {
  /** A room counts as UPCOMING when its next lesson starts within this window. */
  upcomingWindowMinutes: number;
};

const ms = (iso: string) => new Date(iso).getTime();

/**
 * Pure function: lessons of ONE room + current time → status.
 * Priority: CURRENT > CANCELLED (current slot cancelled) > UPCOMING > FINISHED > AVAILABLE.
 */
export function computeRoomState(
  roomLessons: Lesson[],
  now: Date,
  options: RoomStatusOptions,
): RoomScheduleState {
  const t = now.getTime();
  const lessons = [...roomLessons].sort((a, b) => ms(a.startsAt) - ms(b.startsAt));

  const inProgress = lessons.filter((l) => ms(l.startsAt) <= t && t < ms(l.endsAt));
  const activeNow = inProgress.find((l) => !l.cancelled);
  const cancelledNow = inProgress.find((l) => l.cancelled);
  const next = lessons.find((l) => !l.cancelled && ms(l.startsAt) > t);
  const hadEarlier = lessons.some((l) => !l.cancelled && ms(l.endsAt) <= t);

  let status: RoomStatus;
  if (activeNow) status = 'CURRENT';
  else if (cancelledNow) status = 'CANCELLED';
  else if (next && ms(next.startsAt) - t <= options.upcomingWindowMinutes * 60_000) status = 'UPCOMING';
  else if (!next && hadEarlier) status = 'FINISHED';
  else status = 'AVAILABLE';

  return { status, current: activeNow ?? cancelledNow, next, lessons };
}

export function groupLessonsByRoom(lessons: Lesson[]): Map<string, Lesson[]> {
  const byRoom = new Map<string, Lesson[]>();
  for (const lesson of lessons) {
    const list = byRoom.get(lesson.roomId);
    if (list) list.push(lesson);
    else byRoom.set(lesson.roomId, [lesson]);
  }
  return byRoom;
}

/** Status for every given room ID (rooms without lessons → AVAILABLE). */
export function computeRoomStates(
  roomIds: Iterable<string>,
  lessons: Lesson[],
  now: Date,
  options: RoomStatusOptions,
): Map<string, RoomScheduleState> {
  const byRoom = groupLessonsByRoom(lessons);
  const result = new Map<string, RoomScheduleState>();
  for (const roomId of roomIds) {
    result.set(roomId, computeRoomState(byRoom.get(roomId) ?? [], now, options));
  }
  return result;
}
