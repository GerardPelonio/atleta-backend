import { db } from '../utils/firebaseAdmin';

interface AthleteSeedProfile {
  uid: string;
  firstName: string;
  lastName: string;
  sport: 'Basketball' | 'Volleyball' | 'Swimming' | 'Track and Field';
  position: string;
  eventType?: string;
  jersey: number;
  heightCm: number;
  weightKg: number;
  wingspanCm: number;
  verticalCm: number;
  standingReachCm: number;
  bodyFatPct: number;
  rating: number;
  rank: number;
  teamId?: string;
  teamName?: string;
  coachId?: string;
  province?: string;
  stats: Record<string, any>;
  averages: Record<string, any>;
  radar: Record<string, any>;
}

// ─── 1. Authoritative Seed Athletes ──────────────────────────────────────────

const KNOWN_ATHLETES: Record<string, Partial<AthleteSeedProfile>> = {
  // Track & Field
  'CXlViZwG6sQ5pfPShCCSJocy9zz1': { // Eric Cray
    firstName: 'Eric',
    lastName: 'Cray',
    sport: 'Track and Field',
    position: '400m Hurdles',
    eventType: '400m Hurdles',
    jersey: 8,
    heightCm: 178,
    weightKg: 73,
    wingspanCm: 185,
    verticalCm: 86,
    standingReachCm: 232,
    bodyFatPct: 8.5,
    rating: 96,
    rank: 1,
    province: 'Cavite',
    stats: { times_100m: '10.25s', times_400m: '48.98s', personal_best: '48.98s', latest_mark: '49.60s', competitions: 7, podiums: 6, wins: 4 },
    averages: { pb_100m: '10.25s', pb_400m: '48.98s', avg_time: '49.60s' },
    radar: { speed: 97, endurance: 95, technique: 94, agility: 92, explosiveness: 96 },
  },
  'i8GhjKihDdMaVMhsZH6SvW9e0wm1': { // EJ Obiena
    firstName: 'EJ',
    lastName: 'Obiena',
    sport: 'Track and Field',
    position: 'Pole Vault',
    eventType: 'Pole Vault',
    jersey: 88,
    heightCm: 188,
    weightKg: 81,
    wingspanCm: 196,
    verticalCm: 92,
    standingReachCm: 248,
    bodyFatPct: 9.0,
    rating: 99,
    rank: 1,
    teamId: 'TEAM-024',
    teamName: 'Ateneo Track & Field',
    province: 'Manila',
    stats: { personal_best: '6.00m', latest_mark: '5.92m', competitions: 8, podiums: 7, wins: 6, pole_vault_pb: '6.00m' },
    averages: { pb_pole_vault: '6.00m', latest_mark: '5.92m' },
    radar: { speed: 94, power: 98, technique: 99, consistency: 97, explosiveness: 99 },
  },
  'OPINhlI94kdV1JjqxPBE1I1yRgg2': { // Janry Ubas
    firstName: 'Janry',
    lastName: 'Ubas',
    sport: 'Track and Field',
    position: 'Long Jump',
    eventType: 'Long Jump',
    jersey: 14,
    heightCm: 180,
    weightKg: 72,
    wingspanCm: 185,
    verticalCm: 96,
    standingReachCm: 236,
    bodyFatPct: 8.8,
    rating: 93,
    rank: 3,
    province: 'Misamis Oriental',
    stats: { personal_best: '8.08m', latest_mark: '7.95m', competitions: 6, podiums: 4, wins: 3 },
    averages: { pb_long_jump: '8.08m', avg_jump: '7.92m' },
    radar: { speed: 93, power: 94, technique: 92, agility: 91, explosiveness: 96 },
  },
  'PrA17UexiPNVv3qRsjZrIfPgYQY2': { // William Morrison
    firstName: 'William',
    lastName: 'Morrison',
    sport: 'Track and Field',
    position: 'Shot Put',
    eventType: 'Shot Put',
    jersey: 32,
    heightCm: 188,
    weightKg: 120,
    wingspanCm: 198,
    verticalCm: 71,
    standingReachCm: 246,
    bodyFatPct: 15.2,
    rating: 92,
    rank: 4,
    province: 'Rizal',
    stats: { personal_best: '20.40m', latest_mark: '19.80m', competitions: 5, podiums: 4, wins: 3 },
    averages: { pb_shot_put: '20.40m', avg_throw: '19.65m' },
    radar: { strength: 99, power: 96, technique: 91, balance: 90, explosiveness: 93 },
  },
  'tqI6kaC5e3SZxLyiVTOl0UYE5Ex1': { // Kristina Knott
    firstName: 'Kristina',
    lastName: 'Knott',
    sport: 'Track and Field',
    position: '100m Dash',
    eventType: '100m Dash',
    jersey: 7,
    heightCm: 168,
    weightKg: 55,
    wingspanCm: 173,
    verticalCm: 76,
    standingReachCm: 220,
    bodyFatPct: 11.2,
    rating: 95,
    rank: 2,
    province: 'Cebu',
    stats: { times_100m: '11.27s', times_200m: '23.01s', personal_best: '11.27s', latest_mark: '11.45s', competitions: 7, podiums: 6, wins: 5 },
    averages: { pb_100m: '11.27s', pb_200m: '23.01s' },
    radar: { speed: 99, reaction: 96, acceleration: 97, technique: 94, stamina: 91 },
  },
  'nkWsBYBIAngUoiwRUIhvL24aFWV2': { // Robyn Brown
    firstName: 'Robyn',
    lastName: 'Brown',
    sport: 'Track and Field',
    position: '400m Hurdles',
    eventType: '400m Hurdles',
    jersey: 11,
    heightCm: 170,
    weightKg: 58,
    wingspanCm: 175,
    verticalCm: 74,
    standingReachCm: 222,
    bodyFatPct: 12.0,
    rating: 92,
    rank: 5,
    province: 'Iloilo',
    stats: { times_400m: '56.44s', personal_best: '56.44s', latest_mark: '57.10s', competitions: 5, podiums: 4, wins: 3 },
    averages: { pb_400m: '56.44s', avg_time: '57.20s' },
    radar: { speed: 92, endurance: 95, rhythm: 94, technique: 91, determination: 93 },
  },

  // Swimming
  '2cgkfyTqEVOIijykaKJTr9fsrta2': { // Kayla Sanchez
    firstName: 'Kayla',
    lastName: 'Sanchez',
    sport: 'Swimming',
    position: 'Freestyle / Backstroke',
    eventType: '100m Freestyle',
    jersey: 4,
    heightCm: 173,
    weightKg: 64,
    wingspanCm: 180,
    verticalCm: 71,
    standingReachCm: 226,
    bodyFatPct: 13.5,
    rating: 99,
    rank: 1,
    teamId: 'TEAM-014',
    teamName: 'Ateneo Blue Fast',
    province: 'Pampanga',
    stats: { times_50m_free: '00:24.82', times_100m: '00:53.66', times_200m: '01:57.20', personal_best: '00:53.66s', latest_mark: '00:54.20s', competitions: 9, podiums: 8, wins: 7 },
    averages: { pb_50m_free: '00:24.82', pb_100m_free: '00:53.66', pb_200m_free: '01:57.20' },
    radar: { speed: 98, endurance: 97, stroke_power: 96, turn_efficiency: 99, reaction: 97 },
  },
  'HcvX0QKoszYeMZHysStjuupkoC43': { // Luke Gebbie
    firstName: 'Luke',
    lastName: 'Gebbie',
    sport: 'Swimming',
    position: 'Freestyle / Butterfly',
    eventType: '100m Freestyle',
    jersey: 5,
    heightCm: 185,
    weightKg: 79,
    wingspanCm: 193,
    verticalCm: 79,
    standingReachCm: 242,
    bodyFatPct: 10.5,
    rating: 94,
    rank: 2,
    teamId: 'TEAM-014',
    teamName: 'Ateneo Blue Fast',
    province: 'Manila',
    stats: { times_50m_free: '00:22.57', times_100m: '00:49.64', personal_best: '00:49.64s', latest_mark: '00:50.10s', competitions: 6, podiums: 5, wins: 4 },
    averages: { pb_50m_free: '00:22.57', pb_100m_free: '00:49.64' },
    radar: { speed: 96, power: 95, stroke_rate: 94, dive_distance: 93, endurance: 92 },
  },
  '06ER4AyKt8Ue4eNDhvvQtHCXX552': { // Jarod Hatch
    firstName: 'Jarod',
    lastName: 'Hatch',
    sport: 'Swimming',
    position: '100m Butterfly',
    eventType: '100m Butterfly',
    jersey: 3,
    heightCm: 188,
    weightKg: 82,
    wingspanCm: 196,
    verticalCm: 81,
    standingReachCm: 246,
    bodyFatPct: 10.8,
    rating: 95,
    rank: 3,
    province: 'Bohol',
    stats: { times_50m_fly: '00:24.27', times_100m_fly: '00:52.87', personal_best: '00:52.87s', latest_mark: '00:53.25s', competitions: 7, podiums: 5, wins: 4 },
    averages: { pb_50m_fly: '00:24.27', pb_100m_fly: '00:52.87' },
    radar: { speed: 95, power: 97, stroke_power: 96, underwater_kick: 94, endurance: 93 },
  },
  '7qEk9sCw3qYz57DVOLa89hDGkKG3': { // Jasmine Alkhaldi
    firstName: 'Jasmine',
    lastName: 'Alkhaldi',
    sport: 'Swimming',
    position: 'Freestyle / Butterfly',
    eventType: '100m Freestyle',
    jersey: 6,
    heightCm: 173,
    weightKg: 62,
    wingspanCm: 178,
    verticalCm: 69,
    standingReachCm: 226,
    bodyFatPct: 12.8,
    rating: 94,
    rank: 4,
    province: 'Laguna',
    stats: { times_50m_free: '00:25.48', times_100m: '00:55.90', personal_best: '00:55.90s', latest_mark: '00:56.30s', competitions: 8, podiums: 6, wins: 5 },
    averages: { pb_50m_free: '00:25.48', pb_100m_free: '00:55.90' },
    radar: { speed: 94, technique: 96, start_reaction: 95, endurance: 93, consistency: 94 },
  },
  'jGVAedZBIpeiB1Y11ren8rHkho12': { // Xiandi Chua
    firstName: 'Xiandi',
    lastName: 'Chua',
    sport: 'Swimming',
    position: 'Backstroke / IM',
    eventType: '200m Backstroke',
    jersey: 7,
    heightCm: 170,
    weightKg: 60,
    wingspanCm: 175,
    verticalCm: 66,
    standingReachCm: 222,
    bodyFatPct: 13.0,
    rating: 95,
    rank: 5,
    province: 'Quezon City',
    stats: { times_200m_back: '02:13.20', times_400m_im: '04:45.60', personal_best: '02:13.20s', latest_mark: '02:14.50s', competitions: 6, podiums: 5, wins: 4 },
    averages: { pb_200m_back: '02:13.20', pb_400m_im: '04:45.60' },
    radar: { endurance: 98, technique: 97, pacing: 96, versatility: 95, kick_power: 92 },
  },
  'Qq2phRY0xNao6AUOAIsAfMmqtWU2': { // Remedy Rule
    firstName: 'Remedy',
    lastName: 'Rule',
    sport: 'Swimming',
    position: 'Butterfly',
    eventType: '200m Butterfly',
    jersey: 9,
    heightCm: 170,
    weightKg: 61,
    wingspanCm: 178,
    verticalCm: 69,
    standingReachCm: 223,
    bodyFatPct: 12.5,
    rating: 93,
    rank: 6,
    province: 'Batangas',
    stats: { times_100m_fly: '00:59.60', times_200m_fly: '02:09.58', personal_best: '02:09.58s', latest_mark: '02:10.80s', competitions: 5, podiums: 4, wins: 3 },
    averages: { pb_100m_fly: '00:59.60', pb_200m_fly: '02:09.58' },
    radar: { endurance: 97, fly_technique: 96, mental_toughness: 94, tempo: 92, speed: 91 },
  },

  // Basketball
  'JSnT46ObzENZSZvGRJta54dK3og1': { // Kevin Quiambao
    firstName: 'Kevin',
    lastName: 'Quiambao',
    sport: 'Basketball',
    position: 'Power Forward',
    jersey: 15,
    heightCm: 198,
    weightKg: 98,
    wingspanCm: 208,
    verticalCm: 89,
    standingReachCm: 260,
    bodyFatPct: 10.2,
    rating: 96,
    rank: 1,
    province: 'Muntinlupa',
    stats: { ppg: 16.7, rpg: 10.9, apg: 6.0, spg: 1.2, bpg: 0.9, fg_pct: 48.5, three_pct: 35.2, ft_pct: 78.4 },
    averages: { ppg: 16.7, rpg: 10.9, apg: 6.0, spg: 1.2, bpg: 0.9, fg_pct: 48.5 },
    radar: { scoring: 92, playmaking: 96, rebounding: 97, defense: 91, basketball_iq: 98 },
  },
  'TLKO7AHzf7PcQ5e2m4GSTW0L8je2': { // Carl Tamayo
    firstName: 'Carl',
    lastName: 'Tamayo',
    sport: 'Basketball',
    position: 'Power Forward',
    jersey: 28,
    heightCm: 203,
    weightKg: 102,
    wingspanCm: 211,
    verticalCm: 84,
    standingReachCm: 268,
    bodyFatPct: 11.5,
    rating: 93,
    rank: 2,
    province: 'Cebu',
    stats: { ppg: 15.4, rpg: 8.8, apg: 2.3, spg: 0.9, bpg: 1.1, fg_pct: 51.2, three_pct: 33.8, ft_pct: 74.0 },
    averages: { ppg: 15.4, rpg: 8.8, apg: 2.3, spg: 0.9, bpg: 1.1, fg_pct: 51.2 },
    radar: { inside_scoring: 95, rebounding: 93, post_defense: 91, shooting: 88, poise: 92 },
  },
  'XSJ8y261fzT704MYyw8d0tgw50f2': { // Dwight Ramos
    firstName: 'Dwight',
    lastName: 'Ramos',
    sport: 'Basketball',
    position: 'Shooting Guard',
    jersey: 24,
    heightCm: 193,
    weightKg: 88,
    wingspanCm: 203,
    verticalCm: 91,
    standingReachCm: 254,
    bodyFatPct: 9.4,
    rating: 94,
    rank: 3,
    province: 'Laguna',
    stats: { ppg: 14.8, rpg: 5.6, apg: 3.2, spg: 1.5, bpg: 0.6, fg_pct: 46.8, three_pct: 38.5, ft_pct: 82.1 },
    averages: { ppg: 14.8, rpg: 5.6, apg: 3.2, spg: 1.5, bpg: 0.6, fg_pct: 46.8 },
    radar: { perimeter_defense: 96, shooting: 93, court_vision: 90, athletic_drive: 94, stamina: 95 },
  },
  'pvML8aPEJxcvySCwLoI3Kt7cePW2': { // RJ Abarrientos
    firstName: 'RJ',
    lastName: 'Abarrientos',
    sport: 'Basketball',
    position: 'Point Guard',
    jersey: 3,
    heightCm: 180,
    weightKg: 77,
    wingspanCm: 188,
    verticalCm: 86,
    standingReachCm: 236,
    bodyFatPct: 9.1,
    rating: 91,
    rank: 4,
    province: 'Pangasinan',
    stats: { ppg: 13.9, rpg: 3.8, apg: 5.4, spg: 1.6, bpg: 0.2, fg_pct: 44.5, three_pct: 37.1, ft_pct: 85.0 },
    averages: { ppg: 13.9, rpg: 3.8, apg: 5.4, spg: 1.6, bpg: 0.2, fg_pct: 44.5 },
    radar: { playmaking: 94, handles: 95, outside_shooting: 92, clutch_factor: 93, speed: 91 },
  },
  'PB9XZyCMr5VdllbuHrSPCno1UGM2': { // Thirdy Ravena
    firstName: 'Thirdy',
    lastName: 'Ravena',
    sport: 'Basketball',
    position: 'Small Forward',
    jersey: 1,
    heightCm: 188,
    weightKg: 93,
    wingspanCm: 201,
    verticalCm: 99,
    standingReachCm: 248,
    bodyFatPct: 9.0,
    rating: 95,
    rank: 5,
    province: 'Iloilo',
    stats: { ppg: 16.2, rpg: 6.5, apg: 4.1, spg: 1.4, bpg: 0.8, fg_pct: 47.9, three_pct: 34.0, ft_pct: 79.5 },
    averages: { ppg: 16.2, rpg: 6.5, apg: 4.1, spg: 1.4, bpg: 0.8, fg_pct: 47.9 },
    radar: { athleticism: 99, defense: 94, rebounding: 92, transition: 96, motor: 98 },
  },

  // Volleyball
  '0C3PgWJq0HPPKRMEtLjCi31yKxj1': { // Mika Reyes
    firstName: 'Mika',
    lastName: 'Reyes',
    sport: 'Volleyball',
    position: 'Middle Blocker',
    jersey: 3,
    heightCm: 180,
    weightKg: 65,
    wingspanCm: 185,
    verticalCm: 74,
    standingReachCm: 238,
    bodyFatPct: 13.8,
    rating: 93,
    rank: 2,
    province: 'Bulacan',
    stats: { spike_kills: 11.2, block_points: 3.4, digs: 4.5, service_aces: 1.2, hitting_pct: 42.5 },
    averages: { spike_kills: 11.2, block_points: 3.4, digs: 4.5, service_aces: 1.2 },
    radar: { blocking: 97, quick_attack: 94, net_presence: 96, lateral_speed: 91, leadership: 93 },
  },
  'gZIiuL8RLsbxYOxJVmw2ZmrSYJ82': { // Alyssa Valdez
    firstName: 'Alyssa',
    lastName: 'Valdez',
    sport: 'Volleyball',
    position: 'Outside Hitter',
    jersey: 2,
    heightCm: 175,
    weightKg: 60,
    wingspanCm: 180,
    verticalCm: 81,
    standingReachCm: 232,
    bodyFatPct: 12.0,
    rating: 98,
    rank: 1,
    province: 'Batangas',
    stats: { spike_kills: 18.5, block_points: 1.8, digs: 8.2, service_aces: 2.1, hitting_pct: 46.0 },
    averages: { spike_kills: 18.5, block_points: 1.8, digs: 8.2, service_aces: 2.1 },
    radar: { attack_power: 99, backrow_attack: 98, clutch_scoring: 99, court_coverage: 95, floor_defense: 94 },
  },
  'QkbD58grtIOyCd2gVc656vDgCFI3': { // Bryan Bagunas
    firstName: 'Bryan',
    lastName: 'Bagunas',
    sport: 'Volleyball',
    position: 'Outside Hitter',
    jersey: 9,
    heightCm: 195,
    weightKg: 85,
    wingspanCm: 203,
    verticalCm: 99,
    standingReachCm: 258,
    bodyFatPct: 9.8,
    rating: 96,
    rank: 1,
    province: 'Batangas',
    stats: { spike_kills: 21.4, block_points: 2.8, digs: 6.5, service_aces: 2.4, hitting_pct: 51.5 },
    averages: { spike_kills: 21.4, block_points: 2.8, digs: 6.5, service_aces: 2.4 },
    radar: { vertical_reach: 99, jump_serve: 98, terminal_spike: 98, block_touch: 94, stamina: 95 },
  },
  'WMq0nKBbsFRIePuK70WPK8xah9w1': { // Jia Morado
    firstName: 'Jia',
    lastName: 'Morado',
    sport: 'Volleyball',
    position: 'Setter',
    jersey: 12,
    heightCm: 170,
    weightKg: 55,
    wingspanCm: 175,
    verticalCm: 66,
    standingReachCm: 222,
    bodyFatPct: 13.0,
    rating: 95,
    rank: 3,
    province: 'Manila',
    stats: { excellent_sets: 28.5, digs: 6.4, service_aces: 1.5, block_points: 0.8 },
    averages: { excellent_sets: 28.5, digs: 6.4, service_aces: 1.5, block_points: 0.8 },
    radar: { setting_accuracy: 99, decision_making: 99, ball_handling: 98, floor_defense: 92, leadership: 96 },
  },
  'ddtphv2tSqUFWPzwWoHaQBBCXSs2': { // Tots Carlos
    firstName: 'Tots',
    lastName: 'Carlos',
    sport: 'Volleyball',
    position: 'Opposite Hitter',
    jersey: 18,
    heightCm: 175,
    weightKg: 62,
    wingspanCm: 180,
    verticalCm: 79,
    standingReachCm: 232,
    bodyFatPct: 12.5,
    rating: 95,
    rank: 4,
    province: 'Pampanga',
    stats: { spike_kills: 17.8, block_points: 2.2, digs: 7.1, service_aces: 1.6, hitting_pct: 45.2 },
    averages: { spike_kills: 17.8, block_points: 2.2, digs: 7.1, service_aces: 1.6 },
    radar: { opposite_spike: 97, crosscourt_angle: 96, block_reading: 93, consistency: 95, energy: 97 },
  },
  'eDghzZGtzKbbSQiPoE7RWpmmwfL2': { // Marck Espejo
    firstName: 'Marck',
    lastName: 'Espejo',
    sport: 'Volleyball',
    position: 'Outside Hitter',
    jersey: 15,
    heightCm: 191,
    weightKg: 80,
    wingspanCm: 198,
    verticalCm: 97,
    standingReachCm: 252,
    bodyFatPct: 9.5,
    rating: 96,
    rank: 2,
    province: 'Marikina',
    stats: { spike_kills: 19.6, block_points: 2.5, digs: 7.8, service_aces: 2.2, hitting_pct: 49.0 },
    averages: { spike_kills: 19.6, block_points: 2.5, digs: 7.8, service_aces: 2.2 },
    radar: { all_around: 99, pipe_attack: 98, jump_serve: 97, defense: 93, high_ball: 96 },
  },
};

