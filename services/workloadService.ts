import { db } from '../utils/firebaseAdmin';
import {
  WorkloadEntry,
  WorkloadAnalyticsResult,
  classifyRiskLevel,
} from '../models/workloadModel';
import { AthleteWorkloadAnalytics } from '../models/athleteModel';
import { eventBus, EVENTS } from '../utils/eventBus';

// In-memory cache for workload analytics queries (TTL: 60 seconds)
const CACHE_TTL_MS = 60 * 1000;
const workloadCache = new Map<string, { data: WorkloadAnalyticsResult; cachedAt: number }>();

// Listen for new sRPE logs to invalidate cache
eventBus.on(EVENTS.SRPE_LOGGED, (payload?: { athlete_id?: string }) => {
  if (payload?.athlete_id) {
    workloadCache.delete(payload.athlete_id);
    workloadCache.delete(payload.athlete_id.replace(/^ath_/, ''));
    workloadCache.delete(`ath_${payload.athlete_id}`);
  } else {
    workloadCache.clear();
  }
});

// ─── Mathematical Helpers ───────────────────────────────────────────────────

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((s, v) => s + v, 0) / values.length;
}

function stddev(values: number[]): number {
  if (values.length < 2) return 0;
  const m = mean(values);
  const variance = values.reduce((s, v) => s + (v - m) ** 2, 0) / values.length;
  return Math.sqrt(variance);
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
 * Connects directly to Athlete_Profiles schema and saves computed metrics.
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

  const canonicalAthleteId = params.athlete_id.startsWith('ath_')
    ? params.athlete_id
    : `ath_${params.athlete_id}`;
  const rawUid = params.athlete_id.replace(/^ath_/, '');

  const entry: WorkloadEntry = {
    workload_id: workloadId,
    athlete_id: canonicalAthleteId,
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

  // 1. Save entry to Workload_Analysis collection
  await db.collection('Workload_Analysis').doc(workloadId).set(cleanEntry);

  // 2. Fetch coach target and existing profile from Athlete_Profiles or Users
  let profileDoc = await db.collection('Athlete_Profiles').doc(canonicalAthleteId).get();
  if (!profileDoc.exists) {
    profileDoc = await db.collection('Athlete_Profiles').doc(rawUid).get();
  }
  const profileData = profileDoc.exists ? profileDoc.data()! : {};
  const coachTarget = profileData.workload_target || {};
  const targetEffort = Number(coachTarget.target_7day_effort_pts || profileData.workload_analytics?.target_7day_effort_pts || 0);
  const targetIntensity = coachTarget.target_intensity ? Number(coachTarget.target_intensity) : Number(profileData.workload_analytics?.target_intensity || 0);

  // 3. Fetch all entries to compute live aggregate metrics
  const snapshot = await db
    .collection('Workload_Analysis')
    .where('athlete_id', 'in', [canonicalAthleteId, rawUid, params.athlete_id])
    .get();

  const entries: WorkloadEntry[] = [];
  snapshot.forEach((doc) => {
    entries.push(doc.data() as WorkloadEntry);
  });

  const sortedEntries = [...entries].sort(
    (a, b) => new Date(b.entry_date || b.created_at).getTime() - new Date(a.entry_date || a.created_at).getTime()
  );

  const loads = sortedEntries.map((e) => Number(e.daily_load || 0));
  const loads7d = loads.slice(0, 7);
  const loads28d = loads.slice(0, 28);

  const acuteLoadSum = loads7d.reduce((a, b) => a + b, 0);
  const chronicLoadAvg = loads28d.length > 0 ? round(loads28d.reduce((a, b) => a + b, 0) / loads28d.length) : 0;
  const acwrRatio = chronicLoadAvg > 0 ? round(acuteLoadSum / chronicLoadAvg) : 0;

  const mean7d = loads7d.length > 0 ? mean(loads7d) : dailyLoad;
  const std7d = loads7d.length > 0 ? stddev(loads7d) : 0;
  const routineScore = std7d > 0 ? round(mean7d / std7d) : (loads7d.length > 0 ? 1.0 : 0);
  const bodyStress = Math.round(acuteLoadSum * routineScore);

  const weeklyLogs = sortedEntries.slice(0, 7).map((e) => ({
    date: e.entry_date || 'DAY',
    duration_minutes: Number(e.session_duration_mins || 0),
    srpe: Number(e.srpe_score || 0),
  }));

  // 4. Connect to Athlete_Profiles and Coach schema and save
  const computedWorkloadAnalytics: AthleteWorkloadAnalytics = {
    target_7day_effort_pts: targetEffort,
    current_7day_acute_load: acuteLoadSum,
    current_28day_chronic_load: chronicLoadAvg,
    calculated_acwr: acwrRatio,
    workout_score: dailyLoad,
    fatigue_meter: acwrRatio,
    routine_score: routineScore,
    body_stress_pts: bodyStress,
    acute_load_7day_avg: acuteLoadSum,
    chronic_load_28day_avg: chronicLoadAvg,
    acute_load_7d: acuteLoadSum,
    chronic_load_28d: chronicLoadAvg,
    acwr_ratio: acwrRatio,
    body_stress: bodyStress,
    target_intensity: targetIntensity,
    weekly_logs: weeklyLogs,
    recent_entries: sortedEntries.slice(0, 15),
    updated_at: now,
  };

  await Promise.all([
    db.collection('Athlete_Profiles').doc(canonicalAthleteId).set(
      {
        workload_analytics: computedWorkloadAnalytics,
        workload: computedWorkloadAnalytics,
        updated_at: new Date(),
      },
      { merge: true }
    ),
    db.collection('Athlete_Profiles').doc(rawUid).set(
      {
        workload_analytics: computedWorkloadAnalytics,
        workload: computedWorkloadAnalytics,
        updated_at: new Date(),
      },
      { merge: true }
    ),
    db.collection('Users').doc(rawUid).set(
      {
        workload_analytics: computedWorkloadAnalytics,
        workload: computedWorkloadAnalytics,
        updated_at: new Date(),
      },
      { merge: true }
    ),
    db.collection('Users').doc(canonicalAthleteId).set(
      {
        workload_analytics: computedWorkloadAnalytics,
        workload: computedWorkloadAnalytics,
        updated_at: new Date(),
      },
      { merge: true }
    ),
  ]);

  // Invalidate in-memory caches
  workloadCache.delete(canonicalAthleteId);
  workloadCache.delete(rawUid);
  workloadCache.delete(params.athlete_id);
  eventBus.emit(EVENTS.SRPE_LOGGED, { athlete_id: canonicalAthleteId });

  console.log(`[WORKLOAD] Logged sRPE entry and updated Athlete_Profiles for ${canonicalAthleteId}: dailyLoad=${dailyLoad}, ACWR=${acwrRatio}, Coach Target=${targetEffort}`);

  return entry;
}

/**
 * Retrieve calculated workload analytics for an athlete.
 */
export async function getWorkloadAnalytics(athleteId: string): Promise<WorkloadAnalyticsResult | null> {
  const canonicalAthleteId = athleteId.startsWith('ath_') ? athleteId : `ath_${athleteId}`;
  const rawUid = athleteId.replace(/^ath_/, '');

  // 1. Check cache
  const cached = workloadCache.get(canonicalAthleteId);
  if (cached && Date.now() - cached.cachedAt < CACHE_TTL_MS) {
    return cached.data;
  }

  // 2. Fetch entries
  const snapshot = await db
    .collection('Workload_Analysis')
    .where('athlete_id', 'in', [canonicalAthleteId, rawUid, athleteId])
    .get();

  const entries: WorkloadEntry[] = [];
  snapshot.forEach((doc) => {
    entries.push(doc.data() as WorkloadEntry);
  });

  const sortedEntries = [...entries].sort(
    (a, b) => new Date(b.entry_date || b.created_at).getTime() - new Date(a.entry_date || a.created_at).getTime()
  );

  const allDailyLoads = sortedEntries.map((e) => e.daily_load);
  const latestDailyLoad = allDailyLoads[0] || 0;
  const loads7d = allDailyLoads.slice(0, 7);
  const loads28d = allDailyLoads.slice(0, 28);
  const loads30d = allDailyLoads.slice(0, 30);

  const acuteLoad = loads7d.length > 0 ? round(sum(loads7d)) : 0;
  const chronicLoad = loads28d.length > 0 ? round(mean(loads28d)) : 380;
  const acwrRatio = chronicLoad > 0 ? round(acuteLoad / chronicLoad) : 1.0;

  const mean30d = mean(loads30d);
  const stddev30d = stddev(loads30d);
  const zScore = stddev30d > 0 ? round((latestDailyLoad - mean30d) / stddev30d) : 0;

  const mean7d = mean(loads7d);
  const stddev7d = stddev(loads7d);
  const monotonyScore = stddev7d > 0 ? round(mean7d / stddev7d) : 1.25;
  const strainScore = round(acuteLoad * monotonyScore);

  const risk = classifyRiskLevel(acwrRatio);

  const result: WorkloadAnalyticsResult = {
    athlete_id: canonicalAthleteId,
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

  workloadCache.set(canonicalAthleteId, { data: result, cachedAt: Date.now() });

  return result;
}

/**
 * Retrieve athlete workload summary & recent session logs.
 * Synchronized with Athlete_Profiles collection.
 */
export async function getAthleteWorkloadSummary(athleteId: string): Promise<any> {
  const canonicalAthleteId = athleteId.startsWith('ath_') ? athleteId : `ath_${athleteId}`;
  const rawUid = athleteId.replace(/^ath_/, '');

  const snapshot = await db
    .collection('Workload_Analysis')
    .where('athlete_id', 'in', [canonicalAthleteId, rawUid, athleteId])
    .get();

  const entries: WorkloadEntry[] = [];
  snapshot.forEach((doc) => {
    entries.push(doc.data() as WorkloadEntry);
  });

  // Fetch coach target from Athlete_Profiles
  let profileDoc = await db.collection('Athlete_Profiles').doc(canonicalAthleteId).get();
  if (!profileDoc.exists) {
    profileDoc = await db.collection('Athlete_Profiles').doc(rawUid).get();
  }
  const profileData = profileDoc.exists ? profileDoc.data()! : {};
  const savedWorkload = profileData.workload_analytics || profileData.workload || {};
  const coachTarget = profileData.workload_target || {};

  const sortedEntries = [...entries].sort(
    (a, b) => new Date(b.entry_date || b.created_at).getTime() - new Date(a.entry_date || a.created_at).getTime()
  );

  const loads = sortedEntries.map((e) => Number(e.daily_load || 0));
  const loads7d = loads.slice(0, 7);
  const loads28d = loads.slice(0, 28);

  const latestDailyLoad = loads[0] || Number(savedWorkload.workout_score || 0);
  const acuteLoadSum = loads7d.length > 0
    ? loads7d.reduce((a, b) => a + b, 0)
    : Number(savedWorkload.acute_load_7day_avg || 0);
  const chronicLoadAvg = loads28d.length > 0
    ? round(loads28d.reduce((a, b) => a + b, 0) / loads28d.length)
    : Number(savedWorkload.chronic_load_28day_avg || 0);
  const acwrRatio = chronicLoadAvg > 0 ? round(acuteLoadSum / chronicLoadAvg) : 0;

  const mean7d = loads7d.length > 0 ? mean(loads7d) : 0;
  const std7d = loads7d.length > 0 ? stddev(loads7d) : 0;
  const routineScore = std7d > 0 ? round(mean7d / std7d) : (loads7d.length > 0 ? 1.0 : Number(savedWorkload.routine_score || 0));
  const bodyStress = Math.round(acuteLoadSum * routineScore);

  const weeklyLogs = sortedEntries.length > 0
    ? sortedEntries.slice(0, 7).map((e) => ({
        date: e.entry_date ? String(e.entry_date).slice(5) : 'DAY',
        duration_minutes: Number(e.session_duration_mins || 0),
        srpe: Number(e.srpe_score || 0),
      }))
    : (savedWorkload.weekly_logs || []);

  const risk = classifyRiskLevel(acwrRatio);

  const result = {
    athlete_id: canonicalAthleteId,
    total_entries_logged: entries.length,
    unique_days_logged: new Set(entries.map(e => e.entry_date)).size,
    has_28_day_baseline: entries.length >= 28,
    days_until_baseline: Math.max(0, 28 - entries.length),
    latest_daily_load: latestDailyLoad,
    workout_score: latestDailyLoad,
    current_7day_acute_load: acuteLoadSum,
    current_28day_chronic_load: chronicLoadAvg,
    acute_load_7day_avg: acuteLoadSum,
    chronic_load_28day_avg: chronicLoadAvg,
    acute_load_7d: acuteLoadSum,
    chronic_load_28d: chronicLoadAvg,
    acute_load: acuteLoadSum,
    chronic_load: chronicLoadAvg,
    calculated_acwr: acwrRatio,
    acwr_ratio: acwrRatio,
    fatigue_meter: acwrRatio,
    routine_score: routineScore,
    body_stress: bodyStress,
    body_stress_pts: bodyStress,
    target_7day_effort_pts: coachTarget.target_7day_effort_pts || savedWorkload.target_7day_effort_pts || 400,
    target_intensity: coachTarget.target_intensity || savedWorkload.target_intensity || 8,
    workload_target: coachTarget,
    risk_level: risk.level,
    risk_description: risk.description,
    daily_loads_7d: loads7d,
    daily_loads_28d: loads28d,
    weekly_logs: weeklyLogs,
    recent_entries: sortedEntries.slice(0, 15),
    computed_at: new Date().toISOString(),
  };

  return result;
}

/**
 * Coach sets target workload for an athlete.
 * Persists in Athlete_Profiles schema.
 */
export async function setAthleteWorkloadTarget(
  coachId: string,
  athleteId: string,
  targetData: {
    target_7day_effort_pts: number;
    target_intensity?: number;
    notes?: string;
  }
) {
  const canonicalAthleteId = athleteId.startsWith('ath_') ? athleteId : `ath_${athleteId}`;
  const rawUid = athleteId.replace(/^ath_/, '');
  const now = new Date().toISOString();

  const workloadTarget = {
    target_7day_effort_pts: Number(targetData.target_7day_effort_pts) || 400,
    target_intensity: targetData.target_intensity ? Number(targetData.target_intensity) : undefined,
    set_by_coach_id: coachId,
    notes: targetData.notes || undefined,
    updated_at: now,
  };

  const cleanTarget = Object.fromEntries(
    Object.entries(workloadTarget).filter(([_, v]) => v !== undefined)
  );

  await Promise.all([
    db.collection('Athlete_Profiles').doc(canonicalAthleteId).set(
      {
        workload_target: cleanTarget,
        workload_analytics: {
          target_7day_effort_pts: cleanTarget.target_7day_effort_pts,
          target_intensity: cleanTarget.target_intensity || 8,
        },
        workload: {
          target_7day_effort_pts: cleanTarget.target_7day_effort_pts,
          target_intensity: cleanTarget.target_intensity || 8,
        },
        updated_at: new Date(),
      },
      { merge: true }
    ),
    db.collection('Athlete_Profiles').doc(rawUid).set(
      {
        workload_target: cleanTarget,
        workload_analytics: {
          target_7day_effort_pts: cleanTarget.target_7day_effort_pts,
          target_intensity: cleanTarget.target_intensity || 8,
        },
        workload: {
          target_7day_effort_pts: cleanTarget.target_7day_effort_pts,
          target_intensity: cleanTarget.target_intensity || 8,
        },
        updated_at: new Date(),
      },
      { merge: true }
    ),
    db.collection('Users').doc(rawUid).set(
      {
        workload_target: cleanTarget,
        workload_analytics: {
          target_7day_effort_pts: cleanTarget.target_7day_effort_pts,
          target_intensity: cleanTarget.target_intensity || 8,
        },
        workload: {
          target_7day_effort_pts: cleanTarget.target_7day_effort_pts,
          target_intensity: cleanTarget.target_intensity || 8,
        },
        updated_at: new Date(),
      },
      { merge: true }
    ),
    db.collection('Users').doc(canonicalAthleteId).set(
      {
        workload_target: cleanTarget,
        workload_analytics: {
          target_7day_effort_pts: cleanTarget.target_7day_effort_pts,
          target_intensity: cleanTarget.target_intensity || 8,
        },
        workload: {
          target_7day_effort_pts: cleanTarget.target_7day_effort_pts,
          target_intensity: cleanTarget.target_intensity || 8,
        },
        updated_at: new Date(),
      },
      { merge: true }
    ),
  ]);

  // Invalidate in-memory caches
  workloadCache.delete(canonicalAthleteId);
  workloadCache.delete(rawUid);
  workloadCache.delete(athleteId);

  return {
    message: 'Workload target set successfully.',
    athlete_id: canonicalAthleteId,
    workload_target: cleanTarget,
  };
}
