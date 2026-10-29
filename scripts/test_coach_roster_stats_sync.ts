import { db } from '../utils/firebaseAdmin';
import { submitMatchSession } from '../services/matchService';

async function runCoachRosterStatsSyncVerification() {
  console.log('================================================================');
  console.log('🏀 COACH ROSTER STATS SYNCING & OPPONENT ISOLATION TEST');
  console.log('================================================================\n');

  let totalTests = 0;
  let passedTests = 0;

  function assert(condition: boolean, testName: string, detail?: string) {
    totalTests++;
    if (condition) {
      passedTests++;
      console.log(`  ✅ [PASS] ${testName}`);
      if (detail) console.log(`     └─ ${detail}`);
    } else {
      console.error(`  ❌ [FAIL] ${testName}`);
      if (detail) console.error(`     └─ ERROR: ${detail}`);
    }
  }

  const timestamp = Date.now();
  const testCoachUid = `test_coach_sync_${timestamp}`;
  const testCoachId = `coach_${testCoachUid}`;
  const testTeamId = `team_coach_sync_${timestamp}`;
  const testTeamName = `Ateneo Blue Knights ${timestamp}`;
  const oppTeamName = `De La Salle Archers ${timestamp}`;

  const ath1Uid = `ath_user_1_${timestamp}`;
  const ath1Id = `ath_${ath1Uid}`;
  const ath2Uid = `ath_user_2_${timestamp}`;
  const ath2Id = `ath_${ath2Uid}`;

  const opponent1OcrId = `ath_ocr_opp_1_${timestamp}`;
  const opponent2OcrId = `ath_ocr_opp_2_${timestamp}`;

  try {
    // -------------------------------------------------------------
    // STEP 1: Seed Coach, Team, and Initial Active Roster Athletes
    // -------------------------------------------------------------
    console.log('--- STEP 1: Seeding Coach, Team, and Active Roster Athletes ---');

    // 1. Seed Coach User & Profile
    await db.collection('Users').doc(testCoachUid).set({
      user_id: testCoachUid,
      email: `${testCoachUid}@example.com`,
      full_name: 'Coach Norman Black',
      role: 'Coach',
      created_at: new Date().toISOString(),
    });

    await db.collection('Coach_Profiles').doc(testCoachId).set({
      coach_id: testCoachId,
      user_id: testCoachUid,
      full_name: 'Coach Norman Black',
      managed_teams: [testTeamId],
      created_at: new Date().toISOString(),
    });

    // 2. Seed Athlete 1 (Marcus Rivera, #10, PG) with initial career stats
    const initialAth1CareerTotals = {
      points: 100,
      total_points: 100,
      rebounds: 40,
      total_rebounds: 40,
      assists: 50,
      total_assists: 50,
      steals: 15,
      total_steals: 15,
      blocks: 5,
      total_blocks: 5,
      turnovers: 20,
      total_turnovers: 20,
      fouls: 18,
      total_fouls: 18,
      games_played: 5,
    };

    await db.collection('Users').doc(ath1Uid).set({
      user_id: ath1Uid,
      email: `marcus_${timestamp}@example.com`,
      first_name: 'Marcus',
      last_name: 'Rivera',
      full_name: 'Marcus Rivera',
      role: 'Athlete',
      team_id: testTeamId,
      created_at: new Date().toISOString(),
    });

    await db.collection('Athlete_Profiles').doc(ath1Id).set({
      athlete_id: ath1Id,
      user_id: ath1Uid,
      first_name: 'Marcus',
      last_name: 'Rivera',
      full_name: 'Marcus Rivera',
      jersey_number: 10,
      position: 'PG',
      team_id: testTeamId,
      career_totals: { ...initialAth1CareerTotals },
      averages: {
        ppg: 20.0,
        apg: 10.0,
        rpg: 8.0,
        games_played: 5,
      },
      stats: {
        ...initialAth1CareerTotals,
        ppg: 20.0,
        apg: 10.0,
        rpg: 8.0,
        games_played: 5,
      },
      created_at: new Date().toISOString(),
    });

    // 3. Seed Athlete 2 (Adrian Ramos, #23, SF) with initial career stats
    const initialAth2CareerTotals = {
      points: 150,
      total_points: 150,
      rebounds: 75,
      total_rebounds: 75,
      assists: 30,
      total_assists: 30,
      steals: 20,
      total_steals: 20,
      blocks: 10,
      total_blocks: 10,
      turnovers: 15,
      total_turnovers: 15,
      fouls: 12,
      total_fouls: 12,
      games_played: 5,
    };

    await db.collection('Users').doc(ath2Uid).set({
      user_id: ath2Uid,
      email: `adrian_${timestamp}@example.com`,
      first_name: 'Adrian',
      last_name: 'Ramos',
      full_name: 'Adrian Ramos',
      role: 'Athlete',
      team_id: testTeamId,
      created_at: new Date().toISOString(),
    });

    await db.collection('Athlete_Profiles').doc(ath2Id).set({
      athlete_id: ath2Id,
      user_id: ath2Uid,
      first_name: 'Adrian',
      last_name: 'Ramos',
      full_name: 'Adrian Ramos',
      jersey_number: 23,
      position: 'SF',
      team_id: testTeamId,
      career_totals: { ...initialAth2CareerTotals },
      averages: {
        ppg: 30.0,
        apg: 6.0,
        rpg: 15.0,
        games_played: 5,
      },
      stats: {
        ...initialAth2CareerTotals,
        ppg: 30.0,
        apg: 6.0,
        rpg: 15.0,
        games_played: 5,
      },
      created_at: new Date().toISOString(),
    });

    // 4. Seed Managed Team with the 2 athletes on the roster
    await db.collection('Teams').doc(testTeamId).set({
      team_id: testTeamId,
      team_name: testTeamName,
      sport_type: 'Basketball',
      coach_id: testCoachId,
      roster_list: [
        { athlete_id: ath1Id, jersey_number: 10, name: 'Marcus Rivera', position: 'PG' },
        { athlete_id: ath2Id, jersey_number: 23, name: 'Adrian Ramos', position: 'SF' },
      ],
      athletes: [ath1Id, ath2Id],
      created_at: new Date().toISOString(),
    });

    assert(true, 'Coach, managed team, and 2 active roster athletes seeded in Firestore');

    // -------------------------------------------------------------
    // STEP 2: Commit Scoresheet Match featuring Roster Athletes + Guest Opponents
    // -------------------------------------------------------------
    console.log('\n--- STEP 2: Committing Scoresheet Match with Roster Athletes + Opponents ---');

    // Scoresheet Game Performance:
    // Athlete 1: Marcus Rivera (#10) scores 25 pts, 10 ast, 5 reb, 3 stl, 1 blk, 2 to, 3 fouls
    // Athlete 2: Adrian Ramos (#23) scores 30 pts, 4 ast, 12 reb, 2 stl, 2 blk, 1 to, 2 fouls
    // Opponent 1: Lucas Vane (#5, Opponent Team) scores 18 pts, 3 ast, 4 reb
    // Opponent 2: Guest Player X (#14, Opponent Team) scores 12 pts, 1 ast, 6 reb

    const submitMatchPayload: any = {
      team_id: testTeamId,
      home_team_id: testTeamId,
      home_team_name: testTeamName,
      opponent_team_name: oppTeamName,
      away_team_name: oppTeamName,
      sport_type: 'Basketball',
      match_type: 'Official Match',
      match_date: new Date().toISOString().split('T')[0],
      location: 'Araneta Coliseum',
      home_score: 85,
      away_score: 72,
      scoresheet_url: 'https://storage.googleapis.com/atleta/scoresheets/test_scoresheet.png',
      player_stats: [
        // Coach's active roster athlete 1 (identified by OCR player_name & jersey)
        {
          athlete_id: `ath_ocr_scan_1`,
          player_name: 'Marcus Rivera',
          jersey_number: 10,
          team_name: testTeamName,
          points: 25,
          pts: 25,
          assists: 10,
          ast: 10,
          rebounds: 5,
          reb: 5,
          steals: 3,
          stl: 3,
          blocks: 1,
          blk: 1,
          turnovers: 2,
          to: 2,
          fouls: 3,
          pf: 3,
          fg_made: 9,
          fg_attempted: 16,
          three_made: 4,
          three_attempted: 7,
          ft_made: 3,
          ft_attempted: 4,
          minutes: 32,
        },
        // Coach's active roster athlete 2 (identified by OCR player_name & jersey)
        {
          athlete_id: `ath_ocr_scan_2`,
          player_name: 'Adrian Ramos',
          jersey_number: 23,
          team_name: testTeamName,
          points: 30,
          pts: 30,
          assists: 4,
          ast: 4,
          rebounds: 12,
          reb: 12,
          steals: 2,
          stl: 2,
          blocks: 2,
          blk: 2,
          turnovers: 1,
          to: 1,
          fouls: 2,
          pf: 2,
          fg_made: 11,
          fg_attempted: 19,
          three_made: 3,
          three_attempted: 6,
          ft_made: 5,
          ft_attempted: 6,
          minutes: 34,
        },
        // Opponent player 1 (NOT on coach's roster)
        {
          athlete_id: opponent1OcrId,
          player_name: 'Lucas Vane',
          jersey_number: 5,
          team_name: oppTeamName,
          points: 18,
          pts: 18,
          assists: 3,
          ast: 3,
          rebounds: 4,
          reb: 4,
          steals: 1,
          stl: 1,
          blocks: 0,
          blk: 0,
          turnovers: 3,
          to: 3,
          fouls: 4,
          pf: 4,
          minutes: 30,
        },
        // Opponent player 2 (NOT on coach's roster)
        {
          athlete_id: opponent2OcrId,
          player_name: 'Guest Player X',
          jersey_number: 14,
          team_name: oppTeamName,
          points: 12,
          pts: 12,
          assists: 1,
          ast: 1,
          rebounds: 6,
          reb: 6,
          steals: 0,
          stl: 0,
          blocks: 1,
          blk: 1,
          turnovers: 2,
          to: 2,
          fouls: 2,
          pf: 2,
          minutes: 24,
        },
      ],
    };

    console.log('  ⏳ Executing submitMatchSession with coachId and match payload...');
    const idempKey = `idemp_sync_${timestamp}`;
    const matchResponse = await submitMatchSession(testCoachId, submitMatchPayload, idempKey);
    assert(Boolean(matchResponse && matchResponse.match), 'Match committed successfully via submitMatchSession');

    // -------------------------------------------------------------
    // STEP 3: Verify Career Stats Aggregated Automatically for Roster Athletes
    // -------------------------------------------------------------
    console.log('\n--- STEP 3: Verifying Athlete 1 (Marcus Rivera) Career Stats Aggregation ---');

    const updatedAth1Doc = await db.collection('Athlete_Profiles').doc(ath1Id).get();
    assert(updatedAth1Doc.exists, 'Marcus Rivera Athlete_Profiles document exists in Firestore');
    const ath1Data = updatedAth1Doc.data() || {};
    const ath1Totals = ath1Data.career_totals || ath1Data.stats?.career_totals || {};

    const expectedAth1Pts = 100 + 25; // 125
    const expectedAth1Ast = 50 + 10;  // 60
    const expectedAth1Reb = 40 + 5;   // 45
    const expectedAth1Stl = 15 + 3;   // 18
    const expectedAth1Blk = 5 + 1;    // 6
    const expectedAth1To = 20 + 2;    // 22
    const expectedAth1Fouls = 18 + 3; // 21
    const expectedAth1Games = 5 + 1;  // 6
    const expectedAth1Ppg = Number((125 / 6).toFixed(1)); // 20.8

    assert(ath1Totals.points === expectedAth1Pts, `Career total points aggregated (${expectedAth1Pts})`, `Actual: ${ath1Totals.points}`);
    assert(ath1Totals.assists === expectedAth1Ast, `Career total assists aggregated (${expectedAth1Ast})`, `Actual: ${ath1Totals.assists}`);
    assert(ath1Totals.rebounds === expectedAth1Reb, `Career total rebounds aggregated (${expectedAth1Reb})`, `Actual: ${ath1Totals.rebounds}`);
    assert(ath1Totals.steals === expectedAth1Stl, `Career total steals aggregated (${expectedAth1Stl})`, `Actual: ${ath1Totals.steals}`);
    assert(ath1Totals.blocks === expectedAth1Blk, `Career total blocks aggregated (${expectedAth1Blk})`, `Actual: ${ath1Totals.blocks}`);
    assert(ath1Totals.turnovers === expectedAth1To, `Career total turnovers aggregated (${expectedAth1To})`, `Actual: ${ath1Totals.turnovers}`);
    assert(ath1Totals.fouls === expectedAth1Fouls, `Career total fouls aggregated (${expectedAth1Fouls})`, `Actual: ${ath1Totals.fouls}`);
    assert(ath1Totals.games_played === expectedAth1Games, `Career games played aggregated (${expectedAth1Games})`, `Actual: ${ath1Totals.games_played}`);
    assert(ath1Data.averages?.ppg === expectedAth1Ppg, `Career PPG updated accurately (${expectedAth1Ppg})`, `Actual: ${ath1Data.averages?.ppg}`);

    console.log('\n--- STEP 4: Verifying Athlete 2 (Adrian Ramos) Career Stats Aggregation ---');

    const updatedAth2Doc = await db.collection('Athlete_Profiles').doc(ath2Id).get();
    assert(updatedAth2Doc.exists, 'Adrian Ramos Athlete_Profiles document exists in Firestore');
    const ath2Data = updatedAth2Doc.data() || {};
    const ath2Totals = ath2Data.career_totals || ath2Data.stats?.career_totals || {};

    const expectedAth2Pts = 150 + 30; // 180
    const expectedAth2Reb = 75 + 12;  // 87
    const expectedAth2Ast = 30 + 4;   // 34
    const expectedAth2Games = 5 + 1;  // 6
    const expectedAth2Ppg = Number((180 / 6).toFixed(1)); // 30.0

    assert(ath2Totals.points === expectedAth2Pts, `Career total points aggregated (${expectedAth2Pts})`, `Actual: ${ath2Totals.points}`);
    assert(ath2Totals.rebounds === expectedAth2Reb, `Career total rebounds aggregated (${expectedAth2Reb})`, `Actual: ${ath2Totals.rebounds}`);
    assert(ath2Totals.assists === expectedAth2Ast, `Career total assists aggregated (${expectedAth2Ast})`, `Actual: ${ath2Totals.assists}`);
    assert(ath2Totals.games_played === expectedAth2Games, `Career games played aggregated (${expectedAth2Games})`, `Actual: ${ath2Totals.games_played}`);
    assert(ath2Data.averages?.ppg === expectedAth2Ppg, `Career PPG updated accurately (${expectedAth2Ppg})`, `Actual: ${ath2Data.averages?.ppg}`);

    // -------------------------------------------------------------
    // STEP 5: Verify Opponent Players Did NOT Generate Orphaned Documents
    // -------------------------------------------------------------
    console.log('\n--- STEP 5: Verifying Opponent / Non-Roster Players Do Not Generate Orphaned Docs ---');

    // Check opponent 1: Lucas Vane
    const opp1Profile = await db.collection('Athlete_Profiles').doc(opponent1OcrId).get();
    const opp1User = await db.collection('Users').doc(opponent1OcrId).get();
    const opp1ByNameUser = await db.collection('Users').where('full_name', '==', 'Lucas Vane').get();
    const opp1ByNameProfile = await db.collection('Athlete_Profiles').where('full_name', '==', 'Lucas Vane').get();

    assert(!opp1Profile.exists, 'Opponent player (Lucas Vane) did NOT create Athlete_Profiles doc by OCR ID');
    assert(!opp1User.exists, 'Opponent player (Lucas Vane) did NOT create Users doc by OCR ID');
    assert(opp1ByNameUser.empty, 'Opponent player (Lucas Vane) did NOT create Users doc by name');
    assert(opp1ByNameProfile.empty, 'Opponent player (Lucas Vane) did NOT create Athlete_Profiles doc by name');

    // Check opponent 2: Guest Player X
    const opp2Profile = await db.collection('Athlete_Profiles').doc(opponent2OcrId).get();
    const opp2User = await db.collection('Users').doc(opponent2OcrId).get();
    const opp2ByNameUser = await db.collection('Users').where('full_name', '==', 'Guest Player X').get();
    const opp2ByNameProfile = await db.collection('Athlete_Profiles').where('full_name', '==', 'Guest Player X').get();

    assert(!opp2Profile.exists, 'Opponent player (Guest Player X) did NOT create Athlete_Profiles doc by OCR ID');
    assert(!opp2User.exists, 'Opponent player (Guest Player X) did NOT create Users doc by OCR ID');
    assert(opp2ByNameUser.empty, 'Opponent player (Guest Player X) did NOT create Users doc by name');
    assert(opp2ByNameProfile.empty, 'Opponent player (Guest Player X) did NOT create Athlete_Profiles doc by name');

    // Check that game logs still exist in Performance_Metrics for match box-score without polluting Users collection
    const opp1MetricSnap = await db.collection('Performance_Metrics')
      .where('match_id', '==', matchResponse.match.match_id)
      .where('player_name', '==', 'Lucas Vane')
      .get();
    assert(!opp1MetricSnap.empty, 'Opponent match stats logged cleanly in Performance_Metrics for game boxscore');

  } finally {
    // -------------------------------------------------------------
    // CLEANUP: Clean up test fixtures in Firestore
    // -------------------------------------------------------------
    console.log('\n--- CLEANUP: Removing Test Documents ---');
    try {
      await Promise.all([
        db.collection('Users').doc(testCoachUid).delete().catch(() => null),
        db.collection('Coach_Profiles').doc(testCoachId).delete().catch(() => null),
        db.collection('Teams').doc(testTeamId).delete().catch(() => null),
        db.collection('Users').doc(ath1Uid).delete().catch(() => null),
        db.collection('Athlete_Profiles').doc(ath1Id).delete().catch(() => null),
        db.collection('Users').doc(ath2Uid).delete().catch(() => null),
        db.collection('Athlete_Profiles').doc(ath2Id).delete().catch(() => null),
      ]);
      console.log('  🧹 Cleanup completed.');
    } catch (cleanupErr) {
      console.warn('  ⚠️ Cleanup warning:', cleanupErr);
    }
  }

  console.log('\n================================================================');
  console.log(`📊 FINAL RESULTS: ${passedTests}/${totalTests} TESTS PASSED`);
  console.log('================================================================\n');

  if (passedTests === totalTests) {
    console.log('🎉 ALL COACH ROSTER STATS SYNCING & OPPONENT ISOLATION TESTS PASSED!');
    process.exit(0);
  } else {
    console.error('❌ SOME TESTS FAILED.');
    process.exit(1);
  }
}

runCoachRosterStatsSyncVerification().catch(err => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
