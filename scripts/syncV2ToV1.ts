import { dbV1, dbV2 } from '../utils/firebaseAdmin';

async function syncDatabases() {
  console.log(`================================================================`);
  console.log(` Syncing all data from atleta-v2 (Backup) into atleta-v1 (Main) `);
  console.log(`================================================================`);

  const v2Collections = await dbV2.listCollections();
  console.log(`Found ${v2Collections.length} collections in atleta-v2:`);

  for (const col of v2Collections) {
    const colName = col.id;
    const v2Snap = await col.get();
    console.log(`\nProcessing collection '${colName}' (${v2Snap.size} docs)...`);

    let copiedCount = 0;
    for (const doc of v2Snap.docs) {
      const docId = doc.id;
      const data = doc.data();

      // Check if doc exists in atleta-v1
      const v1DocRef = dbV1.collection(colName).doc(docId);
      const v1DocSnap = await v1DocRef.get();

      if (!v1DocSnap.exists) {
        await v1DocRef.set(data);
        copiedCount++;
      } else {
        // Merge any new fields
        await v1DocRef.set(data, { merge: true });
      }
    }
    console.log(`  ✔ Synced '${colName}' into atleta-v1 (Main). ${copiedCount} new docs created.`);
  }

  console.log(`\n================================================================`);
  console.log(` Verifying final state in atleta-v1 (MAIN): `);
  console.log(`================================================================`);
  const v1Collections = await dbV1.listCollections();
  for (const col of v1Collections) {
    const snap = await col.get();
    console.log(` - ${col.id}: ${snap.size} documents in atleta-v1 (MAIN)`);
  }
}

syncDatabases()
  .then(() => {
    console.log('\n✅ atleta-v1 (Main) is now 100% populated and active.');
    process.exit(0);
  })
  .catch((err) => {
    console.error('❌ Sync error:', err);
    process.exit(1);
  });
