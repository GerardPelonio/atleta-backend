// ─── Match Log Entity ────────────────────────────────────────────────────────
// Stored in Firestore "Match_Logs" collection.

export type SportType = 'Basketball' | 'Swimming' | 'Track & Field' | (string & {});
export type GameResult = 'WIN' | 'LOSS' | 'TBD';
export type ValidationStatus = 'Pending' | 'Approved' | 'Rejected';

export interface MatchInjury {
  player_name: string;
  athlete_id?: string;
  team: string; // 'Home' | 'Away' or specific team name
  injury_type: string; // e.g. "Ankle Sprain", "Hamstring Strain", "Knee Contusion", "Cramps", "Concussion"
  quarter_or_set?: string; // e.g. "Q1", "Q2", "Q3", "Q4", "Set 1", "Set 2", "1st Half", "2nd Half"
  severity?: 'Minor' | 'Moderate' | 'Severe';
  status: 'Out' | 'Day-to-Day' | 'Sidelined' | 'Questionable';
  notes?: string;
  is_ocr_detected?: boolean;
}

export interface MatchLog {
  match_id: string;               // Primary Key, Required
  matchName?: string;             // User-defined custom match name
  match_name?: string;            // Snake_case alias for match name
  game_name?: string;             // Human-readable game name (e.g. "CSPC vs CBSUA")
  tournament_id?: string | null;  // Foreign Key -> Tournament_Registry.org_id | Null
  sport_type: SportType;          // Required ("Basketball" | "Swimming" | "Track & Field")
  match_type: string;             // Required ("Official Match" | "Unofficial Match" | "Tournament")
  match_date: string;             // DateTime ISO string, Required
  location: string;               // Required
  home_team_id?: string;          // Optional home team ID
  home_team_name?: string;        // Optional Home Team Name
  home_score?: number;            // Final score of home team
  away_team_id?: string;          // Optional away team ID
  away_team_name?: string;        // Display name for away team
  opponent_team_name: string;     // Required
  away_score?: number;            // Final score of away team
  game_result: GameResult | 'LOSE' | 'TIE' | string; // Required ("WIN" | "LOSS" | "LOSE" | "TIE")
  assigned_coaches?: string[];    // Optional array of assigned coach IDs
  official_id?: string | null;    // ID of the official who created or verified the match
  reference_id?: string;          // Optional reference ID for official match instances
  scoresheet_url?: string;        // Optional URL of uploaded scoresheet
  scoresheetUrl?: string;         // Firebase Storage download URL for scoresheet (operational alias)
  ocr_extracted_data_url?: string | null; // OCR JSON blob storage URL
  is_official?: boolean;          // True when created or certified by a Tournament Official
  is_certified?: boolean;         // Default: false, locked when true
  is_locked?: boolean;            // Default: false, locked when true
  roster_athletes?: string[];     // Array of athlete IDs who played in the match
  rosterAthletes?: string[];      // Array of home team registered athlete UIDs (operational alias)
  away_roster_athletes?: string[]; // Array of away team registered athlete UIDs
  awayRosterAthletes?: string[];  // Array of away team registered athlete UIDs (operational alias)
  player_stats?: any[];           // Detailed array of player stats from both teams
  playerStats?: any[];            // Individual player match stats line mapping (operational alias)
  injuries?: MatchInjury[];       // Injuries and sidelined players logged during the match
  notes?: string;                 // Text, Optional
  idempotency_key?: string;       // Optional idempotency key string
  is_invalidated?: boolean;       // Optional flag for disputed match records
  team_id?: string;               // Foreign Key -> Teams.team_id (operational alias)
  logged_by_coach_id?: string;    // Foreign Key -> Coach.coach_id (operational alias)
  timestamp: string;              // DateTime ISO string, Required
  created_at?: string;            // ISO datetime
  updated_at?: string;            // ISO datetime
  [key: string]: any;
}

// ─── Official Audit (Validation) Entity ────────────────────────────────────
// Stored in Firestore "Official_Audits" and "Official_Validations" collections.

export interface OfficialAudit {
  validation_id: string;          // Primary Key, UUID, Required
  audit_id?: string;              // Audit identifier alias
  match_id: string;               // Foreign Key -> Match_Logs.match_id, Required
  official_id: string | null;     // Foreign Key -> Official_Profiles.official_id, Required
  status: ValidationStatus | 'Certified' | string; // Enum ("Pending" | "Approved" | "Certified" | "Rejected")
  verification_status?: string;   // Paper data dictionary field alias
  scoresheet_url?: string;        // Optional
  scoresheet_attachment_url?: string | null; // Paper data dictionary field alias
  ocr_extracted_data_url?: string | null; // Paper data dictionary field alias
  context_notes?: string;         // Optional
  certified_at?: string;          // Optional ISO DateTime
  requested_by?: string;          // Optional coach_id or system
  requested_by_coach_id?: string; // Optional requesting coach ID
  requested_at?: string;          // Paper data dictionary field alias
  timestamp?: string;             // ISO DateTime
  created_at: string;             // ISO DateTime, Required
  updated_at?: string;            // ISO DateTime
  [key: string]: any;
}

