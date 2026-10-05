import { dbV1, dbV2 } from '../utils/firebaseAdmin';

async function listSports() {
  console.log('--- Sports_Configurations in atleta-v1 (Main) ---');
  const snap1 = await dbV1.collection('Sports_Configurations').get();
  snap1.forEach(d => console.log(` [v1] ID: ${d.id}, sport_id: ${d.data().sport_id}, name: ${d.data().name || d.data().sport_name}`));

  console.log('\n--- Sports_Configurations in atleta-v2 (Backup) ---');
  const snap2 = await dbV2.collection('Sports_Configurations').get();
  snap2.forEach(d => console.log(` [v2] ID: ${d.id}, sport_id: ${d.data().sport_id}, name: ${d.data().name || d.data().sport_name}`));
}

listSports().then(() => process.exit(0));