// ─── 2. Generic Athlete Fallback Generator ───────────────────────────────────

function generateGenericAthleteProfile(uid: string, existingData: any): AthleteSeedProfile {
  const rawSport = (existingData.sport_type || existingData.sport || existingData.sports_type || 'Basketball').toUpperCase();
  let sport: AthleteSeedProfile['sport'] = 'Basketball';
  if (rawSport.includes('SWIM')) sport = 'Swimming';
  else if (rawSport.includes('TRACK') || rawSport.includes('FIELD')) sport = 'Track and Field';
  else if (rawSport.includes('VOLLEY')) sport = 'Volleyball';

  const firstName = existingData.first_name || (existingData.full_name ? existingData.full_name.split(' ')[0] : 'Athlete');
  const lastName = existingData.last_name || (existingData.full_name ? existingData.full_name.split(' ').slice(1).join(' ') : 'Star');

  if (sport === 'Swimming') {
    return {
      uid,
      firstName,
      lastName,
      sport,
      position: 'Freestyle / Backstroke',
      eventType: '100m Freestyle',
      jersey: Math.floor(Math.random() * 8) + 1,
      heightCm: 175,
      weightKg: 68,
      wingspanCm: 183,
      verticalCm: 72,
      standingReachCm: 232,
      bodyFatPct: 11.5,
      rating: 91,
      rank: 10,
      province: existingData.province || 'Camarines Sur',
      stats: { times_50m_free: '00:25.80', times_100m: '00:56.40', personal_best: '00:56.40s', latest_mark: '00:57.10s', competitions: 5, podiums: 3, wins: 2 },
      averages: { pb_50m_free: '00:25.80', pb_100m_free: '00:56.40' },
      radar: { speed: 90, endurance: 91, stroke_power: 89, turn_efficiency: 92, reaction: 90 },
    };
  }

  if (sport === 'Track and Field') {
    return {
      uid,
      firstName,
      lastName,
      sport,
      position: '100m Dash',
      eventType: '100m Dash',
      jersey: Math.floor(Math.random() * 50) + 1,
      heightCm: 178,
      weightKg: 72,
      wingspanCm: 184,
      verticalCm: 84,
      standingReachCm: 235,
      bodyFatPct: 9.5,
      rating: 90,
      rank: 8,
      province: existingData.province || 'Camarines Sur',
      stats: { times_100m: '10.85s', personal_best: '10.85s', latest_mark: '11.02s', competitions: 5, podiums: 3, wins: 2 },
      averages: { pb_100m: '10.85s' },
      radar: { speed: 91, acceleration: 92, technique: 89, stamina: 88, explosiveness: 91 },
    };
  }

  if (sport === 'Volleyball') {
    return {
      uid,
      firstName,
      lastName,
      sport,
      position: 'Outside Hitter',
      jersey: Math.floor(Math.random() * 20) + 1,
      heightCm: 183,
      weightKg: 74,
      wingspanCm: 189,
      verticalCm: 82,
      standingReachCm: 242,
      bodyFatPct: 12.0,
      rating: 90,
      rank: 7,
      province: existingData.province || 'Camarines Sur',
      stats: { spike_kills: 14.2, block_points: 1.9, digs: 6.8, service_aces: 1.4 },
      averages: { spike_kills: 14.2, block_points: 1.9, digs: 6.8, service_aces: 1.4 },
      radar: { attack_power: 91, blocking: 89, floor_defense: 90, jumping: 92, leadership: 88 },
    };
  }

  // Basketball default
  return {
    uid,
    firstName,
    lastName,
    sport: 'Basketball',
    position: 'Shooting Guard',
    jersey: Math.floor(Math.random() * 30) + 1,
    heightCm: 188,
    weightKg: 84,
    wingspanCm: 196,
    verticalCm: 86,
    standingReachCm: 248,
    bodyFatPct: 10.0,
    rating: 90,
    rank: 6,
    province: existingData.province || 'Camarines Sur',
    stats: { ppg: 17.5, rpg: 5.2, apg: 4.8, spg: 1.4, bpg: 0.5, fg_pct: 47.8, three_pct: 36.2, ft_pct: 80.5 },
    averages: { ppg: 17.5, rpg: 5.2, apg: 4.8, spg: 1.4, bpg: 0.5, fg_pct: 47.8 },
    radar: { scoring: 90, playmaking: 89, defense: 88, shooting: 91, athleticism: 90 },
  };
}

