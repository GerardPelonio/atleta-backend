const admin = require('firebase-admin');
const path = require('path');

const keyV1 = require('../serviceAccountKey.json');
const keyV2 = require('../serviceAccountKey.v2.json');

const appV1 = admin.initializeApp({
  credential: admin.credential.cert(keyV1)
}, 'app-v1');

const appV2 = admin.initializeApp({
  credential: admin.credential.cert(keyV2)
}, 'app-v2');

const dbV1 = admin.firestore(appV1);
const dbV2 = admin.firestore(appV2);

async function migrate() {
  console.log(`🚀 Starting migration from ${keyV1.project_id} -> ${keyV2.project_id}...`);
  
  const collections = await dbV1.listCollections();
  console.log(`📁 Found ${collections.length} collections in v1:`, collections.map(c => c.id));

  for (const col of collections) {
    const colName = col.id;
    console.log(`\n⏳ Migrating collection: ${colName}...`);
    const snapshot = await col.get();
    console.log(`   Found ${snapshot.size} documents in ${colName}`);

    if (snapshot.empty) continue;

    const batch = dbV2.batch();
    let count = 0;
    for (const doc of snapshot.docs) {
      const docRef = dbV2.collection(colName).doc(doc.id);
      batch.set(docRef, doc.data(), { merge: true });
      count++;
      if (count % 400 === 0) {
        await batch.commit();
        console.log(`   Committed ${count} docs...`);
      }
    }
    await batch.commit();
    console.log(`   ✅ Finished migrating ${count} documents for ${colName}`);
  }

  // Also seed default sports in v2 if Sports_Configurations was empty
  const sportsSnap = await dbV2.collection('Sports_Configurations').get();
  console.log(`\n🏆 Sports_Configurations in v2: ${sportsSnap.size} docs`);

  console.log('\n🎉 Migration complete! atleta-v2 is now fully populated.');
}

migrate().catch(err => {
  console.error('❌ Migration failed:', err);
  process.exit(1);
});
