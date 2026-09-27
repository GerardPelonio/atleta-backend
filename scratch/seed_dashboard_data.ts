import { db } from '../utils/firebaseAdmin';
import dotenv from 'dotenv';
import crypto from 'crypto';
dotenv.config();

async function seedDashboard() {
  console.log('Searching for official user "jack.coordinator@example.com"...');
  
  const userSnapshot = await db.collection('Users')
    .where('email', '==', 'jack.coordinator@example.com')
    .limit(1)
    .get();

  if (userSnapshot.empty) {
    console.error('❌ User not found. Please register "jack.coordinator@example.com" first via Postman.');
    process.exit(1);
  }

  const userDoc = userSnapshot.docs[0];
  const uid = userDoc.id;

  // Retrieve official_id
  const profileDoc = await db.collection('Official_Profiles').doc(uid).get();
  if (!profileDoc.exists) {
    console.error('❌ Official profile not found for the user.');
    process.exit(1);
  }

  const officialId = profileDoc.data()!.official_id;
  console.log(`Found Official ID: ${officialId}`);

  const timestamp = Date.now();
  const matchId1 = `match_postman_1_${timestamp}`;
  const matchId2 = `match_postman_2_${timestamp}`;
  const auditId1 = `audit_postman_1_${timestamp}`;
  const scheduleId1 = `sched_postman_1_${timestamp}`;
  const notifId1 = `notif_postman_1_${timestamp}`;
  const notifId2 = `notif_postman_2_${timestamp}`;

  console.log('Seeding match logs...');
  await db.collection('Match_Logs').doc(matchId1).set({
    match_id: matchId1,
    team_id: 't_adamson_falcons',
    sport_type: 'Basketball',
    match_type: 'Tournament',
    match_date: '2026-08-15T14:30:00.000Z',
    location: 'Smart Araneta Coliseum',
    opponent_team_name: 'DLSU Green Archers',
    game_result: 'WIN',
    timestamp: new Date().toISOString()
  });

  await db.collection('Match_Logs').doc(matchId2).set({
    match_id: matchId2,
    team_id: 't_ateneo_eagles',
    sport_type: 'Basketball',
    match_type: 'Tournament',
    match_date: '2026-08-18T16:00:00.000Z',
    location: 'Mall of Asia Arena',
    opponent_team_name: 'UP Fighting Maroons',
    game_result: 'LOSS',
    timestamp: new Date().toISOString()
  });

  console.log('Seeding pending audit request...');
  await db.collection('Official_Audits').doc(auditId1).set({
    audit_id: auditId1,
    match_id: matchId1,
    requested_by: 'coach_nash_racela',
    official_id: null,
    status: 'Pending',
    requested_at: new Date().toISOString()
  });

  console.log('Seeding schedule logistics...');
  await db.collection('Official_Schedules').doc(scheduleId1).set({
    schedule_id: scheduleId1,
    match_id: matchId1,
    official_id: officialId,
    venue: 'Smart Araneta Coliseum',
    court_number: 'Court 1',
    scheduled_time: '2026-08-15T14:30:00.000Z',
    month: 8,
    year: 2026,
    assigned_officials: [officialId],
    venue_logistics: 'Team warm-ups begin at 13:45. Medical desk located at Gate 3.'
  });

  console.log('Seeding chronological official notification alerts...');
  await db.collection('Official_Notifications').doc(notifId1).set({
    notification_id: notifId1,
    official_id: officialId,
    type: 'AUDIT_REQUEST',
    title: 'Audit Request Received',
    message: 'Coach Nash Racela submitted an audit request for Match ID ' + matchId1,
    reference_id: auditId1,
    is_read: false,
    created_at: new Date().toISOString()
  });

  await db.collection('Official_Notifications').doc(notifId2).set({
    notification_id: notifId2,
    official_id: officialId,
    type: 'SCHEDULE_UPDATE',
    title: 'Venue Logistics Updated',
    message: 'Medical desk assignment added to Araneta Coliseum schedule.',
    reference_id: scheduleId1,
    is_read: false,
    created_at: new Date(Date.now() - 30000).toISOString()
  });

  console.log('✅ Seeding complete!');
  process.exit(0);
}

seedDashboard().catch(err => {
  console.error(err);
  process.exit(1);
});
