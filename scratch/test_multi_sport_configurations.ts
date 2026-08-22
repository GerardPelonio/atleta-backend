import dotenv from 'dotenv';
dotenv.config();

import jwt from 'jsonwebtoken';
import { db } from '../utils/firebaseAdmin';
import {
  isSnakeCase,
  validateCreateSport,
  validateUpdateSport,
} from '../validators/sportValidator';
import {
  getAllSportsService,
  getSportByIdService,
  createSportService,
  updateSportService,
} from '../services/sportService';
import { submitMatchSession } from '../services/matchService';
import { requireSystemAdmin } from '../middlewares/adminMiddleware';
import { authenticate } from '../middlewares/authMiddleware';

console.log('==========================================================');
console.log('MULTI-SPORT CONFIGURATIONS & DYNAMIC METRIC SCHEMAS TEST');
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
  const jwtSecret = process.env.JWT_SECRET || 'atleta-super-secret-jwt-key-2026';
  const timestamp = Date.now();
  const testSportName = `Volleyball_${timestamp}`;
  const testShortId = `VB_${timestamp.toString().slice(-6)}`;
  const idempotencyKey = `idemp_sport_${timestamp}`;

  // Generate test tokens
  const adminToken = jwt.sign(
    { uid: `admin_${timestamp}`, email: 'admin@atleta.edu', role: 'SystemAdmin' },
    jwtSecret,
    { expiresIn: '1h' }
  );

  const coachToken = jwt.sign(
    { uid: `coach_${timestamp}`, email: 'coach@atleta.edu', role: 'Coach' },
    jwtSecret,
    { expiresIn: '1h' }
  );

  const athleteToken = jwt.sign(
    { uid: `ath_${timestamp}`, email: 'athlete@atleta.edu', role: 'Athlete' },
    jwtSecret,
    { expiresIn: '1h' }
  );

  // ─── TEST GROUP 1: Validator Unit Tests ─────────────────────────────
  console.log('--- TEST GROUP 1: Snake_Case & Payload Validation ---');

  // 1a. Snake_Case format tests
  assert(isSnakeCase('kills'), 'isSnakeCase accepts single-word lowercase');
  assert(isSnakeCase('service_aces'), 'isSnakeCase accepts snake_case words');
  assert(isSnakeCase('attack_kill_pct_3'), 'isSnakeCase accepts numbers in snake_case');
  assert(!isSnakeCase('serviceAces'), 'isSnakeCase rejects camelCase');
  assert(!isSnakeCase('Service_Aces'), 'isSnakeCase rejects uppercase');
  assert(!isSnakeCase('service aces'), 'isSnakeCase rejects spaces');
  assert(!isSnakeCase('service__aces'), 'isSnakeCase rejects consecutive underscores');
  assert(!isSnakeCase('_service_aces'), 'isSnakeCase rejects leading underscores');
  assert(!isSnakeCase('service_aces_'), 'isSnakeCase rejects trailing underscores');

  // 1b. Missing Idempotency-Key header on create
  const missingIdemp = validateCreateSport(
    {
      sport_name: testSportName,
      short_identifier: testShortId,
      configurable_stats: [{ stat_name_key: 'kills', measurement_category: 'Count' }],
    },
    undefined
  );
  assert(
    missingIdemp.some((e) => e.field === 'Idempotency-Key'),
    'Registration without Idempotency-Key header returns validation error (400)'
  );

  // 1c. Missing required fields
  const missingFields = validateCreateSport({}, 'idemp_key_123');
  assert(missingFields.some((e) => e.field === 'sport_name'), 'Missing sport_name rejected');
  assert(missingFields.some((e) => e.field === 'short_identifier'), 'Missing short_identifier rejected');
  assert(missingFields.some((e) => e.field === 'configurable_stats'), 'Missing configurable_stats rejected');

  // 1d. Empty configurable_stats array
  const emptyStats = validateCreateSport(
    {
      sport_name: testSportName,
      short_identifier: testShortId,
      configurable_stats: [],
    },
    'idemp_key_123'
  );
  assert(
    emptyStats.some((e) => e.field === 'configurable_stats'),
    'Empty configurable_stats array rejected (requires Min 1 item)'
  );

  // 1e. Invalid measurement category
  const invalidCategory = validateCreateSport(
    {
      sport_name: testSportName,
      short_identifier: testShortId,
      configurable_stats: [{ stat_name_key: 'kills', measurement_category: 'UnknownCategory' }],
    },
    'idemp_key_123'
  );
  assert(
    invalidCategory.some((e) => e.field.includes('measurement_category')),
    'Invalid measurement_category rejected (must match enum)'
  );

  // 1f. Non-snake_case stat_name_key
  const invalidStatKey = validateCreateSport(
    {
      sport_name: testSportName,
      short_identifier: testShortId,
      configurable_stats: [{ stat_name_key: 'Kills Count', measurement_category: 'Count' }],
    },
    'idemp_key_123'
  );
  assert(
    invalidStatKey.some((e) => e.field.includes('stat_name_key')),
    'Non-snake_case stat_name_key rejected'
  );

  // 1g. ACCEPTANCE CRITERIA: Duplicate metric keys within the same sport payload return HTTP 400 Bad Request
  const duplicateKeysPayload = validateCreateSport(
    {
      sport_name: testSportName,
      short_identifier: testShortId,
      configurable_stats: [
        { stat_name_key: 'kills', measurement_category: 'Count' },
        { stat_name_key: 'digs', measurement_category: 'Count' },
        { stat_name_key: 'kills', measurement_category: 'Count' }, // Duplicate!
      ],
    },
    'idemp_key_123'
  );
  assert(
    duplicateKeysPayload.some(
      (e) => e.field.includes('stat_name_key') && e.message.includes('Duplicate metric key')
    ),
    'ACCEPTANCE CRITERIA: Duplicate metric keys within the same sport payload return HTTP 400 Bad Request'
  );

  // 1h. Valid create payload
  const validCreate = validateCreateSport(
    {
      sport_name: testSportName,
      short_identifier: testShortId,
      configurable_stats: [
        { stat_name_key: 'kills', measurement_category: 'Count' },
        { stat_name_key: 'blocks', measurement_category: 'Count' },
        { stat_name_key: 'digs', measurement_category: 'Count' },
        { stat_name_key: 'service_aces', measurement_category: 'Count' },
      ],
    },
    'idemp_key_123'
  );
  assert(validCreate.length === 0, 'Valid sport registration payload passes validator');

  // 1i. Update validation
  const emptyUpdate = validateUpdateSport({});
  assert(emptyUpdate.length > 0, 'Empty update payload rejected');

  const validUpdate = validateUpdateSport({
    configurable_stats: [
      { stat_name_key: 'kills', measurement_category: 'Count' },
      { stat_name_key: 'attack_kill_pct', measurement_category: 'Percentage' },
    ],
  });
  assert(validUpdate.length === 0, 'Valid update payload passes validator');

  // ─── TEST GROUP 2: Security & RBAC Enforcement ─────────────────────
  console.log('\n--- TEST GROUP 2: Security & RBAC Enforcement ---');

  // Helper to test middleware
  async function testMiddleware(middleware: any, token?: string): Promise<{ status: number; body?: any; calledNext: boolean }> {
    let statusCode = 200;
    let body: any = null;
    let calledNext = false;

    const req: any = {
      headers: token ? { authorization: `Bearer ${token}` } : {},
      method: 'POST',
      url: '/api/v1/sports',
      originalUrl: '/api/v1/sports',
      ip: '127.0.0.1',
    };

    const res: any = {
      status(code: number) {
        statusCode = code;
        return this;
      },
      json(data: any) {
        body = data;
        return this;
      },
    };

    const next = () => {
      calledNext = true;
    };

    await middleware(req, res, next);
    return { status: statusCode, body, calledNext };
  }

  // 2a. Anonymous request to write endpoint (POST)
  const anonRes = await testMiddleware(requireSystemAdmin, undefined);
  assert(anonRes.status === 401 && !anonRes.calledNext, 'Write attempt with no token returns HTTP 401 Unauthorized');

  // 2b. ACCEPTANCE CRITERIA: Write attempts by non-admin users return HTTP 403 Forbidden
  const coachWriteRes = await testMiddleware(requireSystemAdmin, coachToken);
  assert(
    coachWriteRes.status === 403 && !coachWriteRes.calledNext,
    'ACCEPTANCE CRITERIA: Write attempt by Coach role returns HTTP 403 Forbidden'
  );

  const athleteWriteRes = await testMiddleware(requireSystemAdmin, athleteToken);
  assert(
    athleteWriteRes.status === 403 && !athleteWriteRes.calledNext,
    'ACCEPTANCE CRITERIA: Write attempt by Athlete role returns HTTP 403 Forbidden'
  );

  // 2c. Write attempt by SystemAdmin role succeeds
  const adminWriteRes = await testMiddleware(requireSystemAdmin, adminToken);
  assert(adminWriteRes.calledNext, 'Write attempt by SystemAdmin role passes RBAC verification');

  // 2d. Read endpoint accessible by any authenticated user
  const coachReadRes = await testMiddleware(authenticate, coachToken);
  assert(coachReadRes.calledNext, 'Coach can access authenticated GET /api/v1/sports');

  // ─── TEST GROUP 3: Service Layer & Database Operations ─────────────
  console.log('\n--- TEST GROUP 3: Sport Creation, Persistence & Idempotency ---');

  let createdSportId = '';

  try {
    // 3a. Register a new sport configuration
    const createResult = await createSportService(
      {
        sport_name: testSportName,
        short_identifier: testShortId,
        configurable_stats: [
          { stat_name_key: 'kills', measurement_category: 'Count' },
          { stat_name_key: 'blocks', measurement_category: 'Count' },
          { stat_name_key: 'digs', measurement_category: 'Count' },
          { stat_name_key: 'service_aces', measurement_category: 'Count' },
        ],
      },
      idempotencyKey,
      `admin_${timestamp}`
    );

    createdSportId = createResult.sport.sport_id;

    assert(!!createdSportId, 'Sport created with UUID sport_id');
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    assert(uuidRegex.test(createdSportId), 'sport_id is in valid UUID format');
    assert(createResult.sport.sport_name === testSportName, 'sport_name stored correctly');
    assert(createResult.sport.short_identifier === testShortId.toUpperCase(), 'short_identifier stored uppercase');
    assert(createResult.sport.is_active === true, 'is_active defaults to true');
    assert(createResult.sport.configurable_stats.length === 4, 'All 4 configurable stats stored');
    assert(!!createResult.sport.created_at && !!createResult.sport.updated_at, 'created_at and updated_at timestamps populated');

    // Verify Firestore document
    const sportDoc = await db.collection('Sports_Configurations').doc(createdSportId).get();
    assert(sportDoc.exists, 'Sports_Configurations Firestore document persisted');

    // 3b. Idempotency Key Replay Verification
    const replayResult = await createSportService(
      {
        sport_name: testSportName,
        short_identifier: testShortId,
        configurable_stats: [{ stat_name_key: 'kills', measurement_category: 'Count' }],
      },
      idempotencyKey,
      `admin_${timestamp}`
    );
    assert(replayResult.sport.sport_id === createdSportId, 'Identical Idempotency-Key returns cached original response');

    // 3c. Uniqueness constraint check (duplicate name or short identifier)
    try {
      await createSportService(
        {
          sport_name: testSportName,
          short_identifier: 'DIFF_ID',
          configurable_stats: [{ stat_name_key: 'kills', measurement_category: 'Count' }],
        },
        `idemp_diff_${timestamp}`
      );
      assert(false, 'Duplicate sport_name should be rejected');
    } catch (err: any) {
      assert(err.statusCode === 400 && err.message.includes('already exists'), 'Duplicate sport_name returns HTTP 400 error');
    }

    try {
      await createSportService(
        {
          sport_name: `Different_${timestamp}`,
          short_identifier: testShortId,
          configurable_stats: [{ stat_name_key: 'kills', measurement_category: 'Count' }],
        },
        `idemp_diff2_${timestamp}`
      );
      assert(false, 'Duplicate short_identifier should be rejected');
    } catch (err: any) {
      assert(err.statusCode === 400 && err.message.includes('already exists'), 'Duplicate short_identifier returns HTTP 400 error');
    }

    // 3d. Update sport configuration (PATCH /api/v1/sports/:sportId)
    const updateResult = await updateSportService(
      createdSportId,
      {
        configurable_stats: [
          { stat_name_key: 'kills', measurement_category: 'Count' },
          { stat_name_key: 'blocks', measurement_category: 'Count' },
          { stat_name_key: 'digs', measurement_category: 'Count' },
          { stat_name_key: 'service_aces', measurement_category: 'Count' },
          { stat_name_key: 'reception_accuracy_pct', measurement_category: 'Percentage' },
        ],
      },
      `admin_${timestamp}`
    );

    assert(updateResult.sport.configurable_stats.length === 5, 'Sport configurable_stats updated successfully');
    assert(
      updateResult.sport.configurable_stats.some((s) => s.stat_name_key === 'reception_accuracy_pct'),
      'New dynamic metric key reception_accuracy_pct added to schema'
    );

    // 3e. Retrieve by ID
    const retrieved = await getSportByIdService(createdSportId);
    assert(retrieved.sport_id === createdSportId, 'getSportByIdService returns sport configuration');

  } catch (err: any) {
    console.error('Service test error:', err);
    assert(false, 'Sport service operations succeed');
  }

  // ─── TEST GROUP 4: Coach Sideline Logging Population & Match Processing ───
  console.log('\n--- TEST GROUP 4: Coach Sideline Logging Integration ---');

  try {
    // 4a. ACCEPTANCE CRITERIA: Newly registered sports instantly populate across coach sideline logging choices
    const coachSportChoices = await getAllSportsService();
    const foundNewSport = coachSportChoices.find((s) => s.sport_id === createdSportId);

    assert(
      !!foundNewSport && foundNewSport.sport_name === testSportName,
      'ACCEPTANCE CRITERIA: Newly registered sport instantly populates in coach sports choices (GET /api/v1/sports)'
    );
    assert(
      foundNewSport?.configurable_stats.some((s) => s.stat_name_key === 'reception_accuracy_pct'),
      'Coach can access dynamic metric tracking schemas for match logging'
    );

    // 4b. Coach logs a live match session using the newly registered sport and dynamic metric keys
    const matchCoachId = `coach_vb_${timestamp}`;
    const matchTeamId = `team_vb_${timestamp}`;
    const matchAthId = `ath_vb_${timestamp}`;
    const matchIdempKey = `idemp_match_vb_${timestamp}`;

    // Seed test team & athlete
    await db.collection('Teams').doc(matchTeamId).set({
      team_id: matchTeamId,
      team_name: 'Adamson Lady Falcons',
      sport_type: testSportName,
      coach_id: matchCoachId,
      roster_list: [matchAthId],
    });

    await db.collection('Athlete_Profiles').doc(matchAthId).set({
      athlete_id: matchAthId,
      user_id: matchAthId,
      first_name: 'Trisha',
      last_name: 'Tubu',
      position: 'Opposite Spiker',
      jersey_number: 10,
    });

    const matchPayload = {
      team_id: matchTeamId,
      sport_type: testSportName as any,
      match_type: 'UAAP Volleyball Tournament',
      match_date: new Date().toISOString(),
      location: 'Filoil EcoOil Centre',
      opponent_team_name: 'UST Golden Tigresses',
      game_result: 'WIN' as const,
      notes: 'Season opening volleyball victory',
      player_stats: [
        {
          athlete_id: matchAthId,
          stats: {
            kills: 18,
            blocks: 4,
            digs: 7,
            service_aces: 3,
            reception_accuracy_pct: 85.5,
            errors: 2,
          },
        },
      ],
    };

    const recordedMatch = await submitMatchSession(matchCoachId, matchPayload, matchIdempKey);
    assert(!!recordedMatch.match.match_id, 'Match logging engine processed match for new dynamic sport');
    assert(recordedMatch.performance_metrics.length === 1, 'Performance metrics generated for dynamic sport');
    assert(
      recordedMatch.performance_metrics[0].sport_stats.kills === 18,
      'Dynamic stat kills correctly stored in Performance_Metrics'
    );
    assert(
      recordedMatch.performance_metrics[0].calculated_player_efficiency > 0,
      `Calculated player efficiency for dynamic sport (EFF: ${recordedMatch.performance_metrics[0].calculated_player_efficiency})`
    );

    // Cleanup match test data
    await db.collection('Match_Logs').doc(recordedMatch.match.match_id).delete().catch(() => {});
    await db.collection('Performance_Metrics').doc(`metric_${recordedMatch.match.match_id}_${matchAthId}`).delete().catch(() => {});
    await db.collection('Idempotency_Keys').doc(matchIdempKey).delete().catch(() => {});
    await db.collection('Teams').doc(matchTeamId).delete().catch(() => {});
    await db.collection('Athlete_Profiles').doc(matchAthId).delete().catch(() => {});

  } catch (err: any) {
    console.error('Coach logging integration error:', err);
    assert(false, 'Coach sideline logging integration succeeds');
  }

  // ─── TEST GROUP 5: Audit Log Verification ──────────────────────────
  console.log('\n--- TEST GROUP 5: Admin Audit Log Verification ---');

  try {
    const auditLogsSnap = await db
      .collection('Admin_Audit_Logs')
      .where('endpoint', '==', '/api/v1/sports')
      .get();

    assert(!auditLogsSnap.empty, 'Audit log entries generated for sport configuration mutations');
    const logs = auditLogsSnap.docs.map((d) => d.data());
    assert(
      logs.some((l) => l.action === 'POST /api/v1/sports' && l.status === 'SUCCESS'),
      'Admin_Audit_Logs contains SUCCESS entry for sport registration'
    );
  } catch (err: any) {
    console.error('Audit log check error:', err);
    assert(false, 'Audit log entries recorded for sports mutations');
  }

  // ─── Cleanup Test Artifacts ─────────────────────────────────────────
  console.log('\n--- Cleaning up test artifacts ---');
  if (createdSportId) {
    await db.collection('Sports_Configurations').doc(createdSportId).delete().catch(() => {});
  }
  await db.collection('Idempotency_Keys').doc(idempotencyKey).delete().catch(() => {});

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
