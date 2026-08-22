import { db } from '../utils/firebaseAdmin';
import dotenv from 'dotenv';
dotenv.config();

async function cleanCoachDataFull() {
  console.log('🧹 [FULL DATABASE CLEANUP] Starting Coach-side full purge...');

  const collectionsToClean = [
    'Match_Logs',
    'Performance_Metrics',
    'Scouting_Registry',
    'Notifications',
    'Coach_Settings',
    'Coach_Profiles',
    'Teams',
    'Official_Audits',
    'Official_Validations',
  ];

  for (const collName of collectionsToClean) {
    const snap = await db.collection(collName).get();
    console.log(`Clearing collection "${collName}" (${snap.size} documents)...`);
    if (!snap.empty) {
      const batch = db.batch();
      snap.forEach((doc) => batch.delete(doc.ref));
      await batch.commit();
    }
  }

  // Delete Coach accounts from Users collection
  const coachUsersSnap = await db.collection('Users').where('role', '==', 'Coach').get();
  console.log(`Deleting Coach accounts from "Users" (${coachUsersSnap.size} documents)...`);
  if (!coachUsersSnap.empty) {
    const batch = db.batch();
    coachUsersSnap.forEach((doc) => batch.delete(doc.ref));
    await batch.commit();
  }

  console.log('✨ [FULL DATABASE CLEANUP] Coach-side purge completed successfully!\n');
  process.exit(0);
}

cleanCoachDataFull().catch((err) => {
  console.error('❌ Cleanup failed:', err);
  process.exit(1);
});
