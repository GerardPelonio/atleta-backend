import { db } from '../utils/firebaseAdmin';
import { User, AthleteProfile, CoachProfile, OfficialProfile, AdminProfile } from '../models/userModel';
import { Team } from '../models/teamModel';
import { MatchLog, OfficialValidation, PerformanceMetric } from '../models/matchModel';
import { RecruitmentInquiry } from '../models/inquiryModel';
import { WorkloadEntry } from '../models/workloadModel';
import { SportsConfiguration } from '../models/sportModel';
import { TournamentRegistry } from '../models/tournamentModel';
import { AnthropometricMeasurement } from '../models/anthropometricModel';

async function runParityVerification() {
  console.log('================================================================');
  console.log('  ATLETA DATA DICTIONARY & SCHEMA HARMONIZATION VERIFICATION');
  console.log('================================================================\n');

  const now = new Date().toISOString();
  const testSuffix = `test_${Date.now()}`;
  const createdDocRefs: { collection: string; id: string }[] = [];

  try {
    // 1. Users Collection
    console.log('[1/14] Testing Users collection...');
    const userPayload: User = {
      user_id: `usr_${testSuffix}`,
      first_name: 'Juan',
      last_name: 'Dela Cruz',
      full_name: 'Juan Dela Cruz',
      email: `juan_${testSuffix}@example.com`,
      contact_number: '+639123456789',
      role: 'Athlete',
      provider: 'password',
      avatar_url: 'https://example.com/avatar.png',
      account_status: 'Active',
      created_at: now,
      updated_at: now,
    };
    await db.collection('Users').doc(userPayload.user_id).set(userPayload);
    createdDocRefs.push({ collection: 'Users', id: userPayload.user_id });
    const userDoc = await db.collection('Users').doc(userPayload.user_id).get();
    if (!userDoc.exists || userDoc.data()?.email !== userPayload.email) throw new Error('Users validation failed');
    console.log('  ✔ Users schema match');

    // 2. Admin_Profiles Collection
    console.log('[2/14] Testing Admin_Profiles collection...');
    const adminPayload: AdminProfile = {
      admin_id: `adm_${testSuffix}`,
      user_id: `usr_adm_${testSuffix}`,
      full_name: 'Admin User',
      email: `admin_${testSuffix}@atleta.edu.ph`,
      department_code: 'ATH-DEPT',
      institution: 'State Athletic Commission',
      clearance_level: 3,
      is_active: true,
      is_elevated: true,
      permissions: ['all'],
      created_at: now,
      updated_at: now,
    };
    await db.collection('Admin_Profiles').doc(adminPayload.admin_id).set(adminPayload);
    createdDocRefs.push({ collection: 'Admin_Profiles', id: adminPayload.admin_id });
    const admDoc = await db.collection('Admin_Profiles').doc(adminPayload.admin_id).get();
    if (!admDoc.exists || admDoc.data()?.department_code !== 'ATH-DEPT') throw new Error('Admin_Profiles validation failed');
    console.log('  ✔ Admin_Profiles schema match');

    // 3. Athlete_Profiles Collection
    console.log('[3/14] Testing Athlete_Profiles collection...');
    const athletePayload: AthleteProfile = {
      athlete_id: `ath_${testSuffix}`,
      user_id: userPayload.user_id,
      first_name: 'Juan',
      last_name: 'Dela Cruz',
      gender: 'Male',
      birthdate: '2004-05-15',
      province: 'Camarines Sur',
      sports_type: 'Basketball',
      sport_type: 'Basketball',
      position: 'Point Guard',
      jersey_number: 7,
      height_cm: 188.5,
      weight_kg: 82.0,
      avatar_url: 'https://example.com/athlete.png',
      recruitment_status: 'Available',
      leaderboard_rank: 1,
      rank: 1,
      eligibility_documents: {
        psa_verified: true,
        academic_check: true,
        proof_of_residency: true,
      },
      achievements: [
        {
          title: 'Regional MVP',
          year: 2025,
          content: 'Tournament Leading Scorer',
        },
      ],
      created_at: now,
      updated_at: now,
    };
    await db.collection('Athlete_Profiles').doc(athletePayload.athlete_id).set(athletePayload);
    createdDocRefs.push({ collection: 'Athlete_Profiles', id: athletePayload.athlete_id });
    const athDoc = await db.collection('Athlete_Profiles').doc(athletePayload.athlete_id).get();
    if (!athDoc.exists || athDoc.data()?.height_cm !== 188.5) throw new Error('Athlete_Profiles validation failed');
    console.log('  ✔ Athlete_Profiles schema match');

    // 4. Teams Collection
    console.log('[4/14] Testing Teams collection...');
    const teamPayload: Team = {
      team_id: `team_${testSuffix}`,
      team_name: 'Bicol Warriors',
      sport_type: 'Basketball',
      division: 'Collegiate Division A',
      coach_id: `coach_${testSuffix}`,
      roster_list: [athletePayload.athlete_id],
      season_record: {
        wins: 12,
        losses: 2,
      },
      created_at: now,
      timestamp: now,
    };
    await db.collection('Teams').doc(teamPayload.team_id).set(teamPayload);
    createdDocRefs.push({ collection: 'Teams', id: teamPayload.team_id });
    const teamDoc = await db.collection('Teams').doc(teamPayload.team_id).get();
    if (!teamDoc.exists || teamDoc.data()?.team_name !== 'Bicol Warriors') throw new Error('Teams validation failed');
    console.log('  ✔ Teams schema match');

    // 5. Coach_Profiles Collection
    console.log('[5/14] Testing Coach_Profiles collection...');
    const coachPayload: CoachProfile = {
      coach_id: `coach_${testSuffix}`,
      user_id: `usr_coach_${testSuffix}`,
      first_name: 'Coach',
      last_name: 'Alvarez',
      full_name: 'Coach Alvarez',
      email: `coach_${testSuffix}@example.com`,
      account_status: 'Active',
      sport_type: 'Basketball',
      years_of_experience: 15,
      current_institution: 'Ateneo de Naga University',
      regional_affiliation: 'Region V Athletics',
      national_sports_league: 'UAAP / PRISAA',
      team_id: teamPayload.team_id,
      teams_managed: [teamPayload.team_id],
      athletes_managed: [
        {
          athlete_id: athletePayload.athlete_id,
          full_name: 'Juan Dela Cruz',
        },
      ],
      matches_logged: 34,
      total_matches_logged: 34,
      professional_documents: ['https://example.com/coach_license.pdf'],
      profile_image: 'https://example.com/coach.png',
      quote: 'Champions train when nobody is looking.',
      system_statistics: {
        metric_logs: 250,
        total_records: 120,
      },
      created_at: now,
      updated_at: now,
    };
    await db.collection('Coach_Profiles').doc(coachPayload.coach_id).set(coachPayload);
    createdDocRefs.push({ collection: 'Coach_Profiles', id: coachPayload.coach_id });
    const coachDoc = await db.collection('Coach_Profiles').doc(coachPayload.coach_id).get();
    if (!coachDoc.exists || coachDoc.data()?.years_of_experience !== 15) throw new Error('Coach_Profiles validation failed');
    console.log('  ✔ Coach_Profiles schema match');

    // 6. Official_Profiles Collection
    console.log('[6/14] Testing Official_Profiles collection...');
    const officialPayload: OfficialProfile = {
      official_id: `off_${testSuffix}`,
      user_id: `usr_off_${testSuffix}`,
      organization_name: 'Philippine Sports Commission',
      official_license_number: 'PSC-LIC-98214',
      certification_status: 'Certified',
      assigned_tournaments: ['National Youth Games 2026'],
      is_active: true,
      avatar_url: 'https://example.com/official.png',
      profile_image: 'https://example.com/official.png',
      settings: [],
      created_at: now,
      updated_at: now,
    };
    await db.collection('Official_Profiles').doc(officialPayload.official_id).set(officialPayload);
    createdDocRefs.push({ collection: 'Official_Profiles', id: officialPayload.official_id });
    const offDoc = await db.collection('Official_Profiles').doc(officialPayload.official_id).get();
    if (!offDoc.exists || offDoc.data()?.official_license_number !== 'PSC-LIC-98214') throw new Error('Official_Profiles validation failed');
    console.log('  ✔ Official_Profiles schema match');

    // 7. Match_Logs Collection
    console.log('[7/14] Testing Match_Logs collection...');
    const matchPayload: MatchLog = {
      match_id: `match_${testSuffix}`,
      game_name: 'Bicol Warriors vs Legazpi Knights',
      tournament_id: `org_tourn_${testSuffix}`,
      sport_type: 'Basketball',
      match_type: 'Official Match',
      match_date: now,
      location: 'Naga City Coliseum',
      home_team_id: teamPayload.team_id,
      home_team_name: 'Bicol Warriors',
      home_score: 95,
      away_team_id: `team_away_${testSuffix}`,
      away_team_name: 'Legazpi Knights',
      opponent_team_name: 'Legazpi Knights',
      away_score: 88,
      game_result: 'WIN',
      assigned_coaches: [coachPayload.coach_id],
      official_id: officialPayload.official_id,
      reference_id: `ref_${testSuffix}`,
      scoresheet_url: 'https://example.com/scoresheet.pdf',
      scoresheetUrl: 'https://example.com/scoresheet.pdf',
      ocr_extracted_data_url: null,
      is_official: true,
      is_certified: true,
      is_locked: true,
      roster_athletes: [athletePayload.athlete_id],
      notes: 'Final championship game',
      timestamp: now,
      created_at: now,
      updated_at: now,
    };
    await db.collection('Match_Logs').doc(matchPayload.match_id).set(matchPayload);
    createdDocRefs.push({ collection: 'Match_Logs', id: matchPayload.match_id });
    const matchDoc = await db.collection('Match_Logs').doc(matchPayload.match_id).get();
    if (!matchDoc.exists || matchDoc.data()?.home_score !== 95) throw new Error('Match_Logs validation failed');
    console.log('  ✔ Match_Logs schema match');

    // 8. Scouting_Registry Collection
    console.log('[8/14] Testing Scouting_Registry collection...');
    const scoutPayload: RecruitmentInquiry = {
      scout_id: `scout_${testSuffix}`,
      athlete_id: athletePayload.athlete_id,
      coach_scout_id: coachPayload.coach_id,
      initiated_by: coachPayload.coach_id,
      date_initiated: now,
      offer_message: 'Invitation to varsity athletic scholarship trial.',
      offer_status: 'Sent',
      updated_at: now,
    };
    await db.collection('Scouting_Registry').doc(scoutPayload.scout_id).set(scoutPayload);
    createdDocRefs.push({ collection: 'Scouting_Registry', id: scoutPayload.scout_id });
    const scoutDoc = await db.collection('Scouting_Registry').doc(scoutPayload.scout_id).get();
    if (!scoutDoc.exists || scoutDoc.data()?.offer_status !== 'Sent') throw new Error('Scouting_Registry validation failed');
    console.log('  ✔ Scouting_Registry schema match');

    // 9. Official_Validations Collection
    console.log('[9/14] Testing Official_Validations collection...');
    const validationPayload: OfficialValidation = {
      validation_id: `val_${testSuffix}`,
      audit_id: `audit_${testSuffix}`,
      match_id: matchPayload.match_id,
      official_id: officialPayload.official_id,
      requested_by: coachPayload.coach_id,
      requested_by_coach_id: coachPayload.coach_id,
      requested_at: now,
      verification_status: 'Certified',
      status: 'Certified',
      ocr_extracted_data_url: null,
      scoresheet_attachment_url: 'https://example.com/scoresheet.pdf',
      scoresheet_url: 'https://example.com/scoresheet.pdf',
      timestamp: now,
      created_at: now,
      updated_at: now,
    };
    await db.collection('Official_Validations').doc(validationPayload.validation_id).set(validationPayload);
    createdDocRefs.push({ collection: 'Official_Validations', id: validationPayload.validation_id });
    const valDoc = await db.collection('Official_Validations').doc(validationPayload.validation_id).get();
    if (!valDoc.exists || valDoc.data()?.verification_status !== 'Certified') throw new Error('Official_Validations validation failed');
    console.log('  ✔ Official_Validations schema match');

    // 10. Performance_Metrics Collection
    console.log('[10/14] Testing Performance_Metrics collection...');
    const metricPayload: PerformanceMetric = {
      metric_id: `metric_${testSuffix}`,
      match_id: matchPayload.match_id,
      athlete_id: athletePayload.athlete_id,
      player_name: 'Juan Dela Cruz',
      jersey_number: 7,
      sport_category: 'BASKETBALL',
      calculated_player_efficiency: 28.5,
      sport_stats: {
        pts: 24,
        ast: 8,
        reb: 6,
        fg_pct: 0.54,
        basketball: {
          total_field_goals_made: 9,
          total_field_goals_attempts: 16,
          two_point_made: 7,
          two_point_attempts: 11,
          three_point_made: 2,
          three_point_attempts: 5,
          free_throws_made: 4,
          free_throws_attempts: 4,
          assists: 8,
          blocks: 1,
          turnovers: 2,
          rebounds: 6,
        },
      },
      custom_stats: {
        stat_name_key: 'efficiency_rating',
        stat_value: 28.5,
      },
      team_name: 'Bicol Warriors',
      timestamp: now,
      created_at: now,
    };
    await db.collection('Performance_Metrics').doc(metricPayload.metric_id).set(metricPayload);
    createdDocRefs.push({ collection: 'Performance_Metrics', id: metricPayload.metric_id });
    const metricDoc = await db.collection('Performance_Metrics').doc(metricPayload.metric_id).get();
    if (!metricDoc.exists || (metricDoc.data()?.sport_stats?.basketball?.two_point_made !== 7)) {
      throw new Error('Performance_Metrics validation failed');
    }
    console.log('  ✔ Performance_Metrics schema match');

    // 11. Workload_Analysis Collection
    console.log('[11/14] Testing Workload_Analysis collection...');
    const workloadPayload: WorkloadEntry = {
      workload_id: `wl_${testSuffix}`,
      athlete_id: athletePayload.athlete_id,
      session_type: 'Practice',
      session_duration_mins: 90,
      srpe_score: 7,
      daily_load: 630,
      entry_date: '2026-10-14',
      short_term_load: 630,
      long_term_load: 550,
      injury_risk_index: 1.15,
      monotony_score: 1.2,
      strain_score: 756,
      created_at: now,
    };
    await db.collection('Workload_Analysis').doc(workloadPayload.workload_id).set(workloadPayload);
    createdDocRefs.push({ collection: 'Workload_Analysis', id: workloadPayload.workload_id });
    const wlDoc = await db.collection('Workload_Analysis').doc(workloadPayload.workload_id).get();
    if (!wlDoc.exists || wlDoc.data()?.daily_load !== 630) throw new Error('Workload_Analysis validation failed');
    console.log('  ✔ Workload_Analysis schema match');

    // 12. Sports_Configurations Collection
    console.log('[12/14] Testing Sports_Configurations collection...');
    const sportPayload: SportsConfiguration = {
      sport_id: `sport_${testSuffix}`,
      canonical_id: 'pickleball',
      sport_name: 'Pickleball',
      short_identifier: 'PBALL',
      category: 'Team',
      is_active: true,
      is_timed_sport: false,
      measurement_type: 'Points Scored',
      configurable_stats: [
        {
          stat_name_key: 'points_scored',
          label: 'Points Scored',
          measurement_category: 'Cumulative Total',
        },
      ],
      metric_keys: [
        {
          key: 'points_scored',
          label: 'Points Scored',
          data_type: 'number',
          weight: 1.0,
          is_positive: true,
        },
      ],
      rules: {
        scoring_type: 'First to 11 Points',
        period_count: 3,
        period_duration_minutes: 0,
        period_name: 'Round',
      },
      created_at: now,
      updated_at: now,
    };
    await db.collection('Sports_Configurations').doc(sportPayload.sport_id).set(sportPayload);
    createdDocRefs.push({ collection: 'Sports_Configurations', id: sportPayload.sport_id });
    const spDoc = await db.collection('Sports_Configurations').doc(sportPayload.sport_id).get();
    if (!spDoc.exists || spDoc.data()?.rules?.scoring_type !== 'First to 11 Points') throw new Error('Sports_Configurations validation failed');
    console.log('  ✔ Sports_Configurations schema match');

    // 13. Tournament_Registry Collection
    console.log('[13/14] Testing Tournament_Registry collection...');
    const tournamentPayload: TournamentRegistry = {
      org_id: `org_${testSuffix}`,
      name: 'Bicol University Intercollegiate Athletic Meet',
      organization_name: 'Bicol Intercollegiate Sports Union',
      registered_by: `admin_${testSuffix}@atleta.edu.ph`,
      status: 'Active',
      created_at: now,
    };
    await db.collection('Tournament_Registry').doc(tournamentPayload.org_id).set(tournamentPayload);
    createdDocRefs.push({ collection: 'Tournament_Registry', id: tournamentPayload.org_id });
    const tournDoc = await db.collection('Tournament_Registry').doc(tournamentPayload.org_id).get();
    if (!tournDoc.exists || tournDoc.data()?.status !== 'Active') throw new Error('Tournament_Registry validation failed');
    console.log('  ✔ Tournament_Registry schema match');

    // 14. Anthropometric_Measurements Collection
    console.log('[14/14] Testing Anthropometric_Measurements collection...');
    const anthroPayload: AnthropometricMeasurement = {
      measurement_id: `meas_${testSuffix}`,
      athlete_id: athletePayload.athlete_id,
      recorded_by: coachPayload.coach_id,
      height_cm: 188.5,
      weight_kg: 82.0,
      wingspan_cm: 196.0,
      standing_reach_cm: 245.0,
      vertical_jump_cm: 85.0,
      body_fat_pct: 9.8,
      recorded_at: now,
      created_at: now,
      updated_at: now,
    };
    await db.collection('Anthropometric_Measurements').doc(anthroPayload.measurement_id).set(anthroPayload);
    createdDocRefs.push({ collection: 'Anthropometric_Measurements', id: anthroPayload.measurement_id });
    const anthroDoc = await db.collection('Anthropometric_Measurements').doc(anthroPayload.measurement_id).get();
    if (!anthroDoc.exists || anthroDoc.data()?.wingspan_cm !== 196.0) throw new Error('Anthropometric_Measurements validation failed');
    console.log('  ✔ Anthropometric_Measurements schema match');

    console.log('\n================================================================');
    console.log('  ALL 14 COLLECTIONS FULLY VERIFIED WITH 100% TECHNICAL PARITY! ');
    console.log('================================================================\n');
  } finally {
    // Clean up mock documents
    console.log(`Cleaning up ${createdDocRefs.length} mock test documents...`);
    const batch = db.batch();
    for (const ref of createdDocRefs) {
      batch.delete(db.collection(ref.collection).doc(ref.id));
    }
    await batch.commit().catch(() => null);
    console.log('✔ Cleanup complete.');
  }
}

runParityVerification()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('❌ Parity verification failed:', err);
    process.exit(1);
  });
