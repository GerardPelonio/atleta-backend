import { db } from '../utils/firebaseAdmin';
import {
  WorkloadEntry,
  WorkloadAnalyticsResult,
  classifyRiskLevel,
} from '../models/workloadModel';
import { eventBus, EVENTS } from '../utils/eventBus';

// ─── In-Memory Cache (Redis substitute) ─────────────────────────────────────
// Key: "workload:<athleteId>", Value: { data, cachedAt }
// Invalidated on new sRPE log or match certification events.

const workloadCache = new Map<string, { data: WorkloadAnalyticsResult; cachedAt: number }>();
const CACHE_TTL_MS = 60 * 1000; // 60 seconds for fast response (<100ms acceptance criteria)

// Invalidate cache on new sRPE log
eventBus.on(EVENTS.SRPE_LOGGED, (payload?: { athlete_id?: string }) => {
  if (payload?.athlete_id) {
    workloadCache.delete(payload.athlete_id);
    console.log(`[WORKLOAD CACHE] Invalidated for athlete ${payload.athlete_id} (new sRPE log)`);
  }
});

// Invalidate cache on match certification
eventBus.on(EVENTS.MATCH_CERTIFIED, (payload?: { athlete_id?: string }) => {
  if (payload?.athlete_id) {
    workloadCache.delete(payload.athlete_id);
    console.log(`[WORKLOAD CACHE] Invalidated for athlete ${payload.athlete_id} (match certified)`);
  }
});

/**
 * Manually invalidate cache (for testing/admin).
 */
export function invalidateWorkloadCache(athleteId?: string): void {
  if (athleteId) {
    workloadCache.delete(athleteId);
  } else {
    workloadCache.clear();
  }
}

// ─── Math Helpers ───────────────────────────────────────────────────────────

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

function stddev(values: number[]): number {
  if (values.length < 2) return 0;
  const avg = mean(values);
  const squaredDiffs = values.map((v) => (v - avg) ** 2);
  return Math.sqrt(squaredDiffs.reduce((sum, v) => sum + v, 0) / values.length);
}

function sum(values: number[]): number {
  return values.reduce((s, v) => s + v, 0);
}

function round(value: number, decimals: number = 2): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

// ─── Service Functions ──────────────────────────────────────────────────────

/**
 * Log a daily sRPE entry to Firestore Workload_Analysis collection.
 * Can be logged by the coach on behalf of the athlete or by the athlete themselves.
 * Computes daily_load = session_duration_mins × srpe_score.
 * Emits SRPE_LOGGED event to invalidate cache.
 */
