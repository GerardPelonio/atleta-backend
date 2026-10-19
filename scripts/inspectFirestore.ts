import { db, dbV1 } from '../utils/firebaseAdmin';

async function inspect(name: string, firestore: any) {
  console.log(`\n========================================`);
  console.log(` Inspecting Firestore Instance: ${name} `);
  console.log(`========================================`);
  try {
    const collections = await firestore.listCollections();
    console.log(`Found ${collections.length} collections:`);
    for (const col of collections) {
      const snap = await col.get();
      console.log(` - ${col.id}: ${snap.size} documents`);
    }
  } catch (err: any) {
    console.error(`Error inspecting ${name}:`, err?.message || err);
  }
}

async function run() {
  await inspect('db (atleta-v2)', db);
  await inspect('dbV1 (atleta-v1)', dbV1);
  process.exit(0);
}

run();
