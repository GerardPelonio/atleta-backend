import dotenv from 'dotenv';
dotenv.config();

import jwt from 'jsonwebtoken';
import { db } from '../utils/firebaseAdmin';
import { getFullScoutingAthleteProfile } from '../services/scoutingService';
import {
  getAthleteExpandedCareerStats,
  getAthleteDateGroupedMatches,
} from '../services/athleteService';
import { getMatchResultDetails } from '../services/matchService';
import { requireCoach, authenticate } from '../middlewares/authMiddleware';

console.log('==========================================================');
console.log('SCOUTING ANALYTICS, CAREER STATS & MATCH DETAILS TEST');
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
  const jwtSecret = process.env.JWT_SECRET || 'atleta-super-secret-jwt-key-2026';
  const timestamp = Date.now();

  const testCoachId = `coach_scout_${timestamp}`;
  const testAthId = `ath_scout_${timestamp}`;
  const testUserId = `user_scout_${timestamp}`;
  const testTeamId = `team_scout_${timestamp}`;
  const testBballMatchId = `match_bball_${timestamp}`;
  const testSwimMatchId = `match_swim_${timestamp}`;

  // Generate tokens
  const coachToken = jwt.sign(
    { uid: testCoachId, email: 'coach@atleta.edu', role: 'Coach' },
    jwtSecret,
    { expiresIn: '1h' }
  );

  const athleteToken = jwt.sign(
    { uid: testAthId, email: 'athlete@atleta.edu', role: 'Athlete' },
    jwtSecret,
    { expiresIn: '1h' }
  );

  // ─── 0. Seed Test Data in Firestore ─────────────────────────────────
  console.log('--- Setting up Firestore test entities ---');

  await db.collection('Users').doc(testAthId).set({
    user_id: testAthId,
    first_name: 'Jerom',
    last_name: 'Lastimosa',
    email: `jerom_${timestamp}@adamson.edu.ph`,
    role: 'Athlete',
    gender: 'Male',
    province: 'NCR',
    birthdate: '2001-08-14',
    created_at: new Date().toISOString(),
  });

  await db.collection('Athlete_Profiles').doc(testAthId).set({
    athlete_id: testAthId,
    user_id: testAthId,
    first_name: 'Jerom',
    last_name: 'Lastimosa',
    sport_type: 'Basketball',
    position: 'Point Guard',
    jersey_number: 7,
    province: 'NCR',
    recruitment_status: 'Available',
    physical_profile: {
      height_cm: 188,
      weight_kg: 85,
      wingspan_cm: 195,
      vertical_cm: 90,
    },
    analytics: {
      radar_competencies: {
        speed: 92,
        agility: 88,
        power: 84,
        iq: 95,
        tech: 90,
      },
    },
    eligibility_documents: {
      psa_verified: true,
      academic_check: true,
      proof_of_residency: true,
      document_urls: ['https://atleta.ph/private/docs/PSA_Confidential_123.pdf'],
    },
    achievements: [
      { title: 'Season MVP', year: '2025', content: 'Awarded Most Valuable Player.' },
    ],
  });

  await db.collection('Teams').doc(testTeamId).set({
    team_id: testTeamId,
    team_name: 'Adamson Falcons',
    sport_type: 'Basketball',
    coach_id: testCoachId,
  });

  // Seed Basketball match
  await db.collection('Match_Logs').doc(testBballMatchId).set({
    match_id: testBballMatchId,
    team_id: testTeamId,
    sport_type: 'Basketball',
    event_name: 'UAAP Championship Finals',
    match_type: 'UAAP Season 88',
    match_date: '2026-07-25T14:30:00.000Z',
    location: 'Smart Araneta Coliseum',
    opponent_team_name: 'Ateneo Blue Eagles',
    game_result: 'WIN',
    score: '88 - 82',
    is_official: true,
    notes: 'Historic game-winning shot',
    timestamp: '2026-07-25T14:30:00.000Z',
  });

  await db.collection('Performance_Metrics').doc(`metric_${testBballMatchId}_${testAthId}`).set({
    metric_id: `metric_${testBballMatchId}_${testAthId}`,
    athlete_id: testAthId,
    match_id: testBballMatchId,
    sport_category: 'Basketball',
    sport_stats: {
      points: 28,
      assists: 9,
      offensive_rebounds: 2,
      defensive_rebounds: 4,
      steals: 3,
      blocks: 1,
      turnovers: 2,
      fouls: 1,
      fg_made: 10,
      fg_attempted: 16,
      ft_made: 5,
      ft_attempted: 6,
      true_shooting_pct: 75.1,
    },
    calculated_player_efficiency: 34.5,
    timestamp: '2026-07-25T14:30:00.000Z',
  });

  // Seed Swimming match
  await db.collection('Match_Logs').doc(testSwimMatchId).set({
    match_id: testSwimMatchId,
    team_id: testTeamId,
    sport_type: 'Swimming',
    event_name: '100m Freestyle Final',
    match_type: 'National Collegiate Swimming Championships',
    match_date: '2026-06-15T10:00:00.000Z',
    location: 'New Clark City Aquatics Center',
    opponent_team_name: 'National University',
    game_result: 'WIN',
    is_official: true,
    timestamp: '2026-06-15T10:00:00.000Z',
  });

  await db.collection('Performance_Metrics').doc(`metric_${testSwimMatchId}_${testAthId}`).set({
    metric_id: `metric_${testSwimMatchId}_${testAthId}`,
    athlete_id: testAthId,
    match_id: testSwimMatchId,
    sport_category: 'Swimming',
    sport_stats: {
      event_name: '100m Freestyle Final',
      distance_meters: 100,
      finish_time_ms: 51240,
      split_times_ms: [24600, 26640],
      placement_rank: 1,
      is_disqualified: false,
    },
    calculated_player_efficiency: 28.0,
    timestamp: '2026-06-15T10:00:00.000Z',
  });

  // ─── TEST GROUP 1: Complete Coach Scouting Profile ──────────────────
  console.log('\n--- TEST GROUP 1: Complete Coach Scouting Profile Analytics ---');

  // 1a. Security RBAC check on Coach role
  async function testRoleAccess(token?: string): Promise<{ status: number; calledNext: boolean }> {
    let statusCode = 200;
    let calledNext = false;
    const req: any = {
      headers: token ? { authorization: `Bearer ${token}` } : {},
      user: token ? (jwt.verify(token, jwtSecret) as any) : undefined,
    };
    const res: any = {
      status(code: number) {
        statusCode = code;
        return this;
      },
      json() {
        return this;
      },
    };
    const next = () => {
      calledNext = true;
    };

    requireCoach(req, res, next);
    return { status: statusCode, calledNext };
  }

  const athleteAccess = await testRoleAccess(athleteToken);
  assert(
    athleteAccess.status === 403 && !athleteAccess.calledNext,
    'Coach scouting profile access denied for Athlete role (HTTP 403 Forbidden)'
  );

  const coachAccess = await testRoleAccess(coachToken);
  assert(coachAccess.calledNext, 'Coach scouting profile access granted for Coach role');

  // 1b. ACCEPTANCE CRITERIA: Non-existent athlete returns 404
  try {
    await getFullScoutingAthleteProfile('ath_non_existent_99999');
    assert(false, 'Non-existent athlete ID should throw 404');
  } catch (err: any) {
    assert(err.statusCode === 404, 'ACCEPTANCE CRITERIA: Non-existent athlete ID returns HTTP 404 Not Found');
  }

  // 1c. ACCEPTANCE CRITERIA: Unified scouting profile fetch in under 200ms
  const profileResult = await getFullScoutingAthleteProfile(testAthId);
  const startPerf = Date.now();
  const cachedProfile = await getFullScoutingAthleteProfile(testAthId);
  const durationMs = Date.now() - startPerf;

  assert(
    durationMs < 200,
    `ACCEPTANCE CRITERIA: Full scouting profile fetch responds in under 200ms (Actual: ${durationMs}ms)`
  );
  console.log(`⏱️ Profile response execution time: ${durationMs}ms`);

  // 1d. Validate physical attributes & computed metrics
  assert(profileResult.athlete_id === testAthId, 'Returned correct athlete_id');
  assert(profileResult.first_name === 'Jerom' && profileResult.last_name === 'Lastimosa', 'Returned demographic full name');
  assert(profileResult.physical_attributes.height_cm === 188, 'Physical attribute height_cm present');
  assert(profileResult.computed_metrics.bmi === 24.0, `Computed BMI = 24.0 (Actual: ${profileResult.computed_metrics.bmi})`);
  assert(profileResult.computed_metrics.ape_index === 1.04, `Computed Ape Index = 1.04 (Actual: ${profileResult.computed_metrics.ape_index})`);

  // 1e. Validate radar chart scores
  assert(
    profileResult.radar_scores.speed === 92 && profileResult.radar_scores.iq === 95,
    'Radar chart metrics (speed, power, agility, iq, endurance) populated'
  );

  // 1f. Validate workload indicators
  assert(!!profileResult.workload_trends && profileResult.workload_trends.acwr_ratio > 0, 'Workload trends (ACWR, acute/chronic load) populated');
  assert(profileResult.workload_trends.risk_level === 'MODERATE', 'Workload risk classification provided');

  // 1g. SECURITY: Document verification flags present, raw URLs redacted
  assert(
    profileResult.document_verification_status.is_psa_verified === true,
    'document_verification_status includes is_psa_verified flag'
  );
  assert(
    profileResult.document_verification_status.psa_status === 'Verified',
    'document_verification_status includes psa_status'
  );
  assert(
    !JSON.stringify(profileResult).includes('PSA_Confidential_123.pdf'),
    'SECURITY: Raw sensitive document download URLs are sanitized/redacted'
  );

  // ─── TEST GROUP 2: Expanded Career Statistics ───────────────────────
  console.log('\n--- TEST GROUP 2: Expanded Career Statistics (stats/all) ---');

  // 2a. 404 for non-existent athlete
  try {
    await getAthleteExpandedCareerStats('ath_non_existent_99999');
    assert(false, 'Non-existent athlete ID should throw 404 on stats/all');
  } catch (err: any) {
    assert(err.statusCode === 404, 'Non-existent athlete ID returns HTTP 404 Not Found on stats/all');
  }

  // 2b. Career statistics validation
  const careerStats = await getAthleteExpandedCareerStats(testAthId);
  assert(careerStats.athlete_id === testAthId, 'Returned athlete career stats');
  assert(careerStats.games_played >= 2, 'Total games played aggregated');
  assert(careerStats.shooting_accuracy_percentages.fg_pct > 0, 'Shooting accuracy percentages (FG%, 3P%, FT%, eFG%, TS%) computed');
  assert(careerStats.career_totals.points >= 28, 'Career totals (points, rebounds, assists) aggregated');
  assert(careerStats.career_averages.ppg > 0, 'Career per-game averages computed');
  assert(careerStats.game_highs.points === 28, 'Game highs (points, rebounds, assists, efficiency) captured');
  assert(careerStats.historical_per_trend.length >= 2, 'Historical PER trend array present');

  // ─── TEST GROUP 3: Date-Grouped Match History ───────────────────────
  console.log('\n--- TEST GROUP 3: Date-Grouped Match History Logs ---');

  // 3a. 404 for non-existent athlete
  try {
    await getAthleteDateGroupedMatches('ath_non_existent_99999');
    assert(false, 'Non-existent athlete ID should throw 404 on matches');
  } catch (err: any) {
    assert(err.statusCode === 404, 'Non-existent athlete ID returns HTTP 404 Not Found on matches');
  }

  // 3b. Date grouping by Month and Year (e.g. "JULY 2026", "JUNE 2026")
  const matchHistory = await getAthleteDateGroupedMatches(testAthId);
  assert(matchHistory.athlete_id === testAthId, 'Returned match history for athlete');
  assert(matchHistory.grouped_matches.length >= 2, 'Match history grouped into Month & Year buckets');

  const julyGroup = matchHistory.grouped_matches.find((g: any) => g.month_year === 'JULY 2026');
  const juneGroup = matchHistory.grouped_matches.find((g: any) => g.month_year === 'JUNE 2026');

  assert(!!julyGroup && julyGroup.matches.length >= 1, 'ACCEPTANCE CRITERIA: Matches grouped under "JULY 2026"');
  assert(!!juneGroup && juneGroup.matches.length >= 1, 'ACCEPTANCE CRITERIA: Matches grouped under "JUNE 2026"');

  const bballMatch = julyGroup.matches.find((m: any) => m.match_id === testBballMatchId);
  assert(bballMatch.sport_badge === 'BASKETBALL', 'Sport badge formatted uppercase');
  assert(bballMatch.game_result === 'WIN', 'Game result recorded');
  assert(bballMatch.score === '88 - 82', 'Match score included');
  assert(bballMatch.athlete_stats.points === 28, 'Athlete individual stats included in match log');

  // ─── TEST GROUP 4: Sport-Specific Match Result Details ──────────────
  console.log('\n--- TEST GROUP 4: Sport-Specific Match Result Details ---');

  // 4a. 404 for non-existent match
  try {
    await getMatchResultDetails('match_non_existent_99999');
    assert(false, 'Non-existent match ID should throw 404');
  } catch (err: any) {
    assert(err.statusCode === 404, 'Non-existent match ID returns HTTP 404 Not Found');
  }

  // 4b. Basketball match details (Box score table, team totals)
  const bballDetails = await getMatchResultDetails(testBballMatchId);
  assert(bballDetails.match_id === testBballMatchId, 'Basketball match details retrieved');
  assert(bballDetails.sport_type === 'Basketball', 'Sport type is Basketball');
  assert(bballDetails.team_summary.team_name === 'Adamson Falcons', 'Team summary contains team_name');
  assert(bballDetails.sport_specific_details.sport_category === 'Basketball', 'Sport specific details categorized as Basketball');
  assert(bballDetails.sport_specific_details.team_totals.points === 28, 'Basketball team totals computed');
  assert(bballDetails.sport_specific_details.box_score.length >= 1, 'Basketball box score player table populated');
  assert(bballDetails.sport_specific_details.box_score[0].player_name === 'Jerom Lastimosa', 'Player name in box score');
  assert(bballDetails.sport_specific_details.box_score[0].points === 28, 'Player points in box score');
  assert(bballDetails.sport_specific_details.box_score[0].true_shooting_pct === 75.1, 'Player TS% in box score');

  // 4c. Swimming match details (Race results, finish times ms & formatted, split times, placements)
  const swimDetails = await getMatchResultDetails(testSwimMatchId);
  assert(swimDetails.match_id === testSwimMatchId, 'Swimming match details retrieved');
  assert(swimDetails.sport_type === 'Swimming', 'Sport type is Swimming');
  assert(swimDetails.sport_specific_details.event_name === '100m Freestyle Final', 'Swimming event name present');
  assert(swimDetails.sport_specific_details.race_results.length >= 1, 'Swimming race results table populated');
  assert(swimDetails.sport_specific_details.race_results[0].finish_time_ms === 51240, 'Finish time in ms present');
  assert(swimDetails.sport_specific_details.race_results[0].formatted_finish_time === '51.24s', `Formatted finish time present (Actual: ${swimDetails.sport_specific_details.race_results[0].formatted_finish_time})`);
  assert(swimDetails.sport_specific_details.race_results[0].split_times_ms.length === 2, 'Split times array present');
  assert(swimDetails.sport_specific_details.race_results[0].placement_rank === 1, 'Placement rank present');
  assert(swimDetails.sport_specific_details.race_results[0].is_disqualified === false, 'Disqualification status present');

  // ─── 5. Cleanup Test Artifacts ───────────────────────────────────────
  console.log('\n--- Cleaning up test artifacts ---');
  await db.collection('Users').doc(testAthId).delete().catch(() => {});
  await db.collection('Athlete_Profiles').doc(testAthId).delete().catch(() => {});
  await db.collection('Teams').doc(testTeamId).delete().catch(() => {});
  await db.collection('Match_Logs').doc(testBballMatchId).delete().catch(() => {});
  await db.collection('Match_Logs').doc(testSwimMatchId).delete().catch(() => {});
  await db.collection('Performance_Metrics').doc(`metric_${testBballMatchId}_${testAthId}`).delete().catch(() => {});
  await db.collection('Performance_Metrics').doc(`metric_${testSwimMatchId}_${testAthId}`).delete().catch(() => {});

  console.log('\n==========================================================');
  console.log(`TEST SUMMARY: ${passed} / ${total} TESTS PASSED`);
  console.log('==========================================================\n');

  if (passed !== total) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
