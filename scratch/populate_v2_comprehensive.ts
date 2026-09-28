import admin from 'firebase-admin';
import path from 'path';

const serviceAccount = require(path.resolve(__dirname, '../serviceAccountKey.v2.json'));

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
}

const db = admin.firestore();

async function populateV2() {
  console.log('🚀 Starting comprehensive data population for atleta-v2...\n');
  const now = new Date().toISOString();
  const nowDate = new Date();

  // 1. ALL USERS
  const usersList = [
    {
      uid: 'zEJ0q30C0OPZJsk6wyBMLqAasWB2',
      email: 'harold@gmail.com',
      password: 'Astig.123!',
      first_name: 'Harold',
      last_name: 'Delos Santos',
      full_name: 'Harold Delos Santos',
      role: 'Athlete',
      account_status: 'Active',
      contact_number: '09171234567',
      sport_type: 'Basketball',
    },
    {
      uid: 'v5XWfDqgsYTFPx7xEWnBsssNcH83',
      email: 'gerardpelonio30@gmail.com',
      password: 'Astig.123!',
      first_name: 'Gerard Francis',
      last_name: 'Pelonio',
      full_name: 'Gerard Francis Pelonio',
      role: 'Coach',
      account_status: 'Active',
      contact_number: '09179876543',
      sport_type: 'Basketball',
      current_institution: 'Ateneo de Naga University',
      years_of_experience: 10,
    },
    {
      uid: 'usr_coach_001',
      email: 'coach@gmail.com',
      password: 'Password123!',
      first_name: 'Erick Nathaniel',
      last_name: 'De Belen',
      full_name: 'Erick Nathaniel De Belen',
      role: 'Coach',
      account_status: 'Active',
      contact_number: '09123456789',
      sport_type: 'Basketball',
      current_institution: 'University Athletics',
      years_of_experience: 8,
    },
    {
      uid: 'usr_athlete_001',
      email: 'athlete@gmail.com',
      password: 'Password123!',
      first_name: 'Gerard',
      last_name: 'Pelonio',
      full_name: 'Gerard Pelonio',
      role: 'Athlete',
      account_status: 'Active',
      contact_number: '09123456780',
      sport_type: 'Basketball',
    },
    {
      uid: 'lzBu5Q44oLYXTrsUnOsVZrfK5at2',
      email: 'admin@gmail.com',
      password: 'Admin@123',
      first_name: 'System',
      last_name: 'Administrator',
      full_name: 'System Administrator',
      role: 'SystemAdmin',
      account_status: 'Active',
      contact_number: '09170000001',
    },
    {
      uid: 'fYladJevOqYwPJ5Sh2Qjx5OTAgF3',
      email: 'official1025@gmail.com',
      password: 'Official@123',
      first_name: 'Tournament',
      last_name: 'Official',
      full_name: 'Tournament Official',
      role: 'Official',
      account_status: 'Active',
      contact_number: '09170000004',
      organization_name: 'BUCAL',
    },
    {
      uid: 'usr_admin_001',
      email: 'admin@atleta.ph',
      password: 'Admin@123',
      first_name: 'Atleta',
      last_name: 'Administrator',
      full_name: 'Atleta Admin',
      role: 'Admin',
      account_status: 'Active',
      contact_number: '09123456781',
    },
    {
      uid: 'usr_official_001',
      email: 'official@atleta.ph',
      password: 'Official@123',
      first_name: 'Official',
      last_name: 'Referee',
      full_name: 'Official Referee',
      role: 'Official',
      account_status: 'Active',
      contact_number: '09123456782',
      organization_name: 'BUCAL',
    },
    {
      uid: '0DSDbtdRqyaIo5zcgv2gVnV3QmJ3',
      email: 'thematrixx30@gmail.com',
      password: 'Astig.123!',
      first_name: 'The',
      last_name: 'Matrix',
      full_name: 'The Matrix',
      role: 'Athlete',
      account_status: 'Active',
      contact_number: '09170000005',
      sport_type: 'Basketball',
    },
    {
      uid: '9dxT01h4yDfuuPZhltYg3GS7ID92',
      email: 'darren@gmail.com',
      password: 'Astig.123!',
      first_name: 'Darren',
      last_name: 'Solano',
      full_name: 'Darren Solano',
      role: 'Athlete',
      account_status: 'Active',
      contact_number: '09170000006',
      sport_type: 'Basketball',
    },
    {
      uid: 'eYU3PaKhKQQAwYI7ILyFRXmy0Ik1',
      email: 'erick@gmail.com',
      password: 'Astig.123!',
      first_name: 'Erick',
      last_name: 'De Belen',
      full_name: 'Erick De Belen',
      role: 'Athlete',
      account_status: 'Active',
      contact_number: '09170000007',
      sport_type: 'Basketball',
    },
    {
      uid: 'ZxUpwXo27qdabUgTnpa6VeHTAgK2',
      email: 'jl@gmail.com',
      password: 'Password@123',
      first_name: 'Jay',
      last_name: 'Lawrence',
      full_name: 'Jay Lawrence',
      role: 'Athlete',
      account_status: 'Active',
      contact_number: '09170000008',
      sport_type: 'Basketball',
    },
    {
      uid: '3WfIW5yw1YSKHKjJKkOttc2kHcY2',
      email: 'athlete_qa_test@example.com',
      password: 'Password123!',
      first_name: 'Marcus',
      last_name: 'Rivera',
      full_name: 'Marcus Rivera',
      role: 'Athlete',
      account_status: 'Active',
      contact_number: '09170000009',
      sport_type: 'Basketball',
    },
    {
      uid: '48eGGRBrvKcg5A4pkhnpOHbh9sD3',
      email: 'athlete.track@atleta.com',
      password: 'Password123!',
      first_name: 'Usain',
      last_name: 'Santos',
      full_name: 'Usain Santos',
      role: 'Athlete',
      account_status: 'Active',
      contact_number: '09170000010',
      sport_type: 'Track & Field',
    },
    {
      uid: 'Iovii52rxDgziw16flGRd3sdL0u1',
      email: 'athlete.swimming@atleta.com',
      password: 'Password123!',
      first_name: 'Michael',
      last_name: 'Phelps',
      full_name: 'Michael Phelps',
      role: 'Athlete',
      account_status: 'Active',
      contact_number: '09170000011',
      sport_type: 'Swimming',
    },
    {
      uid: 'gxIIbg0sdwa16ayipylDVETZppy1',
      email: 'athlete.basketball@atleta.com',
      password: 'Password123!',
      first_name: 'Jordan',
      last_name: 'Clarkson',
      full_name: 'Jordan Clarkson',
      role: 'Athlete',
      account_status: 'Active',
      contact_number: '09170000012',
      sport_type: 'Basketball',
    },
    {
      uid: 't358EW07qTaKPJLiFHNSClaLqXJ3',
      email: 'coach.basketball@atleta.com',
      password: 'Password123!',
      first_name: 'Ken',
      last_name: 'Carter',
      full_name: 'Coach Carter',
      role: 'Coach',
      account_status: 'Active',
      contact_number: '09170000013',
      sport_type: 'Basketball',
      current_institution: 'Richmond High',
      years_of_experience: 12,
    },
    {
      uid: 'qpigTEbHGIYnxNYxZZILokpLTFr2',
      email: 'testathlete_12345@gmail.com',
      password: 'Password123!',
      first_name: 'Test',
      last_name: 'Athlete',
      full_name: 'Test Athlete',
      role: 'Athlete',
      account_status: 'Active',
      contact_number: '09170000014',
      sport_type: 'Basketball',
    },
    {
      uid: 'demo_coach_01',
      email: 'coach@atleta.ph',
      password: 'Password123!',
      first_name: 'Marcus',
      last_name: 'Vance',
      full_name: 'Coach Marcus Vance',
      role: 'Coach',
      account_status: 'Active',
      contact_number: '09170000015',
      sport_type: 'Basketball',
      current_institution: 'Green Archers Athletic Club',
      years_of_experience: 10,
    },
    {
      uid: 'demo_official_01',
      email: 'official@atleta.ph',
      password: 'Official@123',
      first_name: 'Gerard',
      last_name: 'Pelonio',
      full_name: 'Gerard Pelonio',
      role: 'Official',
      account_status: 'Active',
      contact_number: '09170000016',
      organization_name: 'BUCAL',
    },
  ];

  console.log(`Writing ${usersList.length} users to Users collection...`);
  const batch1 = db.batch();
  for (const u of usersList) {
    const userDoc = {
      user_id: u.uid,
      first_name: u.first_name,
      last_name: u.last_name,
      full_name: u.full_name,
      email: u.email,
      password: u.password,
      role: u.role,
      account_status: u.account_status,
      contact_number: u.contact_number,
      sport_type: u.sport_type || 'Basketball',
      created_at: now,
      updated_at: now,
      is_active: true,
    };
    batch1.set(db.collection('Users').doc(u.uid), userDoc, { merge: true });
  }
  await batch1.commit();
  console.log('✅ Users collection populated.');

  // 2. ATHLETE PROFILES
  console.log('Writing Athlete Profiles...');
  const athletes = usersList.filter(u => u.role === 'Athlete');
  const batch2 = db.batch();

  for (const ath of athletes) {
    const athleteProfile = {
      athlete_id: `ath_${ath.uid}`,
      user_id: ath.uid,
      first_name: ath.first_name,
      last_name: ath.last_name,
      full_name: ath.full_name,
      email: ath.email,
      sport_type: ath.sport_type || 'Basketball',
      gender: 'Male',
      birthdate: '2003-05-15',
      date_of_birth: '2003-05-15',
      province: 'Camarines Sur',
      location: 'Naga City, Camarines Sur',
      position: ath.sport_type === 'Basketball' ? 'Point Guard' : 'Sprinter',
      jersey_number: 7,
      recruitment_status: 'Available',
      rank: 1,
      team_id: 'TEAM-001',
      team_name: 'Atleta Elite Falcons',
      height_cm: 185,
      weight_kg: 78,
      wingspan_cm: 190,
      physical_profile: {
        height_cm: 185,
        weight_kg: 78,
        wingspan_cm: 190,
        vertical_cm: 85,
      },
      computed_metrics: {
        bmi: 22.8,
        ape_index: 1.03,
      },
      eligibility_documents: {
        psa_verified: true,
        academic_check: true,
        proof_of_residency: true,
        document_urls: ['PSA_Verified.pdf'],
      },
      achievements: [
        {
          id: 'ach_1',
          title: 'Regional Championship MVP',
          year: '2025',
          content: 'Led team to victory with 24 PPG.',
        },
      ],
      stats: {
        points_per_game: 18.5,
        rebounds_per_game: 6.2,
        assists_per_game: 5.4,
        games_played: 12,
      },
      created_at: now,
      updated_at: now,
    };

    // Save with ath_<uid> and raw <uid>
    batch2.set(db.collection('Athlete_Profiles').doc(`ath_${ath.uid}`), athleteProfile, { merge: true });
    batch2.set(db.collection('Athlete_Profiles').doc(ath.uid), athleteProfile, { merge: true });
  }

  // Also seed ATH-001
  const ath001 = {
    athlete_id: 'ATH-001',
    user_id: 'usr_athlete_001',
    first_name: 'Gerard',
    last_name: 'Pelonio',
    full_name: 'Gerard Pelonio',
    email: 'athlete@gmail.com',
    sport_type: 'Basketball',
    gender: 'Male',
    birthdate: '2002-05-15',
    province: 'Manila',
    team_id: 'TEAM-001',
    team_name: 'Atleta Elite Falcons',
    height_cm: 185,
    weight_kg: 78,
    wingspan_cm: 190,
    stats: {
      points_per_game: 22.0,
      assists_per_game: 7.5,
      rebounds_per_game: 5.0,
      games_played: 14,
    },
    created_at: now,
    updated_at: now,
  };
  batch2.set(db.collection('Athlete_Profiles').doc('ATH-001'), ath001, { merge: true });
  batch2.set(db.collection('Athlete_Profiles').doc('ath_001'), ath001, { merge: true });

  await batch2.commit();
  console.log('✅ Athlete_Profiles collection populated.');

  // 3. COACH PROFILES & SETTINGS
  console.log('Writing Coach Profiles and Settings...');
  const coaches = usersList.filter(u => u.role === 'Coach');
  const batch3 = db.batch();

  for (const c of coaches) {
    const coachProfile = {
      coach_id: `coach_${c.uid}`,
      user_id: c.uid,
      first_name: c.first_name,
      last_name: c.last_name,
      full_name: c.full_name,
      email: c.email,
      sport_type: c.sport_type || 'Basketball',
      current_institution: c.current_institution || 'Ateneo de Naga University',
      years_of_experience: c.years_of_experience || 10,
      quote: 'Hard work beats talent when talent fails to work hard.',
      specialties: ['Offensive Schemes', 'Player Development', 'Fastbreak Transitions'],
      team_id: 'TEAM-001',
      teams_managed: ['TEAM-001', 'team_001', 'team_adnu_knights'],
      professional_documents: ['https://storage.googleapis.com/atleta/coach_license_sbp.pdf'],
      account_status: 'Active',
      is_active: true,
      created_at: now,
      updated_at: now,
    };

    batch3.set(db.collection('Coach_Profiles').doc(`coach_${c.uid}`), coachProfile, { merge: true });
    batch3.set(db.collection('Coach_Profiles').doc(c.uid), coachProfile, { merge: true });

    const coachSettings = {
      setting_id: `setting_${c.uid}`,
      coach_id: `coach_${c.uid}`,
      user_id: c.uid,
      data_sync_preference: 'Automatic',
      notification_preferences: {
        game_log_updates: true,
        recruitment_inquiries: true,
      },
      game_log_updates: true,
      recruitment_inquiries: true,
      email_alerts: true,
      updated_at: now,
    };

    batch3.set(db.collection('Coach_Settings').doc(`coach_${c.uid}`), coachSettings, { merge: true });
    batch3.set(db.collection('Coach_Settings').doc(c.uid), coachSettings, { merge: true });
  }

  // Also alias coach_001
  batch3.set(db.collection('Coach_Profiles').doc('coach_001'), {
    coach_id: 'coach_001',
    user_id: 'usr_coach_001',
    first_name: 'Erick Nathaniel',
    last_name: 'De Belen',
    full_name: 'Erick Nathaniel De Belen',
    email: 'coach@gmail.com',
    sport_type: 'Basketball',
    team_id: 'TEAM-001',
    is_active: true,
    created_at: now,
    updated_at: now,
  }, { merge: true });

  await batch3.commit();
  console.log('✅ Coach_Profiles & Coach_Settings collections populated.');

  // 4. OFFICIAL PROFILES & SETTINGS
  console.log('Writing Official Profiles and Settings...');
  const officials = usersList.filter(u => u.role === 'Official');
  const batch4 = db.batch();

  for (const off of officials) {
    const officialProfile = {
      official_id: `off_${off.uid}`,
      user_id: off.uid,
      first_name: off.first_name,
      last_name: off.last_name,
      full_name: off.full_name,
      email: off.email,
      organization_name: off.organization_name || 'BUCAL',
      official_license_number: 'OFF-LIC-2026',
      certification_status: 'Certified',
      sport_accreditation: ['Basketball', 'Volleyball', 'Swimming', 'Track & Field', 'Pickleball'],
      assigned_tournaments: ['National Collegiate Athletics Championship 2026', 'BUCAL S5 2026'],
      is_active: true,
      created_at: now,
      updated_at: now,
    };

    batch4.set(db.collection('Official_Profiles').doc(`off_${off.uid}`), officialProfile, { merge: true });
    batch4.set(db.collection('Official_Profiles').doc(off.uid), officialProfile, { merge: true });

    const officialSettings = {
      setting_id: `setting_${off.uid}`,
      official_id: `off_${off.uid}`,
      user_id: off.uid,
      match_reminders: true,
      discrepancy_presets: true,
      split_screen_defaults: true,
      notifications_enabled: true,
      auto_sync: true,
      updated_at: now,
    };

    batch4.set(db.collection('Official_Settings').doc(`off_${off.uid}`), officialSettings, { merge: true });
    batch4.set(db.collection('Official_Settings').doc(off.uid), officialSettings, { merge: true });
  }

  // Alias off_001
  batch4.set(db.collection('Official_Profiles').doc('off_001'), {
    official_id: 'off_001',
    user_id: 'usr_official_001',
    full_name: 'Official Referee',
    email: 'official@atleta.ph',
    organization_name: 'BUCAL',
    is_active: true,
    created_at: now,
  }, { merge: true });

  await batch4.commit();
  console.log('✅ Official_Profiles & Official_Settings collections populated.');

  // 5. ADMIN PROFILES
  console.log('Writing Admin Profiles...');
  const admins = usersList.filter(u => u.role === 'Admin' || u.role === 'SystemAdmin');
  const batch5 = db.batch();

  for (const adm of admins) {
    const adminProfile = {
      admin_id: adm.uid,
      user_id: adm.uid,
      full_name: adm.full_name,
      email: adm.email,
      clearance_level: 10,
      department_code: 'SYS_ADMIN',
      permissions: ['all'],
      is_active: true,
      created_at: now,
      updated_at: now,
    };
    batch5.set(db.collection('Admin_Profiles').doc(adm.uid), adminProfile, { merge: true });
  }
  batch5.set(db.collection('Admin_Profiles').doc('admin_001'), {
    admin_id: 'admin_001',
    user_id: 'usr_admin_001',
    full_name: 'Atleta Admin',
    email: 'admin@atleta.ph',
    permissions: ['all'],
    created_at: now,
  }, { merge: true });

  await batch5.commit();
  console.log('✅ Admin_Profiles collection populated.');

  // 6. SPORTS CONFIGURATIONS
  console.log('Writing Sports Configurations...');
  const sports = [
    {
      sport_id: 'sport_basketball_default',
      canonical_id: 'sport_basketball',
      sport_name: 'Basketball',
      short_identifier: 'BASKETBALL',
      category: 'Team',
      measurement_type: 'Points',
      is_timed_sport: false,
      is_active: true,
      configurable_stats: [
        { stat_name_key: 'points', label: 'Points', measurement_category: 'Count' },
        { stat_name_key: 'assists', label: 'Assists', measurement_category: 'Count' },
        { stat_name_key: 'rebounds', label: 'Rebounds', measurement_category: 'Count' },
        { stat_name_key: 'steals', label: 'Steals', measurement_category: 'Count' },
        { stat_name_key: 'blocks', label: 'Blocks', measurement_category: 'Count' },
        { stat_name_key: 'turnovers', label: 'Turnovers', measurement_category: 'Count' },
        { stat_name_key: 'fouls', label: 'Personal Fouls', measurement_category: 'Count' },
      ],
      created_at: now,
      updated_at: now,
    },
    {
      sport_id: 'sport_swimming_default',
      canonical_id: 'sport_swimming',
      sport_name: 'Swimming',
      short_identifier: 'SWIMMING',
      category: 'Individual',
      measurement_type: 'Time',
      is_timed_sport: true,
      is_active: true,
      configurable_stats: [
        { stat_name_key: 'finish_time_ms', label: 'Finish Time (ms)', measurement_category: 'Time (ms)' },
        { stat_name_key: 'reaction_time_ms', label: 'Reaction Time (ms)', measurement_category: 'Time (ms)' },
        { stat_name_key: 'split_times', label: 'Split Times', measurement_category: 'Array' },
      ],
      created_at: now,
      updated_at: now,
    },
    {
      sport_id: 'sport_track_field_default',
      canonical_id: 'sport_track_field',
      sport_name: 'Track & Field',
      short_identifier: 'TF',
      category: 'Individual',
      measurement_type: 'Time',
      is_timed_sport: true,
      is_active: true,
      configurable_stats: [
        { stat_name_key: 'finish_time_ms', label: 'Finish Time (ms)', measurement_category: 'Time (ms)' },
        { stat_name_key: 'split_times', label: 'Split Times', measurement_category: 'Array' },
      ],
      created_at: now,
      updated_at: now,
    },
    {
      sport_id: 'sport_volleyball_default',
      canonical_id: 'sport_volleyball',
      sport_name: 'Volleyball',
      short_identifier: 'VOLLEYBALL',
      category: 'Team',
      measurement_type: 'Points',
      is_timed_sport: false,
      is_active: true,
      configurable_stats: [
        { stat_name_key: 'spike_kills', label: 'Spike Kills', measurement_category: 'Count' },
        { stat_name_key: 'block_points', label: 'Block Points', measurement_category: 'Count' },
        { stat_name_key: 'service_aces', label: 'Service Aces', measurement_category: 'Count' },
        { stat_name_key: 'digs', label: 'Digs', measurement_category: 'Count' },
        { stat_name_key: 'attack_errors', label: 'Attack Errors', measurement_category: 'Count' },
      ],
      created_at: now,
      updated_at: now,
    },
    {
      sport_id: 'sport_pickleball_default',
      canonical_id: 'sport_pickleball',
      sport_name: 'Pickleball',
      short_identifier: 'PICKLEBALL',
      category: 'Individual',
      measurement_type: 'Points',
      is_timed_sport: false,
      is_active: true,
      configurable_stats: [
        { stat_name_key: 'points_scored', label: 'Points Scored', measurement_category: 'Count' },
        { stat_name_key: 'aces', label: 'Service Aces', measurement_category: 'Count' },
        { stat_name_key: 'dinks', label: 'Successful Dinks', measurement_category: 'Count' },
      ],
      created_at: now,
      updated_at: now,
    },
  ];

  const batch6 = db.batch();
  for (const s of sports) {
    batch6.set(db.collection('Sports_Configurations').doc(s.sport_id), s, { merge: true });
    batch6.set(db.collection('Sports_Configurations').doc(s.canonical_id), { ...s, sport_id: s.canonical_id }, { merge: true });
  }
  await batch6.commit();
  console.log('✅ Sports_Configurations collection populated.');

  // 7. TEAMS
  console.log('Writing Teams...');
  const teams = [
    {
      team_id: 'TEAM-001',
      team_name: 'Atleta Elite Falcons',
      sport_type: 'Basketball',
      division: 'Varsity Division',
      coach_id: 'coach_v5XWfDqgsYTFPx7xEWnBsssNcH83',
      season_record: { wins: 14, losses: 2 },
      roster_list: [
        {
          athlete_id: 'ATH-001',
          user_id: 'usr_athlete_001',
          full_name: 'Gerard Pelonio',
          sport_type: 'Basketball',
          position: 'Point Guard',
          jersey_number: 7,
          is_eligibility_verified: true,
        },
        {
          athlete_id: 'ath_zEJ0q30C0OPZJsk6wyBMLqAasWB2',
          user_id: 'zEJ0q30C0OPZJsk6wyBMLqAasWB2',
          full_name: 'Harold Delos Santos',
          sport_type: 'Basketball',
          position: 'Shooting Guard',
          jersey_number: 10,
          is_eligibility_verified: true,
        },
        {
          athlete_id: 'ath_9dxT01h4yDfuuPZhltYg3GS7ID92',
          user_id: '9dxT01h4yDfuuPZhltYg3GS7ID92',
          full_name: 'Darren Solano',
          sport_type: 'Basketball',
          position: 'Small Forward',
          jersey_number: 15,
          is_eligibility_verified: true,
        },
      ],
      created_at: now,
      updated_at: now,
    },
    {
      team_id: 'team_001',
      team_name: 'Atleta Elite Falcons',
      sport_type: 'Basketball',
      division: 'Division 1 Elite',
      coach_id: 'coach_usr_coach_001',
      season_record: { wins: 14, losses: 2 },
      roster_list: [
        {
          athlete_id: 'ath_usr_athlete_001',
          user_id: 'usr_athlete_001',
          full_name: 'Gerard Pelonio',
          sport_type: 'Basketball',
          position: 'Point Guard',
          jersey_number: 7,
          is_eligibility_verified: true,
        },
      ],
      created_at: now,
      updated_at: now,
    },
    {
      team_id: 'team_adnu_knights',
      team_name: 'ADNU Golden Knights',
      sport_type: 'Basketball',
      division: 'College Varsity',
      region: 'Region V - Bicol',
      established_year: 2020,
      season_record: { wins: 12, losses: 2 },
      coach_id: 'coach_v5XWfDqgsYTFPx7xEWnBsssNcH83',
      roster_list: [
        {
          athlete_id: 'ath_zEJ0q30C0OPZJsk6wyBMLqAasWB2',
          user_id: 'zEJ0q30C0OPZJsk6wyBMLqAasWB2',
          first_name: 'Harold',
          last_name: 'Delos Santos',
          full_name: 'Harold Delos Santos',
          position: 'Point Guard',
          jersey_number: 7,
          is_eligibility_verified: true,
        },
      ],
      created_at: now,
      updated_at: now,
    },
    {
      team_id: 'team_volleyball_01',
      team_name: 'Bicol Spikers',
      sport_type: 'Volleyball',
      division: 'Varsity Division',
      coach_id: 'coach_v5XWfDqgsYTFPx7xEWnBsssNcH83',
      season_record: { wins: 8, losses: 1 },
      roster_list: [],
      created_at: now,
      updated_at: now,
    },
  ];

  const batch7 = db.batch();
  for (const t of teams) {
    batch7.set(db.collection('Teams').doc(t.team_id), t, { merge: true });
  }
  await batch7.commit();
  console.log('✅ Teams collection populated.');

  // 8. TOURNAMENT REGISTRY
  console.log('Writing Tournament Registry...');
  const orgs = [
    {
      org_id: 'org_atleta_championship',
      organization_name: 'National Collegiate Athletics Championship 2026',
      name: 'National Collegiate Athletics Championship 2026',
      region: 'National',
      status: 'Active',
      registered_by: 'official@atleta.ph',
      created_at: now,
    },
    {
      org_id: 'org_bucal',
      organization_name: 'Bicol University Inter-Collegiate Athletic League (BUCAL)',
      name: 'BUCAL',
      full_name: 'Bicol University Inter-Collegiate Athletic League (BUCAL)',
      region: 'Region V - Bicol',
      status: 'Active',
      registered_by: 'official1025@gmail.com',
      created_at: now,
    },
    {
      org_id: 'org_sbp_bicol',
      organization_name: 'Samahang Basketbol ng Pilipinas (SBP)',
      name: 'Samahang Basketbol ng Pilipinas (SBP)',
      region: 'Region V - Bicol',
      status: 'Active',
      registered_by: 'official@gmail.com',
      created_at: now,
    },
    {
      org_id: 'org_prisaa_bicol',
      organization_name: 'Private Schools Athletic Association (PRISAA)',
      name: 'Private Schools Athletic Association (PRISAA)',
      region: 'Region V - Bicol',
      status: 'Active',
      created_at: now,
    },
    {
      org_id: 'tourn_001',
      tournament_id: 'tourn_001',
      tournament_name: 'National Inter-Collegiate Championship 2026',
      sport_type: 'Basketball',
      season: '2026',
      participating_teams: ['TEAM-001', 'team_001', 'team_adnu_knights'],
      status: 'active',
      created_at: now,
      updated_at: now,
    },
  ];

  const batch8 = db.batch();
  for (const o of orgs) {
    batch8.set(db.collection('Tournament_Registry').doc(o.org_id), o, { merge: true });
  }
  await batch8.commit();
  console.log('✅ Tournament_Registry collection populated.');

  // 9. WORKLOAD ANALYSIS
  console.log('Writing Workload Analysis...');
  const workloads = [
    {
      workload_id: 'wl_001',
      entry_id: 'wl_001',
      athlete_id: 'ath_usr_athlete_001',
      user_id: 'usr_athlete_001',
      target_7day_effort_pts: 450,
      target_intensity: 8,
      calculated_acwr: 1.15,
      current_7day_acute_load: 420,
      current_28day_chronic_load: 380,
      acute_load: 420,
      chronic_load: 380,
      srpe_score: 7,
      session_duration_mins: 90,
      daily_load: 630,
      risk_level: 'Optimal',
      recent_entries: [
        { date: '2026-09-26', session: 'Court Drill & Tactical', duration: 90, rpe: 7, load: 630 },
        { date: '2026-09-25', session: 'Strength & Conditioning', duration: 60, rpe: 6, load: 360 },
        { date: '2026-09-24', session: 'Shooting Practice', duration: 45, rpe: 5, load: 225 },
      ],
      created_at: now,
      updated_at: now,
    },
    {
      workload_id: 'wl_harold_001',
      entry_id: 'wl_harold_001',
      athlete_id: 'ath_zEJ0q30C0OPZJsk6wyBMLqAasWB2',
      user_id: 'zEJ0q30C0OPZJsk6wyBMLqAasWB2',
      target_7day_effort_pts: 480,
      target_intensity: 8,
      calculated_acwr: 1.08,
      current_7day_acute_load: 440,
      current_28day_chronic_load: 410,
      acute_load: 440,
      chronic_load: 410,
      srpe_score: 8,
      session_duration_mins: 100,
      daily_load: 800,
      risk_level: 'Optimal',
      recent_entries: [
        { date: '2026-09-27', session: 'High Intensity Scrimmage', duration: 100, rpe: 8, load: 800 },
        { date: '2026-09-26', session: 'Agility & Speed', duration: 60, rpe: 7, load: 420 },
      ],
      created_at: now,
      updated_at: now,
    },
    {
      workload_id: 'wl_demo_001',
      entry_id: 'wl_demo_001',
      athlete_id: 'ATH-001',
      user_id: 'usr_athlete_001',
      target_7day_effort_pts: 400,
      target_intensity: 7,
      calculated_acwr: 1.05,
      current_7day_acute_load: 400,
      current_28day_chronic_load: 390,
      acute_load: 400,
      chronic_load: 390,
      srpe_score: 7,
      session_duration_mins: 90,
      daily_load: 630,
      risk_level: 'Optimal',
      recent_entries: [],
      created_at: now,
      updated_at: now,
    },
  ];

  const batch9 = db.batch();
  for (const wl of workloads) {
    batch9.set(db.collection('Workload_Analysis').doc(wl.workload_id), wl, { merge: true });
  }
  await batch9.commit();
  console.log('✅ Workload_Analysis collection populated.');

  // 10. NOTIFICATIONS
  console.log('Writing Notifications...');
  const notifs = [
    {
      notification_id: 'notif_welcome_harold',
      user_id: 'zEJ0q30C0OPZJsk6wyBMLqAasWB2',
      recipient_id: 'zEJ0q30C0OPZJsk6wyBMLqAasWB2',
      title: 'Welcome to Atleta',
      message: 'Your athlete profile and performance tracking are active.',
      is_read: false,
      read: false,
      type: 'SYSTEM',
      created_at: now,
    },
    {
      notification_id: 'notif_welcome_gerard',
      user_id: 'v5XWfDqgsYTFPx7xEWnBsssNcH83',
      recipient_id: 'v5XWfDqgsYTFPx7xEWnBsssNcH83',
      title: 'Coach Dashboard Ready',
      message: 'Your coaching roster and match logs are synchronized.',
      is_read: false,
      read: false,
      type: 'SYSTEM',
      created_at: now,
    },
  ];

  const batch10 = db.batch();
  for (const n of notifs) {
    batch10.set(db.collection('Notifications').doc(n.notification_id), n, { merge: true });
  }
  await batch10.commit();
  console.log('✅ Notifications collection populated.');

  // 11. SCOUTING REGISTRY
  console.log('Writing Scouting Registry...');
  const scoutingDocs = [
    {
      registry_id: 'scout_001',
      scout_id: 'scout_001',
      athlete_id: 'ATH-001',
      user_id: 'usr_athlete_001',
      full_name: 'Gerard Pelonio',
      sport_category: 'Basketball',
      position: 'Point Guard',
      province: 'Manila',
      rank: 1,
      composite_score: 95.0,
      coach_scout_id: 'coach_v5XWfDqgsYTFPx7xEWnBsssNcH83',
      offer_status: 'Active',
      offer_message: 'Varsity scholarship and training camp invitation.',
      created_at: now,
      updated_at: now,
    },
    {
      registry_id: 'scout_002',
      scout_id: 'scout_002',
      athlete_id: 'ath_zEJ0q30C0OPZJsk6wyBMLqAasWB2',
      user_id: 'zEJ0q30C0OPZJsk6wyBMLqAasWB2',
      full_name: 'Harold Delos Santos',
      sport_category: 'Basketball',
      position: 'Shooting Guard',
      province: 'Camarines Sur',
      rank: 1,
      composite_score: 96.5,
      coach_scout_id: 'coach_v5XWfDqgsYTFPx7xEWnBsssNcH83',
      offer_status: 'Active',
      offer_message: 'Priority recruit for upcoming national tournament.',
      created_at: now,
      updated_at: now,
    },
  ];

  const batch11 = db.batch();
  for (const sc of scoutingDocs) {
    batch11.set(db.collection('Scouting_Registry').doc(sc.registry_id), sc, { merge: true });
  }
  await batch11.commit();
  console.log('✅ Scouting_Registry collection populated.');

  // 12. OFFICIAL SCHEDULES & VALIDATIONS
  console.log('Writing Official Schedules & Validations...');
  const sched = {
    schedule_id: 'sched_v2_001',
    match_id: 'MATCH-001',
    official_id: 'off_fYladJevOqYwPJ5Sh2Qjx5OTAgF3',
    venue: 'Ateneo Gym Court 1',
    court_number: 'Court 1',
    scheduled_time: now,
    status: 'assigned',
    created_at: now,
    updated_at: now,
  };
  await db.collection('Official_Schedules').doc('sched_v2_001').set(sched, { merge: true });

  const val = {
    validation_id: 'val_v2_001',
    match_id: 'MATCH-001',
    official_id: 'off_fYladJevOqYwPJ5Sh2Qjx5OTAgF3',
    status: 'Certified',
    verification_status: 'Certified',
    scoresheet_url: 'https://storage.googleapis.com/atleta/scoresheets/match_001.pdf',
    certified_at: now,
    created_at: now,
  };
  await db.collection('Official_Validations').doc('val_v2_001').set(val, { merge: true });
  console.log('✅ Official Schedules & Validations populated.');

  console.log('\n🎉 ALL COLLECTIONS IN ATLETA-V2 SUCCESSFULLY POPULATED!');
}

populateV2()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Fatal error populating atleta-v2:', err);
    process.exit(1);
  });
