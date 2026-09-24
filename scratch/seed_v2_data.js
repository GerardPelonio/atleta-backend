const admin = require('firebase-admin');
const keyV2 = require('../serviceAccountKey.v2.json');

const appV2 = admin.initializeApp({
  credential: admin.credential.cert(keyV2)
}, 'app-v2-seed');

const dbV2 = admin.firestore(appV2);

async function seedV2() {
  console.log('🌱 Seeding initial datasets into atleta-v2...');
  const now = new Date().toISOString();

  // 1. Tournament Registry
  await dbV2.collection('Tournament_Registry').doc('org_atleta_championship').set({
    org_id: 'org_atleta_championship',
    name: 'National Collegiate Athletics Championship 2026',
    organization_name: 'National Collegiate Athletics Championship 2026',
    status: 'Active',
    registered_by: 'official@atleta.ph',
    created_at: now,
  }, { merge: true });

  // 2. Demo Official Account
  const officialUid = 'demo_official_01';
  const canonicalOffId = `off_${officialUid}`;

  await dbV2.collection('Users').doc(officialUid).set({
    user_id: officialUid,
    full_legal_name: 'Gerard Pelonio',
    full_name: 'Gerard Pelonio',
    first_name: 'Gerard',
    last_name: 'Pelonio',
    email: 'official@atleta.ph',
    role: 'Official',
    organization_name: 'National Collegiate Athletics Championship 2026',
    official_license_number: 'OFF-LIC-2026',
    assigned_tournaments: ['National Collegiate Athletics Championship 2026'],
    certification_status: 'Certified',
    is_active: true,
    created_at: now,
    updated_at: now,
  }, { merge: true });

  await dbV2.collection('Official_Profiles').doc(canonicalOffId).set({
    official_id: canonicalOffId,
    user_id: officialUid,
    organization_name: 'National Collegiate Athletics Championship 2026',
    official_license_number: 'OFF-LIC-2026',
    assigned_tournaments: ['National Collegiate Athletics Championship 2026'],
    certification_status: 'Certified',
    is_active: true,
    created_at: now,
    updated_at: now,
  }, { merge: true });

  await dbV2.collection('Official_Profiles').doc(officialUid).set({
    official_id: canonicalOffId,
    user_id: officialUid,
    organization_name: 'National Collegiate Athletics Championship 2026',
    official_license_number: 'OFF-LIC-2026',
    assigned_tournaments: ['National Collegiate Athletics Championship 2026'],
    certification_status: 'Certified',
    is_active: true,
    created_at: now,
    updated_at: now,
  }, { merge: true });

  await dbV2.collection('Official_Settings').doc(canonicalOffId).set({
    setting_id: 'set_official_01',
    official_id: canonicalOffId,
    split_screen_defaults: true,
    discrepancy_presets: true,
    match_reminders: true,
    updated_at: now,
  }, { merge: true });

  await dbV2.collection('Official_Settings').doc(officialUid).set({
    setting_id: 'set_official_01',
    official_id: canonicalOffId,
    split_screen_defaults: true,
    discrepancy_presets: true,
    match_reminders: true,
    updated_at: now,
  }, { merge: true });

  // 3. Demo Coach Account
  const coachUid = 'demo_coach_01';
  const canonicalCoachId = `coach_${coachUid}`;

  await dbV2.collection('Users').doc(coachUid).set({
    user_id: coachUid,
    full_legal_name: 'Coach Marcus Vance',
    full_name: 'Coach Marcus Vance',
    first_name: 'Marcus',
    last_name: 'Vance',
    email: 'coach@atleta.ph',
    role: 'Coach',
    organization_name: 'Green Archers Athletic Club',
    team_name: 'CELTICS',
    sport: 'Basketball',
    is_active: true,
    created_at: now,
    updated_at: now,
  }, { merge: true });

  await dbV2.collection('Coach_Profiles').doc(canonicalCoachId).set({
    coach_id: canonicalCoachId,
    user_id: coachUid,
    team_name: 'CELTICS',
    sport: 'Basketball',
    is_active: true,
    created_at: now,
    updated_at: now,
  }, { merge: true });

  await dbV2.collection('Coach_Settings').doc(canonicalCoachId).set({
    setting_id: 'set_coach_01',
    coach_id: canonicalCoachId,
    email_alerts: true,
    sms_notifications: false,
    game_log_updates: true,
    updated_at: now,
  }, { merge: true });

  // 4. Initial Teams
  await dbV2.collection('Teams').doc('TEAM-001').set({
    team_id: 'TEAM-001',
    team_name: 'CELTICS',
    sport_type: 'BASKETBALL',
    division: 'Varsity Division',
    coach_id: canonicalCoachId,
    season_record: { wins: 5, losses: 1 },
    roster_list: [
      { athlete_id: 'ATH-001', jersey_number: 23, first_name: 'Jordan', last_name: 'Clark', position: 'Point Guard' },
      { athlete_id: 'ATH-002', jersey_number: 11, first_name: 'Kyrie', last_name: 'Santos', position: 'Shooting Guard' },
      { athlete_id: 'ATH-003', jersey_number: 34, first_name: 'Shaq', last_name: 'Dela Cruz', position: 'Center' },
    ],
    created_at: now,
  }, { merge: true });

  await dbV2.collection('Teams').doc('TEAM-002').set({
    team_id: 'TEAM-002',
    team_name: 'HAWKS',
    sport_type: 'BASKETBALL',
    division: 'Varsity Division',
    coach_id: 'coach_opponent',
    season_record: { wins: 4, losses: 2 },
    roster_list: [
      { athlete_id: 'ATH-010', jersey_number: 7, first_name: 'Trae', last_name: 'Reyes', position: 'Guard' },
      { athlete_id: 'ATH-011', jersey_number: 15, first_name: 'Clint', last_name: 'Bautista', position: 'Center' },
    ],
    created_at: now,
  }, { merge: true });

  // 5. System Counters for Standard IDs
  await dbV2.collection('System_Counters').doc('MATCH').set({ current_number: 1 }, { merge: true });
  await dbV2.collection('System_Counters').doc('TEAM').set({ current_number: 2 }, { merge: true });
  await dbV2.collection('System_Counters').doc('VAL').set({ current_number: 1 }, { merge: true });
  await dbV2.collection('System_Counters').doc('SPORT').set({ current_number: 3 }, { merge: true });

  console.log('✅ Seed completed successfully!');
  const cols = await dbV2.listCollections();
  console.log('📁 Collections now available in atleta-v2:', cols.map(c => c.id));
}

seedV2().catch(err => {
  console.error('❌ Seeding error:', err);
  process.exit(1);
});
