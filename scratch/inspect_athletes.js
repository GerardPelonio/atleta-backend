const admin = require('firebase-admin');
const path = require('path');

const serviceAccount = require(path.join(__dirname, '../serviceAccountKey.v1.json'));
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
}
const db = admin.firestore();

async function inspect() {
  console.log('=== USERS ===');
  const users = await db.collection('Users').get();
  users.docs.forEach(d => {
    const data = d.data();
    if (data.role?.toLowerCase()?.includes('athlete') || data.role?.toLowerCase()?.includes('player') || !data.role) {
      console.log('User ID:', d.id);
      console.log('Data:', JSON.stringify(data, null, 2));
    }
  });

  console.log('\n=== ATHLETE PROFILES ===');
  const profs = await db.collection('Athlete_Profiles').get();
  profs.docs.forEach(d => {
    console.log('Profile ID:', d.id);
    console.log('Data:', JSON.stringify(d.data(), null, 2));
  });

  console.log('\n=== PERFORMANCE METRICS ===');
  const metrics = await db.collection('Performance_Metrics').get();
  metrics.docs.forEach(d => {
    console.log('Metric ID:', d.id);
    console.log('Data:', JSON.stringify(d.data(), null, 2));
  });
}

inspect().then(() => process.exit(0)).catch(err => { console.error(err); process.exit(1); });
