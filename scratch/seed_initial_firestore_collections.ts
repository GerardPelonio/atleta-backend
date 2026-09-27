import { db } from '../utils/firebaseAdmin';

async function seedCollections() {
  console.log('🌱 Seeding initial clean documents into all Firestore collections...\n');

  const now = new Date().toISOString();

  // 1. Users
  await db.collection('Users').doc('usr_coach_001').set({
    user_id: 'usr_coach_001',
    first_name: 'Erick Nathaniel',
    last_name: 'De Belen',
    full_name: 'Erick Nathaniel De Belen',
    email: 'coach@gmail.com',
    role: 'Coach',
    contact_number: '09123456789',
    sport_type: 'Basketball',
    current_institution: 'University Athletics',
    created_at: now,
    updated_at: now,
  });

  await db.collection('Users').doc('usr_athlete_001').set({
    user_id: 'usr_athlete_001',
    first_name: 'Gerard',
    last_name: 'Pelonio',
    full_name: 'Gerard Pelonio',
    email: 'athlete@gmail.com',
    role: 'Athlete',
    contact_number: '09123456780',
    sport_type: 'Basketball',
    created_at: now,
    updated_at: now,
  });

  await db.collection('Users').doc('usr_admin_001').set({
    user_id: 'usr_admin_001',
    first_name: 'Atleta',
    last_name: 'Administrator',
    full_name: 'Atleta Admin',
    email: 'admin@atleta.ph',
    role: 'Admin',
    contact_number: '09123456781',
    created_at: now,
    updated_at: now,
  });

  await db.collection('Users').doc('usr_official_001').set({
    user_id: 'usr_official_001',
    first_name: 'Official',
    last_name: 'Referee',
    full_name: 'Official Referee',
    email: 'official@atleta.ph',
    role: 'Official',
    contact_number: '09123456782',
    created_at: now,
    updated_at: now,
  });
  console.log(' ✅ Seeded: Users');

  // 2. Athlete_Profiles
  await db.collection('Athlete_Profiles').doc('ath_001').set({
    athlete_id: 'ath_001',
    user_id: 'usr_athlete_001',
    first_name: 'Gerard',
    last_name: 'Pelonio',
    full_name: 'Gerard Pelonio',
    sport_type: 'Basketball',
    gender: 'Male',
    birthdate: '2002-05-15',
    province: 'Manila',
    team_id: 'team_001',
    team_name: 'Atleta Elite Falcons',
    height_cm: 185,
    weight_kg: 78,
    wingspan_cm: 190,
    stats: {
      points_per_game: 0,
      assists_per_game: 0,
      rebounds_per_game: 0,
      games_played: 0,
    },
    created_at: now,
    updated_at: now,
  });
  console.log(' ✅ Seeded: Athlete_Profiles');

  // 3. Coach_Profiles
  await db.collection('Coach_Profiles').doc('coach_001').set({
    coach_id: 'coach_001',
    user_id: 'usr_coach_001',
    first_name: 'Erick Nathaniel',
    last_name: 'De Belen',
    full_name: 'Erick Nathaniel De Belen',
    email: 'coach@gmail.com',
    sport_type: 'Basketball',
    role_title: 'BASKETBALL COACH',
    current_institution: 'University Athletics',
    years_of_experience: 5,
    quote: 'Building champions through disciplined training and continuous development.',
    certifications: [
      { id: 'c1', title: 'National Sports Commission Certified', issuer: 'SBP', year: '2024', icon: 'shield-check' }
    ],
    specialties: ['Tactical Strategy', 'Player Development', 'Analytics'],
    created_at: now,
    updated_at: now,
  });
  console.log(' ✅ Seeded: Coach_Profiles');

  // 4. Coach_Settings
  await db.collection('Coach_Settings').doc('usr_coach_001').set({
    coach_id: 'coach_001',
    user_id: 'usr_coach_001',
    data_sync_preference: 'Automatic',
    notification_preferences: {
      game_log_updates: true,
      recruitment_inquiries: true,
    },
    created_at: now,
    updated_at: now,
  });
  console.log(' ✅ Seeded: Coach_Settings');

  // 5. Teams
  await db.collection('Teams').doc('team_001').set({
    team_id: 'team_001',
    team_name: 'Atleta Elite Falcons',
    sport_type: 'BASKETBALL',
    division: 'Division 1 Elite',
    coach_id: 'coach_001',
    season_record: { wins: 0, losses: 0 },
    roster_list: [
      {
        athlete_id: 'ath_001',
        user_id: 'usr_athlete_001',
        full_name: 'Gerard Pelonio',
        sport_type: 'BASKETBALL',
        position: 'PG',
        jersey_number: '7',
        is_eligibility_verified: true,
      }
    ],
    created_at: now,
    updated_at: now,
  });
  console.log(' ✅ Seeded: Teams');

  // 6. Workload_Analysis
  await db.collection('Workload_Analysis').doc('wl_001').set({
    workload_id: 'wl_001',
    athlete_id: 'ath_001',
    user_id: 'usr_athlete_001',
    target_7day_effort_pts: 400,
    target_intensity: 8,
    calculated_acwr: 1.0,
    current_7day_acute_load: 0,
    current_28day_chronic_load: 0,
    recent_entries: [],
    created_at: now,
    updated_at: now,
  });
  console.log(' ✅ Seeded: Workload_Analysis');

  // 7. Performance_Metrics
  await db.collection('Performance_Metrics').doc('pm_001').set({
    metric_id: 'pm_001',
    athlete_id: 'ath_001',
    sport_type: 'Basketball',
    games_recorded: 0,
    averages: {
      points: 0,
      assists: 0,
      rebounds: 0,
    },
    created_at: now,
    updated_at: now,
  });
  console.log(' ✅ Seeded: Performance_Metrics');

  // 8. Match_Logs
  await db.collection('Match_Logs').doc('match_001').set({
    match_id: 'match_001',
    sport_type: 'BASKETBALL',
    home_team_id: 'team_001',
    home_team_name: 'Atleta Elite Falcons',
    away_team_name: 'Blue Warriors',
    home_score: 0,
    away_score: 0,
    status: 'scheduled',
    match_date: now,
    created_at: now,
    updated_at: now,
  });
  console.log(' ✅ Seeded: Match_Logs');

  // 9. Official_Profiles
  await db.collection('Official_Profiles').doc('off_001').set({
    official_id: 'off_001',
    user_id: 'usr_official_001',
    first_name: 'Official',
    last_name: 'Referee',
    full_name: 'Official Referee',
    email: 'official@atleta.ph',
    license_number: 'LIC-2026-001',
    sport_accreditation: ['Basketball'],
    created_at: now,
    updated_at: now,
  });
  console.log(' ✅ Seeded: Official_Profiles');

  // 10. Official_Settings
  await db.collection('Official_Settings').doc('usr_official_001').set({
    official_id: 'off_001',
    user_id: 'usr_official_001',
    notifications_enabled: true,
    auto_sync: true,
    created_at: now,
    updated_at: now,
  });
  console.log(' ✅ Seeded: Official_Settings');

  // 11. Official_Validations
  await db.collection('Official_Validations').doc('val_001').set({
    validation_id: 'val_001',
    match_id: 'match_001',
    official_id: 'off_001',
    status: 'pending',
    verification_hash: 'init_hash_001',
    created_at: now,
    updated_at: now,
  });
  console.log(' ✅ Seeded: Official_Validations');

  // 12. Official_Schedules
  await db.collection('Official_Schedules').doc('sched_001').set({
    schedule_id: 'sched_001',
    official_id: 'off_001',
    match_id: 'match_001',
    venue: 'Main Arena Court A',
    scheduled_time: now,
    status: 'assigned',
    created_at: now,
    updated_at: now,
  });
  console.log(' ✅ Seeded: Official_Schedules');

  // 13. Official_Audits
  await db.collection('Official_Audits').doc('audit_off_001').set({
    audit_id: 'audit_off_001',
    official_id: 'off_001',
    action_type: 'INITIAL_REGISTRATION',
    details: 'Official account provisioned.',
    timestamp: now,
  });
  console.log(' ✅ Seeded: Official_Audits');

  // 14. Official_Notifications
  await db.collection('Official_Notifications').doc('notif_off_001').set({
    notification_id: 'notif_off_001',
    official_id: 'off_001',
    title: 'Welcome to Atleta',
    message: 'Your official officiating dashboard is ready.',
    read: false,
    created_at: now,
  });
  console.log(' ✅ Seeded: Official_Notifications');

  // 15. Notifications
  await db.collection('Notifications').doc('notif_001').set({
    notification_id: 'notif_001',
    user_id: 'usr_athlete_001',
    title: 'Welcome to Atleta!',
    message: 'Welcome to your sports performance platform.',
    is_read: false,
    created_at: now,
  });
  console.log(' ✅ Seeded: Notifications');

  // 16. Scouting_Registry
  await db.collection('Scouting_Registry').doc('scout_001').set({
    registry_id: 'scout_001',
    athlete_id: 'ath_001',
    user_id: 'usr_athlete_001',
    full_name: 'Gerard Pelonio',
    sport_category: 'BASKETBALL',
    position: 'PG',
    province: 'Manila',
    rank: 1,
    composite_score: 95.0,
    created_at: now,
    updated_at: now,
  });
  console.log(' ✅ Seeded: Scouting_Registry');

  // 17. Tournament_Registry
  await db.collection('Tournament_Registry').doc('tourn_001').set({
    tournament_id: 'tourn_001',
    tournament_name: 'National Inter-Collegiate Championship 2026',
    sport_type: 'BASKETBALL',
    season: '2026',
    participating_teams: ['team_001'],
    status: 'active',
    created_at: now,
    updated_at: now,
  });
  console.log(' ✅ Seeded: Tournament_Registry');

  // 18. Sports_Configurations
  await db.collection('Sports_Configurations').doc('sport_basketball_default').set({
    sport_id: 'sport_basketball_default',
    sport_name: 'Basketball',
    short_identifier: 'BBALL',
    is_active: true,
    created_at: now,
    updated_at: now,
  });

  await db.collection('Sports_Configurations').doc('sport_swimming_default').set({
    sport_id: 'sport_swimming_default',
    sport_name: 'Swimming',
    short_identifier: 'SWIM',
    is_active: true,
    created_at: now,
    updated_at: now,
  });

  await db.collection('Sports_Configurations').doc('sport_track_field_default').set({
    sport_id: 'sport_track_field_default',
    sport_name: 'Track & Field',
    short_identifier: 'TF',
    is_active: true,
    created_at: now,
    updated_at: now,
  });
  console.log(' ✅ Seeded: Sports_Configurations');

  // 19. Password_Resets
  await db.collection('Password_Resets').doc('reset_sample_001').set({
    reset_id: 'reset_sample_001',
    email: 'sample@atleta.ph',
    status: 'completed',
    requested_at: now,
    completed_at: now,
  });
  console.log(' ✅ Seeded: Password_Resets');

  // 20. Anthropometric_Measurements
  await db.collection('Anthropometric_Measurements').doc('anthro_001').set({
    measurement_id: 'anthro_001',
    athlete_id: 'ath_001',
    height_cm: 185,
    weight_kg: 78,
    wingspan_cm: 190,
    vertical_leap_cm: 80,
    measured_at: now,
  });
  console.log(' ✅ Seeded: Anthropometric_Measurements');

  // 21. Admin_Profiles
  await db.collection('Admin_Profiles').doc('admin_001').set({
    admin_id: 'admin_001',
    user_id: 'usr_admin_001',
    full_name: 'Atleta Admin',
    email: 'admin@atleta.ph',
    permissions: ['all'],
    created_at: now,
    updated_at: now,
  });
  console.log(' ✅ Seeded: Admin_Profiles');

  // 22. Admin_Audit_Logs
  await db.collection('Admin_Audit_Logs').doc('audit_admin_001').set({
    log_id: 'audit_admin_001',
    admin_id: 'admin_001',
    action: 'SYSTEM_INITIALIZATION',
    details: 'System database initialized with clean collections.',
    timestamp: now,
  });
  console.log(' ✅ Seeded: Admin_Audit_Logs');

  // 23. Idempotency_Keys
  await db.collection('Idempotency_Keys').doc('idemp_001').set({
    key: 'idemp_001',
    operation: 'INITIALIZE',
    response: { status: 'success' },
    created_at: now,
  });
  console.log(' ✅ Seeded: Idempotency_Keys');

  // 24. Offline_Sync_Audit
  await db.collection('Offline_Sync_Audit').doc('sync_001').set({
    sync_id: 'sync_001',
    user_id: 'usr_coach_001',
    client_version: '1.0.0',
    records_synced: 1,
    synced_at: now,
  });
  console.log(' ✅ Seeded: Offline_Sync_Audit');

  // 25. Inquiries
  await db.collection('Inquiries').doc('inq_001').set({
    inquiry_id: 'inq_001',
    coach_id: 'coach_001',
    athlete_id: 'ath_001',
    status: 'pending',
    message: 'Inquiry regarding varsity recruitment trial.',
    created_at: now,
    updated_at: now,
  });
  console.log(' ✅ Seeded: Inquiries');

  console.log('\n🎉 ALL 25 FIRESTORE COLLECTIONS HAVE BEEN SEEDED WITH 1 CLEAN RECORD EACH!');
}

seedCollections()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Error seeding collections:', err);
    process.exit(1);
  });