// ─── 3. Main Seeding Routine ─────────────────────────────────────────────────

export async function seedAllAthletesComprehensive() {
  console.log('=== STARTING COMPREHENSIVE ATHLETE DATA SEEDING ===\n');

  // Step 1: Query all users with Athlete role
  const usersSnap = await db.collection('Users').get();
  const rawAthletesMap = new Map<string, any>();

  usersSnap.forEach((doc) => {
    const data = doc.data();
    if (String(data.role || '').toLowerCase() === 'athlete') {
      const cleanUid = (data.user_id || doc.id).replace(/^ath_/, '');
      rawAthletesMap.set(cleanUid, { docId: doc.id, ...data });
    }
  });

  // Step 2: Also query all documents in Athlete_Profiles
  const profilesSnap = await db.collection('Athlete_Profiles').get();
  profilesSnap.forEach((doc) => {
    const data = doc.data();
    const cleanUid = (data.user_id || doc.id).replace(/^ath_/, '');
    const existing = rawAthletesMap.get(cleanUid) || {};
    rawAthletesMap.set(cleanUid, { ...existing, profileDocId: doc.id, ...data });
  });

  console.log(`Identified ${rawAthletesMap.size} unique athlete accounts in database.`);

  const seededAthletesList: AthleteSeedProfile[] = [];

  // Step 3: Iterate and Populate Each Athlete
  for (const [cleanUid, rawData] of rawAthletesMap.entries()) {
    const template = KNOWN_ATHLETES[cleanUid] || {};
    const fallback = generateGenericAthleteProfile(cleanUid, rawData);

    const merged: AthleteSeedProfile = {
      uid: cleanUid,
      firstName: template.firstName || fallback.firstName,
      lastName: template.lastName || fallback.lastName,
      sport: template.sport || fallback.sport,
      position: template.position || fallback.position,
      eventType: template.eventType || fallback.eventType || template.position || fallback.position,
      jersey: template.jersey !== undefined ? template.jersey : fallback.jersey,
      heightCm: template.heightCm || fallback.heightCm,
      weightKg: template.weightKg || fallback.weightKg,
      wingspanCm: template.wingspanCm || fallback.wingspanCm,
      verticalCm: template.verticalCm || fallback.verticalCm,
      standingReachCm: template.standingReachCm || fallback.standingReachCm,
      bodyFatPct: template.bodyFatPct || fallback.bodyFatPct,
      rating: template.rating || fallback.rating,
      rank: template.rank || fallback.rank,
      teamId: template.teamId || rawData.team_id || (mergedTeamId(template.sport || fallback.sport)),
      teamName: template.teamName || rawData.team_name || (mergedTeamName(template.sport || fallback.sport)),
      coachId: template.coachId || rawData.coach_id || 'coach_mjbadte33tdex5qdsbcwq1sxqyt2',
      province: template.province || fallback.province,
      stats: template.stats || fallback.stats,
      averages: template.averages || fallback.averages,
      radar: template.radar || fallback.radar,
    };

    seededAthletesList.push(merged);

    const heightFt = `${Math.floor(merged.heightCm / 30.48)}'${Math.round((merged.heightCm % 30.48) / 2.54)}"`;
    const weightLbs = `${Math.round(merged.weightKg * 2.20462)} lbs`;
    const wingspanFt = `${Math.floor(merged.wingspanCm / 30.48)}'${Math.round((merged.wingspanCm % 30.48) / 2.54)}"`;
    const verticalIn = `${Math.round(merged.verticalCm / 2.54)}"`;
    const bmi = parseFloat((merged.weightKg / Math.pow(merged.heightCm / 100, 2)).toFixed(1));
    const apeIndex = parseFloat((merged.wingspanCm / merged.heightCm).toFixed(2));
    const nowIso = new Date().toISOString();

    const biometricsObj = {
      height_ft: heightFt,
      weight_lbs: weightLbs,
      wingspan_ft: wingspanFt,
      height_cm: merged.heightCm,
      weight_kg: merged.weightKg,
      wingspan_cm: merged.wingspanCm,
      vertical_jump_in: verticalIn,
      vertical_jump_cm: merged.verticalCm,
      vertical_leap_in: verticalIn,
      vertical_leap_cm: merged.verticalCm,
    };

    const physicalProfileObj = {
      height_cm: merged.heightCm,
      weight_kg: merged.weightKg,
      wingspan_cm: merged.wingspanCm,
      vertical_cm: merged.verticalCm,
      vertical_jump_cm: merged.verticalCm,
    };

    const computedMetricsObj = {
      bmi,
      ape_index: apeIndex,
      standing_reach_cm: merged.standingReachCm,
    };

    const eligibilityDocsObj = {
      psa_verified: true,
      academic_check: true,
      proof_of_residency: true,
      document_urls: ['https://storage.atleta.ph/documents/psa_verified.pdf'],
    };

    // A. Users Document Update
    const userDocRef = db.collection('Users').doc(cleanUid);
    await userDocRef.set({
      user_id: cleanUid,
      uid: cleanUid,
      first_name: merged.firstName,
      last_name: merged.lastName,
      full_name: `${merged.firstName} ${merged.lastName}`.trim(),
      role: 'Athlete',
      sport_type: merged.sport,
      sport: merged.sport,
      sports_type: merged.sport,
      position: merged.position,
      event_type: merged.eventType,
      event_distance: merged.eventType,
      jersey_number: merged.jersey,
      height_cm: merged.heightCm,
      weight_kg: merged.weightKg,
      wingspan_cm: merged.wingspanCm,
      height: heightFt,
      weight: weightLbs,
      wingspan: wingspanFt,
      biometrics: biometricsObj,
      physical_profile: physicalProfileObj,
      physical_attributes: physicalProfileObj,
      computed_metrics: computedMetricsObj,
      stats: merged.stats,
      averages: merged.averages,
      radar_competencies: merged.radar,
      rating_score: merged.rating,
      leaderboard_rank: merged.rank,
      rank: merged.rank,
      team_id: merged.teamId,
      team_name: merged.teamName,
      coach_id: merged.coachId,
      province: merged.province,
      location: merged.province,
      recruitment_status: merged.teamId ? 'Rostered' : 'Available',
      is_eligibility_verified: true,
      eligibility_documents: eligibilityDocsObj,
      is_approved: true,
      account_status: 'Active',
      status: 'active',
      updated_at: nowIso,
    }, { merge: true });

    // B. Athlete_Profiles Document Update (Both ath_uid and cleanUid)
    const athPayload = {
      athlete_id: `ath_${cleanUid}`,
      user_id: cleanUid,
      first_name: merged.firstName,
      last_name: merged.lastName,
      full_name: `${merged.firstName} ${merged.lastName}`.trim(),
      sport_type: merged.sport,
      sport: merged.sport,
      sports_type: merged.sport,
      position: merged.position,
      event_type: merged.eventType,
      event_distance: merged.eventType,
      jersey_number: merged.jersey,
      height_cm: merged.heightCm,
      weight_kg: merged.weightKg,
      wingspan_cm: merged.wingspanCm,
      biometrics: biometricsObj,
      physical_profile: physicalProfileObj,
      physical_attributes: physicalProfileObj,
      computed_metrics: computedMetricsObj,
      stats: merged.stats,
      averages: merged.averages,
      radar_competencies: merged.radar,
      rating_score: merged.rating,
      leaderboard_rank: merged.rank,
      rank: merged.rank,
      team_id: merged.teamId,
      team_name: merged.teamName,
      coach_id: merged.coachId,
      province: merged.province,
      location: merged.province,
      recruitment_status: merged.teamId ? 'Rostered' : 'Available',
      is_eligibility_verified: true,
      eligibility_documents: eligibilityDocsObj,
      updated_at: nowIso,
    };

    await db.collection('Athlete_Profiles').doc(`ath_${cleanUid}`).set(athPayload, { merge: true });
    await db.collection('Athlete_Profiles').doc(cleanUid).set(athPayload, { merge: true });

    // C. Anthropometric_Measurements Document Update
    const measId = `meas_ath_${cleanUid}`;
    await db.collection('Anthropometric_Measurements').doc(measId).set({
      measurement_id: measId,
      athlete_id: `ath_${cleanUid}`,
      user_id: cleanUid,
      recorded_by: merged.coachId || cleanUid,
      height_cm: merged.heightCm,
      weight_kg: merged.weightKg,
      wingspan_cm: merged.wingspanCm,
      standing_reach_cm: merged.standingReachCm,
      vertical_jump_cm: merged.verticalCm,
      body_fat_pct: merged.bodyFatPct,
      recorded_at: nowIso,
      created_at: nowIso,
      updated_at: nowIso,
    }, { merge: true });

    console.log(`[SEEDED] ${merged.firstName} ${merged.lastName} (${merged.sport}) - Ht: ${heightFt}, Wt: ${weightLbs}, Wing: ${wingspanFt}, Rating: ${merged.rating}`);
  }

  // Step 4: Seed Comprehensive Match Logs For All Sports
  console.log('\nSeeding Past Match Logs & Player Stats across all sports...');
  await seedComprehensiveMatchLogs(seededAthletesList);

  // Step 5: Sync Team Rosters
  console.log('\nSynchronizing Coach Team Rosters...');
  await syncTeamRosters(seededAthletesList);

  console.log('\n=== COMPREHENSIVE ATHLETE SEEDING COMPLETED SUCCESSFULLY ===');
}

