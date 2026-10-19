import { socialLoginService } from '../services/userService';
import { db } from '../utils/firebaseAdmin';

async function testSocialOAuthFlow() {
  console.log('=== TEST: Strict Account Existence Check for Social OAuth ===\n');

  const testEmail = `test_strict_oauth_${Date.now()}@example.com`;
  const dummyToken = 'dummy_social_token_for_test';

  try {
    // -------------------------------------------------------------
    // Test 1: Branch B - Unregistered user attempts social login
    // -------------------------------------------------------------
    console.log('[Test 1] Testing Branch B: Unregistered social login attempt...');
    const loginAttemptResult = await socialLoginService(
      dummyToken,
      'google',
      'Athlete',
      {
        email: testEmail,
        first_name: 'TestOAuth',
        last_name: 'Unregistered',
      }
    );

    console.log('Result from login attempt:', {
      account_exists: loginAttemptResult.account_exists,
      require_signup: loginAttemptResult.require_signup,
      is_new_user: loginAttemptResult.is_new_user,
      has_token: Boolean((loginAttemptResult as any).token),
    });

    if (loginAttemptResult.account_exists !== false) {
      throw new Error(`FAIL: Expected account_exists to be false, got ${loginAttemptResult.account_exists}`);
    }
    if (!loginAttemptResult.require_signup) {
      throw new Error('FAIL: Expected require_signup to be true');
    }
    if ((loginAttemptResult as any).token) {
      throw new Error('FAIL: Token must NOT be issued to unregistered social account');
    }

    // Verify Firestore was NOT polluted
    const usersSnap = await db.collection('Users').where('email', '==', testEmail).get();
    if (!usersSnap.empty) {
      throw new Error(`FAIL: Firestore Users document was created for unregistered user! Count: ${usersSnap.size}`);
    }
    const athletesSnap = await db.collection('Athlete_Profiles').where('email', '==', testEmail).get();
    if (!athletesSnap.empty) {
      throw new Error(`FAIL: Firestore Athlete_Profiles document was created for unregistered user! Count: ${athletesSnap.size}`);
    }
    console.log('PASSED [Test 1]: Unregistered user correctly intercepted. No Firestore records created. No session token issued.\n');

    // -------------------------------------------------------------
    // Test 2: User completes registration via Sign-Up / Onboarding
    // -------------------------------------------------------------
    console.log('[Test 2] Testing User completing registration via Sign-Up screen...');
    const registrationResult = await socialLoginService(
      dummyToken,
      'google',
      'Coach',
      {
        email: testEmail,
        first_name: 'TestOAuth',
        last_name: 'RegisteredCoach',
        role: 'Coach',
        is_registration: true,
        sport_type: 'Basketball',
        years_of_experience: 5,
        current_institution: 'State University',
        terms_accepted: true,
      }
    );

    console.log('Result from registration submit:', {
      account_exists: registrationResult.account_exists,
      require_signup: registrationResult.require_signup,
      has_token: Boolean(registrationResult.token),
      role: registrationResult.user?.role,
    });

    if (registrationResult.account_exists !== true) {
      throw new Error('FAIL: Expected account_exists to be true after registration');
    }
    if (!registrationResult.token) {
      throw new Error('FAIL: Expected session token to be issued after registration');
    }
    if (registrationResult.user?.role !== 'Coach') {
      throw new Error(`FAIL: Expected user role to be Coach, got ${registrationResult.user?.role}`);
    }

    // Verify Firestore records now exist
    const postRegUsersSnap = await db.collection('Users').where('email', '==', testEmail).get();
    if (postRegUsersSnap.empty) {
      throw new Error('FAIL: Users record was not created in Firestore upon registration');
    }
    const coachProfilesSnap = await db.collection('Coach_Profiles').where('email', '==', testEmail).get();
    if (coachProfilesSnap.empty) {
      throw new Error('FAIL: Coach_Profiles record was not created in Firestore upon registration');
    }
    console.log('PASSED [Test 2]: User successfully registered. Firestore documents created. Session token issued.\n');

    // -------------------------------------------------------------
    // Test 3: Branch A - Registered user logs in via Social OAuth
    // -------------------------------------------------------------
    console.log('[Test 3] Testing Branch A: Registered user logs in via Social OAuth...');
    const registeredLoginResult = await socialLoginService(
      dummyToken,
      'google',
      'Athlete', // client default input should be overridden by database role
      {
        email: testEmail,
      }
    );

    console.log('Result from registered user login:', {
      account_exists: registeredLoginResult.account_exists,
      require_signup: registeredLoginResult.require_signup,
      has_token: Boolean(registeredLoginResult.token),
      role: registeredLoginResult.user?.role,
    });

    if (registeredLoginResult.account_exists !== true) {
      throw new Error('FAIL: Expected account_exists to be true for registered user');
    }
    if (registeredLoginResult.require_signup !== false) {
      throw new Error('FAIL: Expected require_signup to be false for registered user');
    }
    if (!registeredLoginResult.token) {
      throw new Error('FAIL: Expected session token for registered user');
    }
    if (registeredLoginResult.user?.role !== 'Coach') {
      throw new Error(`FAIL: Expected role to be retrieved from database as Coach, got ${registeredLoginResult.user?.role}`);
    }
    console.log('PASSED [Test 3]: Registered user successfully routed with existing database role Coach and session token.\n');

    // Clean up test records
    console.log('Cleaning up test documents from Firestore...');
    for (const doc of postRegUsersSnap.docs) {
      await doc.ref.delete();
    }
    for (const doc of coachProfilesSnap.docs) {
      await doc.ref.delete();
    }
    console.log('Cleanup complete.');

    console.log('\n ALL TESTS PASSED SUCCESSFULLY! ');
    process.exit(0);
  } catch (error: any) {
    console.error('\n TEST FAILED:', error?.message || error);
    process.exit(1);
  }
}

testSocialOAuthFlow();
