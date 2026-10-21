import * as dotenv from 'dotenv';
dotenv.config();

import { auth, db, dbV1, dbV2 } from '../utils/firebaseAdmin';

const KEEP_EMAILS = new Set(['admin@gmail.com']);
const PRESERVE_COLLECTIONS = new Set(['Sports_Configurations']);

async function wipeDocsInCollection(firestore: any, colName: string, preserveCondition?: (doc: any) => boolean): Promise<{ deleted: number; kept: number }> {
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
      chunk.forEach((ref) => batch.delete(ref));
      await batch.commit();
      deleted += chunk.length;
    }

    return { deleted, kept };
  } catch (err: any) {
    console.warn(`[WARN] Error wiping collection ${colName}:`, err?.message || err);
    return { deleted: 0, kept: 0 };
  }
}

async function cleanFirebaseAuth(adminUids: Set<string>) {
  console.log('\n--- 1. Cleaning Firebase Authentication ---');
  try {
    const listResult = await auth.listUsers(1000);
    console.log(`Found ${listResult.users.length} users in Firebase Auth.`);

    let kept = 0;
    let deleted = 0;

    for (const user of listResult.users) {
      const email = (user.email || '').toLowerCase().trim();
      const isSystemAdmin = KEEP_EMAILS.has(email) || adminUids.has(user.uid);

      if (isSystemAdmin) {
        console.log(`  ✔ KEPT Admin Auth User: [${user.uid}] ${email}`);
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
  }
}

async function cleanFirestoreInstance(name: string, firestore: any, adminUids: Set<string>) {
  console.log(`\n--- 2. Cleaning Firestore Instance: ${name} ---`);
  const collections = await firestore.listCollections();
  console.log(`Found ${collections.length} collections:`, collections.map((c: any) => c.id).join(', '));

  for (const col of collections) {
    const colName = col.id;

    if (PRESERVE_COLLECTIONS.has(colName)) {
      console.log(`  ⏭ PRESERVING system configuration collection: ${colName}`);
      continue;
    }

    if (colName === 'Users') {
      const res = await wipeDocsInCollection(firestore, colName, (doc) => {
        const data = doc.data();
        const role = String(data.role || '').toLowerCase();
        const email = String(data.email || '').toLowerCase().trim();
        return KEEP_EMAILS.has(email) || adminUids.has(doc.id) || role.includes('systemadmin');
      });
      console.log(`  ✔ Users: Kept ${res.kept} System Admin(s), Deleted ${res.deleted} accounts`);
      continue;
    }

    if (colName === 'Admin_Profiles') {
      const res = await wipeDocsInCollection(firestore, colName, (doc) => {
        const data = doc.data();
        const userId = data.user_id || doc.id.replace(/^admin_/, '');
        return adminUids.has(userId) || adminUids.has(doc.id);
      });
      console.log(`  ✔ Admin_Profiles: Kept ${res.kept} profile(s), Deleted ${res.deleted}`);
      continue;
    }

    // All other collections: wipe completely
    const res = await wipeDocsInCollection(firestore, colName);
    if (res.deleted > 0) {
      console.log(`  🗑 Cleared ${res.deleted} docs from ${colName}`);
    } else {
      console.log(`  ⚪ ${colName} was already empty`);
    }
  }
}

async function main() {
  console.log('========================================================');
  console.log('   FIRESTORE & AUTH CLEANUP: KEEP ONLY SYSTEM ADMIN    ');
  console.log('========================================================');

  // Identify System Admin UIDs
  const adminUids = new Set<string>();
  const usersSnap = await db.collection('Users').get();
  usersSnap.forEach((doc) => {
    const data = doc.data();
    const role = String(data.role || '').toLowerCase();
    const email = String(data.email || '').toLowerCase().trim();
    if (KEEP_EMAILS.has(email) || role.includes('systemadmin')) {
      adminUids.add(doc.id);
      if (data.user_id) adminUids.add(data.user_id);
      console.log(`Identified System Admin: [${doc.id}] ${email} (${data.full_name || 'Admin'})`);
    }
  });

  if (adminUids.size === 0) {
    console.error('ERROR: No System Admin account was detected! Aborting to prevent lockout.');
    process.exit(1);
  }

  // 1. Clean Firebase Auth
  await cleanFirebaseAuth(adminUids);

  // 2. Clean Primary Database (atleta-v1)
  await cleanFirestoreInstance('Primary DB (atleta-v1)', db, adminUids);

  // 3. Clean Secondary Database (atleta-v2 if configured)
  if (dbV2) {
    await cleanFirestoreInstance('Secondary DB (atleta-v2)', dbV2, adminUids);
  }

  console.log('\n========================================================');
  console.log('   SUCCESS: Firestore cleared except System Admin!     ');
  console.log('========================================================\n');
  process.exit(0);
}

main().catch((err) => {
  console.error('Fatal error during Firestore cleanup:', err);
  process.exit(1);
});
