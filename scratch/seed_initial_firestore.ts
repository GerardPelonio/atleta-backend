import { db } from '../utils/firebaseAdmin';

async function seedInitialFirestore() {
  console.log('🌱 Seeding initial configurations & collections in Firestore...');

  const batch = db.batch();

  // 1. Seed Sports Configurations
  const sports = [
    {
      sport_id: 'sport_basketball',
      sport_name: 'Basketball',
      category: 'Team',
      is_timed_sport: false,
      measurement_type: 'Points',
      metric_keys: [
        { key: 'points', label: 'Points', data_type: 'number', weight: 1.0, is_positive: true },
        { key: 'offensive_rebounds', label: 'Offensive Rebounds', data_type: 'number', weight: 1.2, is_positive: true },
        { key: 'defensive_rebounds', label: 'Defensive Rebounds', data_type: 'number', weight: 1.0, is_positive: true },
        { key: 'assists', label: 'Assists', data_type: 'number', weight: 1.5, is_positive: true },
        { key: 'steals', label: 'Steals', data_type: 'number', weight: 2.0, is_positive: true },
        { key: 'blocks', label: 'Blocks', data_type: 'number', weight: 2.0, is_positive: true },
        { key: 'turnovers', label: 'Turnovers', data_type: 'number', weight: 1.5, is_positive: false },
        { key: 'fouls', label: 'Personal Fouls', data_type: 'number', weight: 0.5, is_positive: false },
      ],
      created_at: new Date(),
    },
    {
      sport_id: 'sport_swimming',
      sport_name: 'Swimming',
      category: 'Individual',
      is_timed_sport: true,
      measurement_type: 'Time',
      metric_keys: [
        { key: 'finish_time_ms', label: 'Finish Time (ms)', data_type: 'number', weight: 1.0, is_positive: false },
        { key: 'split_times', label: 'Split Times', data_type: 'array', weight: 1.0, is_positive: false },
        { key: 'reaction_time_ms', label: 'Reaction Time (ms)', data_type: 'number', weight: 1.0, is_positive: false },
      ],
      created_at: new Date(),
    },
    {
      sport_id: 'sport_volleyball',
      sport_name: 'Volleyball',
      category: 'Team',
      is_timed_sport: false,
      measurement_type: 'Points',
      metric_keys: [
        { key: 'spike_kills', label: 'Spike Kills', data_type: 'number', weight: 1.5, is_positive: true },
        { key: 'block_points', label: 'Block Points', data_type: 'number', weight: 1.5, is_positive: true },
        { key: 'service_aces', label: 'Service Aces', data_type: 'number', weight: 1.0, is_positive: true },
        { key: 'digs', label: 'Digs', data_type: 'number', weight: 1.0, is_positive: true },
        { key: 'attack_errors', label: 'Attack Errors', data_type: 'number', weight: 1.0, is_positive: false },
      ],
      created_at: new Date(),
    },
  ];

  for (const s of sports) {
    batch.set(db.collection('Sports_Configurations').doc(s.sport_id), s);
  }

  // 2. Seed Tournament Registry
  const orgs = [
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
    {
      org_id: 'org_cal',
      organization_name: 'Collegiate Athletic League',
      region: 'Luzon',
      status: 'Active',
      created_at: new Date(),
    },
    {
      org_id: 'org_bucal',
      organization_name: 'BUCAL',
      full_name: 'Bicol University Inter-Collegiate Athletic League (BUCAL)',
      region: 'Region V - Bicol',
      status: 'Active',
      created_at: new Date(),
    },
    {
      org_id: 'org_bucal_full',
      organization_name: 'Bicol University Inter-Collegiate Athletic League (BUCAL)',
      region: 'Region V - Bicol',
      status: 'Active',
      created_at: new Date(),
    },
    {
      org_id: 'org_bucal_collegiate',
      organization_name: 'Bicol University Collegiate Athletic League',
      region: 'Region V - Bicol',
      status: 'Active',
      created_at: new Date(),
    },
  ];

  for (const o of orgs) {
    batch.set(db.collection('Tournament_Registry').doc(o.org_id), o);
  }

  await batch.commit();
  console.log('✅ Seeded Sports_Configurations and Tournament_Registry into Firestore!');
}

seedInitialFirestore()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
