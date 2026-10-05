import { dbV1, dbV2 } from '../utils/firebaseAdmin';

async function checkProfiles() {
  console.log('=== Official_Profiles in atleta-v1 ===');
  const offSnap = await dbV1.collection('Official_Profiles').get();
  offSnap.docs.forEach((d) => console.log(` - ID: ${d.id}, data:`, JSON.stringify(d.data()).slice(0, 100)));

  console.log('\n=== Admin_Profiles in atleta-v1 ===');
  const admSnap = await dbV1.collection('Admin_Profiles').get();
  admSnap.docs.forEach((d) => console.log(` - ID: ${d.id}, data:`, JSON.stringify(d.data()).slice(0, 100)));

  console.log('\n=== Sports_Configurations in atleta-v1 ===');
  const sportsSnap = await dbV1.collection('Sports_Configurations').get();
  sportsSnap.docs.forEach((d) => console.log(` - ID: ${d.id}, name: ${d.data().sport_name || d.data().name}`));
}

checkProfiles().catch(console.error);
