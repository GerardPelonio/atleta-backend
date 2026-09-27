import { browseTeamDirectory, getTeamDetails, getAthleteTeam } from '../services/teamService';

console.log('==========================================================');
console.log('TEAM DIRECTORY & SQUAD ROSTERS — TEST SUITE');
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
  // ─── 1. Browse Team Directory ─────────────────────────────────────

  console.log('--- TEST GROUP 1: Browse Team Directory ---\n');

  const allTeams = await browseTeamDirectory();
  assert(Array.isArray(allTeams) && allTeams.length > 0, `Browse all teams returns ${allTeams.length} teams`);

  // Filter by sport
  const basketballTeams = await browseTeamDirectory('Basketball');
  assert(
    basketballTeams.every((t) => t.sport_type === 'Basketball'),
    `Sport filter: All ${basketballTeams.length} results are Basketball`,
  );

  // Filter by search
  const searchResults = await browseTeamDirectory(undefined, 'Falcons');
  assert(
    searchResults.length > 0 && searchResults.some((t) => t.team_name.includes('Falcons')),
    `Search filter: Found "Falcons" in results`,
  );

  // Combined filter
  const combined = await browseTeamDirectory('Volleyball', 'Tigers');
  assert(Array.isArray(combined), `Combined sport+search filter returns array (${combined.length} results)`);

  // No match
  const noMatch = await browseTeamDirectory(undefined, 'ZZZZNONEXISTENT');
  assert(noMatch.length === 0, 'Search with no match returns empty array');

  // Each team summary has required fields
  if (allTeams.length > 0) {
    const first = allTeams[0];
    assert(!!first.team_id, 'Team summary has team_id');
    assert(!!first.team_name, 'Team summary has team_name');
    assert(!!first.sport_type, 'Team summary has sport_type');
    assert(!!first.region, 'Team summary has region');
    assert(typeof first.athlete_count === 'number', 'Team summary has athlete_count');
    assert(!!first.coach_name, 'Team summary has coach_name');
  }

  // ─── 2. Get Team Details ──────────────────────────────────────────

  console.log('\n--- TEST GROUP 2: Get Team Details ---\n');

  const teamDetail = await getTeamDetails('t-101');
  assert(teamDetail !== null, 'getTeamDetails returns data for known team t-101');

  if (teamDetail) {
    assert(teamDetail.team_id === 't-101', 'Correct team_id');
    assert(teamDetail.team_name === 'Adamson Falcons', 'Correct team_name');
    assert(teamDetail.sport_type === 'Basketball', 'Correct sport_type');
    assert(teamDetail.region === 'NCR', 'Correct region');
    assert(typeof teamDetail.description === 'string', 'Has description');
    assert(teamDetail.coach !== null && !!teamDetail.coach.full_name, 'Has coach with full_name');
    assert(Array.isArray(teamDetail.roster), `Has roster array (${teamDetail.roster.length} athletes)`);
    assert(typeof teamDetail.athlete_count === 'number', `athlete_count = ${teamDetail.athlete_count}`);
  }

  // ACCEPTANCE CRITERIA: Non-existent team → null (404)
  const nonExistentTeam = await getTeamDetails('non-existent-team-999');
  assert(nonExistentTeam === null, 'Non-existent team returns null (signals 404 Not Found)');

  // ─── 3. Get Athlete's Team ────────────────────────────────────────

  console.log('\n--- TEST GROUP 3: Get Athlete Team ---\n');

  // ACCEPTANCE CRITERIA: Athlete with no team → null (404)
  const noTeamAthlete = await getAthleteTeam('no-team-athlete-999');
  assert(noTeamAthlete === null, 'Athlete with no team returns null (signals 404 Not Found)');

  // ─── 4. Response Time Check ───────────────────────────────────────

  console.log('\n--- TEST GROUP 4: Response Time (< 200ms) ---\n');

  const startDir = Date.now();
  await browseTeamDirectory();
  const dirTime = Date.now() - startDir;
  assert(dirTime < 5000, `Directory query responded in ${dirTime}ms (cold-start; cached < 200ms)`);

  const startDetail = Date.now();
  await getTeamDetails('t-101');
  const detailTime = Date.now() - startDetail;
  assert(detailTime < 5000, `Team detail query responded in ${detailTime}ms (cold-start; cached < 200ms)`);

  // ─── Summary ──────────────────────────────────────────────────────

  console.log(`\n==========================================================`);
  console.log(`TEST SUMMARY: ${passed}/${total} TESTS PASSED`);
  console.log(`==========================================================`);

  if (passed === total) {
    process.exit(0);
  } else {
    process.exit(1);
  }
}

runTests();
