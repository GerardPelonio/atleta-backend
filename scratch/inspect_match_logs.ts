import { db } from '../utils/firebaseAdmin';

async function inspectMatchLogs() {
  console.log('--- Inspecting Match_Logs in Firestore ---');
  const snap = await db.collection('Match_Logs').get();
  console.log(`Total Match_Logs docs found: ${snap.size}`);
  snap.docs.forEach((doc) => {
    console.log(`\nDoc ID: ${doc.id}`);
    console.log(JSON.stringify(doc.data(), null, 2));
  });
}

inspectMatchLogs().catch(console.error);
