import { auth, db, dbV1, dbV2 } from '../utils/firebaseAdmin';

// Explicit allowed Admin & Official User IDs / Emails
const ALLOWED_ROLES = ['admin', 'systemadmin', 'system_admin', 'official', 'tournament_official', 'tournamentofficial'];

const KEEP_AUTH_EMAILS = new Set([
  'admin@gmail.com',
  'admin@atleta.ph',
  'official1025@gmail.com',
  'official@atleta.ph',
  'official_test_1790857133483@atleta.com',
]);

const KEEP_USER_IDS = new Set([
  'lzBu5Q44oLYXTrsUnOsVZrfK5at2',
  'usr_admin_001',
  'fYladJevOqYwPJ5Sh2Qjx5OTAgF3',
  'usr_official_001',
  'demo_official_01',
  'Hr0rSHWRajMk59kR8Kjzw56eef43',
]);

const COLLECTIONS_TO_WIPE_COMPLETELY = [
  'Athlete_Profiles',
  'Coach_Profiles',
  'Teams',
  'Athlete_Teams',
  'athlete_teams',
  'Match_Logs',
  'match_logs',
  'Matches',
  'matches',
  'Performance_Metrics',
  'performance_metrics',
  'Official_Audits',
  'official_audits',
  'Official_Validations',
  'official_validations',
  'Official_Schedules',
  'official_schedules',
  'Match_Schedules',
  'match_schedules',
  'Schedules',
  'schedules',
  'Notifications',
  'notifications',
  'Official_Notifications',
  'Scouting_Registry',
  'scouting_registry',
  'Tournament_Registry',
  'tournament_registry',
  'Anthropometric_Measurements',
  'anthropometric_measurements',
  'Workload_Analysis',
  'workload_analysis',
  'Idempotency_Keys',
  'idempotency_keys',
  'Offline_Sync_Audit',
  'offline_sync_audit',
  'Admin_Audit_Logs',
  'admin_audit_logs',
  'Login_Audit_Logs',
  'Coach_Settings',
  'Official_Settings',
  'Inquiries',
  'Password_Resets',
];

async function wipeCollection(firestore: any, colName: string) {
  try {
    const snap = await firestore.collection(colName).get();
    if (snap.empty) return 0;
    let count = 0;
    const batchSize = 400;
    for (let i = 0; i < snap.docs.length; i += batchSize) {
      const chunk = snap.docs.slice(i, i + batchSize);
      const batch = firestore.batch();
      chunk.forEach((d: any) => {
        batch.delete(d.ref);
        count++;
      });
      await batch.commit();
    }
    return count;
  } catch (err: any) {
    console.warn(`Could not wipe collection ${colName}:`, err?.message || err);
    return 0;
  }
}

async function cleanAuthUsers() {
  console.log('\n========================================');
  console.log(' Cleaning Firebase Authentication Users ');
  console.log('========================================');
  try {
    const listResult = await auth.listUsers(1000);
    console.log(`Total users in Firebase Auth: ${listResult.users.length}`);

    let deletedCount = 0;
    let keptCount = 0;

    for (const u of listResult.users) {
      const email = (u.email || '').toLowerCase().trim();
      const uid = u.uid;

      if (KEEP_AUTH_EMAILS.has(email) || KEEP_USER_IDS.has(uid)) {
        console.log(`  ✔ KEEPING Official/Admin Auth User: [${uid}] ${email} (${u.displayName})`);
        keptCount++;
      } else {
        console.log(`  🗑 DELETING non-official Auth User: [${uid}] ${email} (${u.displayName})`);
        await auth.deleteUser(uid);
        deletedCount++;
      }
    }

    console.log(`\nAuth summary: Kept ${keptCount} admin/official users, deleted ${deletedCount} non-official users.`);
  } catch (err: any) {
    console.error('Error cleaning Firebase Auth users:', err);
  }
}

