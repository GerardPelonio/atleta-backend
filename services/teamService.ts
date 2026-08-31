import { db } from '../utils/firebaseAdmin';
import {
  Team,
  TeamRosterMember,
  RosterAthlete,
  TeamSummary,
  TeamDetailResponse,
  AthleteTeamResponse,
  CreateTeamDto,
  UpdateRosterItem,
} from '../models/teamModel';

export class ServiceError extends Error {
  statusCode: number;
  constructor(message: string, statusCode: number = 400) {
    super(message);
    this.statusCode = statusCode;
    Object.setPrototypeOf(this, ServiceError.prototype);
  }
}

// ─── Helper: Enrich coach from Coach_Profiles + Users ───────────────────────

async function enrichCoach(coachId: string): Promise<{
  coach_id: string;
  full_name: string;
  years_of_experience: number;
  current_institution: string;
  quote: string | null;
}> {
  let coachDoc = await db.collection('Coach_Profiles').doc(coachId).get();

  // Fallback to stripping 'coach_' prefix if needed
  if (!coachDoc.exists && coachId.startsWith('coach_')) {
    const rawUid = coachId.replace('coach_', '');
    coachDoc = await db.collection('Coach_Profiles').doc(rawUid).get();
  }

  const coachData = coachDoc.exists ? coachDoc.data()! : {};

  let firstName = coachData.first_name || '';
  let lastName = coachData.last_name || '';

  // If names not on coach profile, fetch from Users collection via user_id
  if ((!firstName || !lastName) && coachData.user_id) {
    const userDoc = await db.collection('Users').doc(coachData.user_id).get();
    if (userDoc.exists) {
      const userData = userDoc.data()!;
      firstName = firstName || userData.first_name || '';
      lastName = lastName || userData.last_name || '';
    }
  }

  return {
    coach_id: coachId,
    full_name: `${firstName || 'Coach'} ${lastName || ''}`.trim(),
    years_of_experience: coachData.years_of_experience || 0,
    current_institution: coachData.current_institution || '',
    quote: coachData.quote || null,
  };
}

// ─── Helper: Enrich roster athletes with computed eligibility verification ───

async function enrichRoster(rosterList: (string | TeamRosterMember)[]): Promise<RosterAthlete[]> {
  if (!rosterList || rosterList.length === 0) return [];

  const roster: RosterAthlete[] = [];

  for (const item of rosterList) {
    const athleteId = typeof item === 'string' ? item : item.athlete_id;
    const positionOverride = typeof item === 'object' ? item.position : undefined;
    const jerseyOverride = typeof item === 'object' ? item.jersey_number : undefined;

    const profileDoc = await db.collection('Athlete_Profiles').doc(athleteId).get();
    const profileData = profileDoc.exists ? profileDoc.data()! : {};

    let firstName = profileData.first_name || '';
    let lastName = profileData.last_name || '';

    // Fallback to Users collection
    if (!firstName || !lastName) {
      const userDoc = await db.collection('Users').doc(profileData.user_id || athleteId).get();
      if (userDoc.exists) {
        const userData = userDoc.data()!;
        firstName = firstName || userData.first_name || 'Athlete';
        lastName = lastName || userData.last_name || '';
      }
    }

    // eligibility_documents is now an object: { psa_verified, academic_check, proof_of_residency, document_urls }
    const eligDocs = profileData.eligibility_documents;
    const isVerified =
      eligDocs && typeof eligDocs === 'object' && !Array.isArray(eligDocs)
        ? eligDocs.psa_verified === true
        : Array.isArray(eligDocs) && eligDocs.length > 0;

    roster.push({
      athlete_id: athleteId,
      user_id: profileData.user_id || athleteId,
      first_name: firstName || 'Athlete',
      last_name: lastName || '',
      position: positionOverride || profileData.position || 'Unassigned',
      jersey_number: jerseyOverride !== undefined ? jerseyOverride : (profileData.jersey_number ?? null),
      sport_type: profileData.sport_type || '',
      avatar_url: profileData.avatar_url || undefined,
      eligibility_documents: eligDocs || [],
      is_eligibility_verified: isVerified,
    });
  }

  return roster;
}

