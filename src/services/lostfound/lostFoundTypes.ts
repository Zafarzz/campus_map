export type LostFoundKind = 'lost' | 'found';
export type LostFoundStatus = 'open' | 'matched' | 'claimed' | 'returned' | 'expired';

export interface LostFoundItem {
  id: string;
  reporter_user_id: string;
  is_mine: boolean;
  kind: LostFoundKind;
  status: LostFoundStatus;
  category: string;
  title: string;
  description: string;
  contact_info?: string | null;
  photo_storage_key?: string | null;
  photo_url?: string | null;
  building_id?: string | null;
  floor_id?: string | null;
  room_id?: string | null;
  pin_x_m?: number | null;
  pin_z_m?: number | null;
  occurred_at: string;
  verification_question?: string | null;
  handover_point?: string | null;
  expires_at: string;
}

export interface LostFoundClaim {
  id: string;
  item_id: string;
  status: 'pending' | 'approved' | 'rejected';
  handover_point?: string | null;
  verification_answer?: string;
  created_at?: string;
  resolved_at?: string | null;
}

export interface LostFoundMatch {
  candidate_id: string;
  score: number;
  text_similarity: number;
  category_match: boolean;
  time_proximity: number;
  spatial_proximity: number;
}

export interface CreateLostFoundPayload {
  kind: LostFoundKind;
  category: string;
  title: string;
  description?: string;
  contact_info?: string;
  photo_base64?: string;
  building_id?: string;
  floor_id?: string;
  room_id?: string;
  occurred_at?: string;
  verification_question?: string;
  handover_point?: string;
}

export interface SubmitClaimPayload {
  verification_answer: string;
}

export interface ResolveClaimPayload {
  approve: boolean;
  handover_point?: string;
  mark_returned?: boolean;
}
