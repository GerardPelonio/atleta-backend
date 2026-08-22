import { db } from '../utils/firebaseAdmin';

async function checkRegistry() {
  const snap = await db.collection('Tournament_Registry').get();
  console.log(`Tournament_Registry contains ${snap.size} entries:`);
  snap.forEach(d => console.log(`- [${d.id}]: "${d.data().organization_name}" (Status: ${d.data().status})`));
}

checkRegistry().then(() => process.exit(0));
