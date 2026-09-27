import { db } from '../utils/firebaseAdmin';

async function cleanAllFirestore() {
  console.log('🧹 Starting full Firestore database cleanup...');

  try {
    const collections = await db.listCollections();
    console.log(`Found ${collections.length} collections in Firestore.`);

    for (const col of collections) {
      const colName = col.id;
      const snapshot = await col.get();
      if (snapshot.empty) {
        console.log(`- Collection '${colName}' is empty.`);
        continue;
      }

      console.log(`- Deleting ${snapshot.size} documents from collection '${colName}'...`);
      const batchSize = 400;
      let batch = db.batch();
      let count = 0;

      for (const doc of snapshot.docs) {
        batch.delete(doc.ref);
        count++;
        if (count % batchSize === 0) {
          await batch.commit();
          batch = db.batch();
        }
      }

      if (count % batchSize !== 0) {
        await batch.commit();
      }
      console.log(`  ✅ Cleaned '${colName}' (${count} documents removed).`);
    }

    console.log('\n✨ All Firestore collections and tables have been completely cleared!');
  } catch (err) {
    console.error('❌ Error cleaning Firestore:', err);
  }
}

cleanAllFirestore()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
