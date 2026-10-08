import { db } from '../utils/firebaseAdmin';

export async function populateMultiSportComprehensiveData() {
  console.log('🚀 Populating comprehensive multi-sport data into Firestore (atleta-v1)...');
  const now = new Date().toISOString();

  // 1. SPORTS CONFIGURATIONS
  const sports = [
    {
      sport_id: 'sport_basketball',
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
      ],
      created_at: now,
      updated_at: now,
    },
    {
      sport_id: 'sport_swimming',
      sport_name: 'Swimming',
      short_identifier: 'SWIMMING',
      category: 'Individual',
      measurement_type: 'Time',
      is_timed_sport: true,
      is_active: true,
      configurable_stats: [
        { stat_name_key: 'times_50m_free', label: '50m Free', measurement_category: 'Time' },
        { stat_name_key: 'times_100m', label: '100m Free', measurement_category: 'Time' },
        { stat_name_key: 'times_200m', label: '200m Free', measurement_category: 'Time' },
      ],
      created_at: now,
      updated_at: now,
    },
    {
      sport_id: 'sport_track_field',
      sport_name: 'Track & Field',
      short_identifier: 'TRACK AND FIELD',
      category: 'Individual',
      measurement_type: 'Time',
      is_timed_sport: true,
      is_active: true,
      configurable_stats: [
        { stat_name_key: 'times_100m', label: '100m Sprint', measurement_category: 'Time' },
        { stat_name_key: 'times_200m', label: '200m Sprint', measurement_category: 'Time' },
        { stat_name_key: 'times_400m', label: '400m Sprint', measurement_category: 'Time' },
      ],
      created_at: now,
      updated_at: now,
    },
    {
      sport_id: 'sport_volleyball',
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
      ],
      created_at: now,
      updated_at: now,
    },
    {
      sport_id: 'sport_pickleball',
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

  const batchSports = db.batch();
  for (const s of sports) {
    batchSports.set(db.collection('Sports_Configurations').doc(s.sport_id), s, { merge: true });
    batchSports.set(db.collection('sports_configurations').doc(s.sport_id), s, { merge: true });
  }
  await batchSports.commit();
  console.log('✅ 1. Sports_Configurations written.');

  // 2. COACHES (Specific coach for each sport)
  const coaches = [
    {
      uid: 'v5XWfDqgsYTFPx7xEWnBsssNcH83',
      email: 'gerardpelonio30@gmail.com',
      first_name: 'Gerard Francis',
      last_name: 'Pelonio',
      full_name: 'Gerard Francis Pelonio',
      role: 'Coach',
      sport_type: 'Basketball',
      current_institution: 'Ateneo de Naga University',
      years_of_experience: 10,
    },
    {
      uid: 'coach_swimming_01',
      email: 'coach.aquatics@atleta.ph',
      first_name: 'Michael',
      last_name: 'Phelps-Coach',
      full_name: 'Coach Michael Phelps',
      role: 'Coach',
      sport_type: 'Swimming',
      current_institution: 'Bicol Aquatic Academy',
      years_of_experience: 12,
    },
    {
      uid: 'coach_track_01',
      email: 'coach.speed@atleta.ph',
      first_name: 'Usain',
      last_name: 'Bolt-Coach',
      full_name: 'Coach Usain Bolt',
      role: 'Coach',
      sport_type: 'Track & Field',
      current_institution: 'Bicol Striders Athletics Club',
      years_of_experience: 9,
    },
    {
      uid: 'coach_volleyball_01',
      email: 'coach.volleyball@atleta.ph',
      first_name: 'Ramil',
      last_name: 'De Jesus-Coach',
      full_name: 'Coach Ramil De Jesus',
      role: 'Coach',
      sport_type: 'Volleyball',
      current_institution: 'Bicol Spikers Club',
      years_of_experience: 15,
    },
    {
      uid: 'coach_pickleball_01',
      email: 'coach.pickle@atleta.ph',
      first_name: 'Ben',
      last_name: 'Johns-Coach',
      full_name: 'Coach Ben Johns',
      role: 'Coach',
      sport_type: 'Pickleball',
      current_institution: 'Naga Pickleball League',
      years_of_experience: 6,
    },
  ];

  const batchCoaches = db.batch();
  for (const c of coaches) {
    const userDoc = {
      user_id: c.uid,
      first_name: c.first_name,
      last_name: c.last_name,
      full_name: c.full_name,
      email: c.email,
      role: 'Coach',
      account_status: 'Active',
      sport_type: c.sport_type,
      created_at: now,
      updated_at: now,
    };
    batchCoaches.set(db.collection('Users').doc(c.uid), userDoc, { merge: true });

    const coachProfile = {
      coach_id: `coach_${c.uid}`,
      user_id: c.uid,
      first_name: c.first_name,
      last_name: c.last_name,
      full_name: c.full_name,
      email: c.email,
      sport_type: c.sport_type,
      current_institution: c.current_institution,
      years_of_experience: c.years_of_experience,
      account_status: 'Active',
      is_active: true,
      created_at: now,
      updated_at: now,
    };
    batchCoaches.set(db.collection('Coach_Profiles').doc(`coach_${c.uid}`), coachProfile, { merge: true });
    batchCoaches.set(db.collection('Coach_Profiles').doc(c.uid), coachProfile, { merge: true });
  }
  await batchCoaches.commit();
  console.log('✅ 2. Multi-Sport Coaches written.');

  // 3. ATHLETES (Specific athletes for each sport)
  const athletes = [
    // Basketball Athletes
    {
      uid: 'zEJ0q30C0OPZJsk6wyBMLqAasWB2',
      email: 'harold@gmail.com',
      first_name: 'Harold',
      last_name: 'Delos Santos',
      full_name: 'Harold Delos Santos',
      sport_type: 'Basketball',
      position: 'Point Guard',
      jersey_number: 7,
      team_id: 'team_bicol_rivers',
      team_name: 'Bicol Rivers',
      coach_id: 'coach_v5XWfDqgsYTFPx7xEWnBsssNcH83',
      province: 'Camarines Sur',
      recruitment_status: 'Rostered',
      height_cm: 188,
      weight_kg: 82,
      wingspan_cm: 195,
      stats: { ppg: 24.5, rpg: 8.2, ast: 5.1, fg_pct: 52.4, per: 28.5, games_played: 10 },
      averages: { ppg: 24.5, rpg: 8.2, apg: 5.1, fg_percentage: 52.4, per_score: 28.5, games_played: 10 },
      calculated_per: 28.5,
      efficiency_pct: 99,
    },
    {
      uid: 'ath_li7SPmQlX5YrirRWvj0c6PY85AI3',
      email: 'christian.ramos@atleta.ph',
      first_name: 'Christian',
      last_name: 'Ramos',
      full_name: 'Christian Ramos',
      sport_type: 'Basketball',
      position: 'Shooting Guard',
      jersey_number: 11,
      team_id: 'team_bicol_rivers',
      team_name: 'Bicol Rivers',
      coach_id: 'coach_v5XWfDqgsYTFPx7xEWnBsssNcH83',
      province: 'Camarines Sur',
      recruitment_status: 'Available',
      height_cm: 185,
      weight_kg: 80,
      wingspan_cm: 190,
      stats: { ppg: 21.4, rpg: 5.8, ast: 6.2, fg_pct: 48.6, per: 26.2, games_played: 10 },
      averages: { ppg: 21.4, rpg: 5.8, apg: 6.2, fg_percentage: 48.6, per_score: 26.2, games_played: 10 },
      calculated_per: 26.2,
      efficiency_pct: 95,
    },
    {
      uid: 'ath_darren_solano_01',
      email: 'darren.solano@atleta.ph',
      first_name: 'Darren',
      last_name: 'Solano',
      full_name: 'Darren Solano',
      sport_type: 'Basketball',
      position: 'Small Forward',
      jersey_number: 15,
      team_id: 'team_adnu_knights',
      team_name: 'ADNU Golden Knights',
      coach_id: 'coach_v5XWfDqgsYTFPx7xEWnBsssNcH83',
      province: 'Camarines Sur',
      recruitment_status: 'Available',
      height_cm: 193,
      weight_kg: 88,
      wingspan_cm: 200,
      stats: { ppg: 19.8, rpg: 9.4, ast: 3.8, fg_pct: 50.1, per: 24.8, games_played: 8 },
      averages: { ppg: 19.8, rpg: 9.4, apg: 3.8, fg_percentage: 50.1, per_score: 24.8, games_played: 8 },
      calculated_per: 24.8,
      efficiency_pct: 92,
    },

    // Swimming Athletes
    {
      uid: 'ath_swim_chloe_01',
      email: 'chloe.isada@atleta.ph',
      first_name: 'Chloe',
      last_name: 'Isada',
      full_name: 'Chloe Isada',
      sport_type: 'Swimming',
      position: 'Freestyle Swimmer',
      jersey_number: 1,
      team_id: 'team_bicol_aquatics',
      team_name: 'Bicol Aquatics Elite',
      coach_id: 'coach_swimming_01',
      province: 'Camarines Sur',
      recruitment_status: 'Available',
      height_cm: 175,
      weight_kg: 64,
      wingspan_cm: 182,
      stats: { times_50m_free: '24.82s', times_100m: '54.10s', times_200m: '1:58.40', ppg: 0, per: 32.0, games_played: 6 },
      averages: { times_50m_free: '24.82s', times_100m: '54.10s', times_200m: '1:58.40', per_score: 32.0 },
      calculated_per: 32.0,
      efficiency_pct: 98,
    },
    {
      uid: 'ath_swim_marcus_02',
      email: 'marcus.aquino@atleta.ph',
      first_name: 'Marcus',
      last_name: 'Aquino',
      full_name: 'Marcus Aquino',
      sport_type: 'Swimming',
      position: 'Backstroke Specialist',
      jersey_number: 4,
      team_id: 'team_bicol_aquatics',
      team_name: 'Bicol Aquatics Elite',
      coach_id: 'coach_swimming_01',
      province: 'Albay',
      recruitment_status: 'Rostered',
      height_cm: 182,
      weight_kg: 72,
      wingspan_cm: 190,
      stats: { times_50m_free: '25.60s', times_100m: '56.30s', times_200m: '2:02.10', ppg: 0, per: 29.5, games_played: 5 },
      averages: { times_50m_free: '25.60s', times_100m: '56.30s', times_200m: '2:02.10', per_score: 29.5 },
      calculated_per: 29.5,
      efficiency_pct: 94,
    },

    // Track & Field Athletes
    {
      uid: 'ath_track_ej_01',
      email: 'ej.obiena.recruit@atleta.ph',
      first_name: 'Ernest',
      last_name: 'Obiena',
      full_name: 'Ernest Obiena',
      sport_type: 'Track & Field',
      position: 'Pole Vault / Sprint',
      jersey_number: 3,
      team_id: 'team_bicol_striders',
      team_name: 'Bicol Striders Athletics',
      coach_id: 'coach_track_01',
      province: 'Camarines Sur',
      recruitment_status: 'Available',
      height_cm: 188,
      weight_kg: 84,
      wingspan_cm: 194,
      stats: { times_100m: '10.35s', times_200m: '21.05s', times_400m: '47.20s', ppg: 0, per: 35.0, games_played: 7 },
      averages: { times_100m: '10.35s', times_200m: '21.05s', times_400m: '47.20s', per_score: 35.0 },
      calculated_per: 35.0,
      efficiency_pct: 99,
    },
    {
      uid: 'ath_track_kristina_02',
      email: 'kristina.knott@atleta.ph',
      first_name: 'Kristina',
      last_name: 'Knott',
      full_name: 'Kristina Knott',
      sport_type: 'Track & Field',
      position: '100m / 200m Sprinter',
      jersey_number: 5,
      team_id: 'team_bicol_striders',
      team_name: 'Bicol Striders Athletics',
      coach_id: 'coach_track_01',
      province: 'Sorsogon',
      recruitment_status: 'Rostered',
      height_cm: 168,
      weight_kg: 58,
      wingspan_cm: 172,
      stats: { times_100m: '11.27s', times_200m: '23.01s', times_400m: '52.40s', ppg: 0, per: 33.2, games_played: 6 },
      averages: { times_100m: '11.27s', times_200m: '23.01s', times_400m: '52.40s', per_score: 33.2 },
      calculated_per: 33.2,
      efficiency_pct: 96,
    },

    // Volleyball Athletes
    {
      uid: 'ath_volley_alyssa_01',
      email: 'alyssa.valdez@atleta.ph',
      first_name: 'Alyssa',
      last_name: 'Valdez',
      full_name: 'Alyssa Valdez',
      sport_type: 'Volleyball',
      position: 'Outside Hitter',
      jersey_number: 2,
      team_id: 'team_bicol_spikers',
      team_name: 'Bicol Spikers Club',
      coach_id: 'coach_volleyball_01',
      province: 'Batangas / Bicol',
      recruitment_status: 'Available',
      height_cm: 175,
      weight_kg: 60,
      wingspan_cm: 180,
      stats: { ppg: 22.0, spike_kills: 18, block_points: 3, service_aces: 2, per: 31.0, games_played: 8 },
      averages: { ppg: 22.0, spike_kills: 18, block_points: 3, service_aces: 2, per_score: 31.0 },
      calculated_per: 31.0,
      efficiency_pct: 97,
    },

    // Pickleball Athletes
    {
      uid: 'ath_pickle_tyson_01',
      email: 'tyson.mcguffin@atleta.ph',
      first_name: 'Tyson',
      last_name: 'McGuffin',
      full_name: 'Tyson McGuffin',
      sport_type: 'Pickleball',
      position: 'Singles / Doubles Pro',
      jersey_number: 8,
      team_id: 'team_naga_pickleball',
      team_name: 'Naga Dinking Smashers',
      coach_id: 'coach_pickleball_01',
      province: 'Camarines Sur',
      recruitment_status: 'Available',
      height_cm: 178,
      weight_kg: 74,
      wingspan_cm: 183,
      stats: { ppg: 18.0, points_scored: 18, aces: 4, dinks: 24, per: 27.5, games_played: 9 },
      averages: { ppg: 18.0, points_scored: 18, aces: 4, dinks: 24, per_score: 27.5 },
      calculated_per: 27.5,
      efficiency_pct: 93,
    },
  ];

  const batchAthletes = db.batch();
  for (const a of athletes) {
    const userDoc = {
      user_id: a.uid,
      first_name: a.first_name,
      last_name: a.last_name,
      full_name: a.full_name,
      email: a.email,
      role: 'Athlete',
      account_status: 'Active',
      sport_type: a.sport_type,
      province: a.province,
      created_at: now,
      updated_at: now,
    };
    batchAthletes.set(db.collection('Users').doc(a.uid), userDoc, { merge: true });

    const profileDoc = {
      athlete_id: a.uid.startsWith('ath_') ? a.uid : `ath_${a.uid}`,
      user_id: a.uid,
      first_name: a.first_name,
      last_name: a.last_name,
      full_name: a.full_name,
      email: a.email,
      sport_type: a.sport_type,
      sport_category: a.sport_type.toUpperCase(),
      position: a.position,
      jersey_number: a.jersey_number,
      team_id: a.team_id,
      team_name: a.team_name,
      coach_id: a.coach_id,
      province: a.province,
      location: a.province,
      recruitment_status: a.recruitment_status,
      height_cm: a.height_cm,
      weight_kg: a.weight_kg,
      wingspan_cm: a.wingspan_cm,
      biometrics: {
        height_ft: `${Math.floor(a.height_cm / 30.48)}'${Math.round((a.height_cm % 30.48) / 2.54)}"`,
        weight_lbs: `${Math.round(a.weight_kg * 2.20462)} lbs`,
        wingspan_ft: `${Math.floor(a.wingspan_cm / 30.48)}'${Math.round((a.wingspan_cm % 30.48) / 2.54)}"`,
      },
      stats: a.stats,
      averages: a.averages,
      calculated_per: a.calculated_per,
      efficiency_pct: a.efficiency_pct,
      eligibility_documents: {
        psa_verified: true,
        document_urls: ['psa_verified.pdf'],
      },
      created_at: now,
      updated_at: now,
    };

    batchAthletes.set(db.collection('Athlete_Profiles').doc(a.uid), profileDoc, { merge: true });
    if (!a.uid.startsWith('ath_')) {
      batchAthletes.set(db.collection('Athlete_Profiles').doc(`ath_${a.uid}`), profileDoc, { merge: true });
    }
  }
  await batchAthletes.commit();
  console.log('✅ 3. Multi-Sport Athletes written.');

  // 4. TEAMS (Specific teams for each sport)
  const teams = [
    {
      team_id: 'team_bicol_rivers',
      team_name: 'Bicol Rivers',
      sport_type: 'Basketball',
      sport_category: 'BASKETBALL',
      division: 'Varsity Elite Division',
      coach_id: 'coach_v5XWfDqgsYTFPx7xEWnBsssNcH83',
      coach_name: 'Gerard Francis Pelonio',
      season_record: { wins: 14, losses: 2 },
      roster_list: [
        {
          athlete_id: 'ath_zEJ0q30C0OPZJsk6wyBMLqAasWB2',
          full_name: 'Harold Delos Santos',
          position: 'Point Guard',
          jersey_number: 7,
          is_eligibility_verified: true,
        },
        {
          athlete_id: 'ath_li7SPmQlX5YrirRWvj0c6PY85AI3',
          full_name: 'Christian Ramos',
          position: 'Shooting Guard',
          jersey_number: 11,
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
      sport_category: 'BASKETBALL',
      division: 'Collegiate Championship',
      coach_id: 'coach_v5XWfDqgsYTFPx7xEWnBsssNcH83',
      coach_name: 'Gerard Francis Pelonio',
      season_record: { wins: 12, losses: 3 },
      roster_list: [
        {
          athlete_id: 'ath_darren_solano_01',
          full_name: 'Darren Solano',
          position: 'Small Forward',
          jersey_number: 15,
          is_eligibility_verified: true,
        },
      ],
      created_at: now,
      updated_at: now,
    },
    {
      team_id: 'team_bicol_aquatics',
      team_name: 'Bicol Aquatics Elite',
      sport_type: 'Swimming',
      sport_category: 'SWIMMING',
      division: 'National Aquatics League',
      coach_id: 'coach_swimming_01',
      coach_name: 'Coach Michael Phelps',
      season_record: { wins: 8, losses: 1 },
      roster_list: [
        {
          athlete_id: 'ath_swim_chloe_01',
          full_name: 'Chloe Isada',
          position: 'Freestyle Swimmer',
          jersey_number: 1,
          is_eligibility_verified: true,
        },
        {
          athlete_id: 'ath_swim_marcus_02',
          full_name: 'Marcus Aquino',
          position: 'Backstroke Specialist',
          jersey_number: 4,
          is_eligibility_verified: true,
        },
      ],
      created_at: now,
      updated_at: now,
    },
    {
      team_id: 'team_bicol_striders',
      team_name: 'Bicol Striders Athletics',
      sport_type: 'Track & Field',
      sport_category: 'TRACK AND FIELD',
      division: 'National Track Invitational',
      coach_id: 'coach_track_01',
      coach_name: 'Coach Usain Bolt',
      season_record: { wins: 10, losses: 0 },
      roster_list: [
        {
          athlete_id: 'ath_track_ej_01',
          full_name: 'Ernest Obiena',
          position: 'Pole Vault / Sprint',
          jersey_number: 3,
          is_eligibility_verified: true,
        },
        {
          athlete_id: 'ath_track_kristina_02',
          full_name: 'Kristina Knott',
          position: '100m / 200m Sprinter',
          jersey_number: 5,
          is_eligibility_verified: true,
        },
      ],
      created_at: now,
      updated_at: now,
    },
    {
      team_id: 'team_bicol_spikers',
      team_name: 'Bicol Spikers Club',
      sport_type: 'Volleyball',
      sport_category: 'VOLLEYBALL',
      division: 'Varsity Premier Volleyball',
      coach_id: 'coach_volleyball_01',
      coach_name: 'Coach Ramil De Jesus',
      season_record: { wins: 11, losses: 2 },
      roster_list: [
        {
          athlete_id: 'ath_volley_alyssa_01',
          full_name: 'Alyssa Valdez',
          position: 'Outside Hitter',
          jersey_number: 2,
          is_eligibility_verified: true,
        },
      ],
      created_at: now,
      updated_at: now,
    },
    {
      team_id: 'team_naga_pickleball',
      team_name: 'Naga Dinking Smashers',
      sport_type: 'Pickleball',
      sport_category: 'PICKLEBALL',
      division: 'Bicol Open Pickleball',
      coach_id: 'coach_pickleball_01',
      coach_name: 'Coach Ben Johns',
      season_record: { wins: 9, losses: 3 },
      roster_list: [
        {
          athlete_id: 'ath_pickle_tyson_01',
          full_name: 'Tyson McGuffin',
          position: 'Singles / Doubles Pro',
          jersey_number: 8,
          is_eligibility_verified: true,
        },
      ],
      created_at: now,
      updated_at: now,
    },
  ];

  const batchTeams = db.batch();
  for (const t of teams) {
    batchTeams.set(db.collection('Teams').doc(t.team_id), t, { merge: true });
  }
  await batchTeams.commit();
  console.log('✅ 4. Multi-Sport Teams written.');

  // 5. MATCH LOGS & EVENTS
  const matches = [
    {
      match_id: 'MATCH-BBALL-001',
      sport_type: 'Basketball',
      game_name: 'Bicol Rivers vs ADNU Golden Knights',
      home_team_name: 'Bicol Rivers',
      away_team_name: 'ADNU Golden Knights',
      home_score: 98,
      away_score: 91,
      match_date: '2026-10-06',
      location: 'Naga City Coliseum',
      is_certified: true,
      is_locked: true,
      is_official: true,
      notes: 'High paced game, certified and verified by official referee.',
      scoresheet_url: 'https://storage.googleapis.com/atleta/scoresheets/bball_finals.pdf',
      created_at: now,
    },
    {
      match_id: 'MATCH-SWIM-001',
      sport_type: 'Swimming',
      game_name: '50m Freestyle Championship Finals',
      event_name: '50m Freestyle Championship Finals',
      location: 'Ateneo Aquatics Complex',
      match_date: '2026-10-05',
      is_certified: true,
      is_locked: true,
      is_official: true,
      notes: 'Official times certified with electronic touchpads.',
      scoresheet_url: 'https://storage.googleapis.com/atleta/scoresheets/swim_finals.pdf',
      created_at: now,
    },
    {
      match_id: 'MATCH-TRACK-001',
      sport_type: 'Track & Field',
      game_name: '100m Sprint Invitational Finals',
      event_name: '100m Sprint Invitational Finals',
      location: 'Bicol University Sports Oval',
      match_date: '2026-10-04',
      is_certified: true,
      is_locked: true,
      is_official: true,
      notes: 'Certified automatic wind-gauge and timing records.',
      scoresheet_url: 'https://storage.googleapis.com/atleta/scoresheets/track_finals.pdf',
      created_at: now,
    },
  ];

  const batchMatches = db.batch();
  for (const m of matches) {
    batchMatches.set(db.collection('Match_Logs').doc(m.match_id), m, { merge: true });
  }
  await batchMatches.commit();
  console.log('✅ 5. Multi-Sport Matches written.');

  console.log('\n🎉 ALL MULTI-SPORT DEMO DATA POPULATED SUCCESSFULLY!');
}

populateMultiSportComprehensiveData()
  .then(() => {
    console.log('Done!');
    process.exit(0);
  })
  .catch((err) => {
    console.error('Error populating multi-sport data:', err);
    process.exit(1);
  });
