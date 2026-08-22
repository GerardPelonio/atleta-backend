import dotenv from 'dotenv';
dotenv.config();

import { db } from '../utils/firebaseAdmin';
import { registerOfficialService } from '../services/officialService';
import {
  getOfficialDashboardMetrics,
  getOfficialSchedules,
  getOfficialNotifications,
  markAllOfficialNotificationsAsRead
} from '../services/officialDashboardService';
import { cleanAllTestData } from './clean_test_data';

console.log('==========================================================');
console.log('OFFICIAL DASHBOARD, SCHEDULES & ALERTS — TEST SUITE');
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
  const timestamp = Date.now();
  const testOrgName = `Test Org League ${timestamp}`;
  const testEmail = `official_dash_test_${timestamp}@atleta.com`;
  const testPassword = 'Password123!';
  const testLegalName = 'Juan Organizer';

  // Seed organization into Tournament_Registry
  await db.collection('Tournament_Registry').doc(`test_org_${timestamp}`).set({
    organization_name: testOrgName,
    status: 'Active',
  });

  // Register Official
  const regResult = await registerOfficialService({
    full_legal_name: testLegalName,
    email: testEmail,
    password: testPassword,
    organization_name: testOrgName,
  });

  const officialId = regResult.profile.official_id;
  const userId = regResult.user.user_id;

  // Warmup Firestore connection to eliminate initial connection latency from performance measurements
  console.log('Warming up database connection...');
  await db.collection('Users').limit(1).get();
  console.log('Warmup complete.\n');

  // ─── 1. Dashboard Metrics Aggregation ──────────────────────────────────
  console.log('--- TEST GROUP 1: Dashboard Metrics & Audit Queue ---');

  const initialMetrics = await getOfficialDashboardMetrics(officialId);

  // Seed 2 matches in Match_Logs
  const matchId1 = `match_test_1_${timestamp}`;
  const matchId2 = `match_test_2_${timestamp}`;

  await db.collection('Match_Logs').doc(matchId1).set({
    match_id: matchId1,
    team_id: 't_test_101',
    sport_type: 'Basketball',
    match_type: 'Tournament',
    match_date: new Date().toISOString(),
    location: 'Smart Araneta Coliseum',
    opponent_team_name: 'DLSU Green Archers',
    game_result: 'WIN',
    timestamp: new Date().toISOString()
  });

  await db.collection('Match_Logs').doc(matchId2).set({
    match_id: matchId2,
    team_id: 't_test_102',
    sport_type: 'Basketball',
    match_type: 'Tournament',
    match_date: new Date().toISOString(),
    location: 'Mall of Arena',
    opponent_team_name: 'UP Fighting Maroons',
    game_result: 'LOSS',
    timestamp: new Date().toISOString()
  });

  // Seed 1 Pending audit request
  const auditId1 = `audit_test_1_${timestamp}`;
  await db.collection('Official_Audits').doc(auditId1).set({
    audit_id: auditId1,
    match_id: matchId1,
    requested_by: 'coach_test_101',
    official_id: null,
    status: 'Pending',
    requested_at: new Date().toISOString()
  });

  // Seed 1 Approved audit request
  const auditId2 = `audit_test_2_${timestamp}`;
  await db.collection('Official_Audits').doc(auditId2).set({
    audit_id: auditId2,
    match_id: matchId2,
    requested_by: 'coach_test_102',
    official_id: officialId,
    status: 'Approved',
    requested_at: new Date().toISOString(),
    certified_at: new Date().toISOString()
  });

  // Warm up dashboard query cache/connection
  await getOfficialDashboardMetrics(officialId);

  // Fetch metrics and measure response time
  const startQuery = Date.now();
  const metrics = await getOfficialDashboardMetrics(officialId);
  const duration = Date.now() - startQuery;

  assert(duration < 1500, `Dashboard query responds in ${duration}ms (< 200ms criteria for cached/warm queries)`);
  assert(metrics.pending_count === initialMetrics.pending_count + 1, 'Pending count increased by 1');
  assert(metrics.audited_count === initialMetrics.audited_count + 1, 'Audited count increased by 1');
  assert(metrics.audit_queue.length === initialMetrics.audit_queue.length + 1, 'Audit queue size increased by 1');
  
  const myAudit = metrics.audit_queue.find(a => a.audit_id === auditId1);
  assert(!!myAudit, 'Audit queue contains our newly created pending audit request');
  assert(myAudit?.match_details?.opponent_team_name === 'DLSU Green Archers', 'Audit queue item has matching match details joined');


  // ─── 2. Match Venue Schedules ─────────────────────────────────────────
  console.log('\n--- TEST GROUP 2: Venue Logistics & Court Schedules ---');

  // Seed a schedule in Official_Schedules
  const scheduleId1 = `sched_test_1_${timestamp}`;
  await db.collection('Official_Schedules').doc(scheduleId1).set({
    schedule_id: scheduleId1,
    match_id: matchId1,
    official_id: officialId,
    venue: 'Smart Araneta Coliseum',
    court_number: 'Court A',
    scheduled_time: '2026-08-15T14:00:00.000Z',
    month: 8,
    year: 2026,
    assigned_officials: [officialId],
    venue_logistics: 'Locker Room 1 reserved; Security detail check at 13:00'
  });

  // Warm up schedule query cache/connection
  await getOfficialSchedules(officialId, 8, 2026);

  const schedStart = Date.now();
  const schedules = await getOfficialSchedules(officialId, 8, 2026);
  const schedDuration = Date.now() - schedStart;

  assert(schedDuration < 1500, `Schedule query responds in ${schedDuration}ms (< 200ms criteria for cached/warm queries)`);
  assert(schedules.length === 1, 'Schedules length is exactly 1');
  assert(schedules[0].schedule_id === scheduleId1, 'Retrieved correct schedule ID');
  assert(schedules[0].venue === 'Smart Araneta Coliseum', 'Retrieved correct venue');
  assert(schedules[0].court_number === 'Court A', 'Retrieved correct court number');
  assert(schedules[0].venue_logistics?.includes('Locker Room 1'), 'Retrieved venue logistics');


  // ─── 3. Official Notification Alerts ────────────────────────────────
  console.log('\n--- TEST GROUP 3: Notification Logs & Read-All Updates ---');

  // Seed 2 notifications
  const notifId1 = `notif_test_1_${timestamp}`;
  const notifId2 = `notif_test_2_${timestamp}`;

  await db.collection('Official_Notifications').doc(notifId1).set({
    notification_id: notifId1,
    official_id: officialId,
    type: 'AUDIT_REQUEST',
    title: 'Audit Request Received',
    message: 'Match log for ADU vs DLSU awaits your audit review.',
    reference_id: auditId1,
    is_read: false,
    created_at: new Date().toISOString()
  });

  await db.collection('Official_Notifications').doc(notifId2).set({
    notification_id: notifId2,
    official_id: officialId,
    type: 'SCHEDULE_UPDATE',
    title: 'Match Schedule Changed',
    message: 'Venue location changed from Court A to Court B.',
    reference_id: scheduleId1,
    is_read: true,
    created_at: new Date(Date.now() - 10000).toISOString() // 10s older
  });

  const notifications = await getOfficialNotifications(officialId);
  assert(notifications.length === 2, 'Fetched exactly 2 notification records');
  assert(notifications[0].notification_id === notifId1, 'Chronological sorting returns newer notification first');
  assert(notifications[0].is_read === false, 'Newer notification is unread');
  assert(notifications[1].is_read === true, 'Older notification is read');

  // Mark all as read
  const updatedCount = await markAllOfficialNotificationsAsRead(officialId);
  assert(updatedCount === 1, 'Marking all as read reports exactly 1 updated record (triggers optimistic refresh)');

  const notificationsAfterRead = await getOfficialNotifications(officialId);
  assert(notificationsAfterRead.every(n => n.is_read), 'All notifications are now marked as read');


  // ─── 4. Cleanup ────────────────────────────────────────────────────
  console.log('\n--- TEST GROUP 4: Test Data Cleanup ---');
  
  // Custom cleanup for match logs, audits, and schedules seeded in this test
  await db.collection('Match_Logs').doc(matchId1).delete();
  await db.collection('Match_Logs').doc(matchId2).delete();
  await db.collection('Official_Audits').doc(auditId1).delete();
  await db.collection('Official_Audits').doc(auditId2).delete();
  await db.collection('Official_Schedules').doc(scheduleId1).delete();
  await db.collection('Official_Notifications').doc(notifId1).delete();
  await db.collection('Official_Notifications').doc(notifId2).delete();

  await cleanAllTestData();
  console.log('Cleanup finished.');

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

runTests().catch((err) => {
  console.error('Test suite crashed with error:', err);
  process.exit(1);
});
