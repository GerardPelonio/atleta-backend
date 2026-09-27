import { db } from '../utils/firebaseAdmin';
import { registerUserService } from '../services/userService';
import { submitRecruitmentInquiry } from '../services/coachInquiryService';
import { dispatchRecruitmentProposal } from '../services/scoutingService';
import dotenv from 'dotenv';
dotenv.config();

async function seedAthleteData() {
  console.log('🌱 [SEEDING ATHLETE DATA] Starting...');

  const timestamp = Date.now();
  const athleteEmail = `jerom.lastimosa_${timestamp}@atleta.com`;
  const coachEmail = `nash.racela_${timestamp}@atleta.com`;

  // 1. Register Athlete with nested physical_profile, eligibility_documents and achievements
  console.log(`Registering athlete: ${athleteEmail}...`);
  const athleteResult = await registerUserService({
    first_name: 'Jerom',
    last_name: 'Lastimosa',
    email: athleteEmail,
    password: 'Password123!',
    contact_number: '09171112233',
    role: 'Athlete',
    birthdate: '2001-08-14',
    gender: 'Male',
    province: 'Camarines Sur',
    sport_type: 'Basketball',
    rank: 1,
    physical_profile: {
      height_cm: 188,
      weight_kg: 85,
      wingspan_cm: 195,
    },
    eligibility_documents: {
      psa_verified: true,
      academic_check: true,
      proof_of_residency: true,
      document_urls: ['PSA_BirthCertificate_Verified.pdf', 'HighSchool_Transcript.pdf'],
    },
    achievements: [
      {
        title: 'Season MVP',
        year: '2025',
        content: 'Awarded Most Valuable Player in National Collegiate League.',
      },
    ],
  });

  const athleteId = athleteResult.profile.athlete_id;
  console.log(`Athlete registered successfully with ID: ${athleteId}`);

  // 2. Register Coach (needed for recruitment inquiry)
  console.log(`Registering coach: ${coachEmail}...`);
  const coachResult = await registerUserService({
    first_name: 'Nash',
    last_name: 'Racela',
    email: coachEmail,
    password: 'Password123!',
    contact_number: '09174445566',
    role: 'Coach',
    years_of_experience: 15,
    current_institution: 'Adamson University',
    professional_documents: ['FIBA_Coach_License.pdf'],
  });

  const coachId = coachResult.profile.coach_id;
  console.log(`Coach registered successfully with ID: ${coachId}`);

  // 3. Submit an Inquiry from Athlete to Coach
  console.log('Sending recruitment inquiry from Athlete to Coach...');
  const inquiry = await submitRecruitmentInquiry(
    athleteId,
    coachId,
    'Hi Coach, I am Jerom Lastimosa. I would love to join your team for UAAP Season 88!',
  );
  console.log(`Recruitment inquiry sent successfully with scout ID: ${inquiry.scout_id}`);

  // 4. Coach dispatches a proposal BACK to the Athlete → creates a real Notification for the athlete
  console.log('Coach dispatching recruitment proposal back to Athlete...');
  const coachUserId = coachResult.user.user_id;
  const proposal = await dispatchRecruitmentProposal(
    coachId,
    athleteId,
    'We have reviewed your profile and would like to invite you to trial with Adamson Falcons!',
  );
  console.log(`Proposal dispatched with scout ID: ${proposal.scout_id}`);

  // The notification recipient is the athlete's raw Firebase UID (ath_ prefix stripped)
  const athleteRawUid = athleteId.replace(/^ath_/, '');
  console.log(`→ Notification written to Firestore with recipient_id: ${athleteRawUid}`);

  // 5. Seed Workload_Analysis document
  console.log('Seeding Workload_Analysis document for athlete...');
  const workloadId = `workload_${Date.now()}`;
  await db.collection('Workload_Analysis').doc(workloadId).set({
    entry_id: workloadId,
    athlete_id: athleteId,
    user_id: athleteRawUid,
    acute_load: 450,
    chronic_load: 400,
    acwr: 1.125,
    injury_risk_level: 'Optimal',
    date_calculated: new Date().toISOString(),
  });
  console.log(`✅ Workload_Analysis record created with ID: ${workloadId}`);

  // 6. Seed Anthropometric_Measurements document
  console.log('Seeding Anthropometric_Measurements document for athlete...');
  const anthroId = `anthro_${Date.now()}`;
  await db.collection('Anthropometric_Measurements').doc(anthroId).set({
    measurement_id: anthroId,
    athlete_id: athleteId,
    user_id: athleteRawUid,
    height_cm: 188,
    weight_kg: 85,
    wingspan_cm: 195,
    body_fat_percentage: 10.5,
    recorded_at: new Date().toISOString(),
  });
  console.log(`✅ Anthropometric_Measurements record created with ID: ${anthroId}`);

  console.log('\n✅ [SEEDING ATHLETE DATA] Seeding completed successfully!');
  console.log(`Athlete Email: ${athleteEmail}`);
  console.log(`Athlete ID:    ${athleteId}`);
  console.log(`Coach ID:      ${coachId}`);
  console.log(`Password:      Password123!\n`);
  process.exit(0);
}

seedAthleteData().catch((err) => {
  console.error('❌ Seeding failed:', err);
  process.exit(1);
});
