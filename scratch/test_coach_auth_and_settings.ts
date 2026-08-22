import { validateRegisterCoach, validateUpdateCoachSettings, validateChangeCoachPassword } from '../validators/coachValidator';
import { registerCoachService } from '../services/userService';
import { getCoachSettings, updateCoachSettings, updateCoachProfile, changeCoachPassword } from '../services/coachSettingsService';
import { resetAuthRateLimiter } from '../middlewares/rateLimitMiddleware';

console.log('==========================================================');
console.log('COACH AUTH & SETTINGS PREFERENCES — TEST SUITE');
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
  // ─── 1. Validator Tests ────────────────────────────────────────────

  console.log('--- TEST GROUP 1: Coach Validation ---');

  // ACCEPTANCE CRITERIA: Missing certification files block creation
  const missingDocs = validateRegisterCoach({
    first_name: 'Nash',
    last_name: 'Racela',
    email: 'nash.test@adamson.edu.ph',
    password: 'Password123!',
    years_of_experience: 15,
    current_institution: 'Adamson University',
  });
  assert(
    missingDocs.length > 0 && missingDocs.some((e) => e.field === 'professional_documents'),
    'Registration without professional_documents rejected (400 Bad Request rule)',
  );

  const emptyDocsArr = validateRegisterCoach({
    first_name: 'Nash',
    last_name: 'Racela',
    email: 'nash.test@adamson.edu.ph',
    password: 'Password123!',
    professional_documents: [],
  });
  assert(
    emptyDocsArr.length > 0 && emptyDocsArr.some((e) => e.field === 'professional_documents'),
    'Registration with empty professional_documents array rejected',
  );

  const validCoachData = validateRegisterCoach({
    first_name: 'Nash',
    last_name: 'Racela',
    email: 'nash.test@adamson.edu.ph',
    password: 'Password123!',
    professional_documents: ['https://atleta.ph/docs/license_123.pdf'],
    years_of_experience: 15,
    current_institution: 'Adamson University',
  });
  assert(validCoachData.length === 0, 'Valid coach registration data passes validation');

  // ─── 2. Atomic Registration ───────────────────────────────────────

  console.log('\n--- TEST GROUP 2: Atomic Coach Registration & Settings Provisioning ---');

  const uniqueEmail = `coach_test_${Date.now()}@adamson.edu.ph`;

  // 2a. Registration without docs throws Error
  try {
    await registerCoachService({
      first_name: 'Nash',
      last_name: 'Racela',
      email: uniqueEmail,
      password: 'Password123!',
      professional_documents: [],
    });
    assert(false, 'registerCoachService without docs should throw error');
  } catch (err: any) {
    assert(err.message.includes('certification document'), 'registerCoachService blocks registration without docs');
  }

  // 2b. Valid registration creates Users, Coach_Profiles, and Coach_Settings
  const regResult = await registerCoachService({
    first_name: 'Nash',
    last_name: 'Racela',
    email: uniqueEmail,
    password: 'Password123!',
    professional_documents: ['https://atleta.ph/docs/cert_nash_001.pdf'],
    years_of_experience: 15,
    current_institution: 'Adamson University',
  });

  assert(regResult !== null && !!regResult.token, 'Coach registration returned Bearer token');
  assert(regResult.user.role === 'Coach', 'Assigned role is Coach');

  const userId = regResult.user.user_id;
  const coachId = `coach_${userId}`;

  // ─── 3. Coach Settings Preferences ────────────────────────────────

  console.log('\n--- TEST GROUP 3: Coach Settings & Notification Preferences ---');

  const defaultSettings = await getCoachSettings(coachId);
  assert(defaultSettings.data_sync_preference === 'Manual', 'Default data_sync_preference is "Manual"');
  assert(defaultSettings.notification_preferences.game_log_updates === true, 'Default game_log_updates toggle is true');
  assert(defaultSettings.notification_preferences.recruitment_inquiries === true, 'Default recruitment_inquiries toggle is true');

  // Update settings
  const updatedSettings = await updateCoachSettings(coachId, {
    data_sync_preference: 'Automatic',
    notification_preferences: {
      game_log_updates: false,
    },
  });
  assert(updatedSettings.data_sync_preference === 'Automatic', 'Updated data_sync_preference to "Automatic"');
  assert(updatedSettings.notification_preferences.game_log_updates === false, 'Updated game_log_updates toggle to false');
  assert(updatedSettings.notification_preferences.recruitment_inquiries === true, 'Maintained recruitment_inquiries toggle as true');

  // ─── 4. Coach Profile & Password Change ───────────────────────────

  console.log('\n--- TEST GROUP 4: Coach Profile Update & Password Verification ---');

  // Profile update
  const updatedProfile = await updateCoachProfile(coachId, userId, {
    first_name: 'Nash Updated',
    sport_type: 'Basketball Varsity',
    professional_documents: ['https://atleta.ph/docs/cert_nash_001.pdf', 'https://atleta.ph/docs/license_fiba.pdf'],
  });
  assert(updatedProfile.first_name === 'Nash Updated', 'Updated first_name in profile');
  assert(updatedProfile.sport_type === 'Basketball Varsity', 'Updated sport_type in Coach_Profiles');
  assert(Array.isArray(updatedProfile.professional_documents) && updatedProfile.professional_documents.length === 2, 'Updated professional_documents array');

  // ACCEPTANCE CRITERIA: Password change without correct current password returns 401
  try {
    await changeCoachPassword(userId, 'WrongCurrentPassword!', 'NewPassword123!');
    assert(false, 'Incorrect current password should throw 401 error');
  } catch (err: any) {
    assert(err.statusCode === 401, 'Incorrect current password returns HTTP 401 Unauthorized');
  }

  // Password change with correct current password
  const pwdChangeResult = await changeCoachPassword(userId, 'Password123!', 'NewPassword123!');
  assert(pwdChangeResult.message === 'Password changed successfully.', 'Correct current password changes password successfully');

  // ─── 5. Cleanup Test Data ─────────────────────────────────────────

  console.log('\n--- TEST GROUP 5: Firestore Test Data Cleanup ---');
  const { cleanAllTestData } = require('./clean_test_data');
  await cleanAllTestData();

  // ─── Summary ──────────────────────────────────────────────────────

  console.log(`==========================================================`);
  console.log(`TEST SUMMARY: ${passed}/${total} TESTS PASSED`);
  console.log(`==========================================================`);

  if (passed === total) {
    process.exit(0);
  } else {
    process.exit(1);
  }
}

runTests().catch(console.error);
