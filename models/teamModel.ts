// ─── Team Roster Member ──────────────────────────────────────────────────────

export interface TeamRosterMember {
  athlete_id: string;             // Primary Key / FK -> Athlete.athlete_id, Required
  user_id?: string;               // Foreign Key -> Users.user_id
  first_name?: string;            // Athlete First Name
  last_name?: string;             // Athlete Last Name
  position?: string;              // Optional
  jersey_number?: number;         // Optional
  added_at: string;               // ISO DateTime, Required
  eligibility_documents?: string[];
  is_eligibility_verified?: boolean;
}

// ─── Team Entity ─────────────────────────────────────────────────────────────
// Stored in Firestore "Teams" collection.

export interface SeasonRecord {
  wins: number;
  losses: number;
}

export interface Team {
  team_id: string;                // Primary Key, Required
  team_name: string;              // Required, Max 255
  sport_type: string;             // Required
  division: string;               // Required (e.g. "Division 1", "Varsity")
  region?: string;                // Optional
  description?: string;           // Optional
  mission_statement?: string;     // Optional
  established_year?: number;      // Optional
  season_record: SeasonRecord;    // Map / Object (e.g. { wins: 0, losses: 0 })
  coach_id: string;               // Foreign Key -> Coach.coach_id, Required
  roster_list: (string | TeamRosterMember)[]; // Roster array
  timestamp: string;              // ISO datetime
}

// ─── Coach Entity ────────────────────────────────────────────────────────────

export interface Coach {
  coach_id: string;
  user_id: string;
  first_name?: string;
  last_name?: string;
  years_of_experience: number;
  current_institution: string;
  quote?: string;
}

// ─── Roster Athlete (enriched for roster context) ────────────────────────────

export interface RosterAthlete {
  athlete_id: string;
  user_id: string;
  first_name: string;
  last_name: string;
  position: string;
  jersey_number?: number | null;
  sport_type: string;
  avatar_url?: string;
  eligibility_documents: string[];
  is_eligibility_verified: boolean; // Computed based on submitted documents
}

// ─── API DTOs & Response Types ──────────────────────────────────────────────

export interface CreateTeamDto {
  team_name: string;              // Required, Max 255
  sport_type: string;             // Required
  division?: string;              // Optional (Defaults: "Varsity Division")
  region?: string;                // Optional
  description?: string;           // Optional
  mission_statement?: string;     // Optional
  established_year?: number;      // Optional
  roster_list?: any[];            // Optional initial squad roster
}

export interface UpdateRosterItem {
  athlete_id: string;
  position?: string;
  jersey_number?: number;
}

export interface UpdateRosterDto {
  roster: UpdateRosterItem[];
  override_unverified?: boolean;  // Optional flag to bypass eligibility block
}

export interface TeamSummary {
  team_id: string;
  team_name: string;
  sport_type: string;
  division: string;
  region?: string;
  season_record: SeasonRecord;
  athlete_count: number;
  coach_name: string;
  coach_id: string;
  established_year?: number;
}

export interface TeamDetailResponse {
  team_id: string;
  team_name: string;
  sport_type: string;
  division: string;
  region?: string;
  season_record: SeasonRecord;
  description: string | null;
  mission_statement: string | null;
  established_year: number | null;
  athlete_count: number;
  coach: {
    coach_id: string;
    full_name: string;
    years_of_experience: number;
    current_institution: string;
    quote: string | null;
  };
  roster: RosterAthlete[];
  timestamp: string;
}

export interface AthleteTeamResponse {
  athlete_id: string;
  team: {
    team_id: string;
    team_name: string;
    sport_type: string;
    division: string;
    region?: string;
    description: string | null;
  };
  coach: {
    coach_id: string;
    full_name: string;
    current_institution: string;
  };
  roster: RosterAthlete[];
}
