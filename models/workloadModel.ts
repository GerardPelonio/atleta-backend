// ─── Workload Analysis Entity ────────────────────────────────────────────────
// Stored in Firestore "Workload_Analysis" collection, one doc per daily sRPE log.

export interface WorkloadEntry {
  workload_id: string;          // Primary Key, auto-generated
  athlete_id: string;           // Foreign Key → Athlete.athlete_id
  session_duration_mins: number; // Required, > 0
  srpe_score: number;           // Required, 1–10
  daily_load: number;           // Computed: session_duration_mins × srpe_score
  entry_date: string;           // ISO date string (YYYY-MM-DD)
  logged_by_coach_id?: string;  // Optional: Coach who logged this entry
  logged_by_name?: string;      // Optional: Name of coach or logger
  notes?: string;               // Optional: Coach notes
  session_type?: string;        // Optional: "Practice" | "Conditioning" | "Game" | "Recovery"
  created_at: string;           // ISO datetime
}

// ─── Computed Analytics Response Payload ─────────────────────────────────────

export type RiskLevel = 'LOW' | 'MODERATE' | 'HIGH' | 'CRITICAL';

export interface WorkloadAnalyticsResult {
  athlete_id: string;
  total_entries: number;
  latest_daily_load: number;

  // Rolling averages
  acute_load: number;   // 7-day rolling average of daily_load
  chronic_load: number; // 28-day rolling average of daily_load

  // Computed metrics
  acwr_ratio: number;     // Fatigue Meter = acute_load / chronic_load
  monotony_score: number; // Workout Routine Score = mean_7d / stddev_7d
  strain_score: number;   // Total Body Stress = sum_7d × monotony
  z_score: number;        // Workout Spike Alert = (today − μ₃₀) / σ₃₀

  // Risk classification
  risk_level: RiskLevel;
  risk_description: string;

  // Trend data for visualization
  daily_loads_7d: number[];
  daily_loads_28d: number[];

  // Recent workout sessions
  recent_entries?: WorkloadEntry[];

  computed_at: string; // ISO datetime
}

// ─── Risk Level Thresholds ──────────────────────────────────────────────────

export const ACWR_THRESHOLDS = {
  LOW_MAX: 0.8,       // Under-training zone
  MODERATE_MAX: 1.3,  // Optimal / sweet-spot zone
  HIGH_MAX: 1.5,      // Caution zone
  // > 1.5 = CRITICAL (injury risk)
} as const;

export function classifyRiskLevel(acwr: number): { level: RiskLevel; description: string } {
  if (acwr < ACWR_THRESHOLDS.LOW_MAX) {
    return { level: 'LOW', description: 'Under-training zone. Consider increasing workload gradually.' };
  }
  if (acwr <= ACWR_THRESHOLDS.MODERATE_MAX) {
    return { level: 'MODERATE', description: 'Optimal training zone. Keep up the balanced workload!' };
  }
  if (acwr <= ACWR_THRESHOLDS.HIGH_MAX) {
    return { level: 'HIGH', description: 'Caution! Fatigue is building. Monitor recovery closely.' };
  }
  return { level: 'CRITICAL', description: 'Injury risk! Workload spike detected. Reduce intensity immediately.' };
}
