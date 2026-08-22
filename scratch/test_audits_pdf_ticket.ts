import { db } from '../utils/firebaseAdmin';
import { submitAuditRequest, generateMatchPdf } from '../services/auditService';
import { checkPdfRateLimit, resetPdfRateLimit } from '../validators/auditValidator';
import { ServiceError } from '../validators/matchValidator';
import { Writable } from 'stream';

console.log('==========================================================');
console.log('OFFICIAL AUDITS & PDF GENERATION — TEST SUITE');
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

// Simple dummy writable stream to capture PDF output in memory
class DummyWritable extends Writable {
  public bytesWritten = 0;
  _write(chunk: any, encoding: string, callback: (error?: Error | null) => void) {
    this.bytesWritten += chunk.length;
    callback();
  }
}

async function runTests() {
  const timestampStr = String(Date.now());
  const testCoachId = `coach_audit_test_${timestampStr}`;
  const testUnauthCoachId = `coach_audit_unauth_${timestampStr}`;
  const testOfficialId = `off_audit_test_${timestampStr}`;
  const testTeamId = `team_audit_test_${timestampStr}`;
  const testMatchId = `match_audit_test_${timestampStr}`;
  const testAthleteId = `ath_audit_test_${timestampStr}`;

  console.log('--- 1. Seeding Mock Firestore Data for Audits & PDF ---');

  // Seed Coach Users
  await db.collection('Users').doc(testCoachId).set({
    first_name: 'Coach',
    last_name: 'Authorized',
    role: 'Coach',
  });
  await db.collection('Users').doc(testUnauthCoachId).set({
    first_name: 'Coach',
    last_name: 'Unauthorized',
    role: 'Coach',
  });

  // Seed Official User
  await db.collection('Users').doc(testOfficialId).set({
    first_name: 'Referee',
    last_name: 'Jane Doe',
    role: 'Official',
  });

  // Seed Athlete User & Profile
  await db.collection('Users').doc(testAthleteId).set({
    first_name: 'Jerom',
    last_name: 'Lastimosa',
    role: 'Athlete',
  });
  await db.collection('Athlete_Profiles').doc(`ath_${testAthleteId}`).set({
    athlete_id: `ath_${testAthleteId}`,
    province: 'Camarines Sur',
    sport_type: 'Basketball',
  });

  // Seed Team (Authorized coach manages it)
  await db.collection('Teams').doc(testTeamId).set({
    team_id: testTeamId,
    team_name: 'Audit Test Falcons',
    coach_id: testCoachId,
  });

  // Seed Match Log (uncertified initially)
  await db.collection('Match_Logs').doc(testMatchId).set({
    match_id: testMatchId,
    team_id: testTeamId,
    sport_type: 'Basketball',
    match_type: 'UAAP Season 88',
    match_date: new Date().toISOString(),
    location: 'Smart Araneta Coliseum',
    opponent_team_name: 'UP Fighting Maroons',
    game_result: 'WIN',
    notes: 'Incredible game, great transition play.',
    audit_status: 'Not Requested',
    is_certified: false,
    updated_at: new Date().toISOString(),
  });

  // Seed Match Performance Metrics
  await db.collection('Performance_Metrics').doc(`metric_${timestampStr}`).set({
    metric_id: `metric_${timestampStr}`,
    athlete_id: `ath_${testAthleteId}`,
    match_id: testMatchId,
    sport_category: 'Basketball',
    calculated_player_efficiency: 32.5,
  });

  console.log('✅ Mock data seeded successfully.\n');

  // ─── 2. Audit Submission Tests ───────────────────────
  console.log('--- TEST GROUP 2: Submit Audit Request ---');

  // Test unauthorized coach request
  try {
    await submitAuditRequest(testUnauthCoachId, testMatchId);
    assert(false, 'Should throw 403 Forbidden for unauthorized coach');
  } catch (err: any) {
    assert(
      err instanceof ServiceError && err.statusCode === 403,
      'Unauthorized coach audit submission returns HTTP 403 Forbidden'
    );
  }

  // Test authorized coach request
  const audit = await submitAuditRequest(testCoachId, testMatchId);
  assert(
    audit.audit_id !== undefined &&
    audit.status === 'Pending' &&
    audit.requested_by === testCoachId,
    'Managing coach submits audit request successfully'
  );

  // Verify Match_Logs was updated
  const updatedMatchDoc = await db.collection('Match_Logs').doc(testMatchId).get();
  assert(
    updatedMatchDoc.data()?.audit_status === 'Pending',
    'Firestore Match_Logs audit_status successfully updated to Pending'
  );

  // ─── 3. PDF Generation Checks ───────────────────────
  console.log('\n--- TEST GROUP 3: PDF Match Report Generation & Access Rules ---');

  // Test requesting PDF for uncertified match (Acceptance Criteria: returns 404)
  const dummyStream1 = new DummyWritable();
  try {
    await generateMatchPdf(testCoachId, testMatchId, dummyStream1);
    assert(false, 'Should throw 404 for uncertified match PDF generation');
  } catch (err: any) {
    assert(
      err instanceof ServiceError &&
      err.statusCode === 404 &&
      err.message === 'Official certified validation does not exist for this match yet',
      'Requesting PDF for uncertified match returns HTTP 404 Not Found'
    );
  }

  // Mock certifying the match
  console.log('Certifying match record...');
  await db.collection('Match_Logs').doc(testMatchId).update({
    is_certified: true,
    audit_status: 'Granted',
  });

  // Seed approved audit
  const approvedAuditId = `approved_${timestampStr}`;
  await db.collection('Official_Audits').doc(approvedAuditId).set({
    audit_id: approvedAuditId,
    match_id: testMatchId,
    requested_by: testCoachId,
    official_id: testOfficialId,
    status: 'Approved',
    requested_at: new Date().toISOString(),
    certified_at: new Date().toISOString(),
  });

  // Test unauthorized PDF download for certified match
  const dummyStream2 = new DummyWritable();
  try {
    await generateMatchPdf(testUnauthCoachId, testMatchId, dummyStream2);
    assert(false, 'Should throw 403 for unauthorized coach certified match PDF export');
  } catch (err: any) {
    assert(
      err instanceof ServiceError && err.statusCode === 403,
      'Unauthorized coach certified match PDF export returns HTTP 403 Forbidden'
    );
  }

  // Test authorized certified PDF download & response speed (Acceptance Criteria: streams within 1.5 seconds)
  const dummyStream3 = new DummyWritable();
  const startPdfTime = Date.now();
  await generateMatchPdf(testCoachId, testMatchId, dummyStream3);
  const pdfTime = Date.now() - startPdfTime;

  assert(
    pdfTime < 1500,
    `Certified PDF generation completes and streams under 1.5 seconds (took ${pdfTime}ms)`
  );
  assert(
    dummyStream3.bytesWritten > 1000,
    `Streams a non-empty certified PDF file successfully (wrote ${dummyStream3.bytesWritten} bytes)`
  );

  // ─── 4. Rate-Limiting Checks ───────────────────────
  console.log('\n--- TEST GROUP 4: PDF Request Rate-Limiting ---');

  resetPdfRateLimit(testCoachId);

  // Call 5 times successfully
  try {
    for (let i = 0; i < 5; i++) {
      checkPdfRateLimit(testCoachId);
    }
    assert(true, 'Enforces rate limit: 5 requests inside 1 minute window pass successfully');
  } catch (err) {
    assert(false, 'Enforces rate limit: 5 requests should not fail');
  }

  // Call 6th time should throw 429
  try {
    checkPdfRateLimit(testCoachId);
    assert(false, 'Enforces rate limit: 6th request should fail with 429');
  } catch (err: any) {
    assert(
      err instanceof ServiceError &&
      err.statusCode === 429 &&
      err.message.includes('Rate limit exceeded'),
      '6th request in rolling minute window fails with HTTP 429 Too Many Requests'
    );
  }

  // Cleanup rate limits
  resetPdfRateLimit(testCoachId);

  // ─── 5. Cleanup Test Data ───────────────────────
  console.log('\n--- 5. Cleaning Up Test Data ---');
  await db.collection('Users').doc(testCoachId).delete();
  await db.collection('Users').doc(testUnauthCoachId).delete();
  await db.collection('Users').doc(testOfficialId).delete();
  await db.collection('Users').doc(testAthleteId).delete();
  await db.collection('Athlete_Profiles').doc(`ath_${testAthleteId}`).delete();
  await db.collection('Teams').doc(testTeamId).delete();
  await db.collection('Match_Logs').doc(testMatchId).delete();
  await db.collection('Performance_Metrics').doc(`metric_${timestampStr}`).delete();
  await db.collection('Official_Audits').doc(audit.audit_id).delete();
  await db.collection('Official_Audits').doc(approvedAuditId).delete();

  console.log('✅ Cleaned up Firestore mock documents.\n');

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
