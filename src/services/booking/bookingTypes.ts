export type ResourceKind = 'room' | 'lab_device' | 'court' | 'laundry' | 'hall' | 'equipment';

export type BookingStatus = 'pending' | 'confirmed' | 'cancelled' | 'released';

export interface BookableResource {
  id: string;
  code: string;
  name: string;
  kind: string;
  room_id?: string | null;
  building_id?: string | null;
  capacity?: number | null;
  requires_approval: boolean;
  min_duration_minutes: number;
  max_duration_minutes: number;
  max_days_ahead: number;
}

export interface Booking {
  id: string;
  resource_id: string;
  room_id?: string | null;
  starts_at: string;
  ends_at: string;
  status: BookingStatus;
  purpose?: string | null;
  attendee_count?: number | null;
  checked_in_at?: string | null;
  released_at?: string | null;
  awaiting_approval: boolean;
  checkin_opens_at?: string | null;
  checkin_closes_at?: string | null;
}

export interface BookingAlternative {
  starts_at: string;
  ends_at: string;
  starts_at_local?: string;
}

export interface CreateBookingPayload {
  resource_id: string;
  room_id?: string;
  starts_at: string; // ISO instant with timezone (e.g. Asia/Tashkent +05:00)
  ends_at: string;
  purpose?: string;
  attendee_count?: number;
}

export interface BookingPolicyViolation {
  code: string;
  message: string;
}
