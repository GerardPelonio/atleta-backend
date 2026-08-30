import { createTeam, getCoachTeams } from '../services/teamService';
import { submitRecruitmentInquiry, getAthleteInquiries, respondToRecruitmentInquiry, getPublicCoachProfile } from '../services/coachInquiryService';
import { submitRecruitmentProposal } from '../services/scoutingService';
import { calculateIndividualSportMetrics } from '../services/matchService';
import { db } from '../utils/firebaseAdmin';

async function runTests() {
  console.log('--- STARTING BACKEND VERIFICATION TESTS ---');

  // Test 1: Team creation with & without division, without region
  console.log('\n[1] Testing Team Creation...');
  const testCoachId = 'coach_test_user_001';
  
  const team1 = await createTeam(testCoachId, {
    team_name: `Default Division Team ${Date.now()}`,
    sport_type: 'Basketball',
  });
  console.log('Created team with no division specified -> Division:', team1.division);
  if (team1.division !== 'Varsity Division') throw new Error(`Expected division to default to "Varsity Division", got: ${team1.division}`);

  const team2 = await createTeam(testCoachId, {
    team_name: `Custom Division Team ${Date.now()}`,
    sport_type: 'Volleyball',
    division: 'Division 2 - Juniors',
  });
  console.log('Created team with custom division -> Division:', team2.division);
  if (team2.division !== 'Division 2 - Juniors') throw new Error(`Expected division "Division 2 - Juniors", got: ${team2.division}`);

  // Test 2: Calculate individual sport metrics (Swimming & Track)
  console.log('\n[2] Testing Sport Distance & Details Metrics...');
  const swimMetrics = calculateIndividualSportMetrics({
    event_name: '50m Freestyle',
    distance_meters: 50,
    finish_time_ms: 24500,
    split_times_ms: [11500, 13000],
  });
  console.log('Swimming Metrics ->', swimMetrics.enrichedStats);
  if (swimMetrics.enrichedStats.distance !== '50m' || swimMetrics.enrichedStats.distance_meters !== 50) {
    throw new Error('Distance fields not properly set on swimming metrics');
  }

  const trackMetrics = calculateIndividualSportMetrics({
    distance: '100m',
    timer_seconds: 10.85,
  });
  console.log('Track & Field Metrics ->', trackMetrics.enrichedStats);
  if (trackMetrics.enrichedStats.distance !== '100m' || trackMetrics.enrichedStats.distance_meters !== 100) {
    throw new Error('Distance fields not properly set on track & field metrics');
  }

  // Test 3: Coach-to-Athlete Scouting Proposal & Athlete Inquiries visibility
  console.log('\n[3] Testing Inquiries & Scouting Proposals...');
  const testAthleteId = `ath_test_${Date.now()}`;
  const testScoutCoachId = 'coach_test_scout';

  // Seed mock athlete profile & user
  await db.collection('Athlete_Profiles').doc(testAthleteId).set({
    athlete_id: testAthleteId,
    sport_type: 'Basketball',
    province: 'Manila',
  });
  await db.collection('Users').doc(testAthleteId.replace('ath_', '')).set({
    first_name: 'Jordan',
    last_name: 'Clarkson',
    email: 'jordan@atleta.ph',
    role: 'Athlete',
  });

  // Coach sends proposal to athlete
  const proposal = await submitRecruitmentProposal(testScoutCoachId, testAthleteId, 'We would like to recruit you for our varsity team.');
  console.log('Coach sent proposal to athlete:', proposal.scout_id, 'Status:', proposal.offer_status);

  // Athlete queries inquiries
  const athleteInquiries = await getAthleteInquiries(testAthleteId);
  console.log(`Athlete fetched ${athleteInquiries.length} inquiries/proposals.`);
  const foundProposal = athleteInquiries.find((inq) => inq.scout_id === proposal.scout_id);
  if (!foundProposal) {
    throw new Error('Coach-initiated proposal was NOT found in getAthleteInquiries result!');
  }
  console.log('Successfully found coach-initiated proposal in athlete inquiries:', foundProposal.offer_message);

  // Athlete responds to proposal (Accepted)
  const responseResult = await respondToRecruitmentInquiry(proposal.scout_id, testAthleteId, 'Accepted');
  console.log('Athlete responded to proposal ->', responseResult);

  // Test 4: In-memory Caching
  console.log('\n[4] Testing Fast In-Memory Caching...');
  const t0 = Date.now();
  await getPublicCoachProfile('coach-001');
  const duration1 = Date.now() - t0;

  const t1 = Date.now();
  await getPublicCoachProfile('coach-001');
  const duration2 = Date.now() - t1;
  console.log(`First fetch: ${duration1}ms | Second cached fetch: ${duration2}ms`);

  console.log('\n✅ ALL VERIFICATION TESTS PASSED SUCCESSFULLY!\n');
  process.exit(0);
}

runTests().catch((err) => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
