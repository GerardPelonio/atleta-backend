import dotenv from 'dotenv';
dotenv.config();

import jwt from 'jsonwebtoken';
import { db } from '../utils/firebaseAdmin';
import { logSrpeEntry, getAthleteWorkloadSummary } from '../services/workloadService';
import { getAthleteHomeSummary } from '../services/athleteService';

console.log('==========================================================');
console.log('COACH WORKLOAD INPUT & ATHLETE VISIBILITY TEST');
console.log('==========================================================\n');

let passed = 0;
let total = 0;

function assert(condition: boolean, testName: string) {
  total++;
  if (condition) {
    console.log(`✅ [PASS] ${testName}`);
    passed++;
  } else {
    console.error(`❌ [FAIL] ${testName}`);
  }
}

async function runTests() {
  const timestamp = Date.now();
  const testCoachId = `coach_wl_${timestamp}`;
  const testAthId = `ath_wl_${timestamp}`;

  // 1. Seed Athlete Profile & User
  await db.collection('Users').doc(testAthId).set({
    user_id: testAthId,
    first_name: 'Kai',
    last_name: 'Sotto',
    email: `kai_${timestamp}@atleta.ph`,
    role: 'Athlete',
    gender: 'Male',
    province: 'NCR',
  });

  await db.collection('Athlete_Profiles').doc(testAthId).set({
    athlete_id: testAthId,
    user_id: testAthId,
    first_name: 'Kai',
    last_name: 'Sotto',
    sport_type: 'Basketball',
    position: 'Center',
    jersey_number: 11,
    province: 'NCR',
    stats: {
      ppg: 18.5,
      rpg: 12.4,
      apg: 3.2,
      bpg: 2.8,
      fg_pct: 54.2,
      three_pct: 32.0,
      ft_pct: 78.5,
      efficiency_rating: 29.4,
    },
  });

  console.log('--- 1. Testing Coach Input of Workload ---');

  // Coach inputs Session 1: 90 mins, sRPE 8 (Intense scrimmage)
  const session1 = await logSrpeEntry({
    athlete_id: testAthId,
    session_duration_mins: 90,
    srpe_score: 8,
    entry_date: '2026-08-15',
    logged_by_coach_id: testCoachId,
    notes: 'Intense 5v5 full court transition drills',
    session_type: 'Practice',
  });

  assert(session1.workload_id.startsWith('wl_'), 'Session 1 logged with generated workload_id');
  assert(session1.daily_load === 720, `Daily load computed correctly: 90 * 8 = 720 (Actual: ${session1.daily_load})`);
  assert(session1.logged_by_coach_id === testCoachId, 'Coach ID stored in workload entry');
  assert(session1.notes === 'Intense 5v5 full court transition drills', 'Coach workout notes stored');
  assert(session1.session_type === 'Practice', 'Session type stored');

  // Coach inputs Session 2: 60 mins, sRPE 6 (Shooting & tactical)
  const session2 = await logSrpeEntry({
    athlete_id: testAthId,
    session_duration_mins: 60,
    srpe_score: 6,
    entry_date: '2026-08-16',
    logged_by_coach_id: testCoachId,
    notes: 'Set plays, pick and pop shooting drill',
    session_type: 'Tactical',
  });

  assert(session2.daily_load === 360, `Daily load computed correctly: 60 * 6 = 360 (Actual: ${session2.daily_load})`);

  console.log('\n--- 2. Testing Athlete Workload Summary & Recent Sessions Output ---');

  const athleteWorkload = await getAthleteWorkloadSummary(testAthId);
  assert(athleteWorkload.athlete_id === testAthId, 'Workload summary retrieved for athlete');
  assert(athleteWorkload.total_entries_logged === 2, 'Total logged workout sessions count = 2');
  assert(athleteWorkload.latest_daily_load === 360, `Latest daily load returned: 360 (Actual: ${athleteWorkload.latest_daily_load})`);
  assert(athleteWorkload.acute_load_7d > 0, `7-day acute load calculated (Actual: ${athleteWorkload.acute_load_7d})`);
  assert(athleteWorkload.recent_entries.length === 2, 'Recent workout sessions list returned to athlete');
  assert(athleteWorkload.recent_entries[0].notes === 'Set plays, pick and pop shooting drill', 'Athlete sees coach notes on recent session');
  assert(athleteWorkload.recent_entries[0].logged_by_coach_id === testCoachId, 'Athlete sees coach attribution on workout log');

  console.log('\n--- 3. Testing Athlete Home Dashboard Integration ---');

  const homeSummary = await getAthleteHomeSummary(testAthId);
  assert(homeSummary !== null, 'Athlete home dashboard summary retrieved');
  assert(!!homeSummary?.workload_summary, 'Athlete home summary includes workload_summary widget');
  assert(homeSummary?.workload_summary?.latest_daily_load === 360, 'Athlete home summary reflects coach-inputted latest daily load');
  assert(!!homeSummary?.workload_summary?.risk_level, 'Athlete home summary reflects fatigue meter risk level');
  assert(!!homeSummary?.workload_summary?.risk_description, 'Athlete home summary reflects risk advice description');

  console.log('\n--- 4. Testing Real-Time Cache Invalidation on New Coach Workload Input ---');

  // Coach inputs Session 3: 120 mins, sRPE 9 (High intensity scrimmage)
  await logSrpeEntry({
    athlete_id: testAthId,
    session_duration_mins: 120,
    srpe_score: 9,
    entry_date: '2026-08-17',
    logged_by_coach_id: testCoachId,
    notes: 'Pre-season tournament simulation',
    session_type: 'Game',
  });

  // Fetch home summary again: should immediately reflect 120 * 9 = 1080 without stale cache
  const updatedHomeSummary = await getAthleteHomeSummary(testAthId);
  assert(
    updatedHomeSummary?.workload_summary?.latest_daily_load === 1080,
    `Home dashboard cache immediately updated on new coach input: expected 1080 (Actual: ${updatedHomeSummary?.workload_summary?.latest_daily_load})`
  );
  assert(
    updatedHomeSummary?.workload_summary?.days_logged === 3,
    `Days logged updated to 3 (Actual: ${updatedHomeSummary?.workload_summary?.days_logged})`
  );

  console.log('\n--- 5. Cleaning Up Test Data ---');
  await db.collection('Users').doc(testAthId).delete().catch(() => {});
  await db.collection('Athlete_Profiles').doc(testAthId).delete().catch(() => {});
  await db.collection('Workload_Analysis').doc(session1.workload_id).delete().catch(() => {});
  await db.collection('Workload_Analysis').doc(session2.workload_id).delete().catch(() => {});

  console.log('\n==========================================================');
  console.log(`TEST SUMMARY: ${passed} / ${total} TESTS PASSED`);
  console.log('==========================================================\n');

  if (passed !== total) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});
