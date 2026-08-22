import { validateSubmitMatch, validateScoresheetUpload } from '../validators/matchValidator';
import {
  submitMatchSession,
  processScoresheetOCR,
  getMatchBoxscore,
  calculateBasketballMetrics,
  calculateIndividualSportMetrics,
} from '../services/matchService';
import { db } from '../utils/firebaseAdmin';
import { cleanAllTestData } from './clean_test_data';

console.log('==========================================================');
console.log('MATCH LOGGING, OCR & MULTI-SPORT EFFICIENCY — TEST SUITE');
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
  // ─── 1. Validator & Idempotency Header Tests ───────────────────────

  console.log('--- TEST GROUP 1: Match Logging Validation & Idempotency Header ---');

  const missingHeaderErr = validateSubmitMatch({
    team_id: 't_adamson_001',
    sport_type: 'Basketball',
    match_type: 'Tournament',
    match_date: new Date().toISOString(),
    location: 'Mall of Asia Arena',
    opponent_team_name: 'Ateneo Blue Eagles',
    game_result: 'WIN',
    player_stats: [],
  }, undefined);
  assert(
    missingHeaderErr.some((e) => e.field === 'Idempotency-Key'),
    'Submission without Idempotency-Key header rejected (400 Bad Request)',
  );

  const validMatchPayload = validateSubmitMatch({
    team_id: 't_adamson_001',
    sport_type: 'Basketball',
    match_type: 'UAAP Season 88',
    match_date: new Date().toISOString(),
    location: 'Mall of Asia Arena',
    opponent_team_name: 'UP Fighting Maroons',
    game_result: 'WIN',
    player_stats: [{ athlete_id: 'ath_jerom_001', stats: {} }],
  }, 'idemp_key_test_123');
  assert(validMatchPayload.length === 0, 'Valid match payload with Idempotency-Key passes validation');

  // ─── 2. Multi-Sport Math Verification (EFF & True Shooting %) ──────

  console.log('\n--- TEST GROUP 2: Multi-Sport Efficiency & TS% Math Verification ---');

  // Basketball EFF = (PTS + REB + AST + STL + BLK) - ((FGA - FGM) + (FTA - FTM) + TO)
  // PTS=24, REB=5, AST=8, STL=2, BLK=1, FGA=14, FGM=8, FTA=6, FTM=5, TO=2
  // EFF = (24 + 5 + 8 + 2 + 1) - ((14 - 8) + (6 - 5) + 2) = 40 - (6 + 1 + 2) = 31.00
  // TS% = 24 / (2 * (14 + 0.44 * 6)) = 24 / (2 * 16.64) = 24 / 33.28 = 72.12%
  const bballMetrics = calculateBasketballMetrics({
    points: 24,
    assists: 8,
    offensive_rebounds: 2,
    defensive_rebounds: 3,
    steals: 2,
    blocks: 1,
    turnovers: 2,
    fg_made: 8,
    fg_attempted: 14,
    ft_made: 5,
    ft_attempted: 6,
  });

  assert(bballMetrics.efficiency === 31.00, `Basketball EFF computed correctly (expected 31.00, got ${bballMetrics.efficiency})`);
  assert(bballMetrics.trueShootingPct === 72.12, `Basketball True Shooting % computed correctly (expected 72.12%, got ${bballMetrics.trueShootingPct}%)`);

  // Swimming DQ test: is_disqualified = true -> efficiency = 0
  const dqMetrics = calculateIndividualSportMetrics({
    event_name: '100m Butterfly',
    distance_meters: 100,
    finish_time_ms: 54200,
    split_times_ms: [25100, 29100],
    is_disqualified: true,
  });
  assert(dqMetrics.efficiency === 0, 'Disqualified individual athlete receives calculated_player_efficiency = 0');

  // ─── 3. Live Match Submission & Idempotency Replay ────────────────

  console.log('\n--- TEST GROUP 3: Live Match Submission & Idempotency Queue Replay ---');

  const testCoachId = `coach_test_${Date.now()}`;
  const testTeamId = `team_test_${Date.now()}`;
  const testAthId = `ath_test_player_${Date.now()}`;
  const uniqueIdempotencyKey = `idemp_${Date.now()}_abc`;

  // Seed test team & athlete
  await db.collection('Teams').doc(testTeamId).set({
    team_id: testTeamId,
    team_name: 'Adamson Falcons',
    sport_type: 'Basketball',
    coach_id: testCoachId,
    roster_list: [testAthId],
  });

  await db.collection('Athlete_Profiles').doc(testAthId).set({
    athlete_id: testAthId,
    user_id: testAthId,
    first_name: 'Jerom',
    last_name: 'Lastimosa',
    position: 'Point Guard',
    jersey_number: 7,
  });

  const submitPayload = {
    team_id: testTeamId,
    sport_type: 'Basketball' as const,
    match_type: 'UAAP Season 88',
    match_date: new Date().toISOString(),
    location: 'Smart Araneta Coliseum',
    opponent_team_name: 'La Salle Green Archers',
    game_result: 'WIN' as const,
    notes: 'Crucial game winning 3-pointer by Jerom Lastimosa',
    player_stats: [
      {
        athlete_id: testAthId,
        stats: {
          points: 24,
          assists: 8,
          offensive_rebounds: 2,
          defensive_rebounds: 3,
          steals: 2,
          blocks: 1,
          turnovers: 2,
          fg_made: 8,
          fg_attempted: 14,
          ft_made: 5,
          ft_attempted: 6,
        },
      },
    ],
  };

  // 3a. Initial match submission
  const firstResult = await submitMatchSession(testCoachId, submitPayload, uniqueIdempotencyKey);
  assert(firstResult !== null && !!firstResult.match.match_id, 'First match submission created match successfully');
  assert(firstResult.performance_metrics[0].calculated_player_efficiency === 31.00, 'Recorded player efficiency in Performance_Metrics');

  const createdMatchId = firstResult.match.match_id;

  // 3b. Re-sending submission with identical Idempotency-Key returns cached response
  const replayResult = await submitMatchSession(testCoachId, submitPayload, uniqueIdempotencyKey);
  assert(replayResult.match.match_id === createdMatchId, 'Identical Idempotency-Key returns original recorded match response');

  // Verify no duplicate Match_Logs doc created
  const matchDoc = await db.collection('Match_Logs').doc(createdMatchId).get();
  assert(matchDoc.exists, 'Match document persisted in Match_Logs collection');

  // ─── 4. OCR Scoresheet Upload & File Size Limit (413) ──────────────

  console.log('\n--- TEST GROUP 4: Scoresheet OCR Upload & 25MB File Limit ---');

  // ACCEPTANCE CRITERIA: File uploads over 25MB return 413 Payload Too Large
  try {
    validateScoresheetUpload({
      originalname: 'large_scoresheet.pdf',
      size: 26 * 1024 * 1024, // 26 MB (Exceeds limit)
    } as any);
    assert(false, 'Upload over 25MB should throw 413 error');
  } catch (err: any) {
    assert(err.statusCode === 413 && err.message.includes('25MB'), 'File upload > 25MB returns HTTP 413 Payload Too Large');
  }

  // Valid scoresheet upload (CSV format test)
  const mockCsvContent = `Team,Score
HAWKS,103
CELTICS,107

Player,Jersey,Points,Rebounds,Assists,Fouls
J. Carter,8,12,4,3,2
D. Johnson,12,8,5,2,3`;

  const ocrResult = await processScoresheetOCR(createdMatchId, {
    originalname: 'scoresheet_adu_vs_dlsu.csv',
    mimetype: 'text/csv',
    buffer: Buffer.from(mockCsvContent),
    size: mockCsvContent.length,
  } as any);
  assert(ocrResult !== null && ocrResult.parsed_tables.team_scores.length > 0, 'Scoresheet OCR table extraction returned parsed tables');

  // ─── 5. Boxscore Metric Compilation ───────────────────────────────

  console.log('\n--- TEST GROUP 5: Boxscore Compilation & Player Efficiency Metrics ---');

  const boxscore = await getMatchBoxscore(createdMatchId);
  assert(boxscore.match.match_id === createdMatchId, 'getMatchBoxscore returned match details');
  assert(boxscore.player_metrics.length === 1, 'Compiled player metrics included in boxscore');
  assert(boxscore.player_metrics[0].first_name === 'Jerom', 'Enriched athlete name in boxscore metric');

  // ─── 6. Cleanup Test Data ─────────────────────────────────────────

  console.log('\n--- TEST GROUP 6: Firestore Test Data Cleanup ---');
  await db.collection('Match_Logs').doc(createdMatchId).delete();
  await db.collection('Performance_Metrics').doc(`metric_${createdMatchId}_${testAthId}`).delete();
  await db.collection('Idempotency_Keys').doc(uniqueIdempotencyKey).delete();
  await db.collection('Teams').doc(testTeamId).delete();
  await db.collection('Athlete_Profiles').doc(testAthId).delete();
  await cleanAllTestData();

  // ─── Summary ──────────────────────────────────────────────────────

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