export async function logSrpeEntry(params: {
  athlete_id: string;
  session_duration_mins: number;
  srpe_score: number;
  entry_date: string;
  logged_by_coach_id?: string;
  logged_by_name?: string;
  notes?: string;
  session_type?: string;
}): Promise<WorkloadEntry> {
  const workloadId = `wl_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const dailyLoad = params.session_duration_mins * params.srpe_score;
  const now = new Date().toISOString();

  const entry: WorkloadEntry = {
    workload_id: workloadId,
    athlete_id: params.athlete_id,
    session_duration_mins: params.session_duration_mins,
    srpe_score: params.srpe_score,
    daily_load: dailyLoad,
    entry_date: params.entry_date,
    logged_by_coach_id: params.logged_by_coach_id || undefined,
    logged_by_name: params.logged_by_name || undefined,
    notes: params.notes || undefined,
    session_type: params.session_type || 'Practice',
    created_at: now,
  };

  // Clean undefined properties before Firestore write
  const cleanEntry = Object.fromEntries(
    Object.entries(entry).filter(([_, v]) => v !== undefined)
  );

  await db.collection('Workload_Analysis').doc(workloadId).set(cleanEntry);

  // Emit event to invalidate all caches (workload, home summary, scouting profile)
  eventBus.emit(EVENTS.SRPE_LOGGED, { athlete_id: params.athlete_id });

  console.log(`[WORKLOAD] Logged sRPE entry for athlete ${params.athlete_id}: duration=${params.session_duration_mins}min, sRPE=${params.srpe_score}, daily_load=${dailyLoad}, logged_by=${params.logged_by_coach_id || 'self'}`);

  return entry;
}

/**
 * Retrieve calculated workload analytics for an athlete.
 *
 * ACCEPTANCE CRITERIA:
 * - Athletes with < 28 days of baseline data → returns null (signals 404).
 * - Cached queries respond in < 100ms.
 *
 * FORMULAS:
 * - Daily Load = session_duration_mins × srpe_score
 * - Acute Load = mean of last 7 days' daily loads
 * - Chronic Load = mean of last 28 days' daily loads
 * - ACWR = acute_load / chronic_load
 * - Z-Score = (today_load − mean_30d) / stddev_30d
 * - Monotony = mean_7d / stddev_7d
 * - Strain = sum_7d × monotony
 */
export async function getWorkloadAnalytics(athleteId: string): Promise<WorkloadAnalyticsResult | null> {
  // 1. Check cache first (< 100ms response requirement)
  const cached = workloadCache.get(athleteId);
  if (cached && Date.now() - cached.cachedAt < CACHE_TTL_MS) {
    return cached.data;
  }

  // 2. Fetch all workload entries for this athlete from Firestore
  const snapshot = await db
    .collection('Workload_Analysis')
    .where('athlete_id', '==', athleteId)
    .get();

  // Collect entries
  const entries: WorkloadEntry[] = [];
  snapshot.forEach((doc) => {
    entries.push(doc.data() as WorkloadEntry);
  });

  // 3. ACCEPTANCE CRITERIA: < 28 days of data → null (404)
  // Count unique entry dates
  const uniqueDates = new Set(entries.map((e) => e.entry_date));
  if (uniqueDates.size < 28) {
    return null;
  }

  // 4. Sort entries by entry_date descending for rolling window calculations
  const sortedEntries = [...entries].sort(
    (a, b) => new Date(b.entry_date).getTime() - new Date(a.entry_date).getTime()
  );

  const allDailyLoads = sortedEntries.map((e) => e.daily_load);
  const latestDailyLoad = allDailyLoads[0] || 0;

  // Last 7 days' daily loads
  const loads7d = allDailyLoads.slice(0, 7);
  // Last 28 days' daily loads
  const loads28d = allDailyLoads.slice(0, 28);
  // Last 30 days' daily loads (for Z-Score)
  const loads30d = allDailyLoads.slice(0, 30);

  // 5. Compute all formulas
  const acuteLoad = round(mean(loads7d));
  const chronicLoad = round(mean(loads28d));

  // ACWR = Acute / Chronic (guard against division by zero)
  const acwrRatio = chronicLoad > 0 ? round(acuteLoad / chronicLoad) : 0;

  // Z-Score = (today_load − μ₃₀) / σ₃₀
  const mean30d = mean(loads30d);
  const stddev30d = stddev(loads30d);
  const zScore = stddev30d > 0 ? round((latestDailyLoad - mean30d) / stddev30d) : 0;

  // Monotony = mean_7d / stddev_7d
  const mean7d = mean(loads7d);
  const stddev7d = stddev(loads7d);
  const monotonyScore = stddev7d > 0 ? round(mean7d / stddev7d) : 0;

  // Strain = sum_7d × monotony
  const sum7d = sum(loads7d);
  const strainScore = round(sum7d * monotonyScore);

  // 6. Risk classification
  const risk = classifyRiskLevel(acwrRatio);

  const result: WorkloadAnalyticsResult = {
    athlete_id: athleteId,
    total_entries: entries.length,
    latest_daily_load: latestDailyLoad,
    acute_load: acuteLoad,
    chronic_load: chronicLoad,
    acwr_ratio: acwrRatio,
    monotony_score: monotonyScore,
    strain_score: strainScore,
    z_score: zScore,
    risk_level: risk.level,
    risk_description: risk.description,
    daily_loads_7d: loads7d,
    daily_loads_28d: loads28d,
    recent_entries: sortedEntries.slice(0, 10),
    computed_at: new Date().toISOString(),
  };

  // 7. Cache the result
  workloadCache.set(athleteId, { data: result, cachedAt: Date.now() });

  return result;
}

/**
 * Retrieve athlete workload summary & recent session logs.
 * Accessible by both coach and athlete dashboards.
 */
export async function getAthleteWorkloadSummary(athleteId: string): Promise<any> {
  // Parallel fetch athlete existence and entries
  const [athleteCheck, snapshot] = await Promise.all([
    db.collection('Athlete_Profiles').doc(athleteId).get().then(async (d) => {
      if (d.exists) return true;
      const u = await db.collection('Users').doc(athleteId).get();
      return u.exists;
    }),
    db.collection('Workload_Analysis').where('athlete_id', '==', athleteId).get(),
  ]);

  if (!athleteCheck) {
    const { ServiceError } = require('../validators/matchValidator');
    throw new ServiceError(`Athlete with ID '${athleteId}' was not found.`, 404);
  }

  const entries: WorkloadEntry[] = [];
  snapshot.forEach((doc) => {
    entries.push(doc.data() as WorkloadEntry);
  });

  const sortedEntries = [...entries].sort(
    (a, b) => new Date(b.entry_date || b.created_at).getTime() - new Date(a.entry_date || a.created_at).getTime()
  );

  const uniqueDates = new Set(entries.map((e) => e.entry_date));
  const loads = sortedEntries.map((e) => Number(e.daily_load || 0));
  const latestDailyLoad = loads[0] || 0;
  const loads7d = loads.slice(0, 7);
  const loads28d = loads.slice(0, 28);

  const acuteLoad = loads7d.length > 0 ? round(mean(loads7d)) : 0;
  const chronicLoad = loads28d.length > 0 ? round(mean(loads28d)) : (acuteLoad || 400);
  const acwrRatio = chronicLoad > 0 ? round(acuteLoad / chronicLoad) : 1.0;
  const risk = classifyRiskLevel(acwrRatio);

  return {
    athlete_id: athleteId,
    total_entries_logged: entries.length,
    unique_days_logged: uniqueDates.size,
    has_28_day_baseline: uniqueDates.size >= 28,
    days_until_baseline: Math.max(0, 28 - uniqueDates.size),
    latest_daily_load: latestDailyLoad,
    acute_load_7d: acuteLoad,
    chronic_load_28d: chronicLoad,
    acwr_ratio: acwrRatio,
    risk_level: risk.level,
    risk_description: risk.description,
    daily_loads_7d: loads7d,
    recent_entries: sortedEntries.slice(0, 15),
    computed_at: new Date().toISOString(),
  };
}

