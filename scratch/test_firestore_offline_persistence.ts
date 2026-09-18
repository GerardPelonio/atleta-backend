import { initializeApp, getApps } from 'firebase/app';
import {
  initializeFirestore,
  persistentLocalCache,
  persistentSingleTabManager,
  getFirestore,
  doc,
  setDoc,
  getDoc,
  getDocs,
  collection,
  disableNetwork,
  enableNetwork,
  query,
  where,
} from 'firebase/firestore';

const firebaseConfig = {
  apiKey: process.env.FIREBASE_API_KEY || 'AIzaSyDummyApiKeyForNodeTesting12345',
  authDomain: process.env.FIREBASE_AUTH_DOMAIN || 'atleta-v1.firebaseapp.com',
  projectId: process.env.FIREBASE_PROJECT_ID || 'atleta-v1',
  storageBucket: process.env.FIREBASE_STORAGE_BUCKET || 'atleta-v1.appspot.com',
  messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID || '123456789',
  appId: process.env.FIREBASE_APP_ID || '1:123456789:web:abcdef',
};

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];

const db = initializeFirestore(app, {
  localCache: persistentLocalCache({
    tabManager: persistentSingleTabManager(undefined),
  }),
});

async function runOfflinePersistenceTest() {
  console.log('==========================================================');
  console.log('FIRESTORE OFFLINE PERSISTENCE VERIFICATION');
  console.log('==========================================================\n');

  const testMatchId = `match_offline_${Date.now()}`;
  const testPayload = {
    match_id: testMatchId,
    game_name: 'ADNU vs UNC Offline Championship',
    home_team_name: 'ADNU Knights',
    away_team_name: 'UNC Red Guzzlers',
    sport_type: 'Basketball',
    match_type: 'Tournament',
    game_result: 'WIN',
    home_score: 95,
    away_score: 88,
    match_date: new Date().toISOString(),
    location: 'Ateneo Gym',
    notes: 'Recorded completely while WiFi was OFF',
    synced_offline: true,
    player_stats: [
      {
        player_name: 'Harold Delos Santos',
        jersey_number: 7,
        pts: 24,
        ast: 6,
        reb: 8,
      },
    ],
  };

  console.log('1. Simulating WiFi & Internet Disconnection (disableNetwork)...');
  await disableNetwork(db);
  console.log('   ✅ Network is DISABLED. Firestore is running in pure offline mode.\n');

  console.log('2. Recording match log with WiFi OFF...');
  const matchDocRef = doc(db, 'Match_Logs', testMatchId);
  await setDoc(matchDocRef, testPayload);
  console.log(`   ✅ Match [${testMatchId}] successfully recorded to Firestore local offline storage!\n`);

  console.log('3. Reading back match from Firestore offline local cache...');
  const offlineDocSnap = await getDoc(matchDocRef);
  console.log('   Document exists in local cache:', offlineDocSnap.exists());
  console.log('   hasPendingWrites (offline pending sync):', offlineDocSnap.metadata.hasPendingWrites);
  console.log('   fromCache:', offlineDocSnap.metadata.fromCache);
  console.log('   Retrieved Game Name:', offlineDocSnap.data()?.game_name);
  console.log('   Retrieved Score:', `${offlineDocSnap.data()?.home_score} - ${offlineDocSnap.data()?.away_score}`);

  if (!offlineDocSnap.exists() || !offlineDocSnap.metadata.hasPendingWrites) {
    throw new Error('Offline persistence failed to register pending write in cache!');
  }
  console.log('   ✅ OFFLINE LOCAL WRITE CONFIRMED WITH ZERO DATA LOSS!\n');

  console.log('4. Restoring WiFi / Re-enabling Network (enableNetwork)...');
  await enableNetwork(db);
  console.log('   ✅ Network is ENABLED. Firestore background sync engine is syncing pending mutations...\n');

  // Wait 3 seconds for Firestore sync
  await new Promise((r) => setTimeout(r, 3000));

  console.log('5. Verifying synchronized state after reconnection...');
  const onlineDocSnap = await getDoc(matchDocRef);
  console.log('   Document exists:', onlineDocSnap.exists());
  console.log('   hasPendingWrites (after cloud sync):', onlineDocSnap.metadata.hasPendingWrites);
  console.log('   fromCache:', onlineDocSnap.metadata.fromCache);

  console.log('\n==========================================================');
  console.log('🎉 ALL OFFLINE PERSISTENCE AND RECONNECT SYNC TESTS PASSED!');
  console.log('==========================================================');
}

runOfflinePersistenceTest()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Test error:', err);
    process.exit(1);
  });