function mergedTeamId(sport: string): string {
  if (sport === 'Swimming') return 'TEAM-014';
  if (sport === 'Track and Field') return 'TEAM-024';
  if (sport === 'Volleyball') return 'TEAM-013';
  return 't_green_archers';
}

function mergedTeamName(sport: string): string {
  if (sport === 'Swimming') return 'Ateneo Blue Fast';
  if (sport === 'Track and Field') return 'Ateneo Track & Field';
  if (sport === 'Volleyball') return 'Ateneo Blue Spikers';
  return 'Green Archers';
}

async function seedComprehensiveMatchLogs(athletes: AthleteSeedProfile[]) {
  const swimAthletes = athletes.filter(a => a.sport === 'Swimming');
  const trackAthletes = athletes.filter(a => a.sport === 'Track and Field');
  const bballAthletes = athletes.filter(a => a.sport === 'Basketball');
  const vballAthletes = athletes.filter(a => a.sport === 'Volleyball');

  const matches: any[] = [];

  // Track & Field Match 1
  if (trackAthletes.length > 0) {
    matches.push({
      match_id: 'm_tf_uaap_86_final',
      game_name: 'UAAP Season 86 Athletics Championship',
      match_name: 'UAAP Season 86 Athletics Championship',
      sport_type: 'Track and Field',
      match_date: '2026-11-05T08:00:00Z',
      home_team_name: 'Ateneo Track & Field',
      away_team_name: 'DLSU Green Tracksters',
      is_official: true,
      player_stats: trackAthletes.map((a, idx) => ({
        athlete_id: `ath_${a.uid}`,
        user_id: a.uid,
        player_name: `${a.firstName} ${a.lastName}`,
        team_name: 'Ateneo Track & Field',
        event: a.eventType || a.position || '100m Dash',
        event_name: a.eventType || a.position || '100m Dash',
        time: a.eventType?.includes('Hurdle') || a.position.includes('Hurdle') ? '48.98' : a.eventType?.includes('100m') ? '10.25' : '',
        finish_time: a.eventType?.includes('Hurdle') || a.position.includes('Hurdle') ? '48.98' : a.eventType?.includes('100m') ? '10.25' : '',
        distance_m: a.eventType?.includes('Vault') ? 6.00 : a.eventType?.includes('Jump') ? 8.08 : a.eventType?.includes('Shot') ? 20.40 : 0,
        rank: idx === 0 ? 1 : idx === 1 ? 2 : 3,
        place: idx === 0 ? 1 : idx === 1 ? 2 : 3,
      })),
    });

    matches.push({
      match_id: 'm_tf_natl_open_2026',
      game_name: 'Philippine National Open Invitational',
      match_name: 'Philippine National Open Invitational',
      sport_type: 'Track and Field',
      match_date: '2026-10-20T09:00:00Z',
      home_team_name: 'Ateneo Track & Field',
      away_team_name: 'National Invitational Team',
      is_official: true,
      player_stats: trackAthletes.map((a, idx) => ({
        athlete_id: `ath_${a.uid}`,
        user_id: a.uid,
        player_name: `${a.firstName} ${a.lastName}`,
        team_name: 'Ateneo Track & Field',
        event: a.eventType || a.position || '100m Dash',
        event_name: a.eventType || a.position || '100m Dash',
        time: a.eventType?.includes('Hurdle') || a.position.includes('Hurdle') ? '49.60' : a.eventType?.includes('100m') ? '10.45' : '',
        finish_time: a.eventType?.includes('Hurdle') || a.position.includes('Hurdle') ? '49.60' : a.eventType?.includes('100m') ? '10.45' : '',
        distance_m: a.eventType?.includes('Vault') ? 5.92 : a.eventType?.includes('Jump') ? 7.95 : a.eventType?.includes('Shot') ? 19.80 : 0,
        rank: idx === 0 ? 1 : 2,
        place: idx === 0 ? 1 : 2,
      })),
    });
  }

  // Swimming Match 1
  if (swimAthletes.length > 0) {
    matches.push({
      match_id: 'm_swim_jesse_robredo_cup',
      game_name: 'Jesse Robredo Swim Cup 2026',
      match_name: 'Jesse Robredo Swim Cup 2026',
      sport_type: 'Swimming',
      match_date: '2026-11-08T09:00:00Z',
      home_team_name: 'Ateneo Blue Fast',
      away_team_name: 'Camarines Aqua Club',
      is_official: true,
      player_stats: swimAthletes.map((a, idx) => ({
        athlete_id: `ath_${a.uid}`,
        user_id: a.uid,
        player_name: `${a.firstName} ${a.lastName}`,
        team_name: 'Ateneo Blue Fast',
        event: a.eventType || '100m Freestyle',
        event_name: a.eventType || '100m Freestyle',
        time: a.eventType?.includes('50m') ? '00:24.82' : a.eventType?.includes('200m Back') ? '02:13.20' : a.eventType?.includes('Fly') ? '00:52.87' : '00:53.66',
        finish_time: a.eventType?.includes('50m') ? '00:24.82' : a.eventType?.includes('200m Back') ? '02:13.20' : a.eventType?.includes('Fly') ? '00:52.87' : '00:53.66',
        split_time: '00:25.80',
        rank: idx === 0 ? 1 : idx === 1 ? 1 : 2,
        place: idx === 0 ? 1 : idx === 1 ? 1 : 2,
      })),
    });

    matches.push({
      match_id: 'm_swim_uaap_championship',
      game_name: 'UAAP Swimming Championships 2026',
      match_name: 'UAAP Swimming Championships 2026',
      sport_type: 'Swimming',
      match_date: '2026-10-18T10:00:00Z',
      home_team_name: 'Ateneo Blue Fast',
      away_team_name: 'UST Golden Sea Tigers',
      is_official: true,
      player_stats: swimAthletes.map((a, idx) => ({
        athlete_id: `ath_${a.uid}`,
        user_id: a.uid,
        player_name: `${a.firstName} ${a.lastName}`,
        team_name: 'Ateneo Blue Fast',
        event: a.eventType || '100m Freestyle',
        event_name: a.eventType || '100m Freestyle',
        time: a.eventType?.includes('50m') ? '00:25.10' : a.eventType?.includes('200m Back') ? '02:14.50' : a.eventType?.includes('Fly') ? '00:53.25' : '00:54.20',
        finish_time: a.eventType?.includes('50m') ? '00:25.10' : a.eventType?.includes('200m Back') ? '02:14.50' : a.eventType?.includes('Fly') ? '00:53.25' : '00:54.20',
        split_time: '00:26.10',
        rank: idx === 0 ? 1 : 2,
        place: idx === 0 ? 1 : 2,
      })),
    });
  }

  // Basketball Matches
  if (bballAthletes.length > 0) {
    matches.push({
      match_id: 'm_bball_uaap_ateneo_vs_dlsu',
      game_name: 'UAAP Finals Game 1',
      match_name: 'UAAP Finals Game 1',
      sport_type: 'Basketball',
      match_date: '2026-11-02T16:00:00Z',
      home_team_name: 'Green Archers',
      away_team_name: 'Ateneo Blue Eagles',
      home_score: 84,
      away_score: 79,
      game_result: 'WIN',
      is_official: true,
      player_stats: bballAthletes.map((a, idx) => ({
        athlete_id: `ath_${a.uid}`,
        user_id: a.uid,
        player_name: `${a.firstName} ${a.lastName}`,
        team_name: idx % 2 === 0 ? 'Green Archers' : 'Ateneo Blue Eagles',
        jersey_number: a.jersey,
        position: a.position,
        points: 14 + (idx % 12),
        pts: 14 + (idx % 12),
        rebounds: 6 + (idx % 6),
        reb: 6 + (idx % 6),
        assists: 4 + (idx % 5),
        ast: 4 + (idx % 5),
        steals: 1 + (idx % 3),
        stl: 1 + (idx % 3),
        blocks: idx % 2,
        blk: idx % 2,
        fg_made: 6,
        fgm: 6,
        fg_attempted: 13,
        fga: 13,
        minutes: 28,
        min: 28,
      })),
    });
  }

  // Volleyball Matches
  if (vballAthletes.length > 0) {
    matches.push({
      match_id: 'm_vball_pvl_finals',
      game_name: 'PVL Open Conference Championship',
      match_name: 'PVL Open Conference Championship',
      sport_type: 'Volleyball',
      match_date: '2026-10-28T18:00:00Z',
      home_team_name: 'Ateneo Blue Spikers',
      away_team_name: 'F2 Logistics',
      home_score: 3,
      away_score: 1,
      game_result: 'WIN',
      is_official: true,
      player_stats: vballAthletes.map((a, idx) => ({
        athlete_id: `ath_${a.uid}`,
        user_id: a.uid,
        player_name: `${a.firstName} ${a.lastName}`,
        team_name: 'Ateneo Blue Spikers',
        jersey_number: a.jersey,
        position: a.position,
        spike_kills: 16 + (idx % 6),
        kills: 16 + (idx % 6),
        block_points: 2 + (idx % 3),
        blocks: 2 + (idx % 3),
        digs: 7 + (idx % 5),
        service_aces: 1 + (idx % 2),
        aces: 1 + (idx % 2),
        sets_played: 4,
      })),
    });
  }

  for (const m of matches) {
    await db.collection('Match_Logs').doc(m.match_id).set(m, { merge: true });
    console.log(`[MATCH LOG SEEDED] ${m.game_name} (${m.sport_type}) with ${m.player_stats?.length || 0} athletes`);
  }
}

