import { auth, dbV1, dbV2 } from '../utils/firebaseAdmin';
import { registerUserService, registerCoachService } from '../services/userService';

async function testSignups() {
  console.log('--- Testing Athlete Signup Flow ---');
  const athletePayload = {
    role: 'Athlete',
    first_name: 'Test',
    last_name: 'Athlete',
    email: `test_ath_${Date.now()}@example.com`,
    password: 'password123',
    contact_number: '09123456789',
    birthdate: '2004-05-15',
    gender: 'Male',
    province: 'Camarines Sur',
    sport_type: 'Basketball',
    position: 'Point Guard',
    jersey_number: 7,
  };

  const athRes = await registerUserService(athletePayload);
  console.log('✔ Athlete registered successfully:', athRes.user.user_id, athRes.user.email);

  console.log('\n--- Testing Coach Signup Flow ---');
  const coachPayload = {
    role: 'Coach',
    first_name: 'Test',
    last_name: 'Coach',
    email: `test_coach_${Date.now()}@example.com`,
    password: 'password123',
    contact_number: '09123456780',
    years_of_experience: 5,
    current_institution: 'Ateneo de Naga University',
    regional_affiliation: 'Bicol Region',
    national_sports_league: 'UAAP',
    professional_documents: ['coach_license.pdf'],
  };

  const coachRes = await registerCoachService(coachPayload);
  console.log('✔ Coach registered successfully:', coachRes.user.user_id, coachRes.user.email);

  // Clean up the created test accounts from Auth and DB
  console.log('\n--- Cleaning up test records ---');
  await auth.deleteUser(athRes.user.user_id).catch(() => {});
  await auth.deleteUser(coachRes.user.user_id).catch(() => {});
  await dbV1.collection('Users').doc(athRes.user.user_id).delete().catch(() => {});
  await dbV1.collection('Users').doc(coachRes.user.user_id).delete().catch(() => {});
  await dbV1.collection('Athlete_Profiles').doc(`ath_${athRes.user.user_id}`).delete().catch(() => {});
  await dbV1.collection('Coach_Profiles').doc(`coach_${coachRes.user.user_id}`).delete().catch(() => {});

  await dbV2.collection('Users').doc(athRes.user.user_id).delete().catch(() => {});
  await dbV2.collection('Users').doc(coachRes.user.user_id).delete().catch(() => {});
  await dbV2.collection('Athlete_Profiles').doc(`ath_${athRes.user.user_id}`).delete().catch(() => {});
  await dbV2.collection('Coach_Profiles').doc(`coach_${coachRes.user.user_id}`).delete().catch(() => {});

  console.log('✔ Test cleanup complete.');
}

testSignups().catch(console.error);