// ─── Service Functions ──────────────────────────────────────────────────────

/**
 * Create a new team instance (POST /api/v1/teams).
 */
export async function createTeam(coachId: string, payload: CreateTeamDto): Promise<Team> {
  const teamId = `t_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
  const now = new Date().toISOString();

  const newTeam: Record<string, any> = {
    team_id: teamId,
    team_name: payload.team_name.trim(),
    sport_type: payload.sport_type.trim(),
    division: (payload.division && payload.division.trim().length > 0) ? payload.division.trim() : 'Varsity Division',
    established_year: payload.established_year || new Date().getFullYear(),
    season_record: { wins: 0, losses: 0 },
    coach_id: coachId,
    roster_list: Array.isArray(payload.roster_list) ? payload.roster_list : [],
    timestamp: now,
  };

  if (payload.region) newTeam.region = payload.region.trim();
  if (payload.description) newTeam.description = payload.description.trim();
  if (payload.mission_statement) newTeam.mission_statement = payload.mission_statement.trim();

  await db.collection('Teams').doc(teamId).set(newTeam);

  // Link team to Coach_Profiles document (handles both coach_<uid> and raw uid)
  const canonicalCoachId = coachId.startsWith('coach_') ? coachId : `coach_${coachId}`;
  const coachDocRef = db.collection('Coach_Profiles').doc(canonicalCoachId);
  const coachDoc = await coachDocRef.get();

  if (coachDoc.exists) {
    const existingTeams = coachDoc.data()?.teams_managed || [];
    const updatedTeams = Array.from(new Set([...existingTeams, teamId]));
    await coachDocRef.set(
      {
        team_id: teamId,
        teams_managed: updatedTeams,
        updated_at: new Date(),
      },
      { merge: true },
    );
  }

  return newTeam as Team;
}

/**
 * Retrieve all teams managed by a specific coach (GET /api/v1/teams?coachId=).
 */
export async function getCoachTeams(coachId: string): Promise<TeamSummary[]> {
  const possibleCoachIds = [coachId, `coach_${coachId}`, coachId.replace('coach_', '')];

  const snapshot = await db
    .collection('Teams')
    .where('coach_id', 'in', possibleCoachIds)
    .get();

  const teams: TeamSummary[] = [];

  for (const doc of snapshot.docs) {
    const data = doc.data() as Team;
    const coach = await enrichCoach(data.coach_id);

    teams.push({
      team_id: data.team_id,
      team_name: data.team_name,
      sport_type: data.sport_type,
      division: data.division || 'Varsity Division',
      region: data.region || undefined,
      season_record: data.season_record || { wins: 0, losses: 0 },
      athlete_count: data.roster_list ? data.roster_list.length : 0,
      coach_name: coach.full_name,
      coach_id: data.coach_id,
      established_year: data.established_year,
    });
  }

  return teams;
}

/**
 * Browse team directory with optional sport and search filters.
 */
export async function browseTeamDirectory(
  sport?: string,
  search?: string,
  coachId?: string,
): Promise<TeamSummary[]> {
  if (coachId) {
    return getCoachTeams(coachId);
  }

  let query: FirebaseFirestore.Query = db.collection('Teams');

  if (sport && sport.trim().length > 0) {
    query = query.where('sport_type', '==', sport.trim());
  }

  const snapshot = await query.get();
  const teams: TeamSummary[] = [];

  for (const doc of snapshot.docs) {
    const data = doc.data() as Team;

    if (search && search.trim().length > 0) {
      const searchLower = search.trim().toLowerCase();
      if (!data.team_name.toLowerCase().includes(searchLower)) {
        continue;
      }
    }

    const coach = await enrichCoach(data.coach_id);

    teams.push({
      team_id: data.team_id,
      team_name: data.team_name,
      sport_type: data.sport_type,
      division: data.division || 'Varsity Division',
      region: data.region || undefined,
      season_record: data.season_record || { wins: 0, losses: 0 },
      athlete_count: data.roster_list ? data.roster_list.length : 0,
      coach_name: coach.full_name,
      coach_id: data.coach_id,
      established_year: data.established_year,
    });
  }

  return teams;
}

/**
 * Get full team details including coach info and enriched roster with eligibility status.
 * GET /api/v1/teams/:teamId
 */
export async function getTeamDetails(teamId: string): Promise<TeamDetailResponse | null> {
  const teamDoc = await db.collection('Teams').doc(teamId).get();

  if (!teamDoc.exists) {
    return null;
  }

  const data = teamDoc.data() as Team;
  const coach = await enrichCoach(data.coach_id);
  const roster = await enrichRoster(data.roster_list || []);

  return {
    team_id: data.team_id,
    team_name: data.team_name,
    sport_type: data.sport_type,
    division: data.division || 'Varsity Division',
    region: data.region || undefined,
    season_record: data.season_record || { wins: 0, losses: 0 },
    description: data.description || null,
    mission_statement: data.mission_statement || null,
    established_year: data.established_year || null,
    athlete_count: data.roster_list ? data.roster_list.length : 0,
    coach,
    roster,
    timestamp: data.timestamp,
  };
}

/**
 * Update team squad roster, player positions, jersey numbers, and check athlete eligibility.
 * PATCH /api/v1/teams/:teamId/roster
 *
 * ACCEPTANCE CRITERIA:
 * 1. Requires coach ownership authorization (403 Forbidden if not team manager).
 * 2. Blocks roster confirmation if any added athlete has unverified/missing eligibility documents, unless override_unverified: true.
 */
export async function updateTeamRoster(
  coachId: string,
  teamId: string,
  rosterItems: UpdateRosterItem[],
  overrideUnverified: boolean = false,
) {
  const teamDoc = await db.collection('Teams').doc(teamId).get();

  if (!teamDoc.exists) {
    throw new ServiceError(`Team with ID '${teamId}' not found.`, 404);
  }

  const teamData = teamDoc.data() as Team;

  // Authorization check: Coach may only edit teams they manage
  const isOwner =
    teamData.coach_id === coachId ||
    teamData.coach_id === `coach_${coachId}` ||
    teamData.coach_id.replace('coach_', '') === coachId;

  if (!isOwner) {
    throw new ServiceError(
      'Unauthorized. Coaches may only edit squad rosters for teams they manage.',
      403,
    );
  }

  // Check eligibility documents for all athletes in roster
  const unverifiedAthletes: string[] = [];
  const updatedRosterMembers: TeamRosterMember[] = [];

  for (const item of rosterItems) {
    const athleteId = item.athlete_id;
    const profileDoc = await db.collection('Athlete_Profiles').doc(athleteId).get();
    const profileData = profileDoc.exists ? profileDoc.data()! : {};

    let firstName = profileData.first_name || '';
    let lastName = profileData.last_name || '';

    if (!firstName || !lastName) {
      const userDoc = await db.collection('Users').doc(profileData.user_id || athleteId).get();
      if (userDoc.exists) {
        const userData = userDoc.data()!;
        firstName = firstName || userData.first_name || 'Athlete';
        lastName = lastName || userData.last_name || '';
      }
    }

    const eligDocs = profileData.eligibility_documents;
    const isVerified =
      eligDocs && typeof eligDocs === 'object' && !Array.isArray(eligDocs)
        ? eligDocs.psa_verified === true
        : Array.isArray(eligDocs) && eligDocs.length > 0;

    const docs = Array.isArray(eligDocs)
      ? eligDocs
      : eligDocs?.document_urls || [];

    if (!isVerified) {
      unverifiedAthletes.push(`${firstName} ${lastName}`.trim() || athleteId);
    }

    // Update position and jersey_number on Athlete_Profiles
    const athleteUpdates: Record<string, any> = { updated_at: new Date() };
    if (item.position) athleteUpdates.position = item.position.trim();
    if (item.jersey_number !== undefined) athleteUpdates.jersey_number = Number(item.jersey_number);

    if (profileDoc.exists) {
      await db.collection('Athlete_Profiles').doc(athleteId).set(athleteUpdates, { merge: true });
    }

    const userId = profileData.user_id || athleteId;

    updatedRosterMembers.push({
      athlete_id: athleteId,
      user_id: userId,
      first_name: firstName || 'Athlete',
      last_name: lastName || '',
      position: item.position ? item.position.trim() : (profileData.position || 'Unassigned'),
      jersey_number: item.jersey_number !== undefined ? Number(item.jersey_number) : (profileData.jersey_number ?? undefined),
      added_at: new Date().toISOString(),
      eligibility_documents: docs,
      is_eligibility_verified: isVerified,
    });
  }

  // ACCEPTANCE CRITERIA: Block roster confirmation if unverified athletes exist and override_unverified is false
  if (unverifiedAthletes.length > 0 && !overrideUnverified) {
    throw new ServiceError(
      `Roster confirmation blocked. The following athlete(s) have unverified or missing eligibility documents: [${unverifiedAthletes.join(', ')}]. Provide 'override_unverified: true' to bypass or notify the athlete to submit eligibility documents.`,
      400,
    );
  }

  // Update roster_list in Firestore Teams document with full athlete details
  await db.collection('Teams').doc(teamId).set(
    {
      roster_list: updatedRosterMembers,
      timestamp: new Date().toISOString(),
    },
    { merge: true },
  );

  return getTeamDetails(teamId);
}

export async function updateTeam(
  coachId: string,
  teamId: string,
  data: Partial<CreateTeamDto> & { roster?: UpdateRosterItem[]; override_unverified?: boolean; organization?: string },
) {
  const teamDoc = await db.collection('Teams').doc(teamId).get();
  if (!teamDoc.exists) {
    throw new ServiceError(`Team with ID '${teamId}' not found.`, 404);
  }

  const teamData = teamDoc.data() as Team;
  const isOwner =
    teamData.coach_id === coachId ||
    teamData.coach_id === `coach_${coachId}` ||
    teamData.coach_id.replace('coach_', '') === coachId;

  if (!isOwner) {
    throw new ServiceError('Unauthorized. Coaches may only edit teams they manage.', 403);
  }

  const updates: Record<string, any> = {
    timestamp: new Date().toISOString(),
  };

  const anyData = data as any;
  if (anyData.team_name) updates.team_name = anyData.team_name.trim();
  if (anyData.sport_type) updates.sport_type = anyData.sport_type.trim();
  if (anyData.age_group) updates.age_group = anyData.age_group.trim();
  if (anyData.gender) updates.gender = anyData.gender.trim();
  if (anyData.institution_or_org) updates.institution_or_org = anyData.institution_or_org.trim();
  if (anyData.organization) updates.institution_or_org = anyData.organization.trim();

  await db.collection('Teams').doc(teamId).set(updates, { merge: true });

  if (data.roster && Array.isArray(data.roster)) {
    return await updateTeamRoster(coachId, teamId, data.roster, !!data.override_unverified);
  }

  return await getTeamDetails(teamId);
}

export function matchesSportCategory(athleteSport?: string, athletePosition?: string, targetSport?: string): boolean {
  if (!targetSport || targetSport.toUpperCase() === 'ALL') return true;
  const target = targetSport.toUpperCase().trim();
  const sport = (athleteSport || '').toUpperCase().trim();
  const pos = (athletePosition || '').toUpperCase().trim();

  if (target.includes('BASKET')) {
    if (sport.includes('BASKET')) return true;
    if (['POINT GUARD', 'SHOOTING GUARD', 'SMALL FORWARD', 'POWER FORWARD', 'CENTER', 'GUARD', 'FORWARD'].some(p => pos.includes(p))) return true;
    return !sport;
  }

  if (target.includes('SWIM')) {
    if (sport.includes('SWIM')) return true;
    if (['FREESTYLE', 'BUTTERFLY', 'BREASTSTROKE', 'BACKSTROKE', 'MEDLEY', 'SWIMMER', '50M', '100M', '200M'].some(p => pos.includes(p))) return true;
    return false;
  }

  if (target.includes('TRACK') || target.includes('FIELD')) {
    if (sport.includes('TRACK') || sport.includes('FIELD')) return true;
    if (['SPRINT', 'HURDLES', 'RELAY', 'LONG JUMP', 'HIGH JUMP', 'JAVELIN', 'SHOT PUT', 'DISCUS', 'RUNNER', '100M SPRINT'].some(p => pos.includes(p))) return true;
    return false;
  }

  return sport === target;
}

/**
 * Autocomplete search registered athletes by name, ID, position, or email across Users, Athlete_Profiles, and Teams.roster_list collections.
 * Optionally filtered by sportType.
 * GET /api/v1/athletes/search?query=&sport=
 */
export async function searchAthletes(queryStr?: string, sportType?: string) {
  const resultsMap = new Map<string, RosterAthlete>();
  const queryLower = (queryStr || '').trim().toLowerCase();

  // Fetch collections in parallel to eliminate N+1 roundtrips
  const [usersSnapshot, profilesSnapshot, teamsSnapshot] = await Promise.all([
    db.collection('Users').get(),
    db.collection('Athlete_Profiles').get(),
    db.collection('Teams').get(),
  ]);

  const profilesMap = new Map<string, any>();
  profilesSnapshot.docs.forEach((doc) => {
    profilesMap.set(doc.id, doc.data());
  });

  const usersMap = new Map<string, any>();
  usersSnapshot.docs.forEach((doc) => {
    usersMap.set(doc.id, doc.data());
  });

  // 1. Search Users collection for all registered user accounts with role === 'Athlete' or 'Player'
  for (const userDoc of usersSnapshot.docs) {
    const u = userDoc.data();
    const role = (u.role || '').toString().toLowerCase();

    if (role.includes('athlete') || role.includes('player') || role === 'user' || !u.role) {
      const uid = userDoc.id;
      const firstName = u.first_name || '';
      const lastName = u.last_name || '';
      const fullName = `${firstName} ${lastName}`.trim();
      const athleteId = u.athlete_id || uid;

      const p = profilesMap.get(uid) || profilesMap.get(athleteId) || {};

      const docs = Array.isArray(p.eligibility_documents)
        ? p.eligibility_documents
        : Array.isArray(u.eligibility_documents)
        ? u.eligibility_documents
        : [];

      const athleteObj: RosterAthlete = {
        athlete_id: athleteId,
        user_id: uid,
        first_name: firstName || 'Athlete',
        last_name: lastName || '',
        position: p.position || u.position || 'Unassigned',
        jersey_number: p.jersey_number ?? u.jersey_number ?? null,
        sport_type: p.sport_type || u.sport_type || '',
        avatar_url: p.avatar_url || u.avatar_url || undefined,
        eligibility_documents: docs,
        is_eligibility_verified: docs.length > 0,
      };

      const searchHaystack = `${fullName} ${athleteObj.position} ${athleteId} ${uid} ${u.email || ''}`.toLowerCase();
      if (!queryLower || searchHaystack.includes(queryLower)) {
        resultsMap.set(athleteId, athleteObj);
      }
    }
  }

  // 2. Search Athlete_Profiles collection for any profiles
  for (const profileDoc of profilesSnapshot.docs) {
    const p = profileDoc.data();
    const athleteId = p.athlete_id || profileDoc.id;

    if (!resultsMap.has(athleteId)) {
      const uid = p.user_id || profileDoc.id;
      const u = usersMap.get(uid) || {};
      let firstName = p.first_name || u.first_name || '';
      let lastName = p.last_name || u.last_name || '';

      const docs = Array.isArray(p.eligibility_documents) ? p.eligibility_documents : [];
      const athleteObj: RosterAthlete = {
        athlete_id: athleteId,
        user_id: uid,
        first_name: firstName || 'Athlete',
        last_name: lastName || '',
        position: p.position || 'Unassigned',
        jersey_number: p.jersey_number ?? null,
        sport_type: p.sport_type || u.sport_type || '',
        avatar_url: p.avatar_url || undefined,
        eligibility_documents: docs,
        is_eligibility_verified: docs.length > 0,
      };

      const searchHaystack = `${firstName} ${lastName} ${athleteObj.position} ${athleteId}`.toLowerCase();
      if (!queryLower || searchHaystack.includes(queryLower)) {
        resultsMap.set(athleteId, athleteObj);
      }
    }
  }

  // 3. Search Teams collection roster_list array for any athletes
  for (const teamDoc of teamsSnapshot.docs) {
    const teamData = teamDoc.data() as Team;
    if (Array.isArray(teamData.roster_list)) {
      for (const item of teamData.roster_list) {
        if (typeof item === 'object' && item.athlete_id) {
          const athleteId = item.athlete_id;
          if (!resultsMap.has(athleteId)) {
            const firstName = item.first_name || 'Athlete';
            const lastName = item.last_name || '';
            const docs = Array.isArray(item.eligibility_documents) ? item.eligibility_documents : [];

            const athleteObj: RosterAthlete = {
              athlete_id: athleteId,
              user_id: item.user_id || athleteId,
              first_name: firstName,
              last_name: lastName,
              position: item.position || 'Unassigned',
              jersey_number: item.jersey_number ?? null,
              sport_type: teamData.sport_type || '',
              eligibility_documents: docs,
              is_eligibility_verified: item.is_eligibility_verified ?? (docs.length > 0),
            };

            const searchHaystack = `${firstName} ${lastName} ${athleteObj.position} ${athleteId}`.toLowerCase();
            if (!queryLower || searchHaystack.includes(queryLower)) {
              resultsMap.set(athleteId, athleteObj);
            }
          }
        }
      }
    }
  }

  const allAthletes = Array.from(resultsMap.values());
  if (!sportType || sportType.toUpperCase() === 'ALL') {
    return allAthletes;
  }

  return allAthletes.filter((a) => matchesSportCategory(a.sport_type, a.position, sportType));
}

/**
 * Get athlete's current team.
 */
export async function getAthleteTeam(athleteId: string): Promise<AthleteTeamResponse | null> {
  const snapshot = await db.collection('Teams').get();

  let matchedDoc: FirebaseFirestore.QueryDocumentSnapshot | null = null;
  for (const doc of snapshot.docs) {
    const data = doc.data() as Team;
    if (Array.isArray(data.roster_list)) {
      const found = data.roster_list.some((item) =>
        typeof item === 'string' ? item === athleteId : item.athlete_id === athleteId,
      );
      if (found) {
        matchedDoc = doc;
        break;
      }
    }
  }

  if (!matchedDoc) {
    return null;
  }

  const teamData = matchedDoc.data() as Team;
  const coach = await enrichCoach(teamData.coach_id).catch(() => ({
    coach_id: teamData.coach_id,
    full_name: 'Coach',
    current_institution: '',
  }));

  const roster = await enrichRoster(teamData.roster_list || []).catch(() => []);

  return {
    athlete_id: athleteId,
    team: {
      team_id: teamData.team_id,
      team_name: teamData.team_name,
      sport_type: teamData.sport_type,
      division: teamData.division || 'Varsity',
      region: teamData.region,
      description: teamData.description || null,
    },
    coach: {
      coach_id: coach.coach_id,
      full_name: coach.full_name,
      current_institution: coach.current_institution,
    },
    roster,
  };
}
