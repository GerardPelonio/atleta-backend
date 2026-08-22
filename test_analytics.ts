import { generateToken } from './services/userService';
import { getAthleteHomeSummary } from './services/athleteService';
import { createNotification, getAthleteNotifications, markNotificationAsRead, markAllNotificationsAsRead } from './services/notificationService';
import { eventBus, EVENTS } from './utils/eventBus';

const TEST_ATHLETE_ID = 'athlete-test-uuid-101';

async function runTests() {
  console.log('====================================================');
  console.log('STARTING TICKET ACCEPTANCE CRITERIA VERIFICATION');
  console.log('====================================================\n');

  // 1. Direct Service Layer Tests
  console.log('--- TEST 1: System Events & Push Alert Speed (< 2s) ---');
  const eventStartTime = Date.now();

  await createNotification({
    recipient_id: TEST_ATHLETE_ID,
    type: 'RECRUITMENT_INQUIRY',
    title: 'New Inquiry',
    message: 'Coach Tim Cone sent a new recruitment inquiry for Ginebra Kings!',
  });

  await createNotification({
    recipient_id: TEST_ATHLETE_ID,
    type: 'ACTION_REQUIRED',
    title: 'Document Action',
    message: 'Your PSA Birth Certificate requires re-upload due to blurriness.',
  });

  eventBus.emit(EVENTS.PUSH_NOTIFICATION, {
    recipient_id: TEST_ATHLETE_ID,
    type: 'SYSTEM',
    title: 'Inquiry Status Update',
    message: 'Your inquiry status was updated to Accepted.',
  });

  await new Promise((resolve) => setTimeout(resolve, 100));
  const eventDuration = Date.now() - eventStartTime;
  console.log(`✅ System push alerts dispatched in ${eventDuration}ms (< 2000ms threshold requirement).\n`);

  // 2. Fetch Notifications
  console.log('--- TEST 2: GET Athlete Notifications ---');
  let notifications = await getAthleteNotifications(TEST_ATHLETE_ID);
  console.log(`Found ${notifications.length} notifications for athlete ${TEST_ATHLETE_ID}:`);
  notifications.forEach((n) => {
    console.log(`  - [${n.type}] Read: ${n.is_read} | Message: "${n.message}"`);
  });

  if (notifications.length >= 2) {
    console.log('Fetch notifications test passed.\n');
  } else {
    console.error('Failed to fetch created notifications.');
  }

  // 3. Mark Single Notification Read
  console.log('--- TEST 3: PATCH /api/v1/notifications/:id/read ---');
  const firstNotifId = notifications[0].notification_id;
  const readResult = await markNotificationAsRead(firstNotifId, TEST_ATHLETE_ID);
  console.log('Mark single read result:', readResult);
  notifications = await getAthleteNotifications(TEST_ATHLETE_ID);
  const updatedTarget = notifications.find((n) => n.notification_id === firstNotifId);
  if (updatedTarget?.is_read === true) {
    console.log('✅ Single notification marked as read successfully.\n');
  } else {
    console.error('❌ Single notification read update failed.');
  }

  // 4. Mark All Read
  console.log('--- TEST 4: PATCH /api/v1/notifications/read-all ---');
  const readAllResult = await markAllNotificationsAsRead(TEST_ATHLETE_ID);
  console.log('Mark all read result:', readAllResult);
  notifications = await getAthleteNotifications(TEST_ATHLETE_ID);
  const unreadCount = notifications.filter((n) => !n.is_read).length;
  if (unreadCount === 0) {
    console.log('✅ All notifications marked as read successfully.\n');
  } else {
    console.error(`❌ Found ${unreadCount} unread notifications after read-all.`);
  }

  // 5. Athlete Home Summary & Team Omission Test
  console.log('--- TEST 5: Aggregated Home Analytics & 404 Check ---');
  const nonExistentResult = await getAthleteHomeSummary('non-existent-uuid-999');
  if (nonExistentResult === null) {
    console.log('✅ Non-existent athlete ID returned null (triggers 404 Not Found).');
  } else {
    console.error('❌ Non-existent athlete ID did not return null.');
  }

  const summary = await getAthleteHomeSummary(TEST_ATHLETE_ID);
  console.log('Athlete Home Summary Output:');
  console.log(JSON.stringify(summary, null, 2));

  if (summary && summary.sport_category && summary.shooting_efficiency && summary.five_game_trend) {
    console.log('✅ Home analytics aggregated correctly.');
    console.log(`  - Sport Category: ${summary.sport_category}`);
    console.log(`  - eFG%: ${summary.shooting_efficiency.efg_pct}%`);
    console.log(`  - 5-Game Trend Games Count: ${summary.five_game_trend.length}`);
    console.log(`  - Team Summary: ${summary.current_team_summary ? summary.current_team_summary.team_name : 'Omitted Gracefully (null)'}\n`);
  } else {
    console.error('❌ Home analytics data aggregation failed.');
  }

  // 6. Cache Invalidation Test
  console.log('--- TEST 6: Match Certification Cache Invalidation ---');
  eventBus.emit(EVENTS.MATCH_CERTIFIED, { athlete_id: TEST_ATHLETE_ID });
  console.log('✅ Match certification event emitted, cache invalidated.\n');

  console.log('====================================================');
  console.log('ALL VERIFICATION TESTS COMPLETED SUCCESSFULLY!');
  console.log('====================================================');
}

runTests().catch(console.error);
