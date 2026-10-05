import { auth, dbV1, dbV2 } from '../utils/firebaseAdmin';

async function main() {
  console.log('=== Listing Firebase Auth Users ===');
  const authUsers = await auth.listUsers();
  console.log(`Total Auth Users: ${authUsers.users.length}`);
  authUsers.users.forEach((u) => {
    console.log(` - UID: ${u.uid}, Email: ${u.email}, DisplayName: ${u.displayName}`);
  });

  console.log('\n=== Listing atleta-v1 Collections ===');
  const v1Cols = await dbV1.listCollections();
  for (const col of v1Cols) {
    const snap = await col.get();
    console.log(` - ${col.id}: ${snap.size} docs`);
  }

  console.log('\n=== Listing atleta-v1 Users Collection ===');
  const usersSnap = await dbV1.collection('Users').get();
  usersSnap.docs.forEach((d) => {
    const data = d.data();
    console.log(` - DocID: ${d.id}, Role: ${data.role || data.user_type}, Email: ${data.email}, Name: ${data.name || data.first_name || ''}`);
  });

  console.log('\n=== Listing atleta-v2 Collections ===');
  const v2Cols = await dbV2.listCollections();
  for (const col of v2Cols) {
    const snap = await col.get();
    console.log(` - ${col.id}: ${snap.size} docs`);
  }
}

main().catch(console.error);
