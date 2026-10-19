// ─── Sports Configuration Entity ───────────────────────────────────────────
// Stored in Firestore "Sports_Configurations" collection.

export type MeasurementCategory =
  | 'Cumulative Total'
  | 'Percentage'
  | 'Time (ms)'
  | 'Distance (m)'
  | 'Count';

export interface ConfigurableStat {
  stat_name_key: string;               // Required, Snake_Case format, Max 100
  measurement_category: MeasurementCategory; // Enum, Required
  label?: string;                      // Optional human readable label
  description?: string;                // Optional description
}

export interface MetricKeyDefinition {
  key: string;
  label: string;
  data_type: 'number' | 'string';
  weight: number;
  is_positive: boolean;
  [key: string]: any;
}

export interface SportRules {
  scoring_type: string;
  period_count: number;
  period_duration_minutes: number;
  period_name: 'Quarter' | 'Half' | 'Round' | string;
  [key: string]: any;
}

export interface SportsConfiguration {
  sport_id: string;                    // Primary Key, UUID, Required
  canonical_id?: string;               // Canonical identifier string
  sport_name: string;                  // Required, Unique, Max 100
  short_identifier: string;            // Required, Unique, Max 20
  category?: 'Team' | 'Individual' | string;
  is_active: boolean;                  // Default: true
  is_timed_sport?: boolean;
  measurement_type?: string;
  configurable_stats: ConfigurableStat[]; // Array of Objects (Required, Min 1 item)
  metric_keys?: MetricKeyDefinition[];
  rules?: SportRules;
  stat_schema?: Record<string, any>;
  positions?: string[];
  scoring_rules?: Record<string, unknown>;
  created_at: string;                  // DateTime ISO string, Required, Default: NOW()
  updated_at: string;                  // DateTime ISO string, Required, Default: NOW()
  [key: string]: any;
}

// ─── API Payload & DTO Interfaces ─────────────────────────────────────────

export interface CreateSportDTO {
  sport_name: string;
  short_identifier: string;
  configurable_stats: ConfigurableStat[];
  stat_schema?: Record<string, any>;
  positions?: string[];
  scoring_rules?: Record<string, unknown>;
  category?: string;
  is_timed_sport?: boolean;
  is_active?: boolean;
}

export interface UpdateSportDTO {
  sport_name?: string;
  short_identifier?: string;
  configurable_stats?: ConfigurableStat[];
  stat_schema?: Record<string, any>;
  positions?: string[];
  scoring_rules?: Record<string, unknown>;
  category?: string;
  is_timed_sport?: boolean;
  is_active?: boolean;
}

export interface SportsListResponse {
  message: string;
  total_sports: number;
  sports: SportsConfiguration[];
}
