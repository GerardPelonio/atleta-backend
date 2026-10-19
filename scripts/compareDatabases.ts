import { dbV1, dbV2 } from '../utils/firebaseAdmin';

async function main() {
  console.log('=== ATLETA-V1 Collections ===');
  const v1Cols = await dbV1.listCollections();
  for (const c of v1Cols) {
    const snap = await c.get();
    console.log(`v1 > ${c.id}: ${snap.size} docs`);
  }

  console.log('\n=== ATLETA-V2 Collections ===');
  const v2Cols = await dbV2.listCollections();
  for (const c of v2Cols) {
    const snap = await c.get();
    console.log(`v2 > ${c.id}: ${snap.size} docs`);
  }
}

main().catch(console.error);
