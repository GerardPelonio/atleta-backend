import { db } from '../utils/firebaseAdmin';
import { logSrpeEntry, getAthleteWorkloadSummary, setAthleteWorkloadTarget } from '../services/workloadService';
import { getAthleteProfile, updateAthleteProfile } from '../services/athleteService';
import { requestPasswordResetService, resetPasswordConfirmService } from '../services/userService';

function assert(condition: boolean, msg: string) {
  if (!condition) {
    console.error(`❌ Assertion failed: ${msg}`);
    throw new Error(`Assertion failed: ${msg}`);
  }
  console.log(`✅ ${msg}`);
}

async function runTests() {
  console.log('🧪 Starting Athlete Workload, Profile & Password Reset Tests...\n');

  const testUid = `ath_test_${Date.now()}`;
  const testEmail = `test.athlete.${Date.now()}@atleta.test`;

  // 1. Seed test athlete user and profile in Firestore
  await db.collection('Users').doc(testUid).set({
    user_id: testUid,
    first_name: 'Juan',
    last_name: 'Dela Cruz',
    email: testEmail,
    role: 'Athlete',
    gender: 'Male',
    province: 'Camarines Sur',
    birthdate: '2004-10-15',
    created_at: new Date(),
    updated_at: new Date(),
  });

  await db.collection('Athlete_Profiles').doc(testUid).set({
    athlete_id: testUid,
    user_id: testUid,
    first_name: 'Juan',
    last_name: 'Dela Cruz',
    gender: 'Male',
    province: 'Camarines Sur',
    birthdate: '2004-10-15',
    sport_type: 'Basketball',
    physical_profile: {
      height_cm: 190,
      weight_kg: 82,
      wingspan_cm: 198,
      vertical_cm: 85,
    },
    created_at: new Date(),
    updated_at: new Date(),
  });

  console.log('--- Test 1: Initial Athlete Profile Retrieval ---');
  const initialProfile = await getAthleteProfile(testUid);
  assert(initialProfile.first_name === 'Juan', 'Retrieved athlete first_name');
  assert(initialProfile.physical_attributes.height_cm === 190, 'Retrieved athlete height 190cm');
  assert(initialProfile.computed_metrics.bmi > 0, 'Computed BMI correctly');

  console.log('\n--- Test 2: Athlete Logs Workout Session ---');
  const entry = await logSrpeEntry({
    athlete_id: testUid,
    session_duration_mins: 60,
    srpe_score: 7,
    entry_date: '2026-08-24',
    session_type: 'Conditioning',
  });
  assert(entry.daily_load === 420, 'Daily load calculated as 60 * 7 = 420');

  // Verify stored in Workload_Analysis
  const wlDoc = await db.collection('Workload_Analysis').doc(entry.workload_id).get();
  assert(wlDoc.exists, 'Workout entry saved in Workload_Analysis collection');

  // Verify saved into Athlete_Profiles and Users with Coach schema
  const profileDoc = await db.collection('Athlete_Profiles').doc(testUid).get();
  const profileData = profileDoc.data()!;
  assert(!!profileData.workload_analytics, 'workload_analytics saved in Athlete_Profiles');
  assert(profileData.workload_analytics.current_7day_acute_load === 420, 'current_7day_acute_load saved in Athlete_Profiles');
  assert(profileData.workload_analytics.workout_score === 420, 'workout_score saved in Athlete_Profiles');
  assert(profileData.workload_analytics.calculated_acwr > 0, 'calculated_acwr saved in Athlete_Profiles');
  assert(profileData.workload_analytics.routine_score > 0, 'routine_score saved in Athlete_Profiles');
  assert(profileData.workload_analytics.body_stress_pts > 0, 'body_stress_pts saved in Athlete_Profiles');
  assert(profileData.workload_analytics.weekly_logs.length >= 1, 'weekly_logs populated in Athlete_Profiles');

  // Verify saved into Users collection as well
  const userDoc = await db.collection('Users').doc(testUid).get();
  assert(!!userDoc.data()?.workload_analytics, 'workload_analytics saved in Users collection');

  console.log('\n--- Test 3: Athlete Workload Summary API Response ---');
  const summary = await getAthleteWorkloadSummary(testUid);
  assert(summary.current_7day_acute_load === 420, 'Summary returns current_7day_acute_load: 420');
  assert(summary.current_28day_chronic_load > 0, `Summary returns current_28day_chronic_load: ${summary.current_28day_chronic_load}`);
  assert(summary.calculated_acwr > 0, `Summary returns calculated ACWR: ${summary.calculated_acwr}`);
  assert(summary.weekly_logs.length >= 1, 'Summary includes weekly_logs array for UI charts');

  console.log('\n--- Test 4: Coach Sets 7-Day Workload Target & Athlete Logs Follow-Up Workout ---');
  const coachResult = await setAthleteWorkloadTarget('coach_123', testUid, {
    target_7day_effort_pts: 550,
    target_intensity: 8,
    notes: 'Focus on stamina before tournament',
  });
  assert(coachResult.workload_target.target_7day_effort_pts === 550, 'Coach target set to 550 Pts');

  // Verify reflected on athlete's profile
  const updatedAthleteProfile = await getAthleteProfile(testUid);
  assert(updatedAthleteProfile.workload_target?.target_7day_effort_pts === 550, 'Coach target reflected in AthleteFullProfile');
  assert(updatedAthleteProfile.workload_analytics?.target_7day_effort_pts === 550, 'Coach target reflected in workload_analytics');

  // Athlete logs another workout session: coach target should be preserved and 7-day training log updated
  const entry2 = await logSrpeEntry({
    athlete_id: testUid,
    session_duration_mins: 45,
    srpe_score: 8,
    entry_date: '2026-08-25',
    session_type: 'Shooting',
  });
  assert(entry2.daily_load === 360, 'Second workout daily load calculated: 45 * 8 = 360');

  const profileAfterSecondWorkout = await getAthleteProfile(testUid);
  assert(profileAfterSecondWorkout.workload_analytics?.target_7day_effort_pts === 550, 'Coach 7-day target preserved after new workout');
  assert(profileAfterSecondWorkout.workload_analytics?.current_7day_acute_load === 780, 'Acute load updated to 420 + 360 = 780');
  assert(profileAfterSecondWorkout.workload_analytics?.weekly_logs.length === 2, 'Weekly logs has 2 sessions');

  console.log('\n--- Test 5: Dynamic Password Reset Email & Token (Firestore Persistence) ---');
  // 5a. Frontend reset link from env
  const defaultResetRes = await requestPasswordResetService(testEmail);
  assert(defaultResetRes.reset_link.startsWith('https://atleta-frontend.vercel.app/reset-password'), `Reset link connects to deployed frontend: ${defaultResetRes.reset_link}`);
  assert(defaultResetRes.reset_link.includes('token='), 'Reset link includes JWT token');

  // Verify stored in Firestore Users collection
  const userWithReset = await db.collection('Users').doc(testUid).get();
  const resetData = userWithReset.data()?.password_reset;
  assert(resetData !== undefined, 'password_reset metadata saved in Firestore Users doc');
  assert(resetData.status === 'pending', 'password_reset status is pending');
  assert(!!resetData.expires_at, 'password_reset has computed expires_at timestamp');
  assert(resetData.reset_token === defaultResetRes.reset_token, 'Stored reset_token matches generated token');

  // Verify stored in Firestore Password_Resets collection
  const pwResetDoc = await db.collection('Password_Resets').doc(testUid).get();
  assert(pwResetDoc.exists, 'Document created in Firestore Password_Resets collection');
  assert(pwResetDoc.data()?.status === 'pending', 'Password_Resets record is pending');

  // 5b. Custom frontend URL override
  const customFrontendUrl = 'https://atleta-frontend.vercel.app/reset-password';
  const customResetRes = await requestPasswordResetService(testEmail, customFrontendUrl);
  assert(customResetRes.reset_link.startsWith(customFrontendUrl), `Reset link connects to custom frontend: ${customResetRes.reset_link}`);

  console.log('\n--- Test 6: Password Reset Confirmation & Invalidation ---');
  const confirmRes = await resetPasswordConfirmService(customResetRes.reset_token, 'NewSecurePassword123!');
  assert(confirmRes.message.includes('successfully'), 'Password reset confirmed and updated');

  // Verify completed status in Firestore
  const updatedUserDoc = await db.collection('Users').doc(testUid).get();
  assert(updatedUserDoc.data()?.password_reset?.status === 'completed', 'Firestore Users password_reset marked as completed');
  assert(updatedUserDoc.data()?.password === 'NewSecurePassword123!', 'Firestore Users password updated');

  const updatedPwResetDoc = await db.collection('Password_Resets').doc(testUid).get();
  assert(updatedPwResetDoc.data()?.status === 'completed', 'Firestore Password_Resets marked as completed');

  console.log('\n--- Test 7: In-App Mobile Password Reset Flow (No explicit token sent) ---');
  // Request another reset
  await requestPasswordResetService(testEmail);
  // Reset without passing token (simulating mobile app PasswordResetScreen.tsx submitting new password)
  const inAppConfirmRes = await resetPasswordConfirmService(undefined, 'AnotherFreshPassword456!', testEmail);
  assert(inAppConfirmRes.message.includes('successfully'), 'In-app mobile password reset confirmed without requiring token in body');

  console.log('\n🎉 ALL WORKLOAD, PROFILE & PASSWORD RESET TESTS PASSED!\n');
}

runTests()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Test error:', err);
    process.exit(1);
  });
