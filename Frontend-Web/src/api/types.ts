export interface OfficialLoginPayload {
  email: string;
  password: string;
  savePassword?: boolean;
}

export interface OfficialRegisterPayload {
  email: string;
  password: string;
  full_legal_name: string;
  organization_name: string;
  first_name?: string;
  last_name?: string;
  full_name?: string;
  license_number?: string;
  sport_accreditation?: string[];
  organization?: string;
  phone_number?: string;
  assigned_sport?: string;
}

export interface PasswordResetPayload {
  email: string;
  redirect_url?: string;
}

export interface ConfirmPasswordResetPayload {
  token: string;
  new_password: string;
  email?: string;
}

export interface OfficialSettings {
  setting_id?: string;
  official_id?: string;
  split_screen_defaults: boolean;
  discrepancy_presets: boolean;
  match_reminders: boolean;
  audit_notifications?: boolean;
  auto_refresh?: boolean;
  updated_at?: string;
  [key: string]: any;
}

export interface AuthUser {
  uid: string;
  user_id?: string;
  role: string;
  full_legal_name?: string;
  full_name?: string;
  first_name?: string;
  last_name?: string;
  email: string;
  organization_name?: string;
  organization?: string;
  phone_number?: string;
  license_number?: string;
  official_license_number?: string;
  sport_accreditation?: string[];
  avatar_url?: string;
  profile_image?: string;
  photo_url?: string;
  profile?: Record<string, unknown>;
}

export interface AuthResponse {
  token: string;
  user: AuthUser;
  message?: string;
}

export interface AuditQueueItem {
  audit_id: string;
  match_id: string;
  requested_by?: string;
  status: string;
  requested_at?: string;
  match_details?: {
    match_id?: string;
    sport_type?: string;
    home_team_name?: string;
    away_team_name?: string;
    match_date?: string;
    coach_name?: string;
    status?: string;
    division?: string;
    [key: string]: any;
  } | null;
}

export interface OfficialDashboardResponse {
  total_matches: number;
  pending_count: number;
  audited_count: number;
  audit_queue: AuditQueueItem[];
  completed_audits?: number;
  pending_audits?: number;
  [key: string]: any;
}

export interface OfficialScheduleItem {
  schedule_id: string;
  match_id: string;
  official_id: string;
  matchName?: string;
  match_name?: string;
  gameName?: string;
  gameReferenceId?: string;
  venue?: string;
  court_number?: string | number;
  scheduled_time: string;
  month?: number;
  year?: number;
  assigned_officials?: string[];
  venue_logistics?: {
    location?: string;
    sport?: string;
    court?: string | number;
    home_team?: string;
    away_team?: string;
    time?: string;
    [key: string]: any;
  } | null;
  sport?: string;
  match_class?: string;
  home_team?: string;
  away_team?: string;
  assigned_coaches?: string[];
  coaches?: string;
  coach_name?: string;
  requested_by?: string;
  created_by?: string;
  raw_match?: any;
}

export interface CreateMatchPayload {
  team_id?: string;
  sport_type: string;
  match_date: string;
  location?: string;
  venue?: string;
  court_number?: string | number;
  opponent_team_name: string;
  home_team_name?: string;
  participating_teams?: string[];
  game_name?: string;
  coaches?: string[];
  notes?: string;
  scoresheet_url?: string;
  scoresheetUrl?: string;
  player_stats?: any[];
  playerStats?: any[];
  roster_athletes?: string[];
  rosterAthletes?: string[];
  away_roster_athletes?: string[];
  awayRosterAthletes?: string[];
  home_score?: number;
  away_score?: number;
  game_result?: string;
  final_score?: string;
  [key: string]: any;
}

export type AuditStatus = 'PENDING' | 'AUDITED' | 'REJECTED';

