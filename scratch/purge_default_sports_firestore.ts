import { db, dbV1, dbV2 } from '../utils/firebaseAdmin';

async function purgeAllDefaultSportDuplicates() {
  console.log('--- PURGING ALL *_default AND DUPLICATE SPORT DOCUMENTS FROM FIRESTORE ---');

  const databases = [db, dbV1, dbV2].filter((d, idx, arr) => d && arr.indexOf(d) === idx);
  const collections = ['Sports_Configurations', 'sports_configurations', 'sports_configuration'];

  let totalPurged = 0;

  for (const currentDb of databases) {
    for (const colName of collections) {
      try {
        const snap = await currentDb.collection(colName).get();
        if (snap.empty) continue;

        const batch = currentDb.batch();
        let batchCount = 0;

        for (const doc of snap.docs) {
          const docId = doc.id;
          const data = doc.data() || {};
          const sportId = String(data.sport_id || '');

          // Identify duplicate _default documents or legacy random UUID documents
          const isDefaultDoc =
            docId.endsWith('_default') ||
            sportId.endsWith('_default') ||
            docId.includes('_default') ||
            sportId.includes('_default');

          if (isDefaultDoc) {
            console.log(`🗑️ Deleting duplicate document: [${colName}/${docId}] (sport_id: "${sportId}")`);
            batch.delete(doc.ref);
            batchCount++;
            totalPurged++;
          }
        }

        if (batchCount > 0) {
          await batch.commit();
          console.log(`✅ Purged ${batchCount} documents from '${colName}'`);
        }
      } catch (err: any) {
        console.warn(`Error scanning '${colName}':`, err?.message || err);
      }
    }
  }

  console.log(`\n🎉 Total purged duplicate _default sport documents: ${totalPurged}`);

  // Print remaining clean sports
  console.log('\n--- Remaining Clean Sports in Firestore: ---');
  const remainingSnap = await db.collection('Sports_Configurations').get();
  remainingSnap.docs.forEach((d) => {
    console.log(` - DocID: ${d.id.padEnd(25)} | Sport Name: ${(d.data()?.sport_name || '').padEnd(15)} | Sport ID: ${d.data()?.sport_id}`);
  });
}

purgeAllDefaultSportDuplicates().catch(console.error);
