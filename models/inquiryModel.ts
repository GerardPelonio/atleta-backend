// ─── Public Coach Profile Entity ─────────────────────────────────────────────

export interface CoachPublicProfile {
  coach_id: string;               // Primary Key, UUID, Required
  user_id: string;                // Foreign Key -> Users.user_id, Required
  first_name: string;
  last_name: string;
  full_name: string;
  email: string;
  contact_number?: string | null;
  years_of_experience: number;    // Required
  current_institution: string;    // Required
  quote?: string | null;          // Optional
  specialties?: string[];         // Optional
  success_rate?: number | null;   // Optional
  professional_documents?: string[]; // Optional
  sport_type?: string;
  avatar_url?: string | null;
  team_id?: string | null;
  teams_managed?: string[];
}

// ─── Scouting Registry / Inquiry Entity ─────────────────────────────────────

export type OfferStatus = 'Sent' | 'Accepted' | 'Declined';

export interface RecruitmentInquiry {
  scout_id: string;               // Primary Key, UUID, Required (formerly inquiry_id)
  athlete_id: string;             // Foreign Key -> Athlete.athlete_id, Required (dont change t_id)
  coach_scout_id: string;         // Foreign Key -> Coach.coach_id, Required
  initiated_by: string;           // UUID of the initiator (athlete or coach), Required
  offer_message?: string | null;  // Optional, Max 1000 characters
  offer_status: OfferStatus;      // Default: "Sent"
  decline_reason?: string | null; // Optional, populated when status is "Declined"
  date_initiated: string;         // ISO DateTime string, Default: NOW()
  updated_at: string;             // ISO DateTime string, Default: NOW()
}

// ─── Enriched Inquiry Response for Inquiry Tracker ──────────────────────────

export interface EnrichedInquiry extends RecruitmentInquiry {
  coach_name: string;
  current_institution: string;
  sport_type: string;
}
