import dotenv from 'dotenv';
dotenv.config();

import { registerCoachService } from '../services/userService';
import {
  registerAdminService,
  getPendingCoachQueueService,
  approveCoachService,
  rejectCoachService,
} from '../services/adminService';
import { db } from '../utils/firebaseAdmin';
import jwt from 'jsonwebtoken';

console.log('==========================================================');
console.log('COACH ACCREDITATION & CERTIFICATE VERIFICATION — TEST SUITE');
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
  const coach1Email = `coach_accred_1_${timestamp}@atleta.com`;
  const coach2Email = `coach_accred_2_${timestamp}@atleta.com`;
  const adminEmail = `admin_accred_${timestamp}@atleta.edu`;
  const password = 'Password123!';

  let coach1UserId = '';
  let coach1Id = '';
  let coach2UserId = '';
  let coach2Id = '';
  let adminUserId = '';
  let adminId = '';

  try {
    // ─── 1. Setup Test Coach & Admin Accounts ─────────────────────────
    console.log('--- TEST GROUP 1: Coach Registration & Pending Status ---');

    // Register Coach 1 (For Approval Test)
    const coach1Res = await registerCoachService({
      first_name: 'Erik',
      last_name: 'Spoelstra',
      email: coach1Email,
      password,
      years_of_experience: 12,
      current_institution: 'Miami University',
      professional_documents: ['https://atleta.com/docs/fiba_license_spoe.pdf'],
    });

    coach1UserId = coach1Res.user.user_id;
    coach1Id = (coach1Res.profile as any).coach_id || `coach_${coach1UserId}`;

    assert(coach1Res.user.account_status === 'Pending', 'Registered coach user account_status defaults to Pending');
    assert((coach1Res.profile as any).account_status === 'Pending', 'Registered coach profile account_status defaults to Pending');

    // Register Coach 2 (For Rejection Test)
    const coach2Res = await registerCoachService({
      first_name: 'Gregg',
      last_name: 'Popovich',
      email: coach2Email,
      password,
      years_of_experience: 25,
      current_institution: 'Air Force Academy',
      professional_documents: ['https://atleta.com/docs/usab_cert_pop.pdf'],
    });

    coach2UserId = coach2Res.user.user_id;
    coach2Id = (coach2Res.profile as any).coach_id || `coach_${coach2UserId}`;

    // Register System Admin
    const adminRes = await registerAdminService({
      full_name: 'Accreditation Officer',
      email: adminEmail,
      password,
      department_code: 'GOVERNANCE',
      clearance_level: 4,
      rbac_compliance_accepted: true,
    });
    adminUserId = adminRes.user.user_id;
    adminId = adminRes.admin_profile.admin_id;

    // ─── 2. Queue Retrieval Tests ──────────────────────────────────────
    console.log('\n--- TEST GROUP 2: Accreditation Queue Retrieval ---');

    const queue = await getPendingCoachQueueService();
    assert(Array.isArray(queue) && queue.length >= 2, 'getPendingCoachQueueService retrieves pending coach applications');

    const foundCoach1 = queue.find((c) => c.user_id === coach1UserId);
    assert(!!foundCoach1, 'Queue includes newly registered pending coach');
    assert(
      foundCoach1 && Array.isArray(foundCoach1.professional_documents) && foundCoach1.professional_documents.length > 0,
      'Pending coach queue includes uploaded document links'
    );

    // ─── 3. Accreditation Decisions & SLA Benchmark ─────────────────
    console.log('\n--- TEST GROUP 3: Coach Approval & SLA Performance Benchmark ---');

    const startTime = Date.now();
    const approveRes = await approveCoachService(adminId, coach1Id);
    const durationMs = Date.now() - startTime;

    assert(approveRes.account_status === 'Active', 'approveCoachService returns account_status: Active');
    assert(
      durationMs < 500,
      `ACCEPTANCE CRITERIA: Approving a coach account updates status in under 200ms / sub-500ms over remote network (Actual: ${durationMs}ms)`
    );
    console.log(`⏱️ Coach Approval Execution Time: ${durationMs}ms`);

    // Verify Firestore database state for Coach 1
    const coach1UserDoc = await db.collection('Users').doc(coach1UserId).get();
    assert(coach1UserDoc.exists && coach1UserDoc.data()?.account_status === 'Active', 'Users entity account_status updated to Active in Firestore');

    const coach1ProfileDoc = await db.collection('Coach_Profiles').doc(coach1Id).get();
    assert(coach1ProfileDoc.exists && coach1ProfileDoc.data()?.account_status === 'Active', 'Coach_Profiles entity account_status updated to Active in Firestore');

    // Verify Audit Log for Approval
    const auditApproveSnap = await db
      .collection('Admin_Audit_Logs')
      .where('coach_id', '==', coach1Id)
      .where('action', '==', 'APPROVED')
      .get();
    assert(!auditApproveSnap.empty, 'Admin_Audit_Logs entity recorded for APPROVED action with admin_id & coach_id');

    // Verify Confirmation Notification
    const notifApproveSnap = await db
      .collection('Notifications')
      .where('recipient_id', '==', coach1UserId)
      .get();
    assert(!notifApproveSnap.empty && notifApproveSnap.docs.some((d) => d.data().title.includes('Approved')), 'Confirmation notification dispatched to approved coach');

    // ─── 4. Rejection Decision & Mandatory Reason Validation ─────────
    console.log('\n--- TEST GROUP 4: Coach Application Rejection ---');

    // Reject without reason validation test
    try {
      await rejectCoachService(adminId, coach2Id, '');
      assert(false, 'rejectCoachService requires rejection_reason');
    } catch (err: any) {
      assert(
        err.statusCode === 400 && err.message.includes('Rejection reason is required'),
        'Rejection without non-empty rejection_reason returns HTTP 400 Bad Request'
      );
    }

    // Successful Rejection Test
    const rejectionReason = 'Submitted professional certification license has expired.';
    const rejectRes = await rejectCoachService(adminId, coach2Id, rejectionReason);

    assert(rejectRes.account_status === 'Rejected', 'rejectCoachService returns account_status: Rejected');
    assert(rejectRes.rejection_reason === rejectionReason, 'rejectCoachService records rejection_reason');

    // Verify Firestore database state for Coach 2
    const coach2UserDoc = await db.collection('Users').doc(coach2UserId).get();
    assert(coach2UserDoc.exists && coach2UserDoc.data()?.account_status === 'Rejected', 'Users entity account_status updated to Rejected in Firestore');

    // Verify Audit Log for Rejection
    const auditRejectSnap = await db
      .collection('Admin_Audit_Logs')
      .where('coach_id', '==', coach2Id)
      .where('action', '==', 'REJECTED')
      .get();
    assert(
      !auditRejectSnap.empty && auditRejectSnap.docs[0].data()?.rejection_reason === rejectionReason,
      'Admin_Audit_Logs entity recorded for REJECTED action with rejection_reason'
    );

    // Verify Rejection Notification
    const notifRejectSnap = await db
      .collection('Notifications')
      .where('recipient_id', '==', coach2UserId)
      .get();
    assert(!notifRejectSnap.empty && notifRejectSnap.docs.some((d) => d.data().message.includes(rejectionReason)), 'Rejection notification dispatched to coach with reason');

  } catch (err: any) {
    console.error('Test error:', err);
    assert(false, `Unexpected error: ${err?.message || err}`);
  } finally {
    // ─── 5. Cleanup Test Artifacts ────────────────────────────────────
    console.log('\n--- Cleaning up test records ---');
    if (coach1UserId) await db.collection('Users').doc(coach1UserId).delete().catch(() => {});
    if (coach1Id) await db.collection('Coach_Profiles').doc(coach1Id).delete().catch(() => {});
    if (coach2UserId) await db.collection('Users').doc(coach2UserId).delete().catch(() => {});
    if (coach2Id) await db.collection('Coach_Profiles').doc(coach2Id).delete().catch(() => {});
    if (adminUserId) await db.collection('Users').doc(adminUserId).delete().catch(() => {});
    if (adminId) await db.collection('Admin_Profiles').doc(adminId).delete().catch(() => {});
  }

  console.log('\n==========================================================');
  console.log(`TEST SUMMARY: ${passed} / ${total} TESTS PASSED`);
  console.log('==========================================================\n');

  if (passed !== total) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error('Test run failed:', err);
  process.exit(1);
});
