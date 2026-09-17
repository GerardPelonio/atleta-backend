import { db } from '../utils/firebaseAdmin';
import { respondToRecruitmentInquiry } from '../services/coachInquiryService';
import { searchRegionalAthletes } from '../services/scoutingService';
import { submitMatchSession } from '../services/matchService';
import { getCoachManagedAthletes } from '../services/teamService';

async function runSweepTest() {
  console.log('🧪 Starting Phase 1 & 5 End-to-End Verification Sweep...\n');

  const testCoachId = `test_coach_${Date.now()}`;
  const testAthleteId = `ath_test_${Date.now()}`;
  const testInquiryId = `inq_test_${Date.now()}`;
  const testMatchId = `match_test_${Date.now()}`;
  const testIdempKey = `idemp_test_${Date.now()}`;

  try {
    // 1. Seed test coach and athlete
    console.log('1️⃣ Seeding Test Coach and Athlete Profile...');
    await db.collection('Coach_Profiles').doc(testCoachId).set({
      coach_id: testCoachId,
      full_name: 'Coach Phase1 Tester',
      email: 'coachtest@phase1.com',
      sport_type: 'BASKETBALL',
      athletes_managed: [],
      matches_logged: 0,
    });
    await db.collection('Coach_Profiles').doc(`coach_${testCoachId}`).set({
      coach_id: `coach_${testCoachId}`,
      full_name: 'Coach Phase1 Tester',
      email: 'coachtest@phase1.com',
      sport_type: 'BASKETBALL',
      athletes_managed: [],
      matches_logged: 0,
    });

    await db.collection('Athlete_Profiles').doc(testAthleteId).set({
      athlete_id: testAthleteId,
      user_id: testAthleteId,
      full_name: 'Recruited Superstar',
      email: 'athlete@phase1.com',
      sport_type: 'BASKETBALL',
      sport_category: 'BASKETBALL',
      position: 'Point Guard',
      region: 'NCR',
      division: 'Division 1',
      stats: { ppg: 25.5, apg: 8.2, rpg: 5.0 },
      is_scoutable: true,
      is_eligible: true,
    });

    // Seed recruitment inquiry
    await db.collection('Recruitment_Inquiries').doc(testInquiryId).set({
      inquiry_id: testInquiryId,
      coach_id: testCoachId,
      athlete_id: testAthleteId,
      status: 'pending',
      created_at: new Date().toISOString(),
    });

    console.log('✅ Seeding complete.');

    // 2. Test Inquiry Acceptance & Coach athletes_managed update
    console.log('\n2️⃣ Testing respondToRecruitmentInquiry (ACCEPT)...');
    const inquiryResult = await respondToRecruitmentInquiry(testInquiryId, testAthleteId, 'Accepted');
    console.log('Inquiry result:', inquiryResult?.message || inquiryResult?.offer_status);

    const updatedCoachDoc = await db.collection('Coach_Profiles').doc(testCoachId).get();
    const coachData = updatedCoachDoc.data();
    const managed = coachData?.athletes_managed || [];
    console.log(`Coach athletes_managed count: ${managed.length}`);
    const foundRecruited = managed.some((a: any) => a.athlete_id === testAthleteId);
    if (!foundRecruited) {
      throw new Error('❌ Test Failed: Athlete was not added to coach athletes_managed array!');
    }
    console.log('✅ Coach athletes_managed array updated successfully on inquiry acceptance.');

    // 2.1 Test getCoachManagedAthletes
    console.log('\n2️⃣.1 Testing getCoachManagedAthletes (GET /coaches/athletes backend service)...');
    const managedAthletes = await getCoachManagedAthletes(testCoachId);
    console.log(`getCoachManagedAthletes returned ${managedAthletes.length} athletes.`);
    const foundInManaged = managedAthletes.some((a: any) => a.athlete_id === testAthleteId || a.user_id === testAthleteId);
    if (!foundInManaged) {
      throw new Error('❌ Test Failed: getCoachManagedAthletes did not return recruited athlete!');
    }
    console.log('✅ getCoachManagedAthletes returned recruited athlete successfully.');

    // 3. Test Regional Scouting Exclusion
    console.log('\n3️⃣ Testing searchRegionalAthletes (Recruited player exclusion)...');
    const discoveryResults = await searchRegionalAthletes({
      coachId: testCoachId,
      sport_type: 'BASKETBALL',
      region: 'NCR',
    });
    const foundInDiscovery = discoveryResults.some((a: any) => a.athlete_id === testAthleteId);
    if (foundInDiscovery) {
      throw new Error('❌ Test Failed: Recruited athlete still appeared in regional discovery results!');
    }
    console.log('✅ Recruited athlete strictly excluded from coach discovery search results.');

    // 4. Test Match Logging, Idempotency, and Coach matches_logged increment
    console.log('\n4️⃣ Testing submitMatchSession (Match Logging & Deduplication)...');
    const matchPayload: any = {
      match_id: testMatchId,
      team_id: 'team_phase1_alpha',
      home_team_name: 'Alpha Titans',
      away_team_name: 'Beta Warriors',
      home_score: 95,
      away_score: 90,
      sport_type: 'Basketball',
      match_type: 'Regular',
      match_date: new Date().toISOString(),
      location: 'Central Arena',
      player_stats: [
        {
          athlete_id: testAthleteId,
          player_name: 'Recruited Superstar',
          team_name: 'Alpha Titans',
          stats: { points: 28, assists: 9, rebounds: 6 },
        },
      ],
    };

    const firstSubmit = await submitMatchSession(testCoachId, matchPayload, testIdempKey);
    console.log('First submit response message:', firstSubmit?.message);

    // Check coach matches_logged
    const coachAfterMatch = (await db.collection('Coach_Profiles').doc(testCoachId).get()).data();
    console.log(`Coach matches_logged: ${coachAfterMatch?.matches_logged}`);
    if ((coachAfterMatch?.matches_logged || 0) < 1) {
      throw new Error('❌ Test Failed: Coach matches_logged was not incremented!');
    }
    console.log('✅ Coach matches_logged successfully incremented.');

    // 5. Test Deduplication
    console.log('\n5️⃣ Testing Deduplication with same Idempotency Key & Match ID...');
    const duplicateSubmit = await submitMatchSession(testCoachId, matchPayload, testIdempKey);
    console.log('Duplicate submit response message:', duplicateSubmit?.message);
    const coachAfterDuplicate = (await db.collection('Coach_Profiles').doc(testCoachId).get()).data();
    if (coachAfterDuplicate?.matches_logged !== coachAfterMatch?.matches_logged) {
      throw new Error('❌ Test Failed: Duplicate match caused extra increment!');
    }
    console.log('✅ Duplicate insertion prevented; cached response returned cleanly.');

    console.log('\n🎉 ALL PHASE 1 & 5 BACKEND VERIFICATION TESTS PASSED SUCCESSFULLY!');
  } finally {
    // Clean up test documents
    console.log('\n🧹 Cleaning up test documents...');
    await db.collection('Coach_Profiles').doc(testCoachId).delete().catch(() => null);
    await db.collection('Coach_Profiles').doc(`coach_${testCoachId}`).delete().catch(() => null);
    await db.collection('Athlete_Profiles').doc(testAthleteId).delete().catch(() => null);
    await db.collection('Athlete_Profiles').doc(`ath_${testAthleteId}`).delete().catch(() => null);
    await db.collection('Recruitment_Inquiries').doc(testInquiryId).delete().catch(() => null);
    await db.collection('Match_Logs').doc(testMatchId).delete().catch(() => null);
    await db.collection('Idempotency_Keys').doc(testIdempKey).delete().catch(() => null);
    console.log('✅ Cleanup complete.');
  }
}

runSweepTest().catch((err) => {
  console.error('💥 Test suite failed with error:', err);
  process.exit(1);
});