// Formal Atleta Paper Data Dictionary Entity
export interface OfficialValidation {
  validation_id: string;          // Primary Key, UUID, Required
  audit_id: string;               // Foreign Key / Audit ID, Required
  match_id: string;               // Foreign Key -> Match_Logs.match_id, Required
  official_id: string | null;     // Foreign Key -> Official_Profiles.official_id | Null
  requested_by: string;           // UUID of requesting party (coach_id)
  requested_by_coach_id: string;  // Explicit coach ID
  requested_at: string;           // ISO DateTime string
  verification_status: 'Pending' | 'Certified' | 'Rejected' | string;
  status: 'Pending' | 'Certified' | 'Rejected' | 'Approved' | string;
  ocr_extracted_data_url?: string | null;
  scoresheet_attachment_url?: string | null;
  scoresheet_url?: string | null; // Operational alias
  context_notes?: string;
  notes?: string;
  certified_at?: string | null;
  timestamp: string;              // ISO DateTime string
  created_at?: string;
  updated_at?: string;
  [key: string]: any;
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
  [key: string]: any;
}

export interface IndividualSportStats {
  event_name: string;
  distance_meters: number;
  finish_time_ms: number;
  split_times_ms: number[];
  is_disqualified: boolean;
  [key: string]: any;
}

export interface BasketballMetricStats {
  total_field_goals_made?: number;
  total_field_goals_attempts?: number;
  two_point_made?: number;
  two_point_attempts?: number;
  three_point_made?: number;
  three_point_attempts?: number;
  free_throws_made?: number;
  free_throws_attempts?: number;
  assists?: number;
  blocks?: number;
  turnovers?: number;
  rebounds?: number;
  [key: string]: any;
}

export interface SwimmingMetricStats {
  target_distance?: number;
  stroke_count?: number;
  stroke_rate?: number;
  distance_per_stroke?: number;
  reaction_time?: number;
  lap_time?: number;
  finish_time?: number;
  [key: string]: any;
}

export interface TrackAndFieldMetricStats {
  event_type?: string;
  target_distance?: number;
  lap_time?: number;
  finish_time?: number;
  [key: string]: any;
}

export interface StandardSportStats {
  pts?: number;
  ast?: number;
  reb?: number;
  fg_pct?: number;
  basketball?: BasketballMetricStats;
  swimming?: SwimmingMetricStats;
  track_and_field?: TrackAndFieldMetricStats;
  [key: string]: any;
}

export interface CustomStatEntry {
  stat_name_key: string;
  stat_value: number;
  [key: string]: any;
}

export type SportStatsPayload = BasketballStats | IndividualSportStats | StandardSportStats | Record<string, any>;

// ─── Performance Metrics Entity ─────────────────────────────────────────────
// Stored in Firestore "Performance_Metrics" collection.

export interface PerformanceMetric {
  metric_id: string;              // Primary Key, Required
  match_id: string;               // Foreign Key -> Match_Logs.match_id, Required
  athlete_id: string;             // Foreign Key -> Athlete.athlete_id, Required
  player_name?: string;           // Optional Player Name
  team_name?: string;             // Optional Team Name (Home or Opponent)
  team?: string;                  // Optional Team Name alias
  jersey_number?: number | string | null;  // Jersey Number
  position?: string;              // Position
  sport_category: string;         // Required ("BASKETBALL" | "SWIMMING" | "TRACK_AND_FIELD")
  calculated_player_efficiency: number; // Computed Float
  sport_stats: SportStatsPayload; // Map / JSON Object with standardized nested sub-properties
  custom_stats?: CustomStatEntry | Record<string, any>; // Custom dynamic sport metric
  timestamp: string;              // DateTime ISO string, Required
  created_at?: string;            // ISO DateTime string
  [key: string]: any;
}

// ─── API Payload & Response DTOs ───────────────────────────────────────────

export interface PlayerStatSubmission {
  athlete_id: string;
  player_name?: string;
  team_name?: string;
  jersey_number?: number;
  stats: Record<string, any>;
}

export interface MatchSubmissionPayload {
  [key: string]: any;
  team_id: string;
  home_team_name?: string;
  away_team_name?: string;
  opponent_team_name?: string;
  match_type: string;
  sport_type: SportType;
  match_date: string;
  location: string;
  court_number?: number;
  notes?: string;
  home_score?: number;
  away_score?: number;
  game_result?: GameResult;
  player_stats?: PlayerStatSubmission[];
  playerStats?: PlayerStatSubmission[] | any[];
  rosterAthletes?: string[];
  roster_athletes?: string[];
  awayRosterAthletes?: string[];
  away_roster_athletes?: string[];
  scoresheetUrl?: string;
  scoresheet_url?: string;
  scoresheet?: Express.Multer.File;
}

export interface ParsedScoresheetResult {
  match_id?: string;
  scoresheet_url?: string;
  player_summary?: any[];
  team_scores?: any[];
  parsed_tables: {
    team_scores: Array<{ team: string; score: number; is_home?: boolean }>;
    player_summary: Array<Record<string, any>>;
  };
  raw_ocr_text?: string;
  processed_at?: string;
  warning?: string;
  ocr_status?: string;
}

export interface BoxscorePlayerMetric {
  metric_id: string;
  athlete_id: string;
  user_id: string;
  player_name?: string;
  first_name: string;
  last_name: string;
  team_name?: string;
  position: string;
  jersey_number?: number | null;
  sport_stats: SportStatsPayload;
  calculated_player_efficiency: number;
}

export interface BoxscoreResponse {
  match: MatchLog;
  scoresheet_url?: string;
  home_team_name?: string;
  away_team_name?: string;
  home_score?: number | null;
  away_score?: number | null;
  game_result?: GameResult;
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
