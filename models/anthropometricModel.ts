// ─── Anthropometric Measurements Entity ─────────────────────────────────────
// Stored in Firestore "Anthropometric_Measurements" collection.

export interface AnthropometricMeasurement {
  measurement_id: string;       // Primary Key, String/UUID, Required
  athlete_id: string;           // Foreign Key -> Athlete_Profiles.athlete_id, Required
  recorded_by: string;          // String/UUID (coach_id or recorded user UUID)
  height_cm: number | null;     // Float / Integer
  weight_kg: number | null;     // Float / Integer
  wingspan_cm: number | null;   // Float / Integer
  standing_reach_cm: number | null; // Float / Integer
  vertical_jump_cm: number | null;  // Float / Integer
  body_fat_pct: number | null;  // Float (percentage)
  recorded_at: string;          // Timestamp/ISO8601
  created_at: string;           // Timestamp/ISO8601
  updated_at: string;           // Timestamp/ISO8601
  [key: string]: any;
}

export interface SaveAnthropometricDto {
  athlete_id: string;
  recorded_by?: string;
  height_cm?: number | null;
  weight_kg?: number | null;
  wingspan_cm?: number | null;
  standing_reach_cm?: number | null;
  vertical_jump_cm?: number | null;
  body_fat_pct?: number | null;
  recorded_at?: string;
}
