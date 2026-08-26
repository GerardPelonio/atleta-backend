import { db } from '../utils/firebaseAdmin';
import { logSrpeEntry, getAthleteWorkloadSummary, setAthleteWorkloadTarget } from '../services/workloadService';
import { getAthleteProfile } from '../services/athleteService';

function formatDateOffset(daysAgo: number): string {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return d.toISOString().split('T')[0];
}

async function seedSampleDataAndTest() {
  console.log('🚀 Seeding realistic Workload Analytics & Testing Athlete/Coach flows...\n');

  // 1. Target Athletes: include existing users and test account
  const athleteSnap = await db.collection('Users').where('role', '==', 'Athlete').get();
  const athleteList = athleteSnap.docs.map(d => ({
    uid: d.id,
    email: d.data().email,
    name: `${d.data().first_name || 'Athlete'} ${d.data().last_name || ''}`.trim()
  }));

  console.log(`Found ${athleteList.length} athlete accounts in Firestore.`);

  // Sample 7-day training schedule template
  const sampleSchedule = [
    { daysAgo: 6, duration: 60, srpe: 6, type: 'Cardio & Conditioning', notes: 'Morning interval run' },
    { daysAgo: 5, duration: 75, srpe: 7, type: 'Tactical Practice', notes: 'Full-court scrimmage drills' },
    { daysAgo: 4, duration: 45, srpe: 5, type: 'Strength Training', notes: 'Core and lower body' },
    { daysAgo: 3, duration: 90, srpe: 8, type: 'Scrimmage Match', notes: 'High intensity 5v5' },
    { daysAgo: 2, duration: 0,  srpe: 0, type: 'Rest / Active Recovery', notes: 'Recovery day' },
    { daysAgo: 1, duration: 60, srpe: 7, type: 'Skill Drills', notes: 'Shooting and ball handling' },
    { daysAgo: 0, duration: 60, srpe: 7, type: 'Team Practice', notes: 'Pre-game walkthrough' },
  ];

  for (const athlete of athleteList) {
    const athleteId = athlete.uid;
    const canonicalId = athleteId.startsWith('ath_') ? athleteId : `ath_${athleteId}`;
    console.log(`\n📦 Seeding workout logs for ${athlete.name} (${athlete.email})...`);

    // A. Seed past 7 days of workout entries
    for (const session of sampleSchedule) {
      if (session.duration > 0 && session.srpe > 0) {
        await logSrpeEntry({
          athlete_id: canonicalId,
          session_duration_mins: session.duration,
          srpe_score: session.srpe,
          entry_date: formatDateOffset(session.daysAgo),
          session_type: session.type,
          notes: session.notes,
        });
      }
    }

    // B. Set Coach 7-Day Target & Intensity Guide
    await setAthleteWorkloadTarget('coach_head_01', canonicalId, {
      target_7day_effort_pts: 480,
      target_intensity: 8,
      notes: 'Maintain target intensity 7-8/10 for upcoming tournament preparation',
    });

    // C. Verify resulting athlete profile
    const profile = await getAthleteProfile(canonicalId);
    const workload = profile.workload_analytics;
    const target = profile.workload_target;

    console.log(`✅ Athlete: ${profile.full_name} (${profile.sport_type})`);
    console.log(`   • 7-Day Acute Load: ${workload?.current_7day_acute_load || workload?.acute_load_7day_avg} Effort Pts`);
    console.log(`   • 28-Day Baseline: ${workload?.current_28day_chronic_load || workload?.chronic_load_28day_avg} Baseline Pts`);
    console.log(`   • Calculated ACWR (Fatigue Meter): ${workload?.calculated_acwr}`);
    console.log(`   • Latest Workout Score: ${workload?.workout_score} pts`);
    console.log(`   • Routine Score (Consistency): ${workload?.routine_score}`);
    console.log(`   • Body Stress (Strain): ${workload?.body_stress_pts || workload?.body_stress} pts`);
    console.log(`   • Coach Assigned Target: ${target?.target_7day_effort_pts} Pts (Target Intensity: ${target?.target_intensity}/10)`);
    console.log(`   • 7-Day Training Log entries count: ${workload?.weekly_logs?.length || 0}`);
  }

  console.log('\n==========================================================');
  console.log('🎉 ALL SAMPLE WORKLOAD DATA SUCCESSFULLY SEEDED & VERIFIED!');
  console.log('==========================================================');
}

seedSampleDataAndTest()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Seeding error:', err);
    process.exit(1);
  });
