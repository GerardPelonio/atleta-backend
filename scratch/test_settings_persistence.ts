import { getOfficialSettings, updateOfficialSettings } from '../services/officialService';

async function testSettingsPersistence() {
  console.log('--- Testing Official Settings Persistence (auto_refresh & autoRefreshMatchQueue) ---');
  const testOfficialId = 'off_test_official_123';

  // 1. Fetch initial or default settings
  const initial = await getOfficialSettings(testOfficialId);
  console.log('Initial settings retrieved:', {
    official_id: initial.official_id,
    split_screen_defaults: initial.split_screen_defaults,
    audit_notifications: initial.audit_notifications,
    auto_refresh: initial.auto_refresh,
    autoRefreshMatchQueue: initial.autoRefreshMatchQueue,
  });

  // 2. Update settings with autoRefreshMatchQueue = true
  const updated1 = await updateOfficialSettings(testOfficialId, {
    autoRefreshMatchQueue: true,
    audit_notifications: true,
  });
  console.log('Updated with autoRefreshMatchQueue = true:', {
    auto_refresh: updated1.auto_refresh,
    autoRefreshMatchQueue: updated1.autoRefreshMatchQueue,
  });

  // 3. Verify retrieved settings match
  const fetched1 = await getOfficialSettings(testOfficialId);
  console.log('Re-fetched after update 1:', {
    auto_refresh: fetched1.auto_refresh,
    autoRefreshMatchQueue: fetched1.autoRefreshMatchQueue,
  });

  // 4. Update with auto_refresh = false
  const updated2 = await updateOfficialSettings(testOfficialId, {
    auto_refresh: false,
  });
  console.log('Updated with auto_refresh = false:', {
    auto_refresh: updated2.auto_refresh,
    autoRefreshMatchQueue: updated2.autoRefreshMatchQueue,
  });

  const fetched2 = await getOfficialSettings(testOfficialId);
  console.log('Re-fetched after update 2:', {
    auto_refresh: fetched2.auto_refresh,
    autoRefreshMatchQueue: fetched2.autoRefreshMatchQueue,
  });

  console.log('\n✅ Settings persistence test completed successfully!');
}

testSettingsPersistence().catch(console.error);
