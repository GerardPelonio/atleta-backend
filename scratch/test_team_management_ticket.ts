import { validateCreateTeam, validateUpdateRoster } from '../validators/teamValidator';
import { createTeam, getCoachTeams, updateTeamRoster, searchAthletes, getTeamDetails } from '../services/teamService';
import { db } from '../utils/firebaseAdmin';
import { cleanAllTestData } from './clean_test_data';

console.log('==========================================================');
console.log('TEAM MANAGEMENT & ELEGIBILITY VERIFICATION — TEST SUITE');
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
  // ─── 1. Validator Tests ────────────────────────────────────────────

  console.log('--- TEST GROUP 1: Team & Roster Validation ---');

  const invalidTeam = validateCreateTeam({});
  assert(invalidTeam.length >= 3, 'Create team without team_name, sport_type, division rejected (400 Bad Request rule)');

  const validTeamData = validateCreateTeam({
    team_name: 'Adamson Falcons',
    sport_type: 'Basketball',
    division: 'Varsity Division 1',
  });
  assert(validTeamData.length === 0, 'Valid team creation data passes validation');

  const invalidRoster = validateUpdateRoster({ roster: 'not_an_array' });
  assert(invalidRoster.length > 0, 'Invalid roster payload rejected');

  // ─── 2. Team Creation & Coach Team Retrieval ───────────────────────

  console.log('\n--- TEST GROUP 2: Team Creation & Coach Directory ---');

  const testCoachId = `coach_test_${Date.now()}`;

  const createdTeam = await createTeam(testCoachId, {
    team_name: 'AdU Falcons Men Basketball',
    sport_type: 'Basketball',
    division: 'UAAP Seniors Division 1',
    region: 'NCR',
    description: 'Adamson University Men Basketball Team',
  });

  assert(createdTeam.team_id !== undefined, 'createTeam returned valid team_id');
  assert(createdTeam.division === 'UAAP Seniors Division 1', 'Division field set correctly');
  assert(createdTeam.season_record.wins === 0 && createdTeam.season_record.losses === 0, 'Default season record initialized to { wins: 0, losses: 0 }');

  const coachTeams = await getCoachTeams(testCoachId);
  assert(coachTeams.length === 1 && coachTeams[0].team_id === createdTeam.team_id, 'getCoachTeams retrieved team managed by coach');

  // ─── 3. Athlete Autocomplete & Eligibility Verification Check ─────

  console.log('\n--- TEST GROUP 3: Athlete Autocomplete & Roster Eligibility Lock ---');

  // Seed 1 verified athlete (with docs) and 1 unverified athlete (no docs)
  const verifiedAthId = `ath_test_verified_${Date.now()}`;
  const unverifiedAthId = `ath_test_unverified_${Date.now()}`;

  await db.collection('Athlete_Profiles').doc(verifiedAthId).set({
    athlete_id: verifiedAthId,
    user_id: verifiedAthId,
    first_name: 'Jerom',
    last_name: 'Lastimosa',
    position: 'Point Guard',
    sport_type: 'Basketball',
    eligibility_documents: ['https://atleta.ph/docs/psa_jerom.pdf'],
  });

  await db.collection('Athlete_Profiles').doc(unverifiedAthId).set({
    athlete_id: unverifiedAthId,
    user_id: unverifiedAthId,
    first_name: 'Unverified',
    last_name: 'Player',
    position: 'Shooting Guard',
    sport_type: 'Basketball',
    eligibility_documents: [], // Empty eligibility documents!
  });

  const searchResults = await searchAthletes('Jerom');
  assert(searchResults.length > 0, 'searchAthletes found athlete by name');
  const jerom = searchResults.find((a: any) => a.athlete_id === verifiedAthId);
  assert(jerom !== undefined && jerom.is_eligibility_verified === true, 'Verified athlete returns is_eligibility_verified = true');

  // 3a. Updating roster with unverified athlete without override flag MUST throw 400
  try {
    await updateTeamRoster(testCoachId, createdTeam.team_id, [
      { athlete_id: verifiedAthId, position: 'Point Guard', jersey_number: 7 },
      { athlete_id: unverifiedAthId, position: 'Shooting Guard', jersey_number: 23 },
    ], false);
    assert(false, 'Roster update with unverified athlete should throw 400 Bad Request error');
  } catch (err: any) {
    assert(err.statusCode === 400 && err.message.includes('unverified or missing eligibility documents'), 'Unverified athlete blocks roster confirmation (400 Bad Request)');
  }

  // 3b. Updating roster with override_unverified: true succeeds
  const updatedTeamDetail = await updateTeamRoster(testCoachId, createdTeam.team_id, [
    { athlete_id: verifiedAthId, position: 'Point Guard', jersey_number: 7 },
    { athlete_id: unverifiedAthId, position: 'Shooting Guard', jersey_number: 23 },
  ], true);

  assert(updatedTeamDetail !== null && updatedTeamDetail.roster.length === 2, 'Roster updated successfully when override_unverified: true is passed');
  assert(updatedTeamDetail?.roster[0].jersey_number === 7, 'Assigned jersey number saved');

  // ─── 4. Authorization & Security Checks ───────────────────────────

  console.log('\n--- TEST GROUP 4: Coach Management Security Authorization ---');

  const unauthorizedCoachId = `coach_other_${Date.now()}`;
  try {
    await updateTeamRoster(unauthorizedCoachId, createdTeam.team_id, [
      { athlete_id: verifiedAthId },
    ], true);
    assert(false, 'Unauthorized coach editing another coach team should throw 403 error');
  } catch (err: any) {
    assert(err.statusCode === 403, 'Coach editing unmanaged team returns HTTP 403 Forbidden');
  }

  // ─── 5. Cleanup Test Data ─────────────────────────────────────────

  console.log('\n--- TEST GROUP 5: Firestore Test Data Cleanup ---');
  await db.collection('Teams').doc(createdTeam.team_id).delete();
  await db.collection('Athlete_Profiles').doc(verifiedAthId).delete();
  await db.collection('Athlete_Profiles').doc(unverifiedAthId).delete();
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
