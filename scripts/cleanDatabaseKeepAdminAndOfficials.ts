import * as dotenv from 'dotenv';
dotenv.config();

import { auth, db, dbV2 } from '../utils/firebaseAdmin';

const KEEP_EMAILS = new Set([
  'admin@gmail.com',
  'official123@gmail.com',
  'official1025@gmail.com',
]);

const KEEP_ROLES = new Set(['systemadmin', 'official']);

const PRESERVE_FULL_COLLECTIONS = new Set([
  'Sports_Configurations',
  'System_Counters',
]);

async function wipeDocsInCollection(
  firestore: any,
  colName: string,
  preserveCondition?: (doc: any) => boolean
): Promise<{ deleted: number; kept: number }> {
  try {
    const snap = await firestore.collection(colName).get();
    if (snap.empty) return { deleted: 0, kept: 0 };

    let deleted = 0;
    let kept = 0;
    const batchSize = 400;
    const toDelete: any[] = [];

    for (const doc of snap.docs) {
      if (preserveCondition && preserveCondition(doc)) {
        kept++;
      } else {
        toDelete.push(doc.ref);
      }
    }

    for (let i = 0; i < toDelete.length; i += batchSize) {
      const chunk = toDelete.slice(i, i + batchSize);
      const batch = firestore.batch();
      chunk.forEach((ref: any) => batch.delete(ref));
      await batch.commit();
      deleted += chunk.length;
    }

    return { deleted, kept };
  } catch (err: any) {
    console.warn(`[WARN] Error wiping collection ${colName}:`, err?.message || err);
    return { deleted: 0, kept: 0 };
  }
}

async function cleanFirebaseAuth(preservedUids: Set<string>) {
  console.log('\n--- 1. Cleaning Firebase Authentication ---');
  try {
    const listResult = await auth.listUsers(1000);
    console.log(`Found ${listResult.users.length} total users in Firebase Auth.`);

    let kept = 0;
    let deleted = 0;

    for (const user of listResult.users) {
      const email = (user.email || '').toLowerCase().trim();
      const shouldKeep = KEEP_EMAILS.has(email) || preservedUids.has(user.uid);

      if (shouldKeep) {
        console.log(`  ✔ KEPT Auth User: [${user.uid}] ${email || 'No email'}`);
        kept++;
      } else {
        console.log(`  🗑 DELETING Auth User: [${user.uid}] ${email || 'No email'}`);
        await auth.deleteUser(user.uid);
        deleted++;
      }
    }

    console.log(`Auth cleanup summary: ${kept} kept, ${deleted} deleted.`);
  } catch (err) {
    console.error('Error cleaning Firebase Auth:', err);
    throw err;
  }
}

async function cleanFirestoreInstance(
  name: string,
  firestore: any,
  preservedUids: Set<string>
) {
  console.log(`\n--- Cleaning Firestore Instance: ${name} ---`);
  const collections = await firestore.listCollections();
  console.log(`Found ${collections.length} collections:`, collections.map((c: any) => c.id).join(', '));

  for (const col of collections) {
    const colName = col.id;

    if (PRESERVE_FULL_COLLECTIONS.has(colName)) {
      console.log(`  ⏭ PRESERVING full collection: ${colName}`);
      continue;
    }

    if (colName === 'Users') {
      const res = await wipeDocsInCollection(firestore, colName, (doc) => {
        const data = doc.data();
        const role = String(data.role || '').toLowerCase();
        const email = String(data.email || '').toLowerCase().trim();
        const uid = data.user_id || doc.id;
        return (
          KEEP_EMAILS.has(email) ||
          preservedUids.has(doc.id) ||
          preservedUids.has(uid) ||
          KEEP_ROLES.has(role)
        );
      });
      console.log(`  ✔ Users: Kept ${res.kept} Admin/Official accounts, Deleted ${res.deleted} accounts`);
      continue;
    }

    if (colName === 'Admin_Profiles') {
      const res = await wipeDocsInCollection(firestore, colName, (doc) => {
        const data = doc.data();
        const userId = data.user_id || doc.id.replace(/^admin_/, '');
        return preservedUids.has(userId) || preservedUids.has(doc.id);
      });
      console.log(`  ✔ Admin_Profiles: Kept ${res.kept} profiles, Deleted ${res.deleted}`);
      continue;
    }

    if (colName === 'Official_Profiles') {
      const res = await wipeDocsInCollection(firestore, colName, (doc) => {
        const data = doc.data();
        const userId = data.user_id || doc.id.replace(/^off_/, '');
        return preservedUids.has(userId) || preservedUids.has(doc.id);
      });
      console.log(`  ✔ Official_Profiles: Kept ${res.kept} profiles, Deleted ${res.deleted}`);
      continue;
    }

    // All other collections (Athlete_Profiles, Coach_Profiles, Teams, Match_Logs, etc.): wipe completely
    const res = await wipeDocsInCollection(firestore, colName);
    if (res.deleted > 0) {
      console.log(`  🗑 Cleared ${res.deleted} docs from ${colName}`);
    } else {
      console.log(`  ⚪ ${colName} was empty`);
    }
  }
}

async function main() {
  console.log('================================================================');
  console.log(' FIRESTORE & AUTH CLEANUP: KEEP ADMIN, OFFICIALS, & SPORTS CONF ');
  console.log('================================================================');

  // Identify preserved UIDs from Users collection
  const preservedUids = new Set<string>();
  const usersSnap = await db.collection('Users').get();
  usersSnap.forEach((doc) => {
    const data = doc.data();
    const role = String(data.role || '').toLowerCase();
    const email = String(data.email || '').toLowerCase().trim();
    if (KEEP_EMAILS.has(email) || KEEP_ROLES.has(role)) {
      preservedUids.add(doc.id);
      if (data.user_id) preservedUids.add(data.user_id);
      console.log(`Identified Preserved User: [${doc.id}] ${email} (${data.full_name || 'No Name'}) - Role: ${data.role}`);
    }
  });

  console.log(`\nTotal preserved user entities: ${preservedUids.size}`);
  if (preservedUids.size === 0) {
    console.error('ERROR: No Admin or Official accounts found! Aborting to prevent lockout.');
    process.exit(1);
  }

  // 1. Clean Firebase Auth
  await cleanFirebaseAuth(preservedUids);

  // 2. Clean Primary Database (atleta-v1)
  await cleanFirestoreInstance('Primary DB (atleta-v1)', db, preservedUids);

  // 3. Clean Secondary Database (atleta-v2 if configured)
  if (dbV2) {
    await cleanFirestoreInstance('Secondary DB (atleta-v2)', dbV2, preservedUids);
  }

  console.log('\n================================================================');
  console.log('   SUCCESS: Database cleared! Admin, Officials & Sports intact.   ');
  console.log('================================================================\n');
}

main().catch((err) => {
  console.error('Fatal error during database cleanup:', err);
  process.exit(1);
});
