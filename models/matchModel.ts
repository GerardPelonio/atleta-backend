// ─── Match Log Entity ────────────────────────────────────────────────────────
// Stored in Firestore "Match_Logs" collection.

export type SportType = 'Basketball' | 'Swimming' | 'Track & Field';
export type GameResult = 'WIN' | 'LOSS';
export type ValidationStatus = 'Pending' | 'Approved' | 'Rejected';

export interface MatchLog {
  match_id: string;               // Primary Key, Required
  team_id: string;                // Foreign Key -> Teams.team_id, Required
  logged_by_coach_id?: string;    // Foreign Key -> Coach.coach_id, Required by manuscript
  sport_type: SportType;          // Required ("Basketball" | "Swimming" | "Track & Field")
  match_type: string;             // Required (e.g. "Unofficial", "Official", "Tournament")
  match_date: string;             // DateTime ISO string, Required
  location: string;               // Required
  opponent_team_name: string;     // Required
  game_result: GameResult;        // Required ("WIN" | "LOSS")
  roster_athletes?: string[];     // Array of athlete IDs who played in the match
  notes?: string;                 // Text, Optional
  scoresheet_url?: string;        // Optional URL of uploaded scoresheet
  idempotency_key?: string;       // Optional idempotency key string
  reference_id?: string;          // Optional reference ID for official match instances
  home_team_id?: string;          // Optional home team ID
  away_team_id?: string;          // Optional away team ID
  assigned_coaches?: string[];    // Optional array of assigned coach IDs
  is_certified?: boolean;         // Default: false, locked when true
  is_locked?: boolean;            // Default: false, locked when true
  is_invalidated?: boolean;       // Optional flag for disputed match records
  timestamp: string;              // DateTime ISO string, Required
}

// ─── Official Audit (Validation) Entity ────────────────────────────────────
// Stored in Firestore "Official_Audits" collection.

export interface OfficialAudit {
  validation_id: string;          // Primary Key, UUID, Required
  match_id: string;               // Foreign Key -> Match_Logs.match_id, Required
  official_id: string;            // Foreign Key -> Official_Profiles.official_id, Required
  status: ValidationStatus;       // Enum ("Pending" | "Approved" | "Rejected", Default: "Pending")
  scoresheet_url?: string;        // Optional
  context_notes?: string;         // Optional
  certified_at?: string;          // Optional ISO DateTime
  requested_by?: string;          // Optional coach_id or system
  created_at: string;             // ISO DateTime, Required
}


// ─── Sport Specific Stats ───────────────────────────────────────────────────

export interface BasketballStats {
  points: number;
  assists: number;
  offensive_rebounds: number;
  defensive_rebounds: number;
  fouls: number;
  turnovers: number;
  steals: number;
  fg_made: number;
  fg_attempted: number;
  ft_made: number;
  ft_attempted: number;
  true_shooting_pct?: number;     // Computed TS%
}

export interface IndividualSportStats {
  event_name: string;
  distance_meters: number;
  finish_time_ms: number;
  split_times_ms: number[];
  is_disqualified: boolean;
}

export type SportStatsPayload = BasketballStats | IndividualSportStats | Record<string, any>;

// ─── Performance Metrics Entity ─────────────────────────────────────────────
// Stored in Firestore "Performance_Metrics" collection.

export interface PerformanceMetric {
  metric_id: string;              // Primary Key, Required
  athlete_id: string;             // Foreign Key -> Athlete.athlete_id, Required
  match_id: string;               // Foreign Key -> Match_Logs.match_id, Required
  sport_category: string;         // Required
  sport_stats: SportStatsPayload; // Map / JSON Object
  calculated_player_efficiency: number; // Computed Float
  timestamp: string;              // DateTime ISO string, Required
}

// ─── API Payload & Response DTOs ───────────────────────────────────────────

export interface PlayerStatSubmission {
  athlete_id: string;
  stats: Record<string, any>;
}

export interface MatchSubmissionPayload {
  team_id: string;
  sport_type: SportType;
  match_type: string;
  match_date: string;
  location: string;
  opponent_team_name: string;
  game_result: GameResult;
  notes?: string;
  player_stats: PlayerStatSubmission[];
}

export interface ParsedScoresheetResult {
  match_id: string;
  scoresheet_url: string;
  parsed_tables: {
    team_scores: { team: string; score: number }[];
    player_summary: {
      player_name: string;
      jersey_number?: number;
      points: number;
      rebounds: number;
      assists: number;
      fouls: number;
    }[];
  };
  raw_ocr_text?: string;
  processed_at: string;
}

export interface BoxscorePlayerMetric {
  metric_id: string;
  athlete_id: string;
  user_id: string;
  first_name: string;
  last_name: string;
  position: string;
  jersey_number?: number | null;
  sport_stats: SportStatsPayload;
  calculated_player_efficiency: number;
}

export interface BoxscoreResponse {
  match: MatchLog;
  team_summary: {
    team_id: string;
    team_name: string;
    opponent_team_name: string;
    game_result: GameResult;
    match_date: string;
    location: string;
  };
  player_metrics: BoxscorePlayerMetric[];
}
