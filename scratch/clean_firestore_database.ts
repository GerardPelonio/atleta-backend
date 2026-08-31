import { db, auth } from '../utils/firebaseAdmin';

async function listAndCleanFirestore() {
  console.log('🔍 Inspecting Firestore collections...\n');
  const collections = await db.listCollections();

  if (collections.length === 0) {
    console.log('No collections found in Firestore.');
    return;
  }

  console.log(`Found ${collections.length} collection(s):`);
  const collectionStats: { id: string; count: number }[] = [];

  for (const col of collections) {
    const snapshot = await col.get();
    collectionStats.push({ id: col.id, count: snapshot.size });
    console.log(` - Collection '${col.id}': ${snapshot.size} document(s)`);
  }

  console.log('\n🧹 Deleting all documents from collections...');

  let totalDeleted = 0;

  for (const col of collections) {
    const snapshot = await col.get();
    if (snapshot.empty) continue;

    const batchSize = 400;
    const docs = snapshot.docs;

    for (let i = 0; i < docs.length; i += batchSize) {
      const chunk = docs.slice(i, i + batchSize);
      const batch = db.batch();
      chunk.forEach((doc) => batch.delete(doc.ref));
      await batch.commit();
      totalDeleted += chunk.length;
    }
    console.log(` ✅ Cleared collection: ${col.id} (${snapshot.size} docs deleted)`);
  }

  console.log(`\n🎉 Successfully cleared ${totalDeleted} document(s) across all ${collections.length} collection(s)! Firestore is now clean.`);
}

listAndCleanFirestore()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Error cleaning Firestore:', err);
    process.exit(1);
  });
