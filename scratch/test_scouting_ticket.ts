import { db } from '../utils/firebaseAdmin';
import {
  searchRegionalAthletes,
  getLeaderboardRankings,
  dispatchRecruitmentProposal,
  getRecruitmentProposals,
} from '../services/scoutingService';
import { ServiceError } from '../validators/matchValidator';

console.log('==========================================================');
console.log('REGIONAL ATHLETE SEARCH & RECRUITMENT PROPOSALS — TEST SUITE');
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
  const timestampStr = String(Date.now());
  const testAthleteId1 = `ath_scout_test_1_${timestampStr}`;
  const testAthleteId2 = `ath_scout_test_2_${timestampStr}`;
  const testAthleteId3 = `ath_scout_test_3_${timestampStr}`;
  const testCoachId = `coach_scout_test_${timestampStr}`;

  const matchId1 = `match_scout_test_1_${timestampStr}`;
  const matchId2 = `match_scout_test_2_${timestampStr}`;
  const matchId3 = `match_scout_test_3_${timestampStr}`;

  console.log('--- 1. Seeding Mock Firestore Data for Scouting ---');

  // Seed Users
  await db.collection('Users').doc(testAthleteId1).set({
    first_name: 'Jerom',
    last_name: 'Lastimosa',
    email: `jerom_${timestampStr}@test.com`,
    role: 'Athlete',
  });
  await db.collection('Users').doc(testAthleteId2).set({
    first_name: 'Kevin',
    last_name: 'Quiambao',
    email: `kevin_${timestampStr}@test.com`,
    role: 'Athlete',
  });
  await db.collection('Users').doc(testAthleteId3).set({
    first_name: 'Michael',
    last_name: 'Phelps',
    email: `phelps_${timestampStr}@test.com`,
    role: 'Athlete',
  });

  // Seed Athlete_Profiles
  await db.collection('Athlete_Profiles').doc(testAthleteId1).set({
    province: 'Pangasinan',
    sport_type: 'Basketball',
    recruitment_status: 'Uncommitted',
  });
  await db.collection('Athlete_Profiles').doc(testAthleteId2).set({
    province: 'Pangasinan',
    sport_type: 'Basketball',
    recruitment_status: 'Committed',
  });
  await db.collection('Athlete_Profiles').doc(testAthleteId3).set({
    province: 'Manila',
    sport_type: 'Swimming',
    recruitment_status: 'Uncommitted',
  });

  // Seed Match Logs
  await db.collection('Match_Logs').doc(matchId1).set({
    sport_type: 'Basketball',
    match_type: 'UAAP Season 88',
  });
  await db.collection('Match_Logs').doc(matchId2).set({
    sport_type: 'Basketball',
    match_type: 'UAAP Season 88',
  });
  await db.collection('Match_Logs').doc(matchId3).set({
    sport_type: 'Swimming',
    match_type: 'National Games 2026',
  });

  // Seed Performance Metrics
  // Athlete 1 (Jerom): 30 & 40 efficiency -> Average PER = 35
  await db.collection('Performance_Metrics').doc(`m1_${timestampStr}`).set({
    athlete_id: testAthleteId1,
    match_id: matchId1,
    sport_category: 'Basketball',
    calculated_player_efficiency: 30,
  });
  await db.collection('Performance_Metrics').doc(`m2_${timestampStr}`).set({
    athlete_id: testAthleteId1,
    match_id: matchId2,
    sport_category: 'Basketball',
    calculated_player_efficiency: 40,
  });

  // Athlete 2 (Kevin): 20 efficiency -> Average PER = 20
  await db.collection('Performance_Metrics').doc(`m3_${timestampStr}`).set({
    athlete_id: testAthleteId2,
    match_id: matchId1,
    sport_category: 'Basketball',
    calculated_player_efficiency: 20,
  });

  // Athlete 3 (Phelps): 15 efficiency -> Average PER = 15
  await db.collection('Performance_Metrics').doc(`m4_${timestampStr}`).set({
    athlete_id: testAthleteId3,
    match_id: matchId3,
    sport_category: 'Swimming',
    calculated_player_efficiency: 15,
  });

  console.log('✅ Mock data seeded successfully.\n');

  console.log('--- 2. Warming up Firestore connection ---');
  // Query all collections multiple times to ensure TCP socket keep-alive is active
  for (let i = 0; i < 3; i++) {
    await searchRegionalAthletes();
    await getLeaderboardRankings('Basketball', 'UAAP Season 88');
  }
  console.log('✅ Connection warmed up.\n');

  // ─── 3. Search Regional Athletes Tests ───────────────────────
  console.log('--- TEST GROUP 2: Search Regional Athlete Directory ---');

  const startSearch = Date.now();
  const searchAll = await searchRegionalAthletes();
  const searchTime = Date.now() - startSearch;
  assert(searchTime < 1500, `Scouting query returns under 1500ms (took ${searchTime}ms)`);
  assert(
    searchAll.some(a => a.athlete_id === testAthleteId1) &&
    searchAll.some(a => a.athlete_id === testAthleteId2) &&
    searchAll.some(a => a.athlete_id === testAthleteId3),
    'Returns all matching seeded athletes'
  );

  const basketballOnly = await searchRegionalAthletes('Basketball');
  assert(
    basketballOnly.some(a => a.athlete_id === testAthleteId1) &&
    basketballOnly.some(a => a.athlete_id === testAthleteId2) &&
    !basketballOnly.some(a => a.athlete_id === testAthleteId3),
    'Filters regional athletes by sport type successfully'
  );

  const minPERFilter = await searchRegionalAthletes(undefined, 25);
  assert(
    minPERFilter.some(a => a.athlete_id === testAthleteId1) &&
    !minPERFilter.some(a => a.athlete_id === testAthleteId2),
    'Filters regional athletes by minPER successfully'
  );

  const keywordFilter = await searchRegionalAthletes(undefined, undefined, 'Kevin');
  assert(
    keywordFilter.some(a => a.athlete_id === testAthleteId2) &&
    !keywordFilter.some(a => a.athlete_id === testAthleteId1),
    'Filters athletes using keyword search matching name successfully'
  );

  const regionSearch = await searchRegionalAthletes(undefined, undefined, 'Pangasinan');
  assert(
    regionSearch.some(a => a.athlete_id === testAthleteId1) &&
    regionSearch.some(a => a.athlete_id === testAthleteId2) &&
    !regionSearch.some(a => a.athlete_id === testAthleteId3),
    'Filters athletes using keyword search matching province region successfully'
  );

  // ─── 4. Leaderboard Rankings Tests ───────────────────────
  console.log('\n--- TEST GROUP 3: Serve Leaderboard rankings (Top 10 Player PER) ---');

  const startRankings = Date.now();
  const rankings = await getLeaderboardRankings('Basketball', 'UAAP Season 88');
  const rankingsTime = Date.now() - startRankings;
  assert(rankingsTime < 200, `Leaderboard rankings query returns under 200ms (took ${rankingsTime}ms)`);

  const ath1Rank = rankings.findIndex(r => r.athlete_id === testAthleteId1);
  const ath2Rank = rankings.findIndex(r => r.athlete_id === testAthleteId2);
  assert(
    ath1Rank !== -1 && ath2Rank !== -1 && ath1Rank < ath2Rank &&
    rankings[ath1Rank].calculated_player_efficiency === 35 &&
    rankings[ath2Rank].calculated_player_efficiency === 20,
    'Retrieves and computes average PER rankings in descending order correctly'
  );

  const regionalRankings = await getLeaderboardRankings(undefined, undefined, 'Manila');
  assert(
    regionalRankings.some(a => a.athlete_id === testAthleteId3) &&
    !regionalRankings.some(a => a.athlete_id === testAthleteId1),
    'Retrieves PER rankings filtered by region successfully'
  );

  // ─── 5. Recruitment Proposals Lifecycle Tests ───────────────────────
  console.log('\n--- TEST GROUP 4: Dispatch Recruitment Proposals & Lifecycle ---');

  // Test successful dispatch
  const proposal = await dispatchRecruitmentProposal(
    testCoachId,
    testAthleteId1,
    'We want you to join the Adamson Falcons!'
  );
  assert(
    proposal.scout_id !== undefined &&
    proposal.offer_status === 'Sent' &&
    proposal.offer_message === 'We want you to join the Adamson Falcons!' &&
    proposal.athlete_details?.first_name === 'Jerom',
    'Dispatches recruitment proposal to athlete successfully'
  );

  // Test duplicate active proposal check (Acceptance Criteria: Sending duplicate active scouting proposals to the same athlete returns HTTP 400 Bad Request)
  try {
    await dispatchRecruitmentProposal(
      testCoachId,
      testAthleteId1,
      'Duplicate offer message.'
    );
    assert(false, 'Should throw ServiceError on duplicate active proposal');
  } catch (err: any) {
    assert(
      err instanceof ServiceError && err.statusCode === 400 && err.message.includes('active'),
      'Sending duplicate active proposals to the same athlete throws HTTP 400 Bad Request'
    );
  }

  // Test retrieval
  const proposals = await getRecruitmentProposals(testCoachId);
  assert(
    proposals.length === 1 &&
    proposals[0].athlete_id === testAthleteId1 &&
    proposals[0].athlete_details?.first_name === 'Jerom' &&
    proposals[0].athlete_details?.province === 'Pangasinan',
    'Retrieves sent proposals with enriched athlete status details successfully'
  );

  // ─── 6. Cleanup Mock Data ───────────────────────
  console.log('\n--- 6. Cleaning Up Test Data ---');
  await db.collection('Users').doc(testAthleteId1).delete();
  await db.collection('Users').doc(testAthleteId2).delete();
  await db.collection('Users').doc(testAthleteId3).delete();

  await db.collection('Athlete_Profiles').doc(testAthleteId1).delete();
  await db.collection('Athlete_Profiles').doc(testAthleteId2).delete();
  await db.collection('Athlete_Profiles').doc(testAthleteId3).delete();

  await db.collection('Match_Logs').doc(matchId1).delete();
  await db.collection('Match_Logs').doc(matchId2).delete();
  await db.collection('Match_Logs').doc(matchId3).delete();

  await db.collection('Performance_Metrics').doc(`m1_${timestampStr}`).delete();
  await db.collection('Performance_Metrics').doc(`m2_${timestampStr}`).delete();
  await db.collection('Performance_Metrics').doc(`m3_${timestampStr}`).delete();
  await db.collection('Performance_Metrics').doc(`m4_${timestampStr}`).delete();

  await db.collection('Scouting_Registry').doc(proposal.scout_id).delete();

  console.log('✅ Cleaned up Firestore mock documents.\n');

  console.log(`==========================================================`);
  console.log(`TEST SUMMARY: ${passed}/${total} TESTS PASSED`);
  console.log(`==========================================================`);

  if (passed === total) {
    process.exit(0);
  } else {
    process.exit(1);
  }
}

runTests().catch(console.error);
