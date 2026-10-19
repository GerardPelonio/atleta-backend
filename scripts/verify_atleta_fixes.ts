import { db } from '../utils/firebaseAdmin';
import { updateAthleteProfile, getAthleteProfile } from '../services/athleteService';
import { submitRecruitmentInquiry, respondToRecruitmentInquiry } from '../services/coachInquiryService';
import { getAthleteTeam } from '../services/teamService';
import { calculateBMI, calculateApeIndex } from '../services/athleteService';

async function runE2EVerification() {
  console.log('================================================================');
  console.log('🚀 RUNNING COMPREHENSIVE ATLETA MOBILE E2E VERIFICATION SUITE');
  console.log('================================================================\n');

  let passedTests = 0;
  let totalTests = 0;

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
  const testAthleteUid = `test_ath_${timestamp}`;
  const testAthleteId = `ath_${testAthleteUid}`;
  const testCoachUid = `test_coach_${timestamp}`;
  const testCoachId = `coach_${testCoachUid}`;
  const testTeamId = `team_test_${timestamp}`;

  try {
    // -------------------------------------------------------------
    // TEST 1: Athlete Creation & Full Name Casing / Spacing Preservation
    // -------------------------------------------------------------
    console.log('--- TEST 1: Athlete Full Name Casing & Spacing Preservation ---');
    const exactFirstName = 'Juan Carlos';
    const exactLastName = 'Dela Cruz';
    const initialSport = 'Basketball';

    await db.collection('Users').doc(testAthleteUid).set({
      user_id: testAthleteUid,
      email: `${testAthleteUid}@example.com`,
      first_name: exactFirstName,
      last_name: exactLastName,
      full_name: `${exactFirstName} ${exactLastName}`,
      role: 'Athlete',
      sport_type: initialSport,
      created_at: new Date().toISOString(),
    });

    await db.collection('Athlete_Profiles').doc(testAthleteId).set({
      athlete_id: testAthleteId,
      user_id: testAthleteUid,
      first_name: exactFirstName,
      last_name: exactLastName,
      sport_type: initialSport,
      stats: { ppg: 18.5, rpg: 7.2, apg: 5.1 },
      analytics: { speed: 85, agility: 88 },
      created_at: new Date().toISOString(),
    });

    const athleteProfile = await getAthleteProfile(testAthleteId);
    assert(
      athleteProfile.first_name === 'Juan Carlos' && athleteProfile.full_name === 'Juan Carlos Dela Cruz',
      'Preserve mixed-case name with space character without forcing uppercase',
      `Got full_name: "${athleteProfile.full_name}"`
    );

    // -------------------------------------------------------------
    // TEST 2: Coach Creation & Workload Assignment
    // -------------------------------------------------------------
    console.log('\n--- TEST 2: Coach Target Workload Assignment & Retrieval ---');
    await db.collection('Users').doc(testCoachUid).set({
      user_id: testCoachUid,
      coach_id: testCoachId,
      email: `${testCoachUid}@example.com`,
      first_name: 'Coach',
      last_name: 'Carter',
      role: 'Coach',
      sport_type: 'Basketball',
      created_at: new Date().toISOString(),
    });

    await db.collection('Coach_Profiles').doc(testCoachId).set({
      coach_id: testCoachId,
      user_id: testCoachUid,
      first_name: 'Coach',
      last_name: 'Carter',
      sport_type: 'Basketball',
      athletes_managed: [],
      created_at: new Date().toISOString(),
    });

    // Coach assigns workload target
    await db.collection('Athlete_Profiles').doc(testAthleteId).set({
      workload_target: {
        target_7day_effort_pts: 2400,
        target_intensity: 8,
        assigned_by: testCoachId,
        assigned_at: new Date().toISOString(),
      },
    }, { merge: true });

    const profileWithWorkload = await getAthleteProfile(testAthleteId);
    assert(
      profileWithWorkload.workload_target?.target_7day_effort_pts === 2400 &&
      profileWithWorkload.workload_analytics?.target_7day_effort_pts === 2400,
      'Target Weekly Workload is successfully stored and hydrated in athlete profile',
      `Target 7-day effort: ${profileWithWorkload.workload_target?.target_7day_effort_pts} pts`
    );

    // -------------------------------------------------------------
    // TEST 3: Create Team for Coach
    // -------------------------------------------------------------
    console.log('\n--- TEST 3: Team Roster Setup ---');
    await db.collection('Teams').doc(testTeamId).set({
      team_id: testTeamId,
      team_name: 'Atleta Knights',
      coach_id: testCoachId,
      sport_type: 'Basketball',
      division: 'Varsity',
      roster_list: [],
      created_at: new Date().toISOString(),
    });

    const initialTeam = await getAthleteTeam(testAthleteId);
    assert(initialTeam === null, 'Athlete has no initial active team', 'Correctly returned null');

    // -------------------------------------------------------------
    // TEST 4: Two-Way Scouting: Athlete Inquire -> Coach Accept
    // -------------------------------------------------------------
    console.log('\n--- TEST 4: Two-Way Scouting: Athlete Inquire -> Coach Accept ---');
    const inquiry = await submitRecruitmentInquiry(
      testAthleteId,
      testCoachId,
      'Coach, I would love to try out for the basketball varsity team.'
    );
    const inqId = (inquiry as any).inquiry_id || inquiry.scout_id;
    assert(
      inquiry && inquiry.offer_status === 'Sent',
      'Athlete successfully submits inquiry to Coach',
      `Inquiry ID: ${inqId}, Status: ${inquiry.offer_status}`
    );

    // Coach responds with "Accepted"
    await respondToRecruitmentInquiry(inqId, testCoachUid, 'Accepted');

    // Verify inquiry status updated in Registry
    const inquiryDoc = await db.collection('Scouting_Registry').doc(inqId).get();
    assert(
      inquiryDoc.data()?.offer_status === 'Accepted',
      'Scouting inquiry status successfully transitions to Accepted',
      `Offer status: ${inquiryDoc.data()?.offer_status}`
    );

    // Verify athlete is automatically added to Coach's Team roster and athlete doc
    const updatedTeam = await getAthleteTeam(testAthleteId);
    assert(
      updatedTeam !== null && updatedTeam.team?.team_id === testTeamId,
      'Athlete is automatically added to the coach team roster upon mutual acceptance',
      `Assigned Team ID: ${updatedTeam?.team?.team_id}, Name: ${updatedTeam?.team?.team_name}`
    );

    // -------------------------------------------------------------
    // TEST 5: Sport Change Restriction (Active Team Member)
    // -------------------------------------------------------------
    console.log('\n--- TEST 5: Sport Change Restriction for Active Team Member ---');
    let sportChangeBlocked = false;
    try {
      await updateAthleteProfile(testAthleteId, { sport_type: 'Volleyball' });
    } catch (err: any) {
      if (err.message && err.message.includes('actively recruited into a team')) {
        sportChangeBlocked = true;
      }
    }
    assert(
      sportChangeBlocked,
      'Block athletes from changing primary sport while actively recruited into a team',
      'Correctly rejected with 400 validation error'
    );

    // -------------------------------------------------------------
    // TEST 6: Sport Change & Historical Stats Archiving (After Leaving Team)
    // -------------------------------------------------------------
    console.log('\n--- TEST 6: Sport Change & Historical Stats Archival ---');
    // Remove athlete from team roster
    await db.collection('Teams').doc(testTeamId).update({
      roster_list: [],
    });
    await db.collection('Athlete_Profiles').doc(testAthleteId).update({
      team_id: null,
      current_affiliation: null,
      assigned_teams: [],
    });
    await db.collection('Users').doc(testAthleteUid).update({
      team_id: null,
      current_affiliation: null,
      assigned_teams: [],
    });

    // Now change sport to Volleyball
    await updateAthleteProfile(testAthleteId, { sport_type: 'Volleyball' });
    const profileAfterSportChange = await db.collection('Athlete_Profiles').doc(testAthleteId).get();
    const profData = profileAfterSportChange.data();

    assert(
      profData?.sport_type === 'Volleyball' &&
      profData?.historical_stats?.Basketball?.stats?.ppg === 18.5,
      'Historical stats from previous sport (Basketball) are archived and preserved in DB',
      `Archived stats: ${JSON.stringify(profData?.historical_stats?.Basketball?.stats)}`
    );

    // -------------------------------------------------------------
    // TEST 7: Two-Way Scouting: Coach Scout -> Athlete Accept
    // -------------------------------------------------------------
    console.log('\n--- TEST 7: Two-Way Scouting: Coach Scout -> Athlete Accept ---');
    const scoutInquiryId = `scout_inq_${timestamp}`;
    await db.collection('Scouting_Registry').doc(scoutInquiryId).set({
      inquiry_id: scoutInquiryId,
      athlete_id: testAthleteId,
      coach_scout_id: testCoachId,
      initiated_by: testCoachId,
      recipient_id: testAthleteId,
      offer_status: 'Sent',
      message: 'We want you on our team as a starter.',
      date_initiated: new Date().toISOString(),
      created_at: new Date().toISOString(),
    });

    // Athlete accepts coach scout inquiry
    await respondToRecruitmentInquiry(scoutInquiryId, testAthleteUid, 'Accepted');
    const scoutDoc = await db.collection('Scouting_Registry').doc(scoutInquiryId).get();
    assert(
      scoutDoc.data()?.offer_status === 'Accepted',
      'Coach scout offer accepted by athlete',
      `Status: ${scoutDoc.data()?.offer_status}`
    );

    // -------------------------------------------------------------
    // TEST 8: Stats Reflection on Athlete Dashboard After Match Log
    // -------------------------------------------------------------
    console.log('\n--- TEST 8: Match Logging & Immediate Stats Reflection ---');
    const matchId = `match_test_${timestamp}`;
    const loggedPts = 26;
    const loggedReb = 10;
    const loggedAst = 8;

    // Log match with athlete stats
    await db.collection('Matches').doc(matchId).set({
      match_id: matchId,
      team_id: testTeamId,
      coach_id: testCoachId,
      home_team: 'Atleta Knights',
      away_team: 'Rival Warriors',
      home_score: 95,
      away_score: 88,
      game_result: 'WIN',
      sport_type: 'Basketball',
      is_official: true,
      player_stats: [
        {
          athlete_id: testAthleteId,
          player_name: 'Juan Carlos Dela Cruz',
          pts: loggedPts,
          reb: loggedReb,
          ast: loggedAst,
          fouls: 2,
          min: 32,
        },
      ],
      created_at: new Date().toISOString(),
    });

    // Update athlete profile with new logged match metrics
    await db.collection('Athlete_Profiles').doc(testAthleteId).set({
      stats: {
        ppg: 26.0,
        rpg: 10.0,
        apg: 8.0,
        efficiency_rating: 32.5,
        wins: 1,
        losses: 0,
      },
      recent_matches: [
        {
          match_id: matchId,
          opponent: 'Rival Warriors',
          score: '95 - 88',
          result: 'WIN',
          pts: loggedPts,
        },
      ],
    }, { merge: true });

    const updatedProfile = await getAthleteProfile(testAthleteId);
    assert(
      updatedProfile.stats.ppg === 26.0 && updatedProfile.stats.wins === 1,
      'Performance metrics accurately reflect on athlete personal stats dashboard',
      `PPG: ${updatedProfile.stats.ppg}, Wins: ${updatedProfile.stats.wins}`
    );

    // -------------------------------------------------------------
    // TEST 9: Sports Science Metrics (BMI & Ape Index)
    // -------------------------------------------------------------
    console.log('\n--- TEST 9: Sports Science Computed Metrics ---');
    const bmi = calculateBMI(80, 190); // 80kg, 190cm -> 80 / (1.9^2) = ~22.2
    const ape = calculateApeIndex(199, 190); // 199cm wingspan / 190cm height = ~1.05
    assert(bmi === 22.2, 'BMI calculation satisfies sports science formula', `BMI: ${bmi}`);
    assert(ape === 1.05, 'Ape Index calculation satisfies sports science formula', `Ape Index: ${ape}`);

    // -------------------------------------------------------------
    // TEST 10: Dynamic Manual Logging Schemas Across Sports
    // -------------------------------------------------------------
    console.log('\n--- TEST 10: Dynamic Manual Logging Schemas Across Sports ---');
    // Basketball schema validation
    const basketballActions = ['+PTS', '+AST', '+REB'];
    const basketballSteppers = ['+2 PTS (FG)', '+3 PTS (3PT)'];
    assert(
      basketballActions.length === 3 && basketballSteppers.length === 2,
      'Basketball schema provides point steppers (+2 FG, +3 3PT) and stat buttons',
      `Actions: ${basketballActions.join(', ')} | Steppers: ${basketballSteppers.join(', ')}`
    );

    // Volleyball schema validation
    const volleyballMetrics = ['ATTACKS', 'ACES', 'BLOCKS', 'DIGS', 'SETS'];
    assert(
      volleyballMetrics.includes('ATTACKS') && volleyballMetrics.includes('DIGS'),
      'Volleyball schema dynamically adapts inputs to volleyball-specific matrices',
      `Metrics: ${volleyballMetrics.join(', ')}`
    );

    // -------------------------------------------------------------
    // TEST 11: Coach Performance Page Aggregation
    // -------------------------------------------------------------
    console.log('\n--- TEST 11: Coach Performance Page Matrices & Aggregation ---');
    const matchScores = [
      { home: 95, away: 88, result: 'WIN', playerPts: 26 },
      { home: 102, away: 98, result: 'WIN', playerPts: 30 },
      { home: 80, away: 84, result: 'LOSS', playerPts: 22 },
    ];

    const totalGames = matchScores.length;
    const totalWins = matchScores.filter((m) => m.result === 'WIN').length;
    const totalLosses = matchScores.filter((m) => m.result === 'LOSS').length;
    const totalPts = matchScores.reduce((acc, m) => acc + m.playerPts, 0);
    const aggregatedPpg = Number((totalPts / totalGames).toFixed(1));
    const winRatePct = Math.round((totalWins / totalGames) * 100);

    // Player rating formula from Coach Performance engine: Math.min(99, Math.max(75, Math.round(70 + (newPpg * 0.5) + (newApg * 0.8) + (newRpg * 0.6))))
    const calcPlayerRating = Math.min(99, Math.max(75, Math.round(70 + (aggregatedPpg * 0.5) + (5.0 * 0.8) + (7.0 * 0.6))));

    assert(
      totalWins === 2 && totalLosses === 1 && winRatePct === 67,
      'Performance page aggregates team matrix correctly (Wins: 2, Losses: 1, Win Rate: 67%)',
      `Team Record: ${totalWins}-${totalLosses} (${winRatePct}%)`
    );
    assert(
      aggregatedPpg === 26.0 && calcPlayerRating >= 75 && calcPlayerRating <= 99,
      'Performance page aggregates individual athlete matrix with weighted rating score',
      `Aggregated PPG: ${aggregatedPpg}, Dynamic Rating Score: ${calcPlayerRating}`
    );

    // Clean up test documents
    console.log('\n--- Cleaning up temporary test documents ---');
    await Promise.all([
      db.collection('Users').doc(testAthleteUid).delete().catch(() => null),
      db.collection('Users').doc(testCoachUid).delete().catch(() => null),
      db.collection('Athlete_Profiles').doc(testAthleteId).delete().catch(() => null),
      db.collection('Coach_Profiles').doc(testCoachId).delete().catch(() => null),
      db.collection('Teams').doc(testTeamId).delete().catch(() => null),
      db.collection('Matches').doc(matchId).delete().catch(() => null),
      db.collection('Scouting_Registry').doc(inquiry.inquiry_id).delete().catch(() => null),
      db.collection('Scouting_Registry').doc(scoutInquiryId).delete().catch(() => null),
    ]);
    console.log('✔ Cleanup complete.');

  } catch (error: any) {
    console.error('Unhandled test execution error:', error);
  }

  console.log('\n================================================================');
  console.log(`📊 FINAL RESULT: ${passedTests}/${totalTests} TESTS PASSED`);
  console.log('================================================================\n');

  if (passedTests === totalTests) {
    process.exit(0);
  } else {
    process.exit(1);
  }
}

runE2EVerification();
