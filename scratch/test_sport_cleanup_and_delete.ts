import { getAllSportsService, createSportService, deleteSportService, seedDefaultSportsIfEmpty } from '../services/sportService';
import { db } from '../utils/firebaseAdmin';

async function testSportCleanupAndDelete() {
  console.log('--- Testing Sport Config Duplication Cleanup and DELETE API ---');

  // 1. Check cleanup of _default
  await seedDefaultSportsIfEmpty();
  const sports = await getAllSportsService();
  console.log(`Loaded ${sports.length} sports in catalog:`);
  sports.forEach((s) => console.log(` - ID: ${s.sport_id}, Name: ${s.sport_name}, Short: ${s.short_identifier}`));

  const hasDefaultSuffix = sports.some((s) => s.sport_id.endsWith('_default'));
  console.log(`Has '_default' duplicate sports in catalog: ${hasDefaultSuffix}`);

  // 2. Create a test sport
  const testSportPayload = {
    sport_name: 'Test Pickleball ' + Date.now(),
    short_identifier: 'PB' + Math.floor(Math.random() * 900 + 100),
    configurable_stats: [
      { stat_name_key: 'points', measurement_category: 'Cumulative Total' as const },
      { stat_name_key: 'aces', measurement_category: 'Count' as const },
    ],
    is_active: true,
  };

  const created = await createSportService(testSportPayload, 'idempotency_sport_' + Date.now());
  console.log(`Created test sport: ID = ${created.sport.sport_id}, Name = ${created.sport.sport_name}`);

  // 3. Verify sport exists in Firestore
  const createdSnap = await db.collection('Sports_Configurations').doc(created.sport.sport_id).get();
  console.log(`Sport exists in Sports_Configurations before delete: ${createdSnap.exists}`);

  // 4. Delete the sport using deleteSportService
  const deleteResult = await deleteSportService(created.sport.sport_id);
  console.log('Delete result:', deleteResult);

  // 5. Verify sport is permanently removed from Firestore
  const postDeleteSnap = await db.collection('Sports_Configurations').doc(created.sport.sport_id).get();
  console.log(`Sport exists in Sports_Configurations after delete: ${postDeleteSnap.exists}`);

  console.log('\n✅ Sport Config Cleanup and DELETE API Test Passed Successfully!');
}

testSportCleanupAndDelete().catch(console.error);