async function syncTeamRosters(athletes: AthleteSeedProfile[]) {
  // Group athletes by their assigned team
  const teamsMap = new Map<string, AthleteSeedProfile[]>();
  for (const a of athletes) {
    if (a.teamId) {
      const list = teamsMap.get(a.teamId) || [];
      list.push(a);
      teamsMap.set(a.teamId, list);
    }
  }

  for (const [teamId, teamAthletes] of teamsMap.entries()) {
    const tDocRef = db.collection('Teams').doc(teamId);
    const tDoc = await tDocRef.get();
    if (!tDoc.exists) continue;

    const rosterList = teamAthletes.map((a) => ({
      athlete_id: `ath_${a.uid}`,
      user_id: a.uid,
      first_name: a.firstName,
      last_name: a.lastName,
      full_name: `${a.firstName} ${a.lastName}`.trim(),
      position: a.eventType || a.position,
      event_type: a.eventType || a.position,
      event_distance: a.eventType || a.position,
      jersey_number: a.jersey,
      is_eligibility_verified: true,
      added_at: new Date().toISOString(),
    }));

    await tDocRef.set({
      roster_list: rosterList,
      athlete_count: rosterList.length,
      updated_at: new Date().toISOString(),
    }, { merge: true });

    console.log(`[ROSTER SYNCED] Team ${teamId} updated with ${rosterList.length} athletes.`);
  }
}

if (require.main === module) {
  seedAllAthletesComprehensive()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('Fatal error during seeding:', err);
      process.exit(1);
    });
}
