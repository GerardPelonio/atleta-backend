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

export interface SportsConfiguration {
  sport_id: string;                    // Primary Key, UUID, Required
  sport_name: string;                  // Required, Unique, Max 100
  short_identifier: string;            // Required, Unique, Max 20
  configurable_stats: ConfigurableStat[]; // Array of Objects (Required, Min 1 item)
  is_active: boolean;                  // Default: true
  created_at: string;                  // DateTime ISO string, Required, Default: NOW()
  updated_at: string;                  // DateTime ISO string, Required, Default: NOW()
}

// ─── API Payload & DTO Interfaces ─────────────────────────────────────────

export interface CreateSportDTO {
  sport_name: string;
  short_identifier: string;
  configurable_stats: ConfigurableStat[];
  is_active?: boolean;
}

export interface UpdateSportDTO {
  sport_name?: string;
  short_identifier?: string;
  configurable_stats?: ConfigurableStat[];
  is_active?: boolean;
}

export interface SportsListResponse {
  message: string;
  total_sports: number;
  sports: SportsConfiguration[];
}