export interface BoxScoreRow {
  jersey_no: string;
  player_name: string;
  position?: string;
  minutes?: string;
  pts?: number;
  reb?: number;
  ast?: number;
  stl?: number;
  blk?: number;
  fg_pct?: string;
  three_p_pct?: string;
  ft_pct?: string;
  // Secondary basketball / multi-sport stats
  fouls?: number;
  pf?: number;
  offensive_rebounds?: number;
  defensive_rebounds?: number;
  fg_made?: number;
  fg_attempted?: number;
  three_made?: number;
  three_attempted?: number;
  ft_made?: number;
  ft_attempted?: number;
  // Volleyball
  kills?: number;
  attack_errors?: number;
  attack_attempts?: number;
  hitting_pct?: string;
  service_aces?: number;
  service_errors?: number;
  reception_errors?: number;
  digs?: number;
  block_points?: number;
  sets_played?: number;
  set_scores?: string | number[];
  // Soccer
  goals?: number;
  shots?: number;
  shots_on_target?: number;
  saves?: number;
  tackles?: number;
  // Timed / Individual (Swimming / Track)
  finish_time?: string;
  time?: string;
  split?: string;
  split_times?: string[] | number[];
  lap_splits?: string | string[];
  stroke_rate?: number;
  stroke_count?: number;
  distance_m?: number;
  wind?: string;
  heat?: number | string;
  lane?: number | string;
  placement_rank?: number | string;
  [key: string]: any;
}

export interface RaceResultRow {
  athlete_id?: string;
  placement_rank: number | string;
  athlete_name: string;
  team_name?: string;
  distance: string;
  finish_time: string;
  split_times?: string[] | number[];
  efficiency?: number;
  is_disqualified?: boolean;
}

export interface MatchAuditDetail {
  match_id: string;
  validation_id: string;
  matchName?: string;
  match_name?: string;
  gameName?: string;
  game_name: string;
  gameReferenceId?: string;
  sport_type: string;
  league_class: string;
  match_date_formatted: string;
  home_team: {
    name: string;
    score: number;
    result: 'WIN' | 'LOSE' | 'DRAW';
    roster_stats: BoxScoreRow[];
    team_totals: BoxScoreRow;
  };
  away_team: {
    name: string;
    score: number;
    result: 'WIN' | 'LOSE' | 'DRAW';
    roster_stats: BoxScoreRow[];
    team_totals: BoxScoreRow;
  };
  race_results?: RaceResultRow[];
  scoresheet_url?: string;
  scoresheet_urls?: string[];
  audit_context_notes?: string;
  is_certified?: boolean;
  is_locked?: boolean;
  assigned_coaches?: string[];
  coach_name?: string;
}

export interface MatchSummaryItem {
  match_id: string;
  validation_id?: string;
  matchName?: string;
  match_name?: string;
  gameName?: string;
  game_name?: string;
  gameReferenceId?: string;
  match_class: string;
  sport: string;
  coaches: string;
  date_time: string;
  status: AuditStatus;
  raw_match?: any;
}

export type OfficialNotificationType = 'AUDIT_REQUEST' | 'SCHEDULE_UPDATE' | 'SCHEDULE_UPDATES' | string;

export interface OfficialNotificationItem {
  notification_id: string;
  official_id: string;
  type: OfficialNotificationType;
  title: string;
  message: string;
  reference_id?: string | null;
  is_read: boolean;
  created_at: string;
  requested_by_coach?: string;
  match_context?: string;
  sport_discipline?: string;
  [key: string]: any;
}

export interface AdminLoginPayload {
  email: string;
  password: string;
  savePassword?: boolean;
}

export interface AdminProfile {
  admin_id: string;
  user_id: string;
  institution?: string;
  department_code: string;
  clearance_level: number;
  is_active: boolean;
  is_elevated?: boolean;
  created_at: string;
  updated_at?: string;
}

export interface SystemAuditLog {
  log_id: string;
  user_id: string;
  action: string;
  endpoint: string;
  ip_address: string;
  timestamp: string;
  status?: string;
  details?: Record<string, unknown> | string;
}

export interface AdminCoachQueueItem {
  coach_id: string;
  user_id: string;
  full_name: string;
  first_name?: string;
  last_name?: string;
  email?: string;
  sport_type?: string;
  years_of_experience?: number;
  current_institution?: string;
  institutional_affiliation?: string;
  professional_documents?: string[];
  account_status: string;
  status?: string;
  rejection_reason?: string;
  created_at: string;
  date_uploaded?: string;
}

export interface AdminCoachQueueResponse {
  message?: string;
  total_pending: number;
  queue: AdminCoachQueueItem[];
}

export interface AdminOfficialQueueItem {
  official_id: string;
  user_id: string;
  full_name: string;
  first_name?: string;
  last_name?: string;
  email: string;
  organization_name?: string;
  organization?: string;
  official_license_number?: string;
  assigned_tournaments?: string[];
  account_status: string;
  status: string;
  is_approved: boolean;
  rejection_reason?: string;
  created_at: string;
}

export interface AdminOfficialQueueResponse {
  message?: string;
  total_pending: number;
  total_officials?: number;
  queue: AdminOfficialQueueItem[];
}

