import dotenv from 'dotenv';
dotenv.config();

import { validateRegisterOfficial, validateUpdateOfficialSettings } from '../validators/officialValidator';
import { registerOfficialService, loginOfficialService, getOfficialSettings, updateOfficialSettings } from '../services/officialService';
import { db } from '../utils/firebaseAdmin';
import { cleanAllTestData } from './clean_test_data';

console.log('==========================================================');
console.log('TOURNAMENT OFFICIALS AUTH & SETTINGS — TEST SUITE');
console.log('==========================================================\n');

let passed = 0;
let total = 0;

function assert(condition: boolean, testName: string) {
  total++;
  if (condition) {
    console.log(`✅ [PASS] ${testName}`);
    passed++;
  } else {
    console.error(`❌ [FAIL] ${testName}`);
  }
}

async function runTests() {
  const timestamp = Date.now();
  const testOrgName = `Test Org League ${timestamp}`;
  const testEmail = `official_test_${timestamp}@atleta.com`;
  const testPassword = 'Password123!';
  const testLegalName = 'Jack Referee';

  // ─── 1. Validator Tests ────────────────────────────────────────────
  console.log('--- TEST GROUP 1: Official Payload Validation ---');

  // Missing full_legal_name
  const missingName = validateRegisterOfficial({
    email: testEmail,
    password: testPassword,
    organization_name: testOrgName,
  });
  assert(
    missingName.length > 0 && missingName.some((e) => e.field === 'full_legal_name'),
    'Registration without full_legal_name is rejected'
  );

  // Invalid email format
  const invalidEmail = validateRegisterOfficial({
    full_legal_name: testLegalName,
    email: 'invalid-email',
    password: testPassword,
    organization_name: testOrgName,
  });
  assert(
    invalidEmail.length > 0 && invalidEmail.some((e) => e.field === 'email'),
    'Registration with invalid email format is rejected'
  );

  // Missing organization_name
  const missingOrg = validateRegisterOfficial({
    full_legal_name: testLegalName,
    email: testEmail,
    password: testPassword,
  });
  assert(
    missingOrg.length > 0 && missingOrg.some((e) => e.field === 'organization_name'),
    'Registration without organization_name is rejected'
  );

  // Short password
  const shortPassword = validateRegisterOfficial({
    full_legal_name: testLegalName,
    email: testEmail,
    password: '123',
    organization_name: testOrgName,
  });
  assert(
    shortPassword.length > 0 && shortPassword.some((e) => e.field === 'password'),
    'Registration with password < 6 characters is rejected'
  );

  // Valid payload passes validator
  const validPayload = validateRegisterOfficial({
    full_legal_name: testLegalName,
    email: testEmail,
    password: testPassword,
    organization_name: testOrgName,
  });
  assert(validPayload.length === 0, 'Valid official payload passes validator');

  // Settings validator
  const invalidSettings = validateUpdateOfficialSettings({
    split_screen_defaults: 'not-a-boolean',
  });
  assert(
    invalidSettings.length > 0 && invalidSettings.some((e) => e.field === 'split_screen_defaults'),
    'Settings update with invalid type is rejected'
  );

  const validSettings = validateUpdateOfficialSettings({
    split_screen_defaults: false,
    discrepancy_presets: true,
  });
  assert(validSettings.length === 0, 'Valid settings update passes validator');


  // ─── 2. Tournament Registry Check ─────────────────────────────────
  console.log('\n--- TEST GROUP 2: Tournament Registry Verification ---');

  // Attempting registration with unregistered organization
  try {
    await registerOfficialService({
      full_legal_name: testLegalName,
      email: testEmail,
      password: testPassword,
      organization_name: testOrgName,
    });
    assert(false, 'Should throw error when registering with unregistered organization');
  } catch (err: any) {
    assert(
      err.message.includes('not registered or active'),
      'Registration blocks unregistered organization'
    );
  }

  // Seed organization into Tournament_Registry as Active
  console.log(`Seeding Active organization: "${testOrgName}"...`);
  await db.collection('Tournament_Registry').doc(`test_org_${timestamp}`).set({
    organization_name: testOrgName,
    status: 'Active',
  });


  // ─── 3. Atomic Registration & Provisioning ──────────────────────────
  console.log('\n--- TEST GROUP 3: Atomic Official Registration & Provisioning ---');

  const regResult = await registerOfficialService({
    full_legal_name: testLegalName,
    email: testEmail,
    password: testPassword,
    organization_name: testOrgName,
  });

  assert(regResult !== null && !!regResult.token, 'Official registration returned token');
  assert(regResult.user.role === 'Official', 'User record has role "Official"');
  assert(regResult.profile.certification_status === 'Pending', 'Official profile defaults to "Pending"');
  assert(regResult.profile.organization_name === testOrgName, 'Profile stores the correct organization name');

  const userId = regResult.user.user_id;
  const officialId = regResult.profile.official_id;
  const settingId = regResult.settings.setting_id;

  // Verify documents are saved in Firestore collections
  const userDoc = await db.collection('Users').doc(userId).get();
  assert(userDoc.exists && userDoc.data()?.full_legal_name === testLegalName, 'Users document exists in Firestore');

  const profileDoc = await db.collection('Official_Profiles').doc(officialId).get();
  assert(profileDoc.exists && profileDoc.data()?.official_id === officialId, 'Official_Profiles document exists in Firestore (indexed by official_id)');

  const settingsDoc = await db.collection('Official_Settings').doc(officialId).get();
  assert(settingsDoc.exists && settingsDoc.data()?.setting_id === settingId, 'Official_Settings document exists in Firestore (indexed by official_id)');


  // ─── 4. Official Settings Preferences ─────────────────────────────
  console.log('\n--- TEST GROUP 4: Official Settings Fetch & Update ---');

  const defaults = await getOfficialSettings(officialId);
  assert(defaults.split_screen_defaults === true, 'Default split_screen_defaults toggle is true');
  assert(defaults.discrepancy_presets === true, 'Default discrepancy_presets toggle is true');
  assert(defaults.match_reminders === true, 'Default match_reminders toggle is true');

  // Update preferences
  const updated = await updateOfficialSettings(officialId, {
    split_screen_defaults: false,
    match_reminders: false,
  });

  assert(updated.split_screen_defaults === false, 'Updated split_screen_defaults toggle to false');
  assert(updated.discrepancy_presets === true, 'Maintained discrepancy_presets toggle as true');
  assert(updated.match_reminders === false, 'Updated match_reminders toggle to false');
  assert(!!updated.updated_at, 'updated_at timestamp is set');


  // ─── 5. Login Authentication ───────────────────────────────────────
  console.log('\n--- TEST GROUP 5: Login & Authentication Credentials ---');

  const loginResult = await loginOfficialService(testEmail, testPassword);
  assert(loginResult !== null && !!loginResult.token, 'Official login succeeded and returned Bearer JWT');
  assert(loginResult.user.role === 'Official', 'Logged in user has Official role');

  // Login with invalid password should fail
  try {
    await loginOfficialService(testEmail, 'WrongPassword!');
    assert(false, 'Should throw error when logging in with invalid password');
  } catch (err: any) {
    assert(
      err.code === 'auth/invalid-credential' || err.code === 'auth/wrong-password',
      'Login with incorrect password rejected by Auth'
    );
  }


  // ─── 6. Cleanup ────────────────────────────────────────────────────
  console.log('\n--- TEST GROUP 6: Firestore Test Data Cleanup ---');
  await cleanAllTestData();
  console.log('Cleanup finished.');

  // ─── Summary ──────────────────────────────────────────────────────
  console.log(`\n==========================================================`);
  console.log(`TEST SUMMARY: ${passed}/${total} TESTS PASSED`);
  console.log(`==========================================================`);

  if (passed === total) {
    process.exit(0);
  } else {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error('Test suite crashed with error:', err);
  process.exit(1);
});
