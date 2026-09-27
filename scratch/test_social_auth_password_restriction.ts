import { db, auth } from '../utils/firebaseAdmin';
import {
  requestPasswordResetService,
  resetPasswordConfirmService,
  changePasswordService,
} from '../services/userService';

function assert(condition: boolean, msg: string) {
  if (!condition) {
    throw new Error(`Assertion failed: ${msg}`);
  }
  console.log(`✅ ${msg}`);
}

async function runTests() {
  console.log('🧪 Testing Social Login Password Reset/Change Restrictions...\n');

  const timestamp = Date.now();
  const googleUid = `google_test_${timestamp}`;
  const googleEmail = `google.user.${timestamp}@gmail.com`;

  const normalUid = `email_test_${timestamp}`;
  const normalEmail = `email.user.${timestamp}@atleta.test`;

  // 1. Provision a Google OAuth user in Firestore
  await db.collection('Users').doc(googleUid).set({
    user_id: googleUid,
    first_name: 'Google',
    last_name: 'Athlete',
    email: googleEmail,
    role: 'Athlete',
    provider: 'google',
    auth_provider: 'google',
    created_at: new Date(),
    updated_at: new Date(),
  });

  // 2. Provision standard Email/Password user in Firestore
  await db.collection('Users').doc(normalUid).set({
    user_id: normalUid,
    first_name: 'Normal',
    last_name: 'Athlete',
    email: normalEmail,
    role: 'Athlete',
    provider: 'password',
    password: 'oldPassword123!',
    created_at: new Date(),
    updated_at: new Date(),
  });

  // --- Test 1: Google User Attempts to Request Password Reset ---
  console.log('--- Test 1: Social User Attempts Password Reset Request ---');
  let googleResetBlocked = false;
  try {
    await requestPasswordResetService(googleEmail);
  } catch (err: any) {
    if (err.code === 'SOCIAL_AUTH_ACCOUNT') {
      googleResetBlocked = true;
      assert(err.code === 'SOCIAL_AUTH_ACCOUNT', 'Error code is SOCIAL_AUTH_ACCOUNT');
      assert(err.message.includes('Google'), 'Error message informs user to log in with Google');
    }
  }
  assert(googleResetBlocked, 'Google account password reset request blocked with error');

  // --- Test 2: Google User Attempts Change Password ---
  console.log('\n--- Test 2: Social User Attempts Password Change ---');
  let googleChangeBlocked = false;
  try {
    await changePasswordService(googleUid, 'newSecretPassword123!');
  } catch (err: any) {
    if (err.code === 'SOCIAL_AUTH_ACCOUNT') {
      googleChangeBlocked = true;
      assert(err.code === 'SOCIAL_AUTH_ACCOUNT', 'Password change error code is SOCIAL_AUTH_ACCOUNT');
    }
  }
  assert(googleChangeBlocked, 'Google account change password blocked with error');

  // --- Test 3: Normal Email/Password User Successfully Requests Reset ---
  console.log('\n--- Test 3: Standard Email/Password User Password Reset Request ---');
  const normalReset = await requestPasswordResetService(normalEmail);
  assert(!!normalReset.reset_token, 'Standard email user receives reset token');
  assert(normalReset.reset_link.includes('token='), 'Reset link created');

  // --- Test 4: Normal Email/Password User Confirms Reset ---
  console.log('\n--- Test 4: Standard Email/Password User Confirms Reset ---');
  const confirmResult = await resetPasswordConfirmService(normalReset.reset_token, 'brandNewPassword123!', normalEmail);
  assert(confirmResult.message.includes('successfully updated'), 'Password reset confirmed successfully for email account');

  console.log('\n==========================================================');
  console.log('🎉 ALL SOCIAL LOGIN RESTRICTION & ERROR HANDLING TESTS PASSED!');
  console.log('==========================================================');
}

runTests()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Test error:', err);
    process.exit(1);
  });
