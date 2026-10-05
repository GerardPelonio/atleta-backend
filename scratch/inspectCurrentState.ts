import { auth, dbV1, dbV2 } from '../utils/firebaseAdmin';

async function inspectCurrentState() {
  console.log('=== Firebase Auth Users ===');
  const authUsers = await auth.listUsers();
  console.log(`Total: ${authUsers.users.length}`);
  authUsers.users.forEach((u) => console.log(` - UID: ${u.uid}, email: ${u.email}, name: ${u.displayName}`));

  console.log('\n=== atleta-v1 Users Collection ===');
  const v1Users = await dbV1.collection('Users').get();
  console.log(`Total: ${v1Users.size}`);
  v1Users.docs.forEach((d) => console.log(` - ID: ${d.id}, role: ${d.data().role}, email: ${d.data().email}, name: ${d.data().first_name || d.data().name}`));

  console.log('\n=== atleta-v1 Athlete_Profiles Collection ===');
  const v1Ath = await dbV1.collection('Athlete_Profiles').get();
  console.log(`Total: ${v1Ath.size}`);
  v1Ath.docs.forEach((d) => console.log(` - ID: ${d.id}, sport: ${d.data().sport_type || d.data().sport}, user_id: ${d.data().user_id}`));

  console.log('\n=== atleta-v2 Users Collection ===');
  const v2Users = await dbV2.collection('Users').get();
  console.log(`Total: ${v2Users.size}`);
  v2Users.docs.forEach((d) => console.log(` - ID: ${d.id}, role: ${d.data().role}, email: ${d.data().email}`));

  console.log('\n=== atleta-v2 Athlete_Profiles Collection ===');
  const v2Ath = await dbV2.collection('Athlete_Profiles').get();
  console.log(`Total: ${v2Ath.size}`);
  v2Ath.docs.forEach((d) => console.log(` - ID: ${d.id}, sport: ${d.data().sport_type || d.data().sport}`));
}

inspectCurrentState().catch(console.error);