export type MeasurementCategory =
  | 'CUMULATIVE TOTAL'
  | 'PERCENTAGE'
  | 'TIME (MS)'
  | 'DISTANCE (M)'
  | 'COUNT';

export interface DynamicStatRow {
  id: string; // client-side unique id for key mapping
  stat_name_key: string; // e.g. "TOTAL_POINTS", "FIELD_GOAL_ACCURACY"
  measurement_category: MeasurementCategory;
  formula?: string; // e.g. "(FG_MADE / FG_ATTEMPTED) * 100" or "SPLIT_1 + SPLIT_2"
}

export interface SportConfigurationForm {
  sport_name: string; // e.g. "BASKETBALL_PRO"
  short_identifier: string; // e.g. "BKT_01"
  configurable_stats: DynamicStatRow[];
  scoring_rules?: Record<string, unknown>;
  positions?: string[];
}

export interface BackendConfigurableStat {
  stat_name_key: string;
  measurement_category: 'Cumulative Total' | 'Percentage' | 'Time (ms)' | 'Distance (m)' | 'Count';
  label?: string;
  description?: string;
  formula?: string;
}

export interface SportConfiguration {
  sport_id: string;
  sport_name: string;
  short_identifier: string;
  configurable_stats: BackendConfigurableStat[];
  stat_schema?: Record<string, { measurement_category: string; display_label?: string; formula?: string }>;
  positions?: string[];
  scoring_rules?: Record<string, unknown>;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface SportsListResponse {
  message?: string;
  total_sports: number;
  sports: SportConfiguration[];
}

export interface CreateSportPayload {
  sport_name: string;
  short_identifier: string;
  configurable_stats: BackendConfigurableStat[];
  stat_schema?: Record<string, { measurement_category: string; display_label?: string }>;
  positions?: string[];
  scoring_rules?: Record<string, unknown>;
  is_active?: boolean;
}

export interface TeamScoreItem {
  team: string;
  score: number;
}

export interface DetectedAthleteStat {
  athlete_id: string;
  row_uid?: string;
  player_name: string;
  team_name?: string;
  jersey_number?: number;
  position?: string;
  event_id?: string;
  heat?: number | string;
  lane?: number | string;
  stats?: Record<string, any>;

  // Basketball & general
  pts?: number;
  points?: number;
  ast?: number;
  assists?: number;
  to?: number;
  turnovers?: number;
  reb?: number;
  rebounds?: number;
  offensive_rebounds?: number;
  defensive_rebounds?: number;
  stl?: number;
  steals?: number;
  blk?: number;
  blocks?: number;
  fouls?: number;
  pf?: number;
  personal_fouls?: number;
  min?: number;
  minutes?: number;
  fg_pct?: string;
  fg_made?: number;
  fg_attempted?: number;
  three_made?: number;
  three_attempted?: number;
  ft_made?: number;
  ft_attempted?: number;

  // Volleyball
  kills?: number;
  attack_errors?: number;
  attack_attempts?: number;
  hitting_pct?: string;
  service_aces?: number;
  service_errors?: number;
  reception_errors?: number;
  digs?: number;
  block_points?: number;
  block_solos?: number;
  block_assists?: number;
  sets_played?: number;
  set_scores?: string | number[];

  // Soccer
  goals?: number;
  shots?: number;
  shots_on_target?: number;
  saves?: number;
  tackles?: number;
  fouls_committed?: number;
  yellow_cards?: number;
  red_cards?: number;

