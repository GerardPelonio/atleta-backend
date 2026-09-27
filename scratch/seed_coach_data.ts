import { db } from '../utils/firebaseAdmin';
import { registerUserService } from '../services/userService';
import { createTeam, updateTeamRoster } from '../services/teamService';
import { submitMatchSession } from '../services/matchService';
import { dispatchRecruitmentProposal } from '../services/scoutingService';
import dotenv from 'dotenv';
dotenv.config();

async function seedCoachData() {
  console.log('🌱 [SEEDING COACH DATA] Starting clean baseline setup...');

  const timestamp = Date.now();
  const coachEmail = `nash.racela_${timestamp}@atleta.com`;
  const athleteEmail = `jerom.lastimosa_${timestamp}@atleta.com`;

  // 1. Register Coach
  console.log(`Registering Coach: ${coachEmail}...`);
  const coachResult = await registerUserService({
    first_name: 'Nash',
    last_name: 'Racela',
    email: coachEmail,
    password: 'Password123!',
    contact_number: '09171112233',
    role: 'Coach',
    years_of_experience: 15,
    current_institution: 'Adamson University',
    professional_documents: ['FIBA_Coach_License.pdf'],
  });
  const coachId = coachResult.profile.coach_id;

  // 2. Register Athlete (for team roster & recruitment demo)
  console.log(`Registering Athlete: ${athleteEmail}...`);
  const athleteResult = await registerUserService({
    first_name: 'Jerom',
    last_name: 'Lastimosa',
    email: athleteEmail,
    password: 'Password123!',
    contact_number: '09174445566',
    role: 'Athlete',
    birthdate: '2001-08-14',
    gender: 'Male',
    province: 'Camarines Sur',
    sport_type: 'Basketball',
    physical_profile: { height_cm: 188, weight_kg: 85, wingspan_cm: 195 },
    eligibility_documents: {
      psa_verified: true,
      academic_check: true,
      proof_of_residency: true,
      document_urls: ['PSA_Verified.pdf'],
    },
  });
  const athleteId = athleteResult.profile.athlete_id;

  // 3. Create Team Instance
  console.log('Creating Team Instance: Adamson Falcons...');
  const team = await createTeam(coachId, {
    team_name: 'Adamson Falcons',
    sport_type: 'Basketball',
    division: 'Varsity',
    region: 'NCR',
    description: 'Adamson University Men Basketball Team',
  });

  // 4. Update Roster
  console.log('Rostering athlete to Adamson Falcons...');
  await updateTeamRoster(coachId, team.team_id, [
    { athlete_id: athleteId, position: 'Point Guard', jersey_number: 7 },
  ]);

  // 5. Log Match Session
  console.log('Logging Match Session vs Ateneo Blue Eagles...');
  const matchResult = await submitMatchSession(
    coachId,
    {
      team_id: team.team_id,
      sport_type: 'Basketball',
      match_type: 'Unofficial',
      match_date: new Date().toISOString(),
      location: 'Smart Araneta Coliseum',
      opponent_team_name: 'Ateneo Blue Eagles',
      game_result: 'WIN',
      player_stats: [
        {
          athlete_id: athleteId,
          stats: { points: 28, rebounds: 6, assists: 9, fg_made: 10, fg_attempted: 16, ft_made: 5, ft_attempted: 5 },
        },
      ],
    },
    `idemp_seed_${timestamp}`,
  );

  // 6. Dispatch Scouting Proposal
  console.log('Dispatching recruitment proposal to athlete...');
  const proposal = await dispatchRecruitmentProposal(
    coachId,
    athleteId,
    'We invite you to trial for Adamson Falcons for UAAP Season 88!',
  );

  console.log('\n✅ [SEEDING COACH DATA] Seeding completed successfully!');
  console.log('───────────────────────────────────────────────────────');
  console.log(`Coach Email:      ${coachEmail}`);
  console.log(`Coach Password:   Password123!`);
  console.log(`Coach ID:         ${coachId}`);
  console.log(`Team ID:          ${team.team_id}`);
  console.log(`Match ID:         ${matchResult.match.match_id}`);
  console.log(`Athlete Email:    ${athleteEmail}`);
  console.log(`Athlete ID:       ${athleteId}`);
  console.log(`Proposal Scout ID:${proposal.scout_id}`);
  console.log('───────────────────────────────────────────────────────\n');
  process.exit(0);
}

seedCoachData().catch((err) => {
  console.error('❌ Seeding failed:', err);
  process.exit(1);
});
