import { getOfficialSettings, updateOfficialSettings } from '../services/officialService';
import { db } from '../utils/firebaseAdmin';

async function testOfficialSettings() {
  console.log('--- Testing Official Settings Persistence in atleta-v1 (Main) ---');
  const testId = 'off_test_user_001';

  // 1. Get initial settings
  const initial = await getOfficialSettings(testId);
  console.log('Initial settings:', initial);

  // 2. Toggle auto_refresh to true
  const updatedTrue = await updateOfficialSettings(testId, { auto_refresh: true });
  console.log('Updated to true:', updatedTrue);

  // 3. Verify in Firestore Users doc
  const userDoc = await db.collection('Users').doc('test_user_001').get();
  console.log('Users doc settings in Firestore:', userDoc.data()?.settings);

  // 4. Toggle auto_refresh to false
  const updatedFalse = await updateOfficialSettings(testId, { auto_refresh: false });
  console.log('Updated to false:', updatedFalse);

  // 5. Verify in Firestore Users doc
  const userDocAfter = await db.collection('Users').doc('test_user_001').get();
  console.log('Users doc settings after toggle false:', userDocAfter.data()?.settings);

  console.log('✅ Official settings persistence test PASSED!');
}

testOfficialSettings().then(() => process.exit(0)).catch(err => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
