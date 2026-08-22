import { db } from '../utils/firebaseAdmin';

async function seedAllCollections() {
  console.log('🌱 Starting comprehensive seeding for all Firestore tables/collections...\n');

  const batch = db.batch();
  const nowIso = new Date().toISOString();

  // 1. Users
  const users = [
    {
      user_id: 'usr_admin_001',
      first_name: 'System',
      last_name: 'Admin',
      full_name: 'System Administrator',
      email: 'admin@atleta.edu',
      role: 'SystemAdmin',
      account_status: 'Active',
      contact_number: '+639170000001',
      created_at: new Date(),
      updated_at: new Date(),
    },
    {
      user_id: 'usr_coach_001',
      first_name: 'Nash',
      last_name: 'Racela',
      full_name: 'Coach Nash Racela',
      email: 'coach.reyes@adnu.edu.ph',
      role: 'Coach',
      account_status: 'Active',
      contact_number: '+639170000002',
      sport_type: 'Basketball',
      years_of_experience: 15,
      current_institution: 'Ateneo de Naga University',
      quote: 'Hard work beats talent when talent fails to work hard.',
      professional_documents: ['https://storage.googleapis.com/atleta/coach_license_sbp.pdf'],
      created_at: new Date(),
      updated_at: new Date(),
    },
    {
      user_id: 'usr_athlete_001',
      first_name: 'Juan',
      last_name: 'Dela Cruz',
      full_name: 'Juan Dela Cruz',
      email: 'athlete.cruz@adnu.edu.ph',
      role: 'Athlete',
      account_status: 'Active',
      contact_number: '+639170000003',
      sport_type: 'Basketball',
      created_at: new Date(),
      updated_at: new Date(),
    },
    {
      user_id: 'usr_official_001',
      first_name: 'Marco',
      last_name: 'Santos',
      full_name: 'Official Marco Santos',
      email: 'official.santos@bucal.org',
      role: 'Official',
      account_status: 'Active',
      contact_number: '+639170000004',
      organization_name: 'BUCAL',
      created_at: new Date(),
      updated_at: new Date(),
    },
  ];

  for (const u of users) {
    batch.set(db.collection('Users').doc(u.user_id), u, { merge: true });
  }

  // 2. Admin_Profiles
  const adminProfile = {
    admin_id: 'usr_admin_001',
    user_id: 'usr_admin_001',
    clearance_level: 10,
    department_code: 'SYS_OPS',
    is_active: true,
    created_at: nowIso,
    updated_at: nowIso,
  };
  batch.set(db.collection('Admin_Profiles').doc('usr_admin_001'), adminProfile, { merge: true });

  // 3. Coach_Profiles (Stored under both canonical coach_<uid> and raw uid)
  const coachProfile = {
    coach_id: 'coach_usr_coach_001',
    user_id: 'usr_coach_001',
    first_name: 'Nash',
    last_name: 'Racela',
    full_name: 'Coach Nash Racela',
    email: 'coach.reyes@adnu.edu.ph',
    years_of_experience: 15,
    current_institution: 'Ateneo de Naga University',
    quote: 'Hard work beats talent when talent fails to work hard.',
    specialties: ['Offensive Schemes', 'Player Development', 'Fastbreak Transitions'],
    sport_type: 'Basketball',
    team_id: 'team_adnu_knights',
    teams_managed: ['team_adnu_knights'],
    professional_documents: ['https://storage.googleapis.com/atleta/coach_license_sbp.pdf'],
    account_status: 'Active',
    created_at: new Date(),
    updated_at: new Date(),
  };
  batch.set(db.collection('Coach_Profiles').doc('coach_usr_coach_001'), coachProfile, { merge: true });
  batch.set(db.collection('Coach_Profiles').doc('usr_coach_001'), coachProfile, { merge: true });

  // 4. Coach_Settings
  const coachSettings = {
    setting_id: 'setting_usr_coach_001',
    coach_id: 'coach_usr_coach_001',
    data_sync_preference: 'Manual',
    notification_preferences: {
      game_log_updates: true,
      recruitment_inquiries: true,
    },
    updated_at: nowIso,
  };
  batch.set(db.collection('Coach_Settings').doc('coach_usr_coach_001'), coachSettings, { merge: true });
  batch.set(db.collection('Coach_Settings').doc('usr_coach_001'), coachSettings, { merge: true });

  // 5. Athlete_Profiles
  const athleteProfile = {
    athlete_id: 'ath_usr_athlete_001',
    user_id: 'usr_athlete_001',
    first_name: 'Juan',
    last_name: 'Dela Cruz',
    full_name: 'Juan Dela Cruz',
    birthdate: '2004-05-15',
    gender: 'Male',
    position: 'Point Guard',
    jersey_number: 7,
    province: 'Camarines Sur',
    location: 'Naga City, Camarines Sur',
    sport_type: 'Basketball',
    recruitment_status: 'Available',
    rank: 1,
    physical_profile: {
      height_cm: 188,
      weight_kg: 82,
      wingspan_cm: 195,
      vertical_cm: 85,
    },
    computed_metrics: {
      bmi: 23.2,
      ape_index: 1.04,
    },
    eligibility_documents: {
      psa_verified: true,
      academic_check: true,
      proof_of_residency: true,
      document_urls: ['https://storage.googleapis.com/atleta/psa_doc.pdf'],
    },
    achievements: [
      {
        id: 'ach_001',
        title: 'Regional Finals MVP',
        year: '2025',
        content: 'Led ADNU Knights to championship victory.',
      },
    ],
    created_at: new Date(),
    updated_at: new Date(),
  };
  batch.set(db.collection('Athlete_Profiles').doc('ath_usr_athlete_001'), athleteProfile, { merge: true });
  batch.set(db.collection('Athlete_Profiles').doc('usr_athlete_001'), athleteProfile, { merge: true });

  // 6. Anthropometric_Measurements
  const anthropometricData = {
    measurement_id: 'anthro_usr_athlete_001',
    athlete_id: 'ath_usr_athlete_001',
    user_id: 'usr_athlete_001',
    height_cm: 188,
    weight_kg: 82,
    wingspan_cm: 195,
    vertical_jump_cm: 85,
    bmi: 23.2,
    ape_index: 1.04,
    measured_at: nowIso,
    recorded_by: 'coach_usr_coach_001',
  };
  batch.set(db.collection('Anthropometric_Measurements').doc('anthro_usr_athlete_001'), anthropometricData, { merge: true });

  // 7. Official_Profiles
  const officialProfile = {
    official_id: 'off_usr_official_001',
    user_id: 'usr_official_001',
    full_name: 'Official Marco Santos',
    organization_name: 'BUCAL',
    official_license_number: 'BUCAL-REF-2026-001',
    assigned_tournaments: ['BUCAL S5 2026', 'PRISAA Regionals 2026'],
    certification_status: 'Verified',
    is_active: true,
    created_at: new Date(),
    updated_at: new Date(),
  };
  batch.set(db.collection('Official_Profiles').doc('off_usr_official_001'), officialProfile, { merge: true });
  batch.set(db.collection('Official_Profiles').doc('usr_official_001'), officialProfile, { merge: true });

  // 8. Official_Settings
  const officialSettings = {
    setting_id: 'setting_usr_official_001',
    official_id: 'off_usr_official_001',
    split_screen_defaults: true,
    discrepancy_presets: true,
    match_reminders: true,
    updated_at: nowIso,
  };
  batch.set(db.collection('Official_Settings').doc('off_usr_official_001'), officialSettings, { merge: true });
  batch.set(db.collection('Official_Settings').doc('usr_official_001'), officialSettings, { merge: true });

  // 9. Official_Audits & Official_Validations
  const officialAudit = {
    validation_id: 'val_match_demo_001',
    audit_id: 'val_match_demo_001',
    match_id: 'match_demo_001',
    official_id: 'off_usr_official_001',
    requested_by_coach_id: 'coach_usr_coach_001',
    requested_by: 'coach_usr_coach_001',
    status: 'Approved',
    verification_status: 'Approved',
    scoresheet_url: 'https://storage.googleapis.com/atleta/scoresheets/match_demo_001.pdf',
    context_notes: 'Official scoresheet verified and validated by referee.',
    certified_at: nowIso,
    requested_at: nowIso,
    created_at: nowIso,
  };
  batch.set(db.collection('Official_Audits').doc('val_match_demo_001'), officialAudit, { merge: true });
  batch.set(db.collection('Official_Validations').doc('val_match_demo_001'), officialAudit, { merge: true });

  // 10. Official_Notifications
  const officialNotification = {
    notification_id: 'off_notif_demo_001',
    official_id: 'off_usr_official_001',
    type: 'SCHEDULE_UPDATE',
    title: 'New Tournament Match Assignment',
    message: 'You have been assigned as Lead Referee for BUCAL Finals at Ateneo Gym.',
    reference_id: 'sched_demo_001',
    is_read: false,
    created_at: nowIso,
  };
  batch.set(db.collection('Official_Notifications').doc('off_notif_demo_001'), officialNotification, { merge: true });

  // 11. Official_Schedules
  const officialSchedule = {
    schedule_id: 'sched_demo_001',
    match_id: 'match_demo_001',
    official_id: 'off_usr_official_001',
    venue: 'Ateneo University Gym - Main Court',
    court_number: 'Court 1',
    scheduled_time: '2026-08-25T14:00:00.000Z',
    month: 8,
    year: 2026,
    assigned_officials: ['off_usr_official_001'],
    venue_logistics: 'Main digital scoreboard and scoresheet tablet equipped',
  };
  batch.set(db.collection('Official_Schedules').doc('sched_demo_001'), officialSchedule, { merge: true });

  // 12. Tournament_Registry
  const orgs = [
    {
      org_id: 'org_bucal',
      organization_name: 'BUCAL',
      full_name: 'Bicol University Inter-Collegiate Athletic League (BUCAL)',
      region: 'Region V - Bicol',
      status: 'Active',
      created_at: new Date(),
    },
    {
      org_id: 'org_sbp_bicol',
      organization_name: 'Samahang Basketbol ng Pilipinas (SBP)',
      region: 'Region V - Bicol',
      status: 'Active',
      created_at: new Date(),
    },
    {
      org_id: 'org_prisaa_bicol',
      organization_name: 'Private Schools Athletic Association (PRISAA)',
      region: 'Region V - Bicol',
      status: 'Active',
      created_at: new Date(),
    },
  ];
  for (const o of orgs) {
    batch.set(db.collection('Tournament_Registry').doc(o.org_id), o, { merge: true });
  }

  // 13. Sports_Configurations
  const sports = [
    {
      sport_id: 'sport_basketball',
      sport_name: 'Basketball',
      short_identifier: 'BASKETBALL',
      is_active: true,
      category: 'Team',
      measurement_type: 'Points',
      configurable_stats: [
        { stat_name_key: 'points', measurement_category: 'Count', label: 'Points' },
        { stat_name_key: 'assists', measurement_category: 'Count', label: 'Assists' },
        { stat_name_key: 'rebounds', measurement_category: 'Count', label: 'Rebounds' },
        { stat_name_key: 'steals', measurement_category: 'Count', label: 'Steals' },
        { stat_name_key: 'blocks', measurement_category: 'Count', label: 'Blocks' },
        { stat_name_key: 'turnovers', measurement_category: 'Count', label: 'Turnovers' },
        { stat_name_key: 'fouls', measurement_category: 'Count', label: 'Personal Fouls' },
      ],
      created_at: nowIso,
      updated_at: nowIso,
    },
    {
      sport_id: 'sport_swimming',
      sport_name: 'Swimming',
      short_identifier: 'SWIMMING',
      is_active: true,
      category: 'Individual',
      measurement_type: 'Time',
      configurable_stats: [
        { stat_name_key: 'finish_time_ms', measurement_category: 'Time (ms)', label: 'Finish Time (ms)' },
        { stat_name_key: 'reaction_time_ms', measurement_category: 'Time (ms)', label: 'Reaction Time (ms)' },
      ],
      created_at: nowIso,
      updated_at: nowIso,
    },
    {
      sport_id: 'sport_volleyball',
      sport_name: 'Volleyball',
      short_identifier: 'VOLLEYBALL',
      is_active: true,
      category: 'Team',
      measurement_type: 'Points',
      configurable_stats: [
        { stat_name_key: 'spike_kills', measurement_category: 'Count', label: 'Spike Kills' },
        { stat_name_key: 'block_points', measurement_category: 'Count', label: 'Block Points' },
        { stat_name_key: 'service_aces', measurement_category: 'Count', label: 'Service Aces' },
        { stat_name_key: 'digs', measurement_category: 'Count', label: 'Digs' },
      ],
      created_at: nowIso,
      updated_at: nowIso,
    },
  ];
  for (const s of sports) {
    batch.set(db.collection('Sports_Configurations').doc(s.sport_id), s, { merge: true });
  }

  // 14. Teams
  const team = {
    team_id: 'team_adnu_knights',
    team_name: 'ADNU Golden Knights',
    sport_type: 'Basketball',
    division: 'College Varsity',
    region: 'Region V - Bicol',
    established_year: 2020,
    season_record: { wins: 12, losses: 2 },
    coach_id: 'coach_usr_coach_001',
    roster_list: [
      {
        athlete_id: 'ath_usr_athlete_001',
        user_id: 'usr_athlete_001',
        first_name: 'Juan',
        last_name: 'Dela Cruz',
        position: 'Point Guard',
        jersey_number: 7,
        added_at: nowIso,
        eligibility_documents: ['https://storage.googleapis.com/atleta/psa_doc.pdf'],
        is_eligibility_verified: true,
      },
    ],
    timestamp: nowIso,
  };
  batch.set(db.collection('Teams').doc('team_adnu_knights'), team, { merge: true });

  // 15. Match_Logs
  const matchLog = {
    match_id: 'match_demo_001',
    team_id: 'team_adnu_knights',
    logged_by_coach_id: 'coach_usr_coach_001',
    sport_type: 'Basketball',
    match_type: 'Tournament',
    match_date: '2026-08-19T14:00:00.000Z',
    location: 'Ateneo University Gym',
    opponent_team_name: 'UNC Red Guzzlers',
    game_result: 'WIN',
    roster_athletes: ['ath_usr_athlete_001'],
    notes: 'Season opening tournament win 88-82.',
    scoresheet_url: 'https://storage.googleapis.com/atleta/scoresheets/match_demo_001.pdf',
    is_certified: true,
    is_locked: true,
    timestamp: nowIso,
  };
  batch.set(db.collection('Match_Logs').doc('match_demo_001'), matchLog, { merge: true });

  // 16. Performance_Metrics
  const performanceMetric = {
    metric_id: 'metric_demo_001_ath_usr_athlete_001',
    athlete_id: 'ath_usr_athlete_001',
    match_id: 'match_demo_001',
    sport_category: 'Basketball',
    logged_by_coach_id: 'coach_usr_coach_001',
    calculated_player_efficiency: 28.5,
    sport_stats: {
      points: 24,
      assists: 9,
      offensive_rebounds: 2,
      defensive_rebounds: 5,
      rebounds: 7,
      steals: 3,
      blocks: 1,
      turnovers: 2,
      fouls: 1,
      fg_made: 9,
      fg_attempted: 15,
      ft_made: 4,
      ft_attempted: 5,
    },
    timestamp: nowIso,
  };
  batch.set(
    db.collection('Performance_Metrics').doc('metric_demo_001_ath_usr_athlete_001'),
    performanceMetric,
    { merge: true }
  );

  // 17. Workload_Analysis
  const workloadEntry = {
    workload_id: 'wl_demo_001',
    athlete_id: 'ath_usr_athlete_001',
    session_duration_mins: 90,
    srpe_score: 7,
    daily_load: 630,
    entry_date: '2026-08-19',
    logged_by_coach_id: 'coach_usr_coach_001',
    logged_by_name: 'Coach Nash Racela',
    session_type: 'Game',
    notes: 'High intensity tournament match against UNC.',
    created_at: nowIso,
  };
  batch.set(db.collection('Workload_Analysis').doc('wl_demo_001'), workloadEntry, { merge: true });

  // 18. Notifications
  const notification = {
    notification_id: 'notif_demo_001',
    recipient_id: 'usr_athlete_001',
    sender_id: 'usr_coach_001',
    type: 'RECRUITMENT_INQUIRY',
    title: 'Invitation to Varsity Training Camp',
    message: 'Coach Nash Racela invited you to the ADNU Golden Knights training camp.',
    is_read: false,
    action_url: '/api/v1/inquiries/scout_demo_001',
    created_at: nowIso,
  };
  batch.set(db.collection('Notifications').doc('notif_demo_001'), notification, { merge: true });

  // 19. Scouting_Registry
  const scoutingProposal = {
    scout_id: 'scout_demo_001',
    athlete_id: 'ath_usr_athlete_001',
    coach_scout_id: 'coach_usr_coach_001',
    initiated_by: 'coach_usr_coach_001',
    offer_status: 'Sent',
    offer_message: 'Official athletic scholarship offer for the upcoming collegiate season.',
    date_initiated: nowIso,
    updated_at: nowIso,
  };
  batch.set(db.collection('Scouting_Registry').doc('scout_demo_001'), scoutingProposal, { merge: true });

  // 20. Offline_Sync_Audit
  const offlineSyncAudit = {
    transaction_id: 'sync_demo_001',
    device_id: 'device_tablet_coach_01',
    client_tx_id: 'ctx_demo_001',
    entity_type: 'MatchLog',
    action: 'CREATE',
    status: 'SUCCESS',
    details: {
      match_id: 'match_demo_001',
      team_id: 'team_adnu_knights',
      timestamp: nowIso,
    },
    timestamp: nowIso,
  };
  batch.set(db.collection('Offline_Sync_Audit').doc('tx_sync_demo_001'), offlineSyncAudit, { merge: true });

  // 21. Admin_Audit_Logs
  const adminAuditLog = {
    log_id: 'audit_demo_001',
    user_id: 'usr_admin_001',
    email: 'admin@atleta.edu',
    action: 'POST /api/v1/sports',
    status: 'SUCCESS',
    endpoint: '/api/v1/sports',
    ip_address: '127.0.0.1',
    timestamp: nowIso,
    details: {
      description: 'System seed initialization and configurations verified.',
    },
  };
  batch.set(db.collection('Admin_Audit_Logs').doc('audit_demo_001'), adminAuditLog, { merge: true });

  // 22. Idempotency_Keys
  const idempotencyKeyDoc = {
    key: 'idemp_demo_seed_001',
    response: {
      status_code: 200,
      message: 'Demo seed operation cached successfully.',
    },
    created_at: nowIso,
  };
  batch.set(db.collection('Idempotency_Keys').doc('idemp_demo_seed_001'), idempotencyKeyDoc, { merge: true });

  // Commit all
  await batch.commit();
  console.log('✅ Successfully seeded data for all 22 Firestore collections!');
}

seedAllCollections()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('❌ Seeding error:', err);
    process.exit(1);
  });
