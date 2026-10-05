import { dbV1, dbV2 } from '../utils/firebaseAdmin';

async function syncAllCollections() {
  console.log('🔄 Syncing all user and profile data from atleta-v2 to atleta-v1 (and vice-versa)...');

  const collectionsToSync = [
    'Users',
    'Athlete_Profiles',
    'Coach_Profiles',
    'Official_Profiles',
    'Admin_Profiles',
    'Sports_Configurations',
  ];

  for (const colName of collectionsToSync) {
    const v2Snap = await dbV2.collection(colName).get();
    console.log(`\nSyncing collection '${colName}' (${v2Snap.size} docs in v2)...`);
    for (const doc of v2Snap.docs) {
      const data = doc.data();
      await dbV1.collection(colName).doc(doc.id).set(data, { merge: true });
      console.log(` ✔ Synced doc [${doc.id}] into atleta-v1`);
    }
  }

  // Also clean up any invalid/orphaned athlete test docs like Q4nFuIEAgdekVzE84S8yrCZrd302
  const v1AthSnap = await dbV1.collection('Athlete_Profiles').get();
  for (const doc of v1AthSnap.docs) {
    const data = doc.data();
    // Check if matching user exists in Users
    const userDoc = await dbV1.collection('Users').doc(data.user_id || doc.id.replace(/^ath_/, '')).get();
    if (!userDoc.exists) {
      await doc.ref.delete();
      console.log(` 🗑 Cleaned orphaned Athlete_Profile doc [${doc.id}]`);
    }
  }

  console.log('\n✅ Sync and cleanup completed successfully!');
}

syncAllCollections().catch(console.error);
