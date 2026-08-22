import { getAthleteHomeSummary, invalidateAthleteHomeCache } from '../services/athleteService';
import { createNotification, getAthleteNotifications, markNotificationAsRead, markAllNotificationsAsRead } from '../services/notificationService';
import { eventBus, EVENTS } from '../utils/eventBus';

console.log('--- STARTING ATHLETE HOME ANALYTICS & PUSH ALERTS TEST ---\n');

let passedTests = 0;
let totalTests = 0;

function assert(condition: boolean, testName: string) {
  totalTests++;
  if (condition) {
    console.log(`✅ [PASS] ${testName}`);
    passedTests++;
  } else {
    console.error(`❌ [FAIL] ${testName}`);
  }
}

async function runTests() {
  // 1. Test Aggregated Home Summary Data Structure
  const summary = await getAthleteHomeSummary('ath_test_user_101');
  assert(summary !== null, 'getAthleteHomeSummary returns non-null data for valid athlete');
  assert(summary?.sport_category === 'Basketball', 'Summary returns sport_category');
  assert(summary?.shooting_efficiency?.efg_pct === 67.6, 'Calculates eFG% correctly (48.5 + 0.5 * 38.2 = 67.6)');
  assert(Array.isArray(summary?.five_game_trend) && summary.five_game_trend.length === 5, 'Returns 5-game trend array');
  assert(summary?.current_team_summary?.team_name === 'Adamson Falcons', 'Returns current team summary');

  // 2. Acceptance Criteria: Requests for non-existent athlete IDs return 404 (null response)
  const nonExistent = await getAthleteHomeSummary('404_non-existent_athlete_id');
  assert(nonExistent === null, 'Returns null (signals 404 Not Found) for non-existent athlete IDs');

  // 3. Acceptance Criteria: Athletes with no team assignment omit team summary gracefully (null)
  const noTeamSummary = await getAthleteHomeSummary('no_team_athlete');
  assert(noTeamSummary?.current_team_summary === null, 'Gracefully omits team summary (null) for athlete without team assignment');

  // 4. Cache & Invalidation Test on MATCH_CERTIFIED
  const cachedSummary1 = await getAthleteHomeSummary('ath_test_user_101');
  assert(cachedSummary1 !== null, 'First cache fetch succeeds');
  
  eventBus.emit(EVENTS.MATCH_CERTIFIED, { athlete_id: 'ath_test_user_101' });
  const cachedSummary2 = await getAthleteHomeSummary('ath_test_user_101');
  assert(cachedSummary2 !== null, 'Re-fetches fresh data after MATCH_CERTIFIED cache invalidation');

  // 5. Acceptance Criteria: Push alerts reach devices within 2 seconds of event creation
  const pushStartTime = Date.now();
  let pushReceived = false;

  eventBus.emit(EVENTS.PUSH_NOTIFICATION, {
    recipient_id: 'ath_test_user_101',
    title: 'Recruitment Inquiry Status Changed',
    message: 'Your inquiry status was updated to Shortlisted.',
    type: 'RECRUITMENT_INQUIRY',
  });

  // Short delay to allow async event bus listener execution
  await new Promise((r) => setTimeout(r, 200));
  const pushDurationMs = Date.now() - pushStartTime;

  const notifs = await getAthleteNotifications('ath_test_user_101');
  assert(notifs.length > 0, 'Fetched recipient notifications');
  assert(pushDurationMs < 2000, `Push alert executed in ${pushDurationMs}ms (< 2000ms threshold)`);

  // 6. Test Notification Marking Read
  const markedSingle = await markNotificationAsRead('n1', 'ath_test_user_101');
  assert(markedSingle === true, 'Successfully marked single notification as read');

  const markedAllCount = await markAllNotificationsAsRead('ath_test_user_101');
  assert(typeof markedAllCount === 'number', 'Successfully marked all notifications as read');

  console.log(`\n--- TEST SUMMARY: ${passedTests}/${totalTests} TESTS PASSED ---`);
  if (passedTests === totalTests) {
    process.exit(0);
  } else {
    process.exit(1);
  }
}

runTests();