async function cleanFirestoreInstance(instanceName: string, firestore: any) {
  console.log(`\n======================================================`);
  console.log(` Cleaning Firestore Database Instance: ${instanceName} `);
  console.log(`======================================================`);

  // 1. Wipe all operational collections completely
  console.log('\n1. Wiping all operational collections...');
  for (const colName of COLLECTIONS_TO_WIPE_COMPLETELY) {
    const wiped = await wipeCollection(firestore, colName);
    if (wiped > 0) {
      console.log(`  - Wiped ${wiped} docs from '${colName}'`);
    }
  }

  // 2. Clean Users collection: Keep only Admins & Tournament Officials
  console.log('\n2. Cleaning Users collection...');
  try {
    const usersSnap = await firestore.collection('Users').get();
    let userKept = 0;
    let userDeleted = 0;

    for (const doc of usersSnap.docs) {
      const data = doc.data();
      const role = String(data.role || data.user_type || '').toLowerCase().replace(/[\s_-]/g, '');
      const email = String(data.email || '').toLowerCase().trim();
      const uid = doc.id;

      const isAllowedRole = ALLOWED_ROLES.includes(role);
      const isAllowedEmail = KEEP_AUTH_EMAILS.has(email);
      const isAllowedId = KEEP_USER_IDS.has(uid);

      if ((isAllowedRole || isAllowedEmail || isAllowedId) && (data.email || KEEP_USER_IDS.has(uid))) {
        // Normalize role display and keep document clean
        const cleanRole = role.includes('admin') ? 'SystemAdmin' : 'Official';
        await doc.ref.update({
          role: cleanRole,
          is_active: true,
          updated_at: new Date().toISOString(),
        }).catch(() => {});
        console.log(`  ✔ KEPT User doc: [${uid}] role=${cleanRole}, email=${data.email}`);
        userKept++;
      } else {
        await doc.ref.delete();
        console.log(`  🗑 DELETED User doc: [${uid}] role=${data.role || 'unknown'}, email=${data.email || 'none'}`);
        userDeleted++;
      }
    }
    console.log(`Users cleaned: Kept ${userKept}, Deleted ${userDeleted}`);
  } catch (err: any) {
    console.error(`Error cleaning Users collection in ${instanceName}:`, err);
  }

  // 3. Clean Official_Profiles: Keep only profiles corresponding to valid official users
  console.log('\n3. Cleaning Official_Profiles...');
  try {
    const offSnap = await firestore.collection('Official_Profiles').get();
    let offKept = 0;
    let offDeleted = 0;

    for (const doc of offSnap.docs) {
      const data = doc.data();
      const userId = data.user_id || doc.id.replace(/^off_/, '');
      if (KEEP_USER_IDS.has(userId) || KEEP_USER_IDS.has(doc.id)) {
        console.log(`  ✔ KEPT Official Profile: [${doc.id}] for user [${userId}]`);
        offKept++;
      } else {
        await doc.ref.delete();
        console.log(`  🗑 DELETED Official Profile: [${doc.id}]`);
        offDeleted++;
      }
    }
    console.log(`Official_Profiles cleaned: Kept ${offKept}, Deleted ${offDeleted}`);
  } catch (err: any) {
    console.error(`Error cleaning Official_Profiles in ${instanceName}:`, err);
  }

  // 4. Clean Admin_Profiles: Keep only profiles corresponding to valid admin users
  console.log('\n4. Cleaning Admin_Profiles...');
  try {
    const admSnap = await firestore.collection('Admin_Profiles').get();
    let admKept = 0;
    let admDeleted = 0;

    for (const doc of admSnap.docs) {
      const data = doc.data();
      const userId = data.user_id || doc.id.replace(/^admin_/, '');
      if (KEEP_USER_IDS.has(userId) || KEEP_USER_IDS.has(doc.id)) {
        console.log(`  ✔ KEPT Admin Profile: [${doc.id}] for user [${userId}]`);
        admKept++;
      } else {
        await doc.ref.delete();
        console.log(`  🗑 DELETED Admin Profile: [${doc.id}]`);
        admDeleted++;
      }
    }
    console.log(`Admin_Profiles cleaned: Kept ${admKept}, Deleted ${admDeleted}`);
  } catch (err: any) {
    console.error(`Error cleaning Admin_Profiles in ${instanceName}:`, err);
  }

  // 5. Clean Sports_Configurations: Keep canonical sports, delete weird random IDs
  console.log('\n5. Standardizing Sports_Configurations...');
  try {
    const canonicalSports = [
      {
        sport_id: 'sport_basketball',
        sport_name: 'Basketball',
        category: 'Team Sports',
        scoring_type: 'points',
        is_active: true,
        rules: { period_count: 4, period_name: 'Quarter', period_duration_minutes: 10 },
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      {
        sport_id: 'sport_volleyball',
        sport_name: 'Volleyball',
        category: 'Team Sports',
        scoring_type: 'sets',
        is_active: true,
        rules: { sets_to_win: 3, max_sets: 5, target_set_score: 25, final_set_score: 15 },
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      {
        sport_id: 'sport_swimming',
        sport_name: 'Swimming',
        category: 'Individual / Timed Sports',
        scoring_type: 'time',
        is_active: true,
        rules: { measurement_unit: 'seconds', split_tracking: true },
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      {
        sport_id: 'sport_track_field',
        sport_name: 'Track & Field',
        category: 'Athletics',
        scoring_type: 'time_or_distance',
        is_active: true,
        rules: { measurement_unit: 'seconds_or_meters' },
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      {
        sport_id: 'sport_pickleball',
        sport_name: 'Pickleball',
        category: 'Racket Sports',
        scoring_type: 'sets',
        is_active: true,
        rules: { sets_to_win: 2, points_to_win: 11 },
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      {
        sport_id: 'sport_badminton',
        sport_name: 'Badminton',
        category: 'Racket Sports',
        scoring_type: 'sets',
        is_active: true,
        rules: { sets_to_win: 2, points_to_win: 21 },
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    ];

    const sportsSnap = await firestore.collection('Sports_Configurations').get();
    for (const doc of sportsSnap.docs) {
      if (!doc.id.startsWith('sport_')) {
        await doc.ref.delete();
        console.log(`  🗑 Deleted non-canonical Sport doc: [${doc.id}]`);
      }
    }

    for (const sport of canonicalSports) {
      await firestore.collection('Sports_Configurations').doc(sport.sport_id).set(sport, { merge: true });
      console.log(`  ✔ Canonical Sport active: [${sport.sport_id}] ${sport.sport_name}`);
    }
  } catch (err: any) {
    console.error(`Error standardizing Sports_Configurations in ${instanceName}:`, err);
  }
}

async function main() {
  console.log('🚀 Starting Clean Slate & Authentication Reset...');

  // 1. Clean Firebase Auth
  await cleanAuthUsers();

  // 2. Clean atleta-v1 (Primary DB)
  await cleanFirestoreInstance('atleta-v1 (Main Database)', dbV1);

  // 3. Clean atleta-v2 (Backup DB)
  await cleanFirestoreInstance('atleta-v2 (Backup Database)', dbV2);

  console.log('\n✨ Database & Authentication Clean Slate Completed Successfully!');
  process.exit(0);
}

main().catch((err) => {
  console.error('Fatal error during clean slate:', err);
  process.exit(1);
});