  // Timed / Individual (Swimming / Track & Field)
  time?: string;
  finish_time?: string;
  event?: string;
  event_name?: string;
  stroke_count?: number;
  stroke_rate?: number;
  lap_count?: number;
  lap_splits?: string | string[];
  distance_m?: number;
  split?: string;
  split_2?: string;
  split_times?: string[] | number[];
  pace?: string;
  reaction_sec?: string;
  wind?: string;
  placement_rank?: number | string;
  rank?: number | string;
  [key: string]: any;
}

export interface ExpandedPerformanceMetrics {
  shooting_efficiency?: {
    ft_made: number;
    ft_attempts: number;
    pt2_made: number;
    pt2_attempts: number;
    pt3_made: number;
    pt3_attempts: number;
  };
  possession_errors?: {
    key_drives: number;
    assists: number;
    turnovers: number;
    scv_12s: number;
  };
  [key: string]: any;
}

export interface RawOCRDetectedData {
  team_name: string;
  opponent_team_name?: string;
  final_score?: string;
  game_result?: string;
  team_scores?: TeamScoreItem[];
  teams?: string[];
  sport_type?: string;
  match_date?: string;
  location?: string;
  venue?: string;
  notes?: string;
  scoresheet_url?: string;
  scoresheetUrl?: string;
  rosterAthletes?: string[];
  roster_athletes?: string[];
  awayRosterAthletes?: string[];
  away_roster_athletes?: string[];
  playerStats?: any[];
  player_stats?: any[];
  athlete_overview: DetectedAthleteStat[];
  expanded_metrics?: ExpandedPerformanceMetrics;
  batch_matches?: RawOCRDetectedData[];
  [key: string]: any;
}

export interface UploadedFileItem {
  upload_id: string;
  file_name: string;
  file_size_bytes: number;
  uploaded_at_relative: string;
  file_type: 'PDF' | 'CSV' | 'JSON' | 'IMAGE';
  file_url: string;
  raw_file?: File;
}

// ─────────────────────────────────────────────────────────────────────────────
// 14 Core Atleta Research Paper Data Dictionary Models
// ─────────────────────────────────────────────────────────────────────────────

export interface DataDictionaryUser {
  user_id: string;
  first_name: string;
  last_name: string;
  email: string;
  contact_number: string | null;
  role: 'Athlete' | 'Coach' | 'Official' | 'System Admin';
  provider: 'google' | 'password';
  avatar_url: string | null;
  created_at: string;
  updated_at: string;
  [key: string]: any;
}

export interface DataDictionaryAdminProfile {
  admin_id: string;
  user_id: string;
  full_name: string;
  email: string;
  department_code: string;
  institution: string;
  clearance_level: number;
  is_active: boolean;
  is_elevated: boolean;
  permissions: string[];
  created_at: string;
  updated_at: string;
  [key: string]: any;
}

export interface DataDictionaryAthleteProfile {
  athlete_id: string;
  user_id: string;
  first_name: string;
  last_name: string;
  gender: string;
  birthdate: string;
  province: string;
  sports_type: string;
  position: string;
  jersey_number: number | null;
  height_cm: number | null;
  weight_kg: number | null;
  avatar_url: string | null;
  recruitment_status: 'Available' | 'Recruited' | string;
  leaderboard_rank: number;
  eligibility_documents: {
    psa_verified: boolean;
    academic_check: boolean;
    proof_of_residency: boolean;
  };
  achievements: {
    title: string;
    year: number;
    content: string;
  }[];
  created_at: string;
  updated_at: string;
  [key: string]: any;
}

export interface DataDictionaryTeam {
  team_id: string;
  team_name: string;
  sport_type: string;
  division: string;
  coach_id: string;
  roster_list: string[];
  season_record: {
    wins: number;
    losses: number;
  };
  created_at: string;
  [key: string]: any;
}

export interface DataDictionaryCoachProfile {
  coach_id: string;
  user_id: string;
  first_name: string;
  last_name: string;
  full_name: string;
  email: string;
  account_status: 'Active' | 'Inactive';
  sport_type: string;
  years_of_experience: number;
  current_institution: string;
  regional_affiliation: string;
  national_sports_league: string;
  team_id: string | null;
  teams_managed: string[];
  athletes_managed: {
    athlete_id: string;
    full_name: string;
  }[];
  matches_logged: number;
  total_matches_logged: number;
  professional_documents: string[];
  profile_image: string | null;
  quote: string | null;
  system_statistics: {
    metric_logs: number;
    total_records: number;
  };
  created_at: string;
  updated_at: string;
  [key: string]: any;
}

export interface DataDictionaryOfficialProfile {
  official_id: string;
  user_id: string;
  organization_name: string;
  official_license_number: string;
  certification_status: 'Pending' | 'Certified';
  assigned_tournaments: string[];
  is_active: boolean;
  avatar_url: string | null;
  profile_image: string | null;
  settings: any[];
  created_at: string;
  updated_at: string;
  [key: string]: any;
}

export interface DataDictionaryMatchLog {
  match_id: string;
  game_name: string;
  tournament_id: string | null;
  sport_type: string;
  match_type: 'Official Match' | 'Unofficial Match' | string;
  match_date: string;
  location: string;
  home_team_id: string;
  home_team_name: string;
  home_score: number;
  away_team_id: string;
  away_team_name: string;
  opponent_team_name: string;
  away_score: number;
  game_result: 'WIN' | 'LOSE' | 'TIE' | string;
  assigned_coaches: string[];
  official_id: string | null;
  reference_id: string;
  scoresheet_url: string;
  ocr_extracted_data_url: string | null;
  is_official: boolean;
  is_certified: boolean;
  is_locked: boolean;
  roster_athletes: string[];
  notes: string;
  timestamp: string;
  [key: string]: any;
}

export interface DataDictionaryScoutingRegistry {
  scout_id: string;
  athlete_id: string;
  coach_scout_id: string;
  initiated_by: string;
  date_initiated: string;
  offer_message: string;
  offer_status: 'Sent' | 'Accepted' | 'Declined';
  updated_at: string;
  [key: string]: any;
}

export interface DataDictionaryOfficialValidation {
  validation_id: string;
  audit_id: string;
  match_id: string;
  official_id: string | null;
  requested_by: string;
  requested_by_coach_id: string;
  requested_at: string;
  verification_status: 'Pending' | 'Certified' | 'Rejected';
  status: 'Pending' | 'Certified' | 'Rejected';
  ocr_extracted_data_url: string | null;
  scoresheet_attachment_url: string | null;
  timestamp: string;
  [key: string]: any;
}

export interface DataDictionaryPerformanceMetric {
  metric_id: string;
  match_id: string;
  athlete_id: string;
  player_name: string;
  jersey_number: string | number;
  sport_category: 'BASKETBALL' | 'SWIMMING' | 'TRACK_AND_FIELD' | string;
  calculated_player_efficiency: number;
  sport_stats: {
    pts?: number;
    ast?: number;
    reb?: number;
    fg_pct?: number;
    basketball?: {
      total_field_goals_made: number;
      total_field_goals_attempts: number;
      two_point_made: number;
      two_point_attempts: number;
      three_point_made: number;
      three_point_attempts: number;
      free_throws_made: number;
      free_throws_attempts: number;
      assists: number;
      blocks: number;
      turnovers: number;
      rebounds: number;
    };
    swimming?: {
      target_distance: number;
      stroke_count: number;
      stroke_rate: number;
      distance_per_stroke: number;
      reaction_time: number;
      lap_time: number;
      finish_time: number;
    };
    track_and_field?: {
      event_type: string;
      target_distance: number;
      lap_time: number;
      finish_time: number;
    };
    [key: string]: any;
  };
  custom_stats?: {
    stat_name_key: string;
    stat_value: number;
  };
  team_name: string;
  timestamp: string;
  [key: string]: any;
}

export interface DataDictionaryWorkloadAnalysis {
  workload_id: string;
  athlete_id: string;
  session_type: 'Practice' | 'Game' | 'Conditioning' | string;
  session_duration_mins: number;
  srpe_score: number;
  daily_load: number;
  entry_date: string;
  short_term_load: number;
  long_term_load: number;
  injury_risk_index: number;
  monotony_score: number;
  strain_score: number;
  created_at: string;
  [key: string]: any;
}

export interface DataDictionarySportsConfiguration {
  sport_id: string;
  canonical_id: string;
  sport_name: string;
  short_identifier: string;
  category: 'Team' | 'Individual' | string;
  is_active: boolean;
  is_timed_sport: boolean;
  measurement_type: string;
  configurable_stats: {
    stat_name_key: string;
    label: string;
    measurement_category: string;
  }[];
  metric_keys: {
    key: string;
    label: string;
    data_type: 'number' | 'string';
    weight: number;
    is_positive: boolean;
  }[];
  rules: {
    scoring_type: string;
    period_count: number;
    period_duration_minutes: number;
    period_name: 'Quarter' | 'Half' | 'Round' | string;
  };
  created_at: string;
  updated_at: string;
  [key: string]: any;
}

export interface DataDictionaryTournamentRegistry {
  org_id: string;
  name: string;
  organization_name: string;
  registered_by: string;
  status: 'Active' | 'Inactive';
  created_at: string;
  [key: string]: any;
}

export interface DataDictionaryAnthropometricMeasurement {
  measurement_id: string;
  athlete_id: string;
  recorded_by: string;
  height_cm: number | null;
  weight_kg: number | null;
  wingspan_cm: number | null;
  standing_reach_cm: number | null;
  vertical_jump_cm: number | null;
  body_fat_pct: number | null;
  recorded_at: string;
  created_at: string;
  updated_at: string;
  [key: string]: any;
}

