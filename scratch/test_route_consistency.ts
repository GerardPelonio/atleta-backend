import http from 'http';
import app from '../app';

console.log('==========================================================');
console.log('EXPRESS ROUTE CONSISTENCY & NAMED ENDPOINTS TEST SUITE');
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
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const address = server.address() as { port: number };
  const baseUrl = `http://127.0.0.1:${address.port}`;

  async function request(method: string, path: string, headers: Record<string, string> = {}, body?: any) {
    const res = await fetch(`${baseUrl}${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...headers,
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    let data;
    try {
      data = await res.json();
    } catch {
      data = null;
    }
    return { status: res.status, data };
  }

  try {
    // ─── 1. Health & Root ───────────────────────────────────────────
    console.log('--- 1. Health & Root API Endpoints ---');
    const rootRes = await request('GET', '/');
    assert(rootRes.status === 200 && rootRes.data.success, 'GET / returns 200 success');

    const healthRes = await request('GET', '/health');
    assert(healthRes.status === 200 && healthRes.data.status === 'healthy', 'GET /health returns 200 healthy');

    // ─── 2. Teams Endpoints (Named & Root) ──────────────────────────
    console.log('\n--- 2. Teams Endpoints ---');
    // Without token -> 401 Unauthorized (proves route was matched and reached authMiddleware)
    const teamsRoot = await request('GET', '/api/v1/teams');
    assert(teamsRoot.status === 401, 'GET /api/v1/teams matches route (401 without token)');

    const teamsBrowse = await request('GET', '/api/v1/teams/browse');
    assert(teamsBrowse.status === 401, 'GET /api/v1/teams/browse matches route (401 without token)');

    const teamsSearch = await request('GET', '/api/v1/teams/search');
    assert(teamsSearch.status === 401, 'GET /api/v1/teams/search matches route (401 without token)');

    const teamsList = await request('GET', '/api/v1/teams/list');
    assert(teamsList.status === 401, 'GET /api/v1/teams/list matches route (401 without token)');

    const teamsCreate = await request('POST', '/api/v1/teams/create');
    assert(teamsCreate.status === 401, 'POST /api/v1/teams/create matches route (401 without token)');

    const teamsCreateRoot = await request('POST', '/api/v1/teams');
    assert(teamsCreateRoot.status === 401, 'POST /api/v1/teams matches route (401 without token)');

    const teamRosterPatch = await request('PATCH', '/api/v1/teams/team_123/roster');
    assert(teamRosterPatch.status === 401, 'PATCH /api/v1/teams/:teamId/roster matches route (401 without token)');

    const teamRosterPost = await request('POST', '/api/v1/teams/team_123/roster');
    assert(teamRosterPost.status === 401, 'POST /api/v1/teams/:teamId/roster matches route (401 without token)');

    // ─── 3. Inquiries Endpoints (Named & Root) ──────────────────────
    console.log('\n--- 3. Inquiries Endpoints ---');
    const inqRoot = await request('GET', '/api/v1/inquiries');
    assert(inqRoot.status === 401, 'GET /api/v1/inquiries matches route (401 without token)');

    const inqList = await request('GET', '/api/v1/inquiries/list');
    assert(inqList.status === 401, 'GET /api/v1/inquiries/list matches route (401 without token)');

    const inqMe = await request('GET', '/api/v1/inquiries/me');
    assert(inqMe.status === 401, 'GET /api/v1/inquiries/me matches route (401 without token)');

    const inqSubmit = await request('POST', '/api/v1/inquiries/submit');
    assert(inqSubmit.status === 401, 'POST /api/v1/inquiries/submit matches route (401 without token)');

    const inqCreate = await request('POST', '/api/v1/inquiries/create');
    assert(inqCreate.status === 401, 'POST /api/v1/inquiries/create matches route (401 without token)');

    const inqSend = await request('POST', '/api/v1/inquiries/send');
    assert(inqSend.status === 401, 'POST /api/v1/inquiries/send matches route (401 without token)');

    const inqPostRoot = await request('POST', '/api/v1/inquiries');
    assert(inqPostRoot.status === 401, 'POST /api/v1/inquiries matches route (401 without token)');

    const inqRespondPatch = await request('PATCH', '/api/v1/inquiries/inq_123/respond');
    assert(inqRespondPatch.status === 401, 'PATCH /api/v1/inquiries/:inquiryId/respond matches route (401 without token)');

    const inqRespondPost = await request('POST', '/api/v1/inquiries/inq_123/respond');
    assert(inqRespondPost.status === 401, 'POST /api/v1/inquiries/:inquiryId/respond matches route (401 without token)');

    // ─── 4. Matches Endpoints (Named & Root) ────────────────────────
    console.log('\n--- 4. Matches Endpoints ---');
    const matchSubmit = await request('POST', '/api/v1/matches/submit');
    assert(matchSubmit.status === 401, 'POST /api/v1/matches/submit matches route (401 without token)');

    const matchCreate = await request('POST', '/api/v1/matches/create');
    assert(matchCreate.status === 401, 'POST /api/v1/matches/create matches route (401 without token)');

    const matchLog = await request('POST', '/api/v1/matches/log');
    assert(matchLog.status === 401, 'POST /api/v1/matches/log matches route (401 without token)');

    const matchRoot = await request('POST', '/api/v1/matches');
    assert(matchRoot.status === 401, 'POST /api/v1/matches matches route (401 without token)');

    const matchOfficial = await request('POST', '/api/v1/matches/official');
    assert(matchOfficial.status === 401, 'POST /api/v1/matches/official matches route (401 without token)');

    const matchCreateOfficial = await request('POST', '/api/v1/matches/create-official');
    assert(matchCreateOfficial.status === 401, 'POST /api/v1/matches/create-official matches route (401 without token)');

    const matchDetails = await request('GET', '/api/v1/matches/match_123/details');
    assert(matchDetails.status === 401, 'GET /api/v1/matches/:matchId/details matches route (401 without token)');

    const matchDirect = await request('GET', '/api/v1/matches/match_123');
    assert(matchDirect.status === 401, 'Direct GET /api/v1/matches/:matchId matches route (401 without token)');

    const matchBoxscore = await request('GET', '/api/v1/matches/match_123/boxscore');
    assert(matchBoxscore.status === 401, 'GET /api/v1/matches/:matchId/boxscore matches route (401 without token)');

    // ─── 5. Sports Catalog Endpoints (Named & Root) ─────────────────
    console.log('\n--- 5. Sports Catalog Endpoints ---');
    const sportsList = await request('GET', '/api/v1/sports/list');
    assert(sportsList.status === 401, 'GET /api/v1/sports/list matches route (401 without token)');

    const sportsAll = await request('GET', '/api/v1/sports/all');
    assert(sportsAll.status === 401, 'GET /api/v1/sports/all matches route (401 without token)');

    const sportsBrowse = await request('GET', '/api/v1/sports/browse');
    assert(sportsBrowse.status === 401, 'GET /api/v1/sports/browse matches route (401 without token)');

    const sportsRoot = await request('GET', '/api/v1/sports');
    assert(sportsRoot.status === 401, 'GET /api/v1/sports matches route (401 without token)');

    const sportsCreate = await request('POST', '/api/v1/sports/create');
    assert(sportsCreate.status === 401, 'POST /api/v1/sports/create matches route (401 without token)');

    const sportsPostRoot = await request('POST', '/api/v1/sports');
    assert(sportsPostRoot.status === 401, 'POST /api/v1/sports matches route (401 without token)');

    const sportDetail = await request('GET', '/api/v1/sports/sport_123');
    assert(sportDetail.status === 401, 'GET /api/v1/sports/:sportId matches route (401 without token)');

    // ─── 6. Notifications Endpoints ─────────────────────────────────
    console.log('\n--- 6. Notifications Endpoints ---');
    const notifMe = await request('GET', '/api/v1/notifications/me');
    assert(notifMe.status === 401, 'GET /api/v1/notifications/me matches route (401 without token)');

    const notifList = await request('GET', '/api/v1/notifications/list');
    assert(notifList.status === 401, 'GET /api/v1/notifications/list matches route (401 without token)');

    const notifRoot = await request('GET', '/api/v1/notifications');
    assert(notifRoot.status === 401, 'GET /api/v1/notifications matches route (401 without token)');

    const notifReadAllPatch = await request('PATCH', '/api/v1/notifications/read-all');
    assert(notifReadAllPatch.status === 401, 'PATCH /api/v1/notifications/read-all matches route (401 without token)');

    const notifReadAllPost = await request('POST', '/api/v1/notifications/read-all');
    assert(notifReadAllPost.status === 401, 'POST /api/v1/notifications/read-all matches route (401 without token)');

    // ─── 7. Users Auth & Profile Endpoints ──────────────────────────
    console.log('\n--- 7. Users Auth & Profile Endpoints ---');
    const userRegAth = await request('POST', '/api/v1/users/register-athlete', {}, {});
    assert(userRegAth.status === 400, 'POST /api/v1/users/register-athlete responds (400 validation error on empty body)');

    const userReg = await request('POST', '/api/v1/users/register', {}, {});
    assert(userReg.status === 400, 'POST /api/v1/users/register responds (400 validation error)');

    const userRegCoach = await request('POST', '/api/v1/users/register-coach', {}, {});
    assert(userRegCoach.status === 400, 'POST /api/v1/users/register-coach responds (400 validation error)');

    const userRegOff = await request('POST', '/api/v1/users/register-official', {}, {});
    assert(userRegOff.status === 400, 'POST /api/v1/users/register-official responds (400 validation error)');

    const userProfile = await request('GET', '/api/v1/users/profile');
    assert(userProfile.status === 401, 'GET /api/v1/users/profile matches route (401 without token)');

    const userMe = await request('GET', '/api/v1/users/me');
    assert(userMe.status === 401, 'GET /api/v1/users/me matches route (401 without token)');

    const userPassReq = await request('POST', '/api/v1/users/password-reset', {}, { email: 'invalid-email' });
    assert(userPassReq.status === 400, 'POST /api/v1/users/password-reset correctly routes to requestPasswordReset');

    const userPassConfirm = await request('POST', '/api/v1/users/password-reset/confirm', {}, { token: 't', new_password: 'pass' });
    assert(userPassConfirm.status === 400, 'POST /api/v1/users/password-reset/confirm routes to resetPassword');

    // ─── 8. Athlete Endpoints ───────────────────────────────────────
    console.log('\n--- 8. Athlete Endpoints ---');
    const athRoot = await request('GET', '/api/v1/athletes');
    assert(athRoot.status === 401, 'GET /api/v1/athletes matches route (401 without token)');

    const athList = await request('GET', '/api/v1/athletes/list');
    assert(athList.status === 401, 'GET /api/v1/athletes/list matches route (401 without token)');

    const athSearch = await request('GET', '/api/v1/athletes/search');
    assert(athSearch.status === 401, 'GET /api/v1/athletes/search matches route (401 without token)');

    const athStats = await request('GET', '/api/v1/athletes/stats');
    assert(athStats.status === 401, 'GET /api/v1/athletes/stats matches route (401 without token)');

    const athStatsAll = await request('GET', '/api/v1/athletes/stats/all');
    assert(athStatsAll.status === 401, 'GET /api/v1/athletes/stats/all matches route (401 without token)');

    const athProfile = await request('GET', '/api/v1/athletes/profile');
    assert(athProfile.status === 401, 'GET /api/v1/athletes/profile matches route (401 without token)');

    const athMe = await request('GET', '/api/v1/athletes/me');
    assert(athMe.status === 401, 'GET /api/v1/athletes/me matches route (401 without token)');

    // ─── 9. Coach Endpoints ─────────────────────────────────────────
    console.log('\n--- 9. Coach Endpoints ---');
    const coachProfile = await request('GET', '/api/v1/coaches/profile');
    assert(coachProfile.status === 401, 'GET /api/v1/coaches/profile matches route (401 without token)');

    const coachMe = await request('GET', '/api/v1/coaches/me');
    assert(coachMe.status === 401, 'GET /api/v1/coaches/me matches route (401 without token)');

    const coachSettings = await request('GET', '/api/v1/coaches/settings');
    assert(coachSettings.status === 401, 'GET /api/v1/coaches/settings matches route (401 without token)');

    const coachSettingsMe = await request('GET', '/api/v1/coaches/me/settings');
    assert(coachSettingsMe.status === 401, 'GET /api/v1/coaches/me/settings matches route (401 without token)');

    // ─── 10. Official Endpoints ─────────────────────────────────────
    console.log('\n--- 10. Official Endpoints ---');
    const offRoot = await request('GET', '/api/v1/officials');
    assert(offRoot.status === 401, 'GET /api/v1/officials matches route (401 without token)');

    const offProfile = await request('GET', '/api/v1/officials/profile');
    assert(offProfile.status === 401, 'GET /api/v1/officials/profile matches route (401 without token)');

    const offMe = await request('GET', '/api/v1/officials/me');
    assert(offMe.status === 401, 'GET /api/v1/officials/me matches route (401 without token)');

    const offSettings = await request('GET', '/api/v1/officials/settings');
    assert(offSettings.status === 401, 'GET /api/v1/officials/settings matches route (401 without token)');

    // ─── 11. Scouting Endpoints ─────────────────────────────────────
    console.log('\n--- 11. Scouting Endpoints ---');
    const scoutSearch = await request('GET', '/api/v1/scouting/search');
    assert(scoutSearch.status === 401, 'GET /api/v1/scouting/search matches route (401 without token)');

    const scoutAthletes = await request('GET', '/api/v1/scouting/athletes');
    assert(scoutAthletes.status === 401, 'GET /api/v1/scouting/athletes matches route (401 without token)');

    const scoutLeaderboard = await request('GET', '/api/v1/scouting/leaderboard');
    assert(scoutLeaderboard.status === 401, 'GET /api/v1/scouting/leaderboard matches route (401 without token)');

    const scoutRankings = await request('GET', '/api/v1/scouting/rankings');
    assert(scoutRankings.status === 401, 'GET /api/v1/scouting/rankings matches route (401 without token)');

    const scoutPropCreate = await request('POST', '/api/v1/scouting/proposals/create');
    assert(scoutPropCreate.status === 401, 'POST /api/v1/scouting/proposals/create matches route (401 without token)');

    const scoutPropList = await request('GET', '/api/v1/scouting/proposals/list');
    assert(scoutPropList.status === 401, 'GET /api/v1/scouting/proposals/list matches route (401 without token)');

    // ─── 12. Admin Endpoints ────────────────────────────────────────
    console.log('\n--- 12. Admin Endpoints ---');
    const adminProfile = await request('GET', '/api/v1/admin/profile');
    assert(adminProfile.status === 401, 'GET /api/v1/admin/profile matches route (401 without token)');

    const adminMe = await request('GET', '/api/v1/admin/me');
    assert(adminMe.status === 401, 'GET /api/v1/admin/me matches route (401 without token)');

    const adminQueue = await request('GET', '/api/v1/admin/coaches/queue');
    assert(adminQueue.status === 401, 'GET /api/v1/admin/coaches/queue matches route (401 without token)');

    const adminCoachQueue = await request('GET', '/api/v1/admin/coach-queue');
    assert(adminCoachQueue.status === 401, 'GET /api/v1/admin/coach-queue matches route (401 without token)');

    // ─── 13. Validations Endpoints ──────────────────────────────────
    console.log('\n--- 13. Validations Endpoints ---');
    const valPending = await request('GET', '/api/v1/validations/pending');
    assert(valPending.status === 401, 'GET /api/v1/validations/pending matches route (401 without token)');

    const valList = await request('GET', '/api/v1/validations/list');
    assert(valList.status === 401, 'GET /api/v1/validations/list matches route (401 without token)');

    const valRoot = await request('GET', '/api/v1/validations');
    assert(valRoot.status === 401, 'GET /api/v1/validations matches route (401 without token)');

    const valCertifyPost = await request('POST', '/api/v1/validations/val_123/certify');
    assert(valCertifyPost.status === 401, 'POST /api/v1/validations/:id/certify matches route (401 without token)');

    const valCertifyPatch = await request('PATCH', '/api/v1/validations/val_123/certify');
    assert(valCertifyPatch.status === 401, 'PATCH /api/v1/validations/:id/certify matches route (401 without token)');

    // ─── 14. Analytics Endpoints ────────────────────────────────────
    console.log('\n--- 14. Analytics Endpoints ---');
    const analyticsSrpe = await request('POST', '/api/v1/analytics/srpe');
    assert(analyticsSrpe.status === 401, 'POST /api/v1/analytics/srpe matches route (401 without token)');

    const analyticsWorkloadPost = await request('POST', '/api/v1/analytics/workload');
    assert(analyticsWorkloadPost.status === 401, 'POST /api/v1/analytics/workload matches route (401 without token)');

    const analyticsWorkloadGet = await request('GET', '/api/v1/analytics/workload');
    assert(analyticsWorkloadGet.status === 401, 'GET /api/v1/analytics/workload matches route (401 without token)');

    // ─── 15. Non-Existent Route (404 Test) ──────────────────────────
    console.log('\n--- 15. 404 Fallback Test ---');
    const notFound = await request('GET', '/api/v1/non_existent_random_route_xyz');
    assert(notFound.status === 404, 'Non-existent route returns 404 Not Found');

  } finally {
    server.close();
  }

  console.log('\n==========================================================');
  console.log(`TOTAL TESTS: ${total} | PASSED: ${passed} | FAILED: ${total - passed}`);
  console.log('==========================================================\n');

  if (passed === total) {
    console.log('🎉 ALL 62 ROUTE INTEGRATION TESTS PASSED!');
    process.exit(0);
  } else {
    console.error('❌ SOME ROUTE INTEGRATION TESTS FAILED.');
    process.exit(1);
  }
}

runTests().catch(err => {
  console.error('Test runner fatal error:', err);
  process.exit(1);
});
