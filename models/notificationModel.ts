export type NotificationType = 'RECRUITMENT_INQUIRY' | 'ACTION_REQUIRED' | 'SYSTEM';

export interface Notification {
  notification_id: string;
  recipient_id: string; // Foreign Key -> Users.user_id
  sender_id?: string | null; // Foreign Key -> Users.user_id
  type: NotificationType;
  title: string;
  message: string;
  is_read: boolean;
  action_url?: string | null;
  created_at: string;
}

export interface PerformanceMetric {
  metric_id: string;
  athlete_id: string;
  calculated_player_efficiency: number;
  sport_category: string;
  sport_stats: {
    points_per_game: number;
    assists: number;
    rebounds_avg: number;
    fg_percentage: number;
    ft_percentage: number;
    three_percentage?: number;
    blocks_avg?: number;
  };
  custom_stats?: Record<string, unknown>;
  timestamp: string;
}

export interface MatchLog {
  match_id: string;
  athlete_id: string;
  sport_type: string;
  match_type: string;
  match_date: string;
  opponent_team_name: string;
  game_result: 'WIN' | 'LOSS' | string;
  points?: number;
  score_breakdown?: string;
}

export interface Team {
  team_id: string;
  team_name: string;
  sport_type: string;
  coach_id: string;
  roster_list: string[];
  timestamp?: string;
}

export interface ShootingEfficiency {
  fg_pct: number;
  three_pct: number;
  ft_pct: number;
  efg_pct: number; // Effective Field Goal Percentage
}

export interface FiveGameTrendItem {
  id: string;
  opponent: string;
  result: string;
  score: string;
  date: string;
  points: number;
}

export interface CurrentTeamSummary {
  team_id: string;
  team_name: string;
  coach_name: string;
  record: string;
  jersey_number?: number;
}

export interface AthleteHomeSummary {
  athlete_id: string;
  sport_category: string;
  personal_analytics: {
    ppg: number;
    rpg: number;
    apg: number;
    bpg: number;
    efficiency_rating: number;
    scoring_trend: number[];
    radar_competencies: Record<string, number>;
  };
  shooting_efficiency: ShootingEfficiency;
  five_game_trend: FiveGameTrendItem[];
  current_team_summary: CurrentTeamSummary | null; // Omitted (null) if no team assignment
  workload_summary?: {
    latest_daily_load: number;
    acute_load_7d: number;
    chronic_load_28d: number;
    acwr_ratio: number;
    risk_level: string;
    risk_description: string;
    days_logged: number;
  };
}
