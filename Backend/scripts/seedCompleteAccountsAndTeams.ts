import { auth, db } from '../utils/firebaseAdmin';

async function seedCompleteAccountsAndTeams() {
  console.log('=== SEEDING COMPLETE ATLETA ACCOUNTS & TEAMS ===\n');

  // 1. Athletes List
  const athletes = [
    {
      uid: 'A1btfKhmlaTqYkT6A8XrXa9r1cB3',
      email: 'athlete@atleta.ph',
      firstName: 'Alex',
      lastName: 'Atleta',
      position: 'Point Guard',
      jersey: 7,
      rating: 94,
      stats: { ppg: 22.4, rpg: 5.6, apg: 8.2, spg: 2.3, bpg: 0.5, fgPct: 49.2 },
      biometrics: { height: "6'2\"", weight: '185 lbs', wingspan: "6'6\"" },
    },
    {
      uid: '6M1hBs0t9Vhm992Zls4DFULb2n33',
      email: 'test_ath1_1792325389717@atleta.ph',
      firstName: 'Juan Carlos',
      lastName: 'Dela Cruz',
      position: 'Shooting Guard',
      jersey: 10,
      rating: 91,
      stats: { ppg: 19.8, rpg: 4.2, apg: 4.5, spg: 1.8, bpg: 0.3, fgPct: 47.5 },
      biometrics: { height: "6'3\"", weight: '190 lbs', wingspan: "6'7\"" },
    },
    {
      uid: 'D4tKUyXpUnTFhMm7JyusF6EOhpH2',
      email: 'test_ath2_1792325959060@atleta.ph',
      firstName: 'Marcus',
      lastName: 'Santos',
      position: 'Power Forward',
      jersey: 23,
      rating: 89,
      stats: { ppg: 16.5, rpg: 9.8, apg: 2.1, spg: 1.1, bpg: 1.7, fgPct: 53.1 },
      biometrics: { height: "6'8\"", weight: '225 lbs', wingspan: "7'1\"" },
    },
    {
      uid: 'pluRByFpADeSn0oeuxVPOOp0XaE2',
      email: 'test_ath1_1792325835469@atleta.ph',
      firstName: 'Kobe',
      lastName: 'Paras',
      position: 'Small Forward',
      jersey: 6,
      rating: 92,
      stats: { ppg: 20.1, rpg: 6.4, apg: 3.8, spg: 1.5, bpg: 1.1, fgPct: 48.0 },
      biometrics: { height: "6'6\"", weight: '210 lbs', wingspan: "6'10\"" },
    },
    {
      uid: 'wk1D3yC6tTUoCW1nciIi237ij413',
      email: 'test_ath2_1792325389717@atleta.ph',
      firstName: 'Kai',
      lastName: 'Sotto',
      position: 'Center',
      jersey: 11,
      rating: 93,
      stats: { ppg: 17.2, rpg: 11.5, apg: 2.5, spg: 0.8, bpg: 2.9, fgPct: 56.4 },
      biometrics: { height: "7'3\"", weight: '240 lbs', wingspan: "7'5\"" },
    },
  ];

  // 2. Coaches List
  const coaches = [
    {
      uid: 'Mjbadte33tdEx5qDSbcwq1SxQyT2',
      email: 'coach@atleta.ph',
      firstName: 'Coach',
      lastName: 'Carter',
      fullName: 'Coach Carter',
    },
    {
      uid: 'EyQ7fzxkZ6dPq2dWgVWAkGjumnm2',
      email: 'deb1025@gmail.com',
      firstName: 'Deb',
      lastName: 'Coach',
      fullName: 'Deb Coach',
    },
    {
      uid: 'Irwh3vqQxuSYPNlF2Fp1wGHJeCR2',
      email: 'gerard@gmail.com',
      firstName: 'Gerard',
      lastName: 'Pelonio',
      fullName: 'Coach Gerard Pelonio',
    },
    {
      uid: 'sRva2Xredcc1ef35XOCGvzOoVdO2',
      email: 'erickdebelen22@gmail.com',
      firstName: 'Erick',
      lastName: 'Debelen',
      fullName: 'Coach Erick Debelen',
    },
    {
      uid: 'Za63Cfa12XMkmF3xWF73lm3eFZA2',
      email: 'debs@gmail.com',
      firstName: 'Erick',
      lastName: 'De Belen',
      fullName: 'Coach Erick De Belen',
    },
  ];

  const allCoachIds = coaches.flatMap(c => [
    c.uid,
    c.uid.toLowerCase(),
    `coach_${c.uid}`,
    `coach_${c.uid.toLowerCase()}`,
  ]);

  // 3. Populate Athletes
  console.log('Seeding athletes in Firestore...');
  const athleteRosterItems = [];

  for (const ath of athletes) {
    const athDocId = `ath_${ath.uid}`;
    const athleteData = {
      athlete_id: athDocId,
      user_id: ath.uid,
      first_name: ath.firstName,
      last_name: ath.lastName,
      full_name: `${ath.firstName} ${ath.lastName}`,
      email: ath.email,
      sport_type: 'Basketball',
      position: ath.position,
      jersey_number: ath.jersey,
      team_id: 't_green_archers',
      team_name: 'Green Archers',
      coach_id: 'coach_mjbadte33tdex5qdsbcwq1sxqyt2',
      is_eligibility_verified: true,
      eligibility_documents: ['https://storage.atleta.ph/psa_verified.pdf'],
      rating_score: ath.rating,
      biometrics: ath.biometrics,
      physical_profile: ath.biometrics,
      stats: {
        points_per_game: ath.stats.ppg,
        rebounds_per_game: ath.stats.rpg,
        assists_per_game: ath.stats.apg,
        steals_per_game: ath.stats.spg,
        blocks_per_game: ath.stats.bpg,
        field_goal_percentage: ath.stats.fgPct,
      },
      averages: {
        points_per_game: ath.stats.ppg,
        rebounds_per_game: ath.stats.rpg,
        assists_per_game: ath.stats.apg,
        steals_per_game: ath.stats.spg,
        blocks_per_game: ath.stats.bpg,
        field_goal_percentage: ath.stats.fgPct,
      },
      radar_competencies: {
        scoring: Math.min(99, Math.round(ath.stats.ppg * 4)),
        defense: 86,
        playmaking: Math.min(99, Math.round(ath.stats.apg * 11)),
        rebounding: Math.min(99, Math.round(ath.stats.rpg * 9)),
        athleticism: 88,
      },
      workload_analytics: {
        acute_load: 420,
        chronic_load: 390,
        acwr: 1.08,
        injury_risk: 'Low Risk',
      },
      updated_at: new Date(),
    };

    // Write to both ath_${uid} and ${uid}
    await db.collection('Athlete_Profiles').doc(athDocId).set(athleteData, { merge: true });
    await db.collection('Athlete_Profiles').doc(ath.uid).set(athleteData, { merge: true });

    // Ensure User doc
    await db.collection('Users').doc(ath.uid).set({
      user_id: ath.uid,
      first_name: ath.firstName,
      last_name: ath.lastName,
      full_name: `${ath.firstName} ${ath.lastName}`,
      email: ath.email,
      role: 'Athlete',
      sport_type: 'Basketball',
      team_id: 't_green_archers',
      is_approved: true,
      account_status: 'Active',
      status: 'VERIFIED',
      updated_at: new Date(),
    }, { merge: true });

    athleteRosterItems.push({
      athlete_id: athDocId,
      user_id: ath.uid,
      first_name: ath.firstName,
      last_name: ath.lastName,
      full_name: `${ath.firstName} ${ath.lastName}`,
      position: ath.position,
      jersey_number: ath.jersey,
      sport_type: 'Basketball',
      is_eligibility_verified: true,
      eligibility_documents: ['https://storage.atleta.ph/psa_verified.pdf'],
      rating_score: ath.rating,
      stats: athleteData.stats,
      averages: athleteData.averages,
      biometrics: ath.biometrics,
      workload_analytics: athleteData.workload_analytics,
    });
  }

  // 4. Seed Teams
  console.log('Seeding Teams in Firestore...');
  const greenArchersTeam = {
    team_id: 't_green_archers',
    team_name: 'Green Archers',
    sport_type: 'Basketball',
    division: 'Varsity Division',
    coach_id: 'coach_mjbadte33tdex5qdsbcwq1sxqyt2',
    coach_name: 'Coach Carter',
    coaching_staff: allCoachIds,
    season_record: { wins: 14, losses: 2 },
    established_year: 2020,
    created_at: new Date().toISOString(),
    roster_list: athleteRosterItems,
    timestamp: new Date().toISOString(),
  };
  await db.collection('Teams').doc('t_green_archers').set(greenArchersTeam, { merge: true });

  const bullsTeam = {
    team_id: 'TEAM-024',
    team_name: 'BULLS',
    sport_type: 'Basketball',
    division: 'Elite Division',
    coach_id: 'coach_mjbadte33tdex5qdsbcwq1sxqyt2',
    coach_name: 'Coach Carter',
    coaching_staff: allCoachIds,
    season_record: { wins: 10, losses: 4 },
    established_year: 2022,
    created_at: new Date().toISOString(),
    roster_list: athleteRosterItems.slice(0, 3),
    timestamp: new Date().toISOString(),
  };
  await db.collection('Teams').doc('TEAM-024').set(bullsTeam, { merge: true });

  // 5. Seed Coach Profiles and Users for each coach
  console.log('Seeding Coach Profiles and Users...');
  for (const c of coaches) {
    const canonicalId = `coach_${c.uid.toLowerCase()}`;
    const rawUid = c.uid;

    const coachData = {
      coach_id: canonicalId,
      user_id: rawUid,
      first_name: c.firstName,
      last_name: c.lastName,
      full_name: c.fullName,
      email: c.email,
      contact_number: '+63 917 123 4567',
      sport_type: 'Basketball',
      current_institution: 'De La Salle University',
      regional_affiliation: 'NCR',
      national_sports_league: 'UAAP',
      years_of_experience: 8,
      team_id: 't_green_archers',
      teams_managed: ['t_green_archers', 'TEAM-024'],
      athlete_managed: athletes.map(a => `ath_${a.uid}`),
      athletes_managed: athletes.map(a => `ath_${a.uid}`),
      quote: 'Champions are built in practice.',
      status: 'VERIFIED',
      is_approved: true,
      account_status: 'Active',
      updated_at: new Date(),
    };

    // Save under canonical coach doc, lowercased doc, and raw uid doc
    await db.collection('Coach_Profiles').doc(canonicalId).set(coachData, { merge: true });
    await db.collection('Coach_Profiles').doc(rawUid).set(coachData, { merge: true });
    await db.collection('Coach_Profiles').doc(`coach_${rawUid}`).set(coachData, { merge: true });

    // Save under Users collection
    await db.collection('Users').doc(rawUid).set({
      user_id: rawUid,
      first_name: c.firstName,
      last_name: c.lastName,
      full_name: c.fullName,
      email: c.email,
      role: 'Coach',
      sport_type: 'Basketball',
      team_id: 't_green_archers',
      current_institution: 'De La Salle University',
      is_approved: true,
      account_status: 'Active',
      status: 'VERIFIED',
      updated_at: new Date(),
    }, { merge: true });
  }

  // 6. Seed Official Accounts
  console.log('Seeding Official Accounts in Users...');
  const officials = [
    { uid: 'demo_official_01', email: 'official@atleta.ph', name: 'Gerard Pelonio' },
    { uid: 'usr_official_001', email: 'official@atleta.ph', name: 'Tournament Referee' },
    { uid: 'OWn4WvIULVMkyp92CSxfJcgq7NA3', email: 'official1025@gmail.com', name: 'Tournament Official' },
  ];
  for (const off of officials) {
    await db.collection('Users').doc(off.uid).set({
      user_id: off.uid,
      full_name: off.name,
      first_name: off.name.split(' ')[0],
      last_name: off.name.split(' ').slice(1).join(' '),
      email: off.email,
      role: 'Official',
      is_approved: true,
      account_status: 'Active',
      status: 'VERIFIED',
      updated_at: new Date(),
    }, { merge: true });
  }

  // 7. Seed Match Logs
  console.log('Seeding Match Logs...');
  const matches = [
    {
      match_id: 'm_ga_vs_ateneo_01',
      team_id: 't_green_archers',
      home_team: 'Green Archers',
      home_team_name: 'Green Archers',
      away_team: 'Ateneo Blue Eagles',
      away_team_name: 'Ateneo Blue Eagles',
      opponent_team_name: 'Ateneo Blue Eagles',
      home_score: 85,
      away_score: 79,
      game_result: 'WIN',
      sport_type: 'Basketball',
      match_date: '2026-10-15',
      date_time: '2026-10-15T16:00:00Z',
      coach_id: 'coach_mjbadte33tdex5qdsbcwq1sxqyt2',
      logged_by_coach_id: 'coach_mjbadte33tdex5qdsbcwq1sxqyt2',
      is_official: true,
      notes: 'Final Win (85 - 79). Outstanding 4th quarter defense.',
    },
    {
      match_id: 'm_ga_vs_ust_02',
      team_id: 't_green_archers',
      home_team: 'Green Archers',
      home_team_name: 'Green Archers',
      away_team: 'UST Growling Tigers',
      away_team_name: 'UST Growling Tigers',
      opponent_team_name: 'UST Growling Tigers',
      home_score: 92,
      away_score: 84,
      game_result: 'WIN',
      sport_type: 'Basketball',
      match_date: '2026-10-10',
      date_time: '2026-10-10T14:00:00Z',
      coach_id: 'coach_mjbadte33tdex5qdsbcwq1sxqyt2',
      logged_by_coach_id: 'coach_mjbadte33tdex5qdsbcwq1sxqyt2',
      is_official: true,
      notes: 'Final Win (92 - 84). Fast break points led the way.',
    },
    {
      match_id: 'm_ga_vs_feu_03',
      team_id: 't_green_archers',
      home_team: 'Green Archers',
      home_team_name: 'Green Archers',
      away_team: 'FEU Tamaraws',
      away_team_name: 'FEU Tamaraws',
      opponent_team_name: 'FEU Tamaraws',
      home_score: 74,
      away_score: 78,
      game_result: 'LOSS',
      sport_type: 'Basketball',
      match_date: '2026-10-05',
      date_time: '2026-10-05T18:00:00Z',
      coach_id: 'coach_mjbadte33tdex5qdsbcwq1sxqyt2',
      logged_by_coach_id: 'coach_mjbadte33tdex5qdsbcwq1sxqyt2',
      is_official: true,
      notes: 'Tough loss in double overtime (74 - 78).',
    },
  ];

  for (const m of matches) {
    await db.collection('Match_Logs').doc(m.match_id).set(m, { merge: true });
  }

  console.log('=== SEEDING COMPLETED SUCCESSFULLY ===');
}

seedCompleteAccountsAndTeams()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Seeding failed:', err);
    process.exit(1);
  });
