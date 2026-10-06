/**
 * Schedule data references rooms ONLY by `roomId`. Never by coordinates or meshes.
 */
export type Lesson = {
  id: string;
  roomId: string;
  subject: string;
  teacher?: string;
  group?: string;
  /** ISO-8601 date-time. */
  startsAt: string;
  /** ISO-8601 date-time. */
  endsAt: string;
  cancelled?: boolean;
};

export type RoomStatus = 'AVAILABLE' | 'CURRENT' | 'UPCOMING' | 'FINISHED' | 'CANCELLED';

export type RoomScheduleState = {
  status: RoomStatus;
  /** Lesson in progress right now (may be cancelled). */
  current?: Lesson;
  /** Next non-cancelled lesson that has not started yet. */
  next?: Lesson;
  /** All lessons for the room on the given day, sorted by start time. */
  lessons: Lesson[];
};
