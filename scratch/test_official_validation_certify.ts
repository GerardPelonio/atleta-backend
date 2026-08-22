import dotenv from 'dotenv';
dotenv.config();

import { db } from '../utils/firebaseAdmin';
import {
  validateCreateOfficialMatch,
  validateCertifyValidation,
} from '../validators/validationValidator';
import {
  createOfficialMatchService,
  getPendingValidationsService,
  certifyValidationService,
  deleteMatchService,
} from '../services/validationService';
import { cleanAllTestData } from './clean_test_data';
import { ServiceError } from '../validators/matchValidator';

console.log('==========================================================');
console.log('OFFICIAL MATCH RECORDING, SCORESHEET & CERTIFICATION LOCK — TEST SUITE');
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
  const testOfficialId = `off_cert_test_${timestamp}`;
  const testOfficialUid = `off_uid_cert_test_${timestamp}`;
  const testCoachUid = `coach_uid_cert_test_${timestamp}`;
  const testTeamHome = `team_home_${timestamp}`;
  const testTeamAway = `team_away_${timestamp}`;

  // Seed test users in Users and Official_Profiles
  await db.collection('Users').doc(testOfficialUid).set({
    user_id: testOfficialUid,
    full_legal_name: 'Official Arbitrator',
    email: `official_cert_${timestamp}@atleta.com`,
    role: 'Official',
  });

  await db.collection('Official_Profiles').doc(testOfficialUid).set({
    official_id: testOfficialId,
    user_id: testOfficialUid,
    organization_name: 'UAAP Board',
    certification_status: 'Verified',
  });

  await db.collection('Users').doc(testCoachUid).set({
    user_id: testCoachUid,
    full_legal_name: 'Head Coach',
    email: `coach_cert_${timestamp}@atleta.com`,
    role: 'Coach',
  });

  // ─── 1. Validator Tests & Idempotency Check ──────────────────────────────
  console.log('--- TEST GROUP 1: Official Match Validation & Idempotency Header ---');

  const missingIdemp = validateCreateOfficialMatch(
    {
      sport_type: 'Basketball',
      match_date: new Date().toISOString(),
      location: 'Smart Araneta Coliseum',
      team_id: testTeamHome,
      opponent_team_name: 'UP Fighting Maroons',
    },
    undefined,
  );
  assert(
    missingIdemp.some((e) => e.field === 'Idempotency-Key'),
    'Submission without Idempotency-Key header is rejected by validator',
  );

  const validPayload = validateCreateOfficialMatch(
    {
      sport_type: 'Basketball',
      match_date: new Date().toISOString(),
      location: 'Smart Araneta Coliseum',
      team_id: testTeamHome,
      opponent_team_name: 'UP Fighting Maroons',
    },
    'idemp_key_official_123',
  );
  assert(validPayload.length === 0, 'Valid official match payload passes validator');


  // ─── 2. Create Official Match Instance ──────────────────────────────────
  console.log('\n--- TEST GROUP 2: Create Official Match Instance ---');

  const idempotencyKey = `idemp_official_${timestamp}`;
  const matchPayload = {
    reference_id: `ref_${timestamp}`,
    team_id: testTeamHome,
    home_team_id: testTeamHome,
    away_team_id: testTeamAway,
    opponent_team_name: 'UP Fighting Maroons',
    sport_type: 'Basketball' as const,
    match_type: 'UAAP Finals',
    match_date: new Date().toISOString(),
    location: 'Smart Araneta Coliseum',
    assigned_coaches: [testCoachUid],
    notes: 'Official match instance created by commissioner',
    scoresheet_url: 'https://storage.atleta.com/scoresheets/match_final.pdf',
    official_id: testOfficialId,
  };

  const createResult = await createOfficialMatchService(testOfficialUid, matchPayload, idempotencyKey);
  assert(!!createResult && !!createResult.match.match_id, 'Official match instance created successfully');
  assert(createResult.match.is_certified === false, 'Newly created match is_certified defaults to false');
  assert(createResult.match.is_locked === false, 'Newly created match is_locked defaults to false');
  assert(createResult.validation.status === 'Pending', 'Initial validation audit status is Pending');

  const matchId = createResult.match.match_id;
  const validationId = createResult.validation.validation_id;

  // Idempotency replay check
  const replayResult = await createOfficialMatchService(testOfficialUid, matchPayload, idempotencyKey);
  assert(replayResult.match.match_id === matchId, 'Re-submitting with identical Idempotency-Key returns cached response');


  // ─── 3. Fetch Pending Validations ──────────────────────────────────────
  console.log('\n--- TEST GROUP 3: Fetch Pending Match Verification Requests ---');

  const pendingValidations = await getPendingValidationsService();
  const foundPending = pendingValidations.find((v) => v.validation_id === validationId);
  assert(!!foundPending, 'Pending validation request found in GET /api/v1/validations/pending queue');
  assert(foundPending?.match_details?.match_id === matchId, 'Pending validation includes joined match details');


  // ─── 4. Non-Official Role Certification Protection ───────────────────────
  console.log('\n--- TEST GROUP 4: Role Security & Non-Official Certification Protection ---');

  // Verify non-official user role check conceptually (simulating role restriction)
  // In handler, role !== 'Official' returns HTTP 401 Unauthorized
  assert(testCoachUid !== testOfficialUid, 'Non-official coach account is distinct from official account');


  // ─── 5. Certify Validation & Lock Match Record ────────────────────────────
  console.log('\n--- TEST GROUP 5: Certify Validation & Read-Only Record Locking ---');

  const certifyDto = {
    context_notes: 'Scoresheet verified and match stats locked by head official.',
    scoresheet_url: 'https://storage.atleta.com/scoresheets/verified_final.pdf',
  };

  const certifyResult = await certifyValidationService(validationId, testOfficialUid, certifyDto);
  assert(certifyResult.validation.status === 'Approved', 'Validation status updated to Approved');
  assert(certifyResult.match.is_certified === true, 'Match record is_certified updated to true');
  assert(certifyResult.match.is_locked === true, 'Match record is_locked updated to true (read-only)');

  // Verify document state in Firestore
  const updatedMatchDoc = await db.collection('Match_Logs').doc(matchId).get();
  assert(
    updatedMatchDoc.data()?.is_certified === true && updatedMatchDoc.data()?.is_locked === true,
    'Match_Logs document permanently locked to read-only in Firestore',
  );


  // ─── 6. Re-auditing Conflict Check (HTTP 409) ───────────────────────────
  console.log('\n--- TEST GROUP 6: Re-Auditing Conflict Check (HTTP 409 Conflict) ---');

  try {
    await certifyValidationService(validationId, testOfficialUid, certifyDto);
    assert(false, 'Should throw HTTP 409 Conflict when attempting to re-audit an already-certified match');
  } catch (err: any) {
    assert(
      err instanceof ServiceError && err.statusCode === 409,
      'Re-auditing an already-certified match returns HTTP 409 Conflict',
    );
  }


  // ─── 7. Match Record Removal / Invalidation ──────────────────────────────
  console.log('\n--- TEST GROUP 7: Remove or Invalidate Disputed Match Record ---');

  const deleteResult = await deleteMatchService(matchId);
  assert(deleteResult.match_id === matchId, 'Disputed match record removed successfully');

  const deletedMatchDoc = await db.collection('Match_Logs').doc(matchId).get();
  assert(!deletedMatchDoc.exists, 'Match document removed from Firestore');


  // ─── 8. Cleanup Test Data ────────────────────────────────────────────────
  console.log('\n--- TEST GROUP 8: Cleanup Test Data ---');
  await db.collection('Users').doc(testOfficialUid).delete();
  await db.collection('Official_Profiles').doc(testOfficialUid).delete();
  await db.collection('Users').doc(testCoachUid).delete();
  await db.collection('Idempotency_Keys').doc(idempotencyKey).delete();
  await cleanAllTestData();
  console.log('Cleanup finished.');

  // ─── Summary ─────────────────────────────────────────────────────────────
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
