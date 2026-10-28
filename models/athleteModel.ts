export interface PhysicalAttributes {
  height_cm: number;
  weight_kg: number;
  wingspan_cm: number;
  vertical_cm: number;
  vertical_jump_cm?: number | null;
  vertical_leap_in?: number | null;
}

export interface AthleteStats {
  ppg: number;
  rpg: number;
  apg: number;
  bpg: number;
  fg_pct: number;
  three_pct: number;
  ft_pct: number;
  efficiency_rating: number;
  wins: number;
  losses: number;
}

export interface AthleteMatch {
  id: string;
  opponent: string;
  result: 'Win' | 'Lose';
  score: string;
  date: string;
}

export interface RadarCompetencies {
  speed: number;
  agility: number;
  power: number;
  iq: number;
  tech: number;
}

export interface AthleteAnalytics {
  scoring_trend: number[]; // Last 10 games
  radar_competencies: RadarCompetencies;
}

export interface AthleteDocument {
  name: string;
  url?: string;
  mimeType?: string;
  size?: number;
  status: 'Pending' | 'Verified' | 'Unverified';
  uploaded_at: string;
}

export interface AthleteAchievement {
  id: string;
  title: string;
  year: string;
  description: string;
}

export interface WeeklyWorkoutLog {
  date: string;
  duration_minutes: number;
  srpe: number;
}

export interface AthleteWorkloadAnalytics {
  target_7day_effort_pts: number;
  current_7day_acute_load: number;
  current_28day_chronic_load: number;
  calculated_acwr: number;
  workout_score: number;
  fatigue_meter: number;
  routine_score: number;
  body_stress_pts: number;
  acute_load_7day_avg: number;
  chronic_load_28day_avg: number;
  acute_load_7d?: number;
  chronic_load_28d?: number;
  acwr_ratio?: number;
  body_stress?: number;
  target_intensity?: number;
  weekly_logs: WeeklyWorkoutLog[];
  recent_entries?: any[];
  updated_at?: string;
}

export interface AthleteWorkloadTarget {
  target_7day_effort_pts: number;
  target_intensity?: number;
  set_by_coach_id?: string;
  notes?: string;
  updated_at?: string;
}

export interface AthleteFullProfile {
  athlete_id: string;
  user_id: string;
  first_name: string;
  last_name: string;
  full_name: string;
  avatar_url: string;
  birthdate: string;
  gender: string;
  position: string;
  location: string;
  province?: string;
  eligible_documents?: any[];
  sport_type: string;
  physical_attributes: PhysicalAttributes;
  height_cm?: number | null;
  weight_kg?: number | null;
  wingspan_cm?: number | null;
  vertical_cm?: number | null;
  vertical_jump_cm?: number | null;
  vertical_leap_in?: number | null;
  computed_metrics: {
    bmi: number; // weight (kg) / height (m)²
    ape_index: number; // wingspan (cm) / height (cm)
  };
  stats: AthleteStats;
  recent_matches: AthleteMatch[];
  analytics: AthleteAnalytics;
  workload_analytics?: AthleteWorkloadAnalytics;
  workload?: AthleteWorkloadAnalytics;
  workload_target?: AthleteWorkloadTarget;
  documents: {
    psa_birth_certificate: AthleteDocument | null;
    proof_of_residency: AthleteDocument | null;
  };
  achievements: AthleteAchievement[];
  player_status?: 'Active' | 'Injured' | 'Prone to Injury' | 'Recovering' | 'Day-to-Day' | string;
  playerStatus?: 'Active' | 'Injured' | 'Prone to Injury' | 'Recovering' | 'Day-to-Day' | string;
  injury_notes?: string;
  injuryNotes?: string;
  excel_tags?: string[];
  excelTags?: string[];
  specialties?: string[];
  past_teams?: PastTeamAffiliation[];
  created_at?: Date;
  updated_at?: Date;
}

export interface PastTeamStatsSummary {
  matches_played: number;
  total_points: number;
  ppg: number;
  total_rebounds: number;
  rpg: number;
  total_assists: number;
  apg: number;
  total_steals: number;
  spg: number;
  total_blocks: number;
  bpg: number;
  total_turnovers: number;
  total_fouls: number;
  fg_pct: number;
  three_pct: number;
  ft_pct: number;
  efficiency_rating: number;
  wins: number;
  losses: number;
  best_time?: string | number;
  top_sprint_time?: string | number;
  events_participated?: number;
}

export interface PastTeamAffiliation {
  team_id: string;
  team_name: string;
  sport_type: string;
  division?: string;
  logo_url?: string;
  coach_name?: string;
  coach_id?: string;
  jersey_number?: number | string | null;
  position?: string;
  joined_at?: string;
  terminated_at?: string;
  status: 'Terminated' | 'Former' | 'Released' | 'Suspended';
  termination_reason?: string;
  stats_summary: PastTeamStatsSummary;
}
