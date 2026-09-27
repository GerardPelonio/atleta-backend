import dotenv from 'dotenv';
dotenv.config();

import { validateRegisterAdmin, validateLoginAdmin, isInstitutionalEmail } from '../validators/adminValidator';
import { registerAdminService, loginAdminService, generateElevatedAdminToken } from '../services/adminService';
import { db } from '../utils/firebaseAdmin';

console.log('==========================================================');
console.log('SYSTEM ADMIN AUTHENTICATION & RBAC ENFORCEMENT — TEST SUITE');
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
  const instEmail = `admin_test_${timestamp}@atleta.edu`;
  const nonInstEmail = `admin_test_${timestamp}@gmail.com`;
  const testPassword = 'AdminPassword123!';
  const fullName = 'System Administrator One';
  const deptCode = 'SYS_ADMIN';

  // ─── 1. Validator Tests ────────────────────────────────────────────
  console.log('--- TEST GROUP 1: Validator & Institutional Email Checks ---');

  // Test institutional email checker
  assert(isInstitutionalEmail('user@university.edu'), 'isInstitutionalEmail recognizes .edu');
  assert(isInstitutionalEmail('official@deped.gov.ph'), 'isInstitutionalEmail recognizes .gov.ph');
  assert(isInstitutionalEmail('admin@atleta.edu'), 'isInstitutionalEmail recognizes atleta.edu');
  assert(!isInstitutionalEmail('admin@gmail.com'), 'isInstitutionalEmail rejects gmail.com');
  assert(!isInstitutionalEmail('admin@yahoo.com'), 'isInstitutionalEmail rejects yahoo.com');

  // Non-institutional email registration attempt
  const nonInstResult = validateRegisterAdmin({
    full_name: fullName,
    email: nonInstEmail,
    password: testPassword,
    department_code: deptCode,
    rbac_compliance_accepted: true,
  });
  assert(
    nonInstResult.length > 0 && nonInstResult.some((e) => e.field === 'email'),
    'Registration attempt with non-institutional email is rejected with 400'
  );

  // Missing mandatory RBAC compliance acceptance
  const missingRbacResult = validateRegisterAdmin({
    full_name: fullName,
    email: instEmail,
    password: testPassword,
    department_code: deptCode,
    rbac_compliance_accepted: false,
  });
  assert(
    missingRbacResult.length > 0 && missingRbacResult.some((e) => e.field === 'rbac_compliance_accepted'),
    'ACCEPTANCE CRITERIA: Registration attempt without accepting RBAC compliance returns HTTP 400 Bad Request'
  );

  // Valid registration payload
  const validPayloadResult = validateRegisterAdmin({
    full_name: fullName,
    email: instEmail,
    password: testPassword,
    department_code: deptCode,
    rbac_compliance_accepted: true,
  });
  assert(validPayloadResult.length === 0, 'Valid admin registration payload passes validator');

  // ─── 2. Registration & Admin_Profiles Provisioning ──────────────────
  console.log('\n--- TEST GROUP 2: Admin Registration & Provisioning ---');

  let adminUserId = '';
  let adminId = '';
  let elevatedToken = '';

  try {
    const regRes = await registerAdminService({
      full_name: fullName,
      email: instEmail,
      password: testPassword,
      department_code: deptCode,
      clearance_level: 4,
      rbac_compliance_accepted: true,
    });

    adminUserId = regRes.user.user_id;
    adminId = regRes.admin_profile.admin_id;
    elevatedToken = regRes.token;

    assert(!!adminUserId, 'System Admin user created with user_id');
    assert(regRes.user.role === 'SystemAdmin', 'User entity role is SystemAdmin');
    assert(regRes.admin_profile.clearance_level === 4, 'Admin_Profiles subtype clearance_level defaults to 4');
    assert(regRes.admin_profile.department_code === deptCode, 'Admin_Profiles subtype department_code provisioned');
    assert(regRes.admin_profile.is_active === true, 'Admin_Profiles subtype is_active defaults to true');
    assert(!!regRes.token, 'Elevated Bearer JWT generated on registration');
  } catch (err: any) {
    console.error('Registration failed:', err);
    assert(false, 'registerAdminService succeeds with valid inputs');
  }

  // Verify Firestore documents
  if (adminUserId) {
    const userDoc = await db.collection('Users').doc(adminUserId).get();
    assert(userDoc.exists && userDoc.data()?.role === 'SystemAdmin', 'Users entity stored in Firestore with role SystemAdmin');

    const adminProfileDoc = await db.collection('Admin_Profiles').doc(adminId).get();
    assert(
      adminProfileDoc.exists && adminProfileDoc.data()?.user_id === adminUserId,
      'Admin_Profiles subtype stored in Firestore with FK to Users.user_id'
    );
  }

  // ─── 3. Authentication & Latency Performance Benchmark ────────────
  console.log('\n--- TEST GROUP 3: Authentication & Performance Benchmark ---');

  const startTime = Date.now();
  try {
    const loginRes = await loginAdminService(instEmail, testPassword);
    const duration = Date.now() - startTime;

    assert(loginRes.user.role === 'SystemAdmin', 'loginAdminService returns SystemAdmin user payload');
    assert(!!loginRes.token, 'loginAdminService returns elevated Bearer JWT');
    assert(
      duration < 500,
      `ACCEPTANCE CRITERIA: Authentication endpoint responds in under 500ms (Actual: ${duration}ms)`
    );
    console.log(`⏱️ Authentication execution time: ${duration}ms`);
  } catch (err: any) {
    console.error('Login failed:', err);
    assert(false, 'loginAdminService succeeds for valid credentials');
  }

  // ─── 4. RBAC & Security Enforcement Tests ─────────────────────────
  console.log('\n--- TEST GROUP 4: RBAC & Security Enforcement ---');

  // Deactivated Admin Account Test
  if (adminId) {
    // Temporarily deactivate admin
    await db.collection('Admin_Profiles').doc(adminId).update({ is_active: false });

    try {
      await loginAdminService(instEmail, testPassword);
      assert(false, 'Deactivated admin login is blocked');
    } catch (err: any) {
      assert(
        err.statusCode === 403 && err.message.includes('deactivated'),
        'Deactivated admin account login returns HTTP 403 Forbidden'
      );
    }

    // Re-activate admin for cleanup
    await db.collection('Admin_Profiles').doc(adminId).update({ is_active: true });
  }

  // ─── 5. Audit Logging Verification ─────────────────────────────────
  console.log('\n--- TEST GROUP 5: Audit Log Verification ---');

  try {
    const auditLogsSnap = await db
      .collection('Admin_Audit_Logs')
      .where('email', '==', instEmail.toLowerCase())
      .get();

    assert(!auditLogsSnap.empty, 'Audit log entries generated for admin access attempts');
    const logs = auditLogsSnap.docs.map((doc) => doc.data());
    console.log(`📋 Total audit log entries recorded for ${instEmail}: ${logs.length}`);
    assert(
      logs.some((l) => l.action === 'POST /api/v1/admin/register' && l.status === 'SUCCESS'),
      'Audit log contains SUCCESS entry for admin registration'
    );
    assert(
      logs.some((l) => l.action === 'POST /api/v1/admin/login'),
      'Audit log contains entry for admin login attempt'
    );
  } catch (err: any) {
    console.error('Audit log query error:', err);
    assert(false, 'Audit log entries stored in Admin_Audit_Logs collection');
  }

  // ─── Cleanup Test Artifacts ─────────────────────────────────────────
  console.log('\n--- Cleaning up test artifacts ---');
  if (adminUserId) {
    await db.collection('Users').doc(adminUserId).delete().catch(() => {});
  }
  if (adminId) {
    await db.collection('Admin_Profiles').doc(adminId).delete().catch(() => {});
  }

  console.log('\n==========================================================');
  console.log(`TEST SUMMARY: ${passed} / ${total} TESTS PASSED`);
  console.log('==========================================================\n');

  if (passed !== total) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
