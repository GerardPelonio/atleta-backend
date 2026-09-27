import dotenv from 'dotenv';
dotenv.config();

import { db } from '../utils/firebaseAdmin';
import {
  processCoachOfflineBatchService,
  processAthleteOfflineBatchService,
  getCoachOfflineSnapshotService,
  getAthleteOfflineSnapshotService,
  getOfflineSyncStatusService,
} from '../services/syncService';
import { validateSyncBatchRequest } from '../validators/syncValidator';

console.log('==========================================================');
console.log('OFFLINE CACHING & DATA SYNCHRONIZATION TEST SUITE');
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
  const testCoachId = `coach_sync_${timestamp}`;
  const testAthleteId = `ath_sync_${timestamp}`;
  const testTeamId = `team_sync_${timestamp}`;
  const testMatchId = `match_sync_${timestamp}`;

  // 1. Seed Coach & Athlete in Firestore
  await db.collection('Users').doc(testCoachId).set({
    user_id: testCoachId,
    first_name: 'Coach',
    last_name: 'Aljon',
    email: `coach_${timestamp}@atleta.ph`,
    role: 'Coach',
  });

  await db.collection('Coach_Profiles').doc(testCoachId).set({
    coach_id: testCoachId,
    user_id: testCoachId,
    full_name: 'Coach Aljon',
    current_institution: 'Ateneo de Naga University',
    sport_type: 'Basketball',
    years_of_experience: 10,
    quote: 'Defense wins championships.',
  });

  await db.collection('Users').doc(testAthleteId).set({
    user_id: testAthleteId,
    first_name: 'Kobe',
    last_name: 'Paras',
    email: `kobe_${timestamp}@atleta.ph`,
    role: 'Athlete',
  });

  await db.collection('Athlete_Profiles').doc(testAthleteId).set({
    athlete_id: testAthleteId,
    user_id: testAthleteId,
    first_name: 'Kobe',
    last_name: 'Paras',
    sport_type: 'Basketball',
    position: 'Small Forward',
    jersey_number: 6,
    physical_profile: {
      height_cm: 198,
      weight_kg: 95,
      wingspan_cm: 205,
      vertical_cm: 95,
    },
    computed_metrics: {
      bmi: 24.2,
      ape_index: 1.04,
    },
    stats: {
      ppg: 21.0,
      rpg: 7.5,
      apg: 4.2,
      efficiency_rating: 28.5,
    },
  });

  await db.collection('Teams').doc(testTeamId).set({
    team_id: testTeamId,
    team_name: 'ADNU Knights',
    sport_type: 'Basketball',
    coach_id: testCoachId,
    roster_list: [testAthleteId],
  });

  console.log('--- 1. Testing Coach Offline Snapshot Pre-fetch ---');

  const coachSnapshot = await getCoachOfflineSnapshotService(testCoachId);
  assert(coachSnapshot.coach_profile.full_name === 'Coach Aljon', 'Coach profile embedded in offline snapshot');
  assert(coachSnapshot.teams.length >= 1, 'Coach teams list pre-fetched in offline bundle');
  assert(coachSnapshot.rosters[testTeamId] !== undefined, 'Team roster athletes embedded in offline snapshot');
  assert(coachSnapshot.sports_configurations.length >= 1, 'Registered sports dynamic stat schemas embedded');
  assert(coachSnapshot.etag.startsWith('W/"'), `Deterministic ETag generated: ${coachSnapshot.etag}`);
  assert(coachSnapshot.cache_version.startsWith('v_'), `Cache version token generated: ${coachSnapshot.cache_version}`);

  console.log('\n--- 2. Testing Coach Offline Batch Synchronization ---');

  const coachTx1 = `tx_match_${timestamp}`;
  const coachTx2 = `tx_metric_${timestamp}`;
  const coachTx3 = `tx_srpe_${timestamp}`;
  const coachTx4 = `tx_roster_${timestamp}`;

  const coachBatchRequest = {
    user_id: testCoachId,
    user_role: 'Coach' as const,
    client_sync_timestamp: new Date().toISOString(),
    transactions: [
      {
        transaction_id: coachTx1,
        user_id: testCoachId,
        user_role: 'Coach' as const,
        action_type: 'CREATE_MATCH' as const,
        client_timestamp: new Date(Date.now() - 3600000).toISOString(),
        payload: {
          match_id: testMatchId,
          team_id: testTeamId,
          sport_type: 'Basketball',
          event_name: 'Regional Tune-Up',
          opponent_team_name: 'UNC Red Guzzlers',
          game_result: 'WIN',
          score: '92 - 86',
        },
      },
      {
        transaction_id: coachTx2,
        user_id: testCoachId,
        user_role: 'Coach' as const,
        action_type: 'LOG_METRIC' as const,
        client_timestamp: new Date(Date.now() - 3000000).toISOString(),
        payload: {
          athlete_id: testAthleteId,
          match_id: testMatchId,
          sport_category: 'Basketball',
          sport_stats: {
            points: 26,
            rebounds: 8,
            assists: 5,
            steals: 2,
            blocks: 1,
            turnovers: 2,
            fouls: 2,
            fg_made: 9,
            fg_attempted: 15,
            ft_made: 6,
            ft_attempted: 7,
          },
        },
      },
      {
        transaction_id: coachTx3,
        user_id: testCoachId,
        user_role: 'Coach' as const,
        action_type: 'LOG_SRPE' as const,
        client_timestamp: new Date(Date.now() - 2000000).toISOString(),
        payload: {
          athlete_id: testAthleteId,
          session_duration_mins: 90,
          srpe_score: 8,
          entry_date: '2026-08-18',
          notes: 'Intense 5v5 full court drill offline',
        },
      },
      {
        transaction_id: coachTx4,
        user_id: testCoachId,
        user_role: 'Coach' as const,
        action_type: 'UPDATE_ROSTER' as const,
        client_timestamp: new Date(Date.now() - 1000000).toISOString(),
        payload: {
          team_id: testTeamId,
          roster_athletes: [testAthleteId],
        },
      },
    ],
  };

  // Validate batch schema
  const coachValidationErrors = validateSyncBatchRequest(coachBatchRequest);
  assert(coachValidationErrors.length === 0, 'Coach batch sync request passes validation');

  // Process batch
  const coachSyncResponse = await processCoachOfflineBatchService(testCoachId, coachBatchRequest);
  if (coachSyncResponse.failed_count > 0) {
    console.error('Coach sync failures:', coachSyncResponse.results.filter(r => r.error));
  }
  assert(coachSyncResponse.total_processed === 4, 'Coach batch processed all 4 queued transactions');
  assert(coachSyncResponse.successful_count === 4, 'All 4 coach transactions marked SYNCED');
  assert(coachSyncResponse.failed_count === 0, 'Zero coach transaction failures');

  // Verify match in Firestore
  const savedMatch = await db.collection('Match_Logs').doc(testMatchId).get();
  assert(savedMatch.exists, 'Offline created match successfully persisted in Firestore');
  assert(savedMatch.data()?.synced_offline === true, 'Match marked with synced_offline: true');

  console.log('\n--- 3. Testing Idempotency & Replay Protection ---');

  // Resubmit exact same batch request (simulating network drop retry)
  const replayResponse = await processCoachOfflineBatchService(testCoachId, coachBatchRequest);
  assert(replayResponse.total_processed === 4, 'Replay batch processed 4 transactions');
  assert(replayResponse.replayed_count === 4, 'All 4 duplicate transactions detected as REPLAYED');
  assert(replayResponse.successful_count === 0, 'Zero duplicate insertions executed');

  console.log('\n--- 4. Testing Athlete Offline Snapshot Pre-fetch ---');

  const athleteSnapshot = await getAthleteOfflineSnapshotService(testAthleteId);
  assert(athleteSnapshot.athlete_profile.first_name === 'Kobe', 'Athlete profile embedded in snapshot');
  assert(athleteSnapshot.etag.startsWith('W/"'), `Athlete snapshot generated ETag: ${athleteSnapshot.etag}`);
  assert(athleteSnapshot.registered_sports.length >= 1, 'Registered sports schemas embedded for athlete');

  console.log('\n--- 5. Testing Athlete Offline Batch Synchronization ---');

  const athTx1 = `tx_ath_prof_${timestamp}`;
  const athTx2 = `tx_ath_srpe_${timestamp}`;
  const athTx3 = `tx_ath_inq_${timestamp}`;

  const athleteBatchRequest = {
    user_id: testAthleteId,
    user_role: 'Athlete' as const,
    client_sync_timestamp: new Date().toISOString(),
    transactions: [
      {
        transaction_id: athTx1,
        user_id: testAthleteId,
        user_role: 'Athlete' as const,
        action_type: 'UPDATE_PROFILE' as const,
        client_timestamp: new Date(Date.now() - 3600000).toISOString(),
        payload: {
          height_cm: 200,
          weight_kg: 98,
          wingspan_cm: 210,
          vertical_cm: 98,
          position: 'Power Forward',
        },
      },
      {
        transaction_id: athTx2,
        user_id: testAthleteId,
        user_role: 'Athlete' as const,
        action_type: 'LOG_WORKOUT' as const,
        client_timestamp: new Date(Date.now() - 2000000).toISOString(),
        payload: {
          session_duration_mins: 60,
          srpe_score: 7,
          notes: 'Solo shooting and vertical jump training',
        },
      },
      {
        transaction_id: athTx3,
        user_id: testAthleteId,
        user_role: 'Athlete' as const,
        action_type: 'SEND_INQUIRY' as const,
        client_timestamp: new Date(Date.now() - 1000000).toISOString(),
        payload: {
          coach_id: testCoachId,
          message: 'Good day Coach! I am very interested in trying out for the Knights basketball team.',
        },
      },
    ],
  };

  const athleteValidationErrors = validateSyncBatchRequest(athleteBatchRequest);
  assert(athleteValidationErrors.length === 0, 'Athlete batch sync request passes validation');

  const athleteSyncResponse = await processAthleteOfflineBatchService(testAthleteId, athleteBatchRequest);
  if (athleteSyncResponse.failed_count > 0) {
    console.error('Athlete sync failures:', athleteSyncResponse.results.filter(r => r.error));
  }
  assert(athleteSyncResponse.total_processed === 3, 'Athlete batch processed all 3 transactions');
  assert(athleteSyncResponse.successful_count === 3, 'All 3 athlete transactions marked SYNCED');

  // Verify updated biometrics and computed metrics in Firestore
  const updatedProfile = await db.collection('Athlete_Profiles').doc(testAthleteId).get();
  const profileData = updatedProfile.data();
  assert(profileData?.physical_profile?.height_cm === 200, 'Athlete height updated in Firestore');
  assert(profileData?.computed_metrics?.bmi === 24.5, `BMI recomputed: 98 / (2.00^2) = 24.5 (Actual: ${profileData?.computed_metrics?.bmi})`);
  assert(profileData?.computed_metrics?.ape_index === 1.05, `Ape index recomputed: 210 / 200 = 1.05 (Actual: ${profileData?.computed_metrics?.ape_index})`);

  console.log('\n--- 6. Testing Offline Sync Audit & History Lookup ---');

  const syncAuditStatus = await getOfflineSyncStatusService(testCoachId);
  assert(syncAuditStatus.total_audited_transactions === 4, `Coach has 4 recorded audit entries in Offline_Sync_Audit (Actual: ${syncAuditStatus.total_audited_transactions})`);

  console.log('\n--- 7. Cleaning Up Test Data ---');
  await db.collection('Users').doc(testCoachId).delete().catch(() => {});
  await db.collection('Coach_Profiles').doc(testCoachId).delete().catch(() => {});
  await db.collection('Users').doc(testAthleteId).delete().catch(() => {});
  await db.collection('Athlete_Profiles').doc(testAthleteId).delete().catch(() => {});
  await db.collection('Teams').doc(testTeamId).delete().catch(() => {});
  await db.collection('Match_Logs').doc(testMatchId).delete().catch(() => {});
  await db.collection('Offline_Sync_Audit').doc(`tx_${coachTx1}`).delete().catch(() => {});
  await db.collection('Offline_Sync_Audit').doc(`tx_${coachTx2}`).delete().catch(() => {});
  await db.collection('Offline_Sync_Audit').doc(`tx_${coachTx3}`).delete().catch(() => {});
  await db.collection('Offline_Sync_Audit').doc(`tx_${coachTx4}`).delete().catch(() => {});
  await db.collection('Offline_Sync_Audit').doc(`tx_${athTx1}`).delete().catch(() => {});
  await db.collection('Offline_Sync_Audit').doc(`tx_${athTx2}`).delete().catch(() => {});
  await db.collection('Offline_Sync_Audit').doc(`tx_${athTx3}`).delete().catch(() => {});

  console.log('\n==========================================================');
  console.log(`TEST SUMMARY: ${passed} / ${total} TESTS PASSED`);
  console.log('==========================================================\n');

  if (passed !== total) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error('Test suite failed:', err);
  process.exit(1);
});
