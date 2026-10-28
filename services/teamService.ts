import { db } from '../utils/firebaseAdmin';
import { serverCache } from '../utils/cache';
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
import { PastTeamAffiliation, PastTeamStatsSummary } from '../models/athleteModel';
import { createNotification } from './notificationService';

export class ServiceError extends Error {
  statusCode: number;
  constructor(message: string, statusCode: number = 400) {
    super(message);
    this.statusCode = statusCode;
    Object.setPrototypeOf(this, ServiceError.prototype);
  }
}

// ─── In-Memory Cache for Team Directory, Coach Enrichment, and Roster ────────
interface CachedItem<T> {
  data: T;
  cachedAt: number;
}
const teamDirectoryCache = new Map<string, CachedItem<TeamSummary[]>>();
const coachSummaryCache = new Map<string, CachedItem<{ coach_id: string; full_name: string; years_of_experience: number; current_institution: string; quote: string | null; avatar_url?: string }>>();
const rosterAthleteCache = new Map<string, CachedItem<RosterAthlete>>();
const coachTeamsCache = new Map<string, CachedItem<TeamSummary[]>>();
const coachManagedAthletesCache = new Map<string, CachedItem<any[]>>();

const TEAM_CACHE_TTL_MS = 60000; // 60s cache for directory
const ATHLETE_CACHE_TTL_MS = 60000; // 60s cache for roster athletes
const COACH_TEAMS_TTL_MS = 60000; // 60s cache for coach teams
const COACH_ATHLETES_TTL_MS = 60000; // 60s cache for coach managed athletes

export function invalidateTeamCache() {
  teamDirectoryCache.clear();
  coachSummaryCache.clear();
  rosterAthleteCache.clear();
  coachTeamsCache.clear();
  coachManagedAthletesCache.clear();
  try {
    serverCache.clear();
  } catch (_) {}
}

// ─── Helper: Enrich coach from Coach_Profiles + Users ───────────────────────

async function enrichCoach(coachId?: string): Promise<{
  coach_id: string;
  full_name: string;
  years_of_experience: number;
  current_institution: string;
  quote: string | null;
  avatar_url?: string;
}> {
  if (!coachId || typeof coachId !== 'string' || !coachId.trim()) {
    return {
      coach_id: '',
      full_name: 'No Coach Assigned',
      years_of_experience: 0,
      current_institution: 'Athletic Program',
      quote: null,
      avatar_url: '',
    };
  }

  const rawCoachId = coachId.trim();
  const rawUid = rawCoachId.replace(/^coach_/, '');
  const canonicalCoachId = rawCoachId.startsWith('coach_') ? rawCoachId : `coach_${rawCoachId}`;

  const cached = coachSummaryCache.get(rawCoachId);
  if (cached && Date.now() - cached.cachedAt < TEAM_CACHE_TTL_MS * 5) {
    return cached.data;
  }

  let coachDoc = await db.collection('Coach_Profiles').doc(canonicalCoachId).get();
  if (!coachDoc.exists) {
    coachDoc = await db.collection('Coach_Profiles').doc(rawUid).get();
  }
  if (!coachDoc.exists) {
    coachDoc = await db.collection('Coach_Profiles').doc(rawCoachId).get();
  }

  const coachData = coachDoc.exists ? coachDoc.data()! : {};

  let firstName = coachData.first_name || '';
  let lastName = coachData.last_name || '';
  let fullName = coachData.full_name || '';
  let institution = coachData.current_institution || coachData.institution || '';
  let quote = coachData.quote || null;
  let experience = Number(coachData.years_of_experience || coachData.years_experience || 0);
  let avatarUrl = coachData.avatar_url || coachData.profile_image || '';

  // Look up Users collection across all possible ID variants
  const lookupIds = [coachData.user_id, rawUid, canonicalCoachId, rawCoachId].filter(Boolean) as string[];
  for (const uid of lookupIds) {
    if (fullName && institution && experience && avatarUrl) break;
    const userDoc = await db.collection('Users').doc(uid).get();
    if (userDoc.exists) {
      const userData = userDoc.data()!;
      firstName = firstName || userData.first_name || '';
      lastName = lastName || userData.last_name || '';
      fullName = fullName || userData.full_name || '';
      institution = institution || userData.current_institution || userData.institution || '';
      quote = quote || userData.quote || null;
      experience = experience || Number(userData.years_of_experience || userData.years_experience || 0);
      avatarUrl = avatarUrl || userData.avatar_url || userData.profile_image || userData.photo_url || '';
    }
  }

  if (!fullName) {
    if (firstName || lastName) {
      fullName = `${firstName} ${lastName}`.trim();
    } else {
      fullName = 'No Coach Assigned';
    }
  }

  const result = {
    coach_id: rawCoachId,
    full_name: fullName,
    years_of_experience: experience,
    current_institution: institution || 'Athletic Program',
    quote: quote,
    avatar_url: avatarUrl || '',
  };

  coachSummaryCache.set(rawCoachId, { data: result, cachedAt: Date.now() });
  return result;
}

// ─── Helper: Enrich roster athletes with computed eligibility verification ───

async function enrichRoster(rosterList: (string | TeamRosterMember)[]): Promise<RosterAthlete[]> {
  if (!rosterList || rosterList.length === 0) return [];

  const rosterPromises = rosterList.map(async (item) => {
    if (!item) return null;
    const athleteId = typeof item === 'string' ? item : (item.athlete_id || (item as any).user_id);
    if (!athleteId || typeof athleteId !== 'string' || !athleteId.trim()) return null;

    const positionOverride = typeof item === 'object' ? item.position : undefined;
    const jerseyOverride = typeof item === 'object' ? item.jersey_number : undefined;

    const cleanId = athleteId.trim().replace(/^ath_/, '');
    const canonicalAthleteId = athleteId.startsWith('ath_') ? athleteId.trim() : `ath_${cleanId}`;

    const cachedAth = rosterAthleteCache.get(canonicalAthleteId) || rosterAthleteCache.get(cleanId);
    if (cachedAth && Date.now() - cachedAth.cachedAt < ATHLETE_CACHE_TTL_MS) {
      return {
        ...cachedAth.data,
        ...(positionOverride ? { position: positionOverride } : {}),
        ...(jerseyOverride !== undefined ? { jersey_number: jerseyOverride } : {}),
      };
    }

    const [prof1, prof2, u1, u2] = await Promise.all([
      db.collection('Athlete_Profiles').doc(canonicalAthleteId).get().catch(() => null),
      db.collection('Athlete_Profiles').doc(cleanId).get().catch(() => null),
      db.collection('Users').doc(cleanId).get().catch(() => null),
      db.collection('Users').doc(canonicalAthleteId).get().catch(() => null),
    ]);

    const p1 = (prof1 && prof1.exists) ? prof1.data()! : {};
    const p2 = (prof2 && prof2.exists) ? prof2.data()! : {};
    const profileData = { ...p2, ...p1 };

    const ud1 = (u1 && u1.exists) ? u1.data()! : {};
    const ud2 = (u2 && u2.exists) ? u2.data()! : {};
    const userData = { ...ud2, ...ud1 };

    const firstName = userData.first_name || profileData.first_name || '';
    const lastName = userData.last_name || profileData.last_name || '';
    const fullName = profileData.full_name || userData.full_name || (firstName ? `${firstName} ${lastName}`.trim() : 'Athlete');

    const eligDocs = profileData.eligibility_documents;
    const isVerified =
      eligDocs && typeof eligDocs === 'object' && !Array.isArray(eligDocs)
        ? eligDocs.psa_verified === true
        : Array.isArray(eligDocs) && eligDocs.length > 0;

    const statusVal = profileData.player_status || profileData.playerStatus || userData.player_status || userData.playerStatus || 'Active';
    const notesVal = profileData.injury_notes || profileData.injuryNotes || userData.injury_notes || userData.injuryNotes || '';
    const tagsVal = profileData.excel_tags || profileData.excelTags || profileData.specialties || userData.excel_tags || userData.excelTags || userData.specialties || [];

    const athResult: RosterAthlete = {
      athlete_id: canonicalAthleteId,
      user_id: profileData.user_id || cleanId,
      first_name: firstName || 'Athlete',
      last_name: lastName || '',
      full_name: fullName,
      position: positionOverride || profileData.position || 'Unassigned',
      jersey_number: jerseyOverride !== undefined ? jerseyOverride : (profileData.jersey_number ?? null),
      sport_type: profileData.sport_type || '',
      avatar_url: profileData.avatar_url || undefined,
      eligibility_documents: eligDocs || [],
      is_eligibility_verified: isVerified,
      player_status: statusVal,
      playerStatus: statusVal,
      injury_notes: notesVal,
      injuryNotes: notesVal,
      excel_tags: tagsVal,
      excelTags: tagsVal,
      specialties: tagsVal,
    };

    rosterAthleteCache.set(canonicalAthleteId, { data: athResult, cachedAt: Date.now() });
    rosterAthleteCache.set(cleanId, { data: athResult, cachedAt: Date.now() });

    return athResult;
  });

  const results = await Promise.all(rosterPromises);
  return results.filter((r): r is RosterAthlete => r !== null);
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
    created_at: now,
    timestamp: now,
  };

  if (payload.region) newTeam.region = payload.region.trim();
  if (payload.description) newTeam.description = payload.description.trim();
  if (payload.mission_statement) newTeam.mission_statement = payload.mission_statement.trim();

  // Primary write: atleta-v1
  await db.collection('Teams').doc(teamId).set(newTeam);
  
  invalidateTeamCache();

  // Link team to Coach_Profiles document (handles both coach_<uid> and raw uid)
  const canonicalCoachId = coachId.startsWith('coach_') ? coachId : `coach_${coachId}`;
  const rawUid = coachId.replace(/^coach_/, '');

  const coachDocRef = db.collection('Coach_Profiles').doc(canonicalCoachId);
  const rawDocRef = db.collection('Coach_Profiles').doc(rawUid);

  const [coachDoc, rawDoc] = await Promise.all([
    coachDocRef.get().catch(() => null),
    rawDocRef.get().catch(() => null),
  ]);

  const targetRef = (coachDoc && coachDoc.exists) ? coachDocRef : (rawDoc && rawDoc.exists) ? rawDocRef : coachDocRef;
  const existingDoc = (coachDoc && coachDoc.exists) ? coachDoc : rawDoc;
  const existingTeams = existingDoc?.exists ? (existingDoc.data()?.teams_managed || []) : [];
  const updatedTeams = Array.from(new Set([...existingTeams, teamId]));

  const coachProfileUpdates = {
    team_id: teamId,
    teams_managed: updatedTeams,
    updated_at: new Date(),
  };

  await targetRef.set(coachProfileUpdates, { merge: true });

  return newTeam as Team;
}

/**
 * Retrieve all teams managed by a specific coach (GET /api/v1/teams?coachId=).
 */
export async function getCoachTeams(coachId: string): Promise<TeamSummary[]> {
  const cached = coachTeamsCache.get(coachId);
  if (cached && Date.now() - cached.cachedAt < COACH_TEAMS_TTL_MS) {
    return cached.data;
  }

  const cleanId = coachId.replace(/^coach_/, '');
  const possibleCoachIds = Array.from(new Set([coachId, `coach_${cleanId}`, cleanId]));

  // Primary source of truth: atleta-v1
  const [snapshotV1, staffSnapshot, coachProfileDoc1, coachProfileDoc2] = await Promise.all([
    db.collection('Teams').where('coach_id', 'in', possibleCoachIds).get().catch(() => ({ docs: [] })),
    db.collection('Teams').where('coaching_staff', 'array-contains-any', possibleCoachIds).get().catch(() => ({ docs: [] })),
    db.collection('Coach_Profiles').doc(`coach_${cleanId}`).get().catch(() => null),
    db.collection('Coach_Profiles').doc(cleanId).get().catch(() => null),
  ]);

  const docsMap = new Map<string, any>();
  snapshotV1.docs.forEach((d: any) => docsMap.set(d.id, d));
  staffSnapshot.docs.forEach((d: any) => docsMap.set(d.id, d));

  const coachProfileData = (coachProfileDoc1 && coachProfileDoc1.exists)
    ? coachProfileDoc1.data()
    : ((coachProfileDoc2 && coachProfileDoc2.exists) ? coachProfileDoc2.data() : null);

  const managedIds: string[] = Array.isArray(coachProfileData?.teams_managed) ? coachProfileData.teams_managed : [];
  for (const tId of managedIds) {
    if (!docsMap.has(tId)) {
      const tDoc = await db.collection('Teams').doc(tId).get().catch(() => null);
      if (tDoc && tDoc.exists) {
        docsMap.set(tDoc.id, tDoc);
      }
    }
  }

  const teams: TeamSummary[] = [];

  for (const doc of docsMap.values()) {
    const data = doc.data() as Team;
    const coach = await enrichCoach(data.coach_id);
    const enrichedRoster = await enrichRoster(data.roster_list || []);
    const coachName = data.coach_name || coach.full_name || 'Coach';

    teams.push({
      team_id: data.team_id,
      team_name: data.team_name,
      sport_type: data.sport_type,
      division: data.division || 'Varsity Division',
      region: data.region || undefined,
      season_record: data.season_record || { wins: 0, losses: 0 },
      athlete_count: enrichedRoster.length,
      coach_name: coachName,
      coach_id: data.coach_id,
      established_year: data.established_year,
      roster_list: enrichedRoster,
    });
  }

  coachTeamsCache.set(coachId, { data: teams, cachedAt: Date.now() });
  return teams;
}

/**
 * Browse team directory with optional sport, search, and exclusion filters.
 */
export async function browseTeamDirectory(
  sport?: string,
  search?: string,
  coachId?: string,
  excludeAthleteId?: string,
  excludeTeamId?: string,
): Promise<TeamSummary[]> {
  if (coachId) {
    return getCoachTeams(coachId);
  }

  const cacheKey = `dir_${sport || 'all'}_${search || ''}_${excludeAthleteId || ''}_${excludeTeamId || ''}`;
  const cached = teamDirectoryCache.get(cacheKey);
  if (cached && Date.now() - cached.cachedAt < TEAM_CACHE_TTL_MS) {
    return cached.data;
  }

  // Primary source of truth: atleta-v1
  const snapshotV1 = await db.collection('Teams').get().catch(() => ({ docs: [] }));

  const docsMap = new Map<string, any>();
  snapshotV1.docs.forEach((d: any) => docsMap.set(d.id, d));

  const teams: TeamSummary[] = [];

  const normSportQuery = (sport || '').toLowerCase().replace(/&/g, 'and').replace(/\s+/g, '').trim();

  for (const doc of docsMap.values()) {
    const data = doc.data() as Team;

    // Filter by excluded team ID
    if (excludeTeamId && data.team_id === excludeTeamId) {
      continue;
    }

    // Filter by excluded athlete membership (if athlete already plays in this team)
    if (excludeAthleteId && Array.isArray(data.roster_list)) {
      const cleanExId = excludeAthleteId.replace(/^ath_/, '');
      const isMember = data.roster_list.some((item) => {
        const id = (typeof item === 'string' ? item : (item.athlete_id || (item as any).user_id) || '').replace(/^ath_/, '');
        return id === cleanExId;
      });
      if (isMember) {
        continue;
      }
    }

    // Sport filter with normalization (& vs and, case-insensitive)
    if (normSportQuery && normSportQuery !== 'all') {
      const teamSport = (data.sport_type || '').toLowerCase().replace(/&/g, 'and').replace(/\s+/g, '').trim();
      if (teamSport !== normSportQuery && !teamSport.includes(normSportQuery) && !normSportQuery.includes(teamSport)) {
        continue;
      }
    }

    const coach = await enrichCoach(data.coach_id);
    const enrichedRoster = await enrichRoster(data.roster_list || []);
    const coachName = data.coach_name || coach.full_name || 'Coach';

    // Search query filter: check team_name, sport_type, coach_name, description
    if (search && search.trim().length > 0) {
      const searchLower = search.trim().toLowerCase();
      const matches =
        data.team_name.toLowerCase().includes(searchLower) ||
        (data.sport_type || '').toLowerCase().includes(searchLower) ||
        coachName.toLowerCase().includes(searchLower) ||
        (data.description || '').toLowerCase().includes(searchLower);
      if (!matches) {
        continue;
      }
    }

    teams.push({
      team_id: data.team_id,
      team_name: data.team_name,
      sport_type: data.sport_type,
      division: data.division || 'Varsity Division',
      region: data.region || undefined,
      season_record: data.season_record || { wins: 0, losses: 0 },
      athlete_count: enrichedRoster.length,
      coach_name: coachName,
      coach_id: data.coach_id || '',
      established_year: data.established_year,
      roster_list: enrichedRoster,
    });
  }

  teamDirectoryCache.set(cacheKey, { data: teams, cachedAt: Date.now() });
  return teams;
}

/**
 * Retrieve all athletes managed by a coach (both those assigned to a team and unassigned).
 */
/**
 * Retrieve all athletes managed by a coach (both those assigned to a team and unassigned).
 */
export async function getCoachManagedAthletes(coachId: string): Promise<any[]> {
  const cached = coachManagedAthletesCache.get(coachId);
  if (cached && Date.now() - cached.cachedAt < COACH_ATHLETES_TTL_MS) {
    return cached.data;
  }

  const cleanId = coachId.replace(/^coach_/, '');
  const possibleCoachIds = Array.from(new Set([coachId, `coach_${cleanId}`, cleanId]));

  // Fetch coach profile, teams, accepted proposals, and assigned athletes in parallel
  const [coachProfileDoc1, coachProfileDoc2, teamsSnapshot, acceptedOffersSnapshot, assignedAthletesSnapshot] = await Promise.all([
    db.collection('Coach_Profiles').doc(`coach_${cleanId}`).get().catch(() => null),
    db.collection('Coach_Profiles').doc(cleanId).get().catch(() => null),
    db.collection('Teams').where('coach_id', 'in', possibleCoachIds).get().catch(() => null),
    db.collection('Scouting_Registry').where('coach_scout_id', 'in', possibleCoachIds).get().catch(() => null),
    db.collection('Athlete_Profiles').where('coach_id', 'in', possibleCoachIds).get().catch(() => null),
  ]);

  const athleteIdSet = new Set<string>();
  const athleteTeamsMap = new Map<string, Array<{ team_id: string; team_name: string; sport_type: string; jersey_number?: number; position?: string }>>();

  const addTeamForAthlete = (rawAthId: string, teamObj: { team_id: string; team_name: string; sport_type: string; jersey_number?: number; position?: string }) => {
    const clean = rawAthId.replace(/^ath_/, '');
    const canonical = rawAthId.startsWith('ath_') ? rawAthId : `ath_${rawAthId}`;
    const keys = [rawAthId, clean, canonical];
    for (const k of keys) {
      const existing = athleteTeamsMap.get(k) || [];
      if (!existing.some((e) => e.team_id === teamObj.team_id)) {
        athleteTeamsMap.set(k, [...existing, teamObj]);
      }
    }
  };

  // 1. From Coach Profile athlete_managed array
  const coachData = (coachProfileDoc1 && coachProfileDoc1.exists) ? coachProfileDoc1.data() : (coachProfileDoc2 && coachProfileDoc2.exists) ? coachProfileDoc2.data() : null;
  if (coachData) {
    const managed = coachData.athlete_managed || coachData.athletes_managed || [];
    if (Array.isArray(managed)) {
      managed.forEach((item: any) => {
        const id = typeof item === 'string' ? item : (item.athlete_id || item.user_id || item.id);
        if (id) athleteIdSet.add(String(id).trim());
      });
    }
  }

  // 2. From Coach Teams roster_list
  if (teamsSnapshot && !teamsSnapshot.empty) {
    for (const doc of teamsSnapshot.docs) {
      const t = doc.data() as Team;
      if (Array.isArray(t.roster_list)) {
        for (const item of t.roster_list) {
          const aId = typeof item === 'string' ? item : (item.athlete_id || (item as any).user_id);
          if (aId) {
            athleteIdSet.add(aId);
            addTeamForAthlete(aId, {
              team_id: t.team_id || doc.id,
              team_name: t.team_name,
              sport_type: t.sport_type,
              jersey_number: typeof item === 'object' ? item.jersey_number : undefined,
              position: typeof item === 'object' ? item.position : undefined,
            });
          }
        }
      }
    }
  }

  const scoutedAthleteMap = new Map<string, any>();
  // 3. From Scouting Proposals / Inquiries (Active proposals: Sent, Pending, Accepted)
  if (acceptedOffersSnapshot && !acceptedOffersSnapshot.empty) {
    for (const doc of acceptedOffersSnapshot.docs) {
      const inq = doc.data();
      const status = String(inq.offer_status || inq.status || '').toLowerCase();
      if (status === 'declined' || status === 'rejected' || status === 'revoked') continue;
      if (inq.athlete_id) {
        athleteIdSet.add(inq.athlete_id);
        scoutedAthleteMap.set(inq.athlete_id, inq);
        scoutedAthleteMap.set(String(inq.athlete_id).replace(/^ath_/, ''), inq);
      }
    }
  }

  // 4. From Athlete_Profiles where coach_id is assigned
  if (assignedAthletesSnapshot && !assignedAthletesSnapshot.empty) {
    for (const doc of assignedAthletesSnapshot.docs) {
      athleteIdSet.add(doc.id);
      const d = doc.data();
      if (d.athlete_id) athleteIdSet.add(d.athlete_id);
    }
  }

  if (athleteIdSet.size === 0) {
    return [];
  }

  // Fetch only the targeted athlete profiles and users documents in parallel
  const athleteIds = Array.from(athleteIdSet);
  const profileFetchPromises = athleteIds.map(async (aId) => {
    const rawUid = aId.replace(/^ath_/, '');
    const canonicalAthleteId = aId.startsWith('ath_') ? aId : `ath_${aId}`;

    const [profDoc1, profDoc2, userDoc1, userDoc2] = await Promise.all([
      db.collection('Athlete_Profiles').doc(canonicalAthleteId).get().catch(() => null),
      db.collection('Athlete_Profiles').doc(rawUid).get().catch(() => null),
      db.collection('Users').doc(rawUid).get().catch(() => null),
      db.collection('Users').doc(canonicalAthleteId).get().catch(() => null),
    ]);

    const p1 = (profDoc1 && profDoc1.exists) ? (profDoc1.data() || {}) : {};
    const p2 = (profDoc2 && profDoc2.exists) ? (profDoc2.data() || {}) : {};
    const profileData: Record<string, any> = { ...p2, ...p1 };
    const u1 = (userDoc1 && userDoc1.exists) ? (userDoc1.data() || {}) : {};
    const u2 = (userDoc2 && userDoc2.exists) ? (userDoc2.data() || {}) : {};
    const userData: Record<string, any> = { ...u2, ...u1 };

    const teamEntries = athleteTeamsMap.get(aId) || athleteTeamsMap.get(canonicalAthleteId) || athleteTeamsMap.get(rawUid) || [];
    const primaryTeam = teamEntries[0];
    const teamNames = teamEntries.map((te) => te.team_name).filter(Boolean);
    const combinedTeamName = teamNames.length > 0 ? teamNames.join(' • ') : 'Unassigned / No Team';
    const teamIds = teamEntries.map((te) => te.team_id).filter(Boolean);

    const firstName = userData.first_name || profileData.first_name || 'Athlete';
    const lastName = userData.last_name || profileData.last_name || '';
    const fullName = `${firstName} ${lastName}`.trim();

    const phys = profileData.physical_profile || profileData.physical_attributes || {};
    const heightCm = Number(phys.height_cm ?? profileData.height_cm ?? 0);
    const weightKg = Number(phys.weight_kg ?? profileData.weight_kg ?? 0);
    const wingspanCm = Number(phys.wingspan_cm ?? profileData.wingspan_cm ?? 0);
    const verticalCm = Number(phys.vertical_cm ?? profileData.vertical_cm ?? profileData.vertical_jump_cm ?? profileData.vertical ?? 0);
    const verticalInches = verticalCm > 0 ? Math.round(verticalCm / 2.54) : 0;

    const docs = Array.isArray(profileData.eligibility_documents)
      ? profileData.eligibility_documents
      : profileData.eligibility_documents && typeof profileData.eligibility_documents === 'object'
        ? Object.values(profileData.eligibility_documents)
        : [];

    const stats = profileData.stats || profileData.averages || {};
    const per = Number(stats.efficiency_rating ?? stats.per ?? stats.calculated_per ?? stats.per_score ?? 0);
    const ppg = Number(stats.ppg ?? stats.points_per_game ?? 0);
    const dynamicRating = per > 0 ? Math.min(99, Math.max(65, Math.round(per * 2.8))) : (ppg > 0 ? Math.min(99, Math.max(65, Math.round(ppg * 3.5))) : (profileData.rating_score || 0));

    const scoutInfo = scoutedAthleteMap.get(aId) || scoutedAthleteMap.get(canonicalAthleteId) || scoutedAthleteMap.get(rawUid);
    const isScouted = Boolean(scoutInfo || profileData.is_scouted);

    return {
      athlete_id: canonicalAthleteId,
      user_id: rawUid,
      coach_id: coachId,
      coach_scout_id: coachId,
      first_name: firstName,
      last_name: lastName,
      full_name: fullName,
      position: (primaryTeam?.position && primaryTeam.position !== 'Unassigned' ? primaryTeam.position : (profileData.position && profileData.position !== 'Unassigned' ? profileData.position : (userData.position && userData.position !== 'Unassigned' ? userData.position : (primaryTeam?.sport_type || profileData.sport_type || userData.sport_type || 'Basketball')))),
      jersey_number: primaryTeam?.jersey_number ?? profileData.jersey_number ?? userData.jersey_number ?? null,
      sport_type: primaryTeam?.sport_type || profileData.sport_type || userData.sport_type || 'Basketball',
      sport_category: (primaryTeam?.sport_type || profileData.sport_type || userData.sport_type || 'Basketball').toUpperCase(),
      team_id: primaryTeam?.team_id || null,
      team_name: combinedTeamName,
      team_ids: teamIds,
      team_names: teamNames,
      teams: teamEntries,
      has_team: teamEntries.length > 0,
      province: profileData.province || userData.province || undefined,
      location: profileData.province || userData.province || undefined,
      avatar_url: profileData.avatar_url || userData.avatar_url || undefined,
      is_scouted: isScouted,
      scout_status: scoutInfo?.offer_status || (isScouted ? 'Pending' : undefined),
      recruitment_status: scoutInfo?.offer_status === 'Accepted' ? 'Active Roster' : (scoutInfo ? `Scouted (${scoutInfo.offer_status || 'Pending'})` : (profileData.recruitment_status || 'Active Roster')),
      rating_score: dynamicRating,
      is_eligibility_verified: docs.length > 0 || profileData.eligibility_documents?.psa_verified === true,
      physical_attributes: {
        height_cm: heightCm,
        weight_kg: weightKg,
        wingspan_cm: wingspanCm,
        vertical_cm: verticalCm,
        vertical_jump_cm: verticalCm,
        vertical_leap_in: verticalInches,
      },
      vertical_cm: verticalCm,
      vertical_jump_cm: verticalCm,
      vertical_leap_in: verticalInches,
      stats: {
        ppg: Number(stats.ppg ?? stats.points_per_game ?? 0),
        rpg: Number(stats.rpg ?? stats.rebounds_per_game ?? 0),
        apg: Number(stats.apg ?? stats.assists_per_game ?? 0),
        fg_pct: Number(stats.fg_pct ?? stats.field_goal_percentage ?? 0),
        per: per,
        games_played: Number(stats.games_played ?? 0),
      },
      averages: profileData.averages || {
        ppg: Number(stats.ppg ?? stats.points_per_game ?? 0),
        rpg: Number(stats.rpg ?? stats.rebounds_per_game ?? 0),
        apg: Number(stats.apg ?? stats.assists_per_game ?? 0),
        fg_percentage: Number(stats.fg_pct ?? stats.field_goal_percentage ?? 0),
        per_score: per,
        games_played: Number(stats.games_played ?? 0),
      },
      scoring_trends_last_10: profileData.scoring_trends_last_10 || [],
      biometrics: profileData.biometrics || undefined,
      workload_analytics: profileData.workload_analytics || profileData.workload || undefined,
    };
  });

  const managedAthletes = await Promise.all(profileFetchPromises);
  coachManagedAthletesCache.set(coachId, { data: managedAthletes, cachedAt: Date.now() });
  return managedAthletes;
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
  if (data.coach_name && (!coach.full_name || coach.full_name === 'No Coach Assigned')) {
    coach.full_name = data.coach_name;
  }
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
    created_at: data.created_at || data.timestamp || new Date().toISOString(),
    timestamp: data.timestamp || data.created_at || new Date().toISOString(),
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

  // Enforce no duplicate athlete IDs or jersey numbers
  const seenAthletes = new Set<string>();
  const seenJerseys = new Set<string>();
  for (const item of rosterItems) {
    const athId = item.athlete_id;
    if (seenAthletes.has(athId)) {
      throw new ServiceError(`Duplicate athlete ID '${athId}' in roster payload.`, 400);
    }
    seenAthletes.add(athId);

    if (item.jersey_number !== undefined && item.jersey_number !== null && !isNaN(Number(item.jersey_number))) {
      const jersey = String(item.jersey_number).trim();
      if (seenJerseys.has(jersey)) {
        throw new ServiceError(`Duplicate jersey number '${jersey}' assigned to multiple athletes.`, 400);
      }
      seenJerseys.add(jersey);
    }
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

    // Update position and jersey_number on Athlete_Profiles, and set active team_id
    const athleteUpdates: Record<string, any> = { updated_at: new Date(), team_id: teamId };
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

  // Detect removed / terminated athletes from current roster
  const existingRoster: (string | TeamRosterMember)[] = Array.isArray(teamData.roster_list) ? teamData.roster_list : [];
  const incomingAthleteIds = new Set(rosterItems.map((r) => r.athlete_id));
  const newTerminatedRecords: any[] = [];

  for (const existing of existingRoster) {
    const existingId = typeof existing === 'string' ? existing : existing.athlete_id;
    if (existingId && !incomingAthleteIds.has(existingId)) {
      try {
        const canonicalAthId = existingId.startsWith('ath_') ? existingId : `ath_${existingId}`;
        const rawAthUid = existingId.replace(/^ath_/, '');

        // Calculate player's stats earned while with this team
        const statsSummary = await calculateAthleteStatsForTeam(existingId, teamId, teamData.team_name);
        const nowIso = new Date().toISOString();

        const terminatedRecord: PastTeamAffiliation = {
          team_id: teamId,
          team_name: teamData.team_name,
          sport_type: teamData.sport_type,
          division: teamData.division || 'Varsity',
          logo_url: (teamData as any).logo_url || (teamData as any).banner_url || null,
          coach_name: teamData.coach_name || 'Coach',
          coach_id: teamData.coach_id,
          jersey_number: typeof existing !== 'string' ? (existing.jersey_number ?? null) : null,
          position: typeof existing !== 'string' ? (existing.position ?? 'Unassigned') : 'Unassigned',
          joined_at: (typeof existing !== 'string' && existing.added_at) ? existing.added_at : (teamData.created_at || nowIso),
          terminated_at: nowIso,
          status: 'Terminated',
          termination_reason: 'Roster adjustment by coach',
          stats_summary: statsSummary,
        };

        // Archive into Athlete_Profiles
        const athDocRef = db.collection('Athlete_Profiles').doc(canonicalAthId);
        const athDoc = await athDocRef.get();
        const currentData = athDoc.exists ? (athDoc.data() || {}) : {};
        const existingPast: PastTeamAffiliation[] = Array.isArray(currentData.past_teams) ? currentData.past_teams : [];

        const filteredPast = [
          terminatedRecord,
          ...existingPast.filter((pt) => pt.team_id !== teamId),
        ];

        const athUpdates: Record<string, any> = {
          past_teams: filteredPast,
          updated_at: new Date().toISOString(),
        };

        if (currentData.team_id === teamId) {
          athUpdates.team_id = null;
        }
        if (currentData.current_affiliation?.team_id === teamId) {
          athUpdates.current_affiliation = null;
        }

        await athDocRef.set(athUpdates, { merge: true });
        await db.collection('Athlete_Profiles').doc(rawAthUid).set(athUpdates, { merge: true }).catch(() => null);

        newTerminatedRecords.push({
          athlete_id: existingId,
          terminated_at: nowIso,
          jersey_number: typeof existing !== 'string' ? existing.jersey_number : null,
          position: typeof existing !== 'string' ? existing.position : 'Unassigned',
          stats_summary: statsSummary,
        });

        createNotification({
          recipient_id: rawAthUid,
          title: `Roster Update: ${teamData.team_name}`,
          message: `You are no longer on the active roster for ${teamData.team_name}. Your entire performance stats and achievements while playing with this team have been preserved in your past teams career portfolio.`,
          type: 'SYSTEM',
          metadata: { team_id: teamId, team_name: teamData.team_name, status: 'Terminated' },
        }).catch(() => null);
      } catch (termErr) {
        console.warn(`[ROSTER ARCHIVE] Error archiving past team stats for athlete ${existingId}:`, termErr);
      }
    }
  }

  const existingTerminatedList = Array.isArray((teamData as any).terminated_roster_list) ? (teamData as any).terminated_roster_list : [];
  const mergedTerminatedList = [...newTerminatedRecords, ...existingTerminatedList.filter((m: any) => !newTerminatedRecords.some(n => n.athlete_id === (m.athlete_id || m)))];

  const rosterUpdates: Record<string, any> = {
    roster_list: updatedRosterMembers,
    timestamp: new Date().toISOString(),
  };
  if (mergedTerminatedList.length > 0) {
    rosterUpdates.terminated_roster_list = mergedTerminatedList;
  }

  // Update roster_list in Firestore Teams document with full athlete details
  await db.collection('Teams').doc(teamId).set(rosterUpdates, { merge: true });

  invalidateTeamCache();
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

  invalidateTeamCache();

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

  // Fetch collections in parallel from atleta-v1
  const [usersSnapshot, profilesSnapshot, teamsSnapshot, matchLogsSnapshot, metricsSnapshot] = await Promise.all([
    db.collection('Users').get(),
    db.collection('Athlete_Profiles').get(),
    db.collection('Teams').get(),
    db.collection('Match_Logs').get().catch(() => ({ docs: [] } as any)),
    db.collection('Performance_Metrics').get().catch(() => ({ docs: [] } as any)),
  ]);

  const profilesMap = new Map<string, any>();
  profilesSnapshot.docs.forEach((doc) => {
    profilesMap.set(doc.id, doc.data());
    const rawId = doc.id.replace(/^ath_/, '');
    if (!profilesMap.has(rawId)) profilesMap.set(rawId, doc.data());
    if (!profilesMap.has(`ath_${rawId}`)) profilesMap.set(`ath_${rawId}`, doc.data());
  });

  const usersMap = new Map<string, any>();
  usersSnapshot.docs.forEach((doc) => {
    usersMap.set(doc.id, doc.data());
    const rawId = doc.id.replace(/^ath_/, '');
    if (!usersMap.has(rawId)) usersMap.set(rawId, doc.data());
    if (!usersMap.has(`ath_${rawId}`)) usersMap.set(`ath_${rawId}`, doc.data());
  });

  // Aggregate points and performance stats from Match_Logs and Performance_Metrics
  const matchStatsByAthlete = new Map<string, {
    totalGames: number;
    totalPts: number;
    totalReb: number;
    totalAst: number;
    totalFgm: number;
    totalFga: number;
    scores: number[];
  }>();

  const recordAthleteMatchStat = (
    aId: string,
    pts: number,
    reb: number,
    ast: number,
    fgm: number,
    fga: number
  ) => {
    if (!aId) return;
    const cleanId = aId.replace(/^ath_/, '');
    const keys = [aId, cleanId, `ath_${cleanId}`];
    
    let entry = matchStatsByAthlete.get(cleanId);
    if (!entry) {
      entry = {
        totalGames: 0,
        totalPts: 0,
        totalReb: 0,
        totalAst: 0,
        totalFgm: 0,
        totalFga: 0,
        scores: [],
      };
      keys.forEach((k) => matchStatsByAthlete.set(k, entry!));
    }

    entry.totalGames += 1;
    entry.totalPts += pts;
    entry.totalReb += reb;
    entry.totalAst += ast;
    entry.totalFgm += fgm;
    entry.totalFga += fga;
    if (pts > 0) entry.scores.push(pts);
  };

  // Inspect Match_Logs player_stats
  matchLogsSnapshot.docs.forEach((doc: any) => {
    const m = doc.data();
    if (Array.isArray(m.player_stats)) {
      m.player_stats.forEach((p: any) => {
        const aId = p.athlete_id || p.user_id || p.id;
        if (aId) {
          const s = p.stats || {};
          const pts = Number(p.pts ?? p.points ?? s.points ?? s.pts ?? 0);
          const reb = Number(p.reb ?? p.rebounds ?? s.rebounds ?? s.reb ?? 0);
          const ast = Number(p.ast ?? p.assists ?? s.assists ?? s.ast ?? 0);
          const fgm = Number(s.fg_made ?? 0);
          const fga = Number(s.fg_attempted ?? 0);
          recordAthleteMatchStat(String(aId), pts, reb, ast, fgm, fga);
        }
      });
    }
  });

  // Inspect Performance_Metrics
  metricsSnapshot.docs.forEach((doc: any) => {
    const m = doc.data();
    const aId = m.athlete_id || m.user_id;
    if (aId) {
      const s = m.sport_stats || {};
      const pts = Number(s.points ?? m.calculated_player_efficiency ?? 0);
      const reb = Number(s.rebounds ?? (Number(s.offensive_rebounds || 0) + Number(s.defensive_rebounds || 0)));
      const ast = Number(s.assists ?? 0);
      const fgm = Number(s.fg_made ?? 0);
      const fga = Number(s.fg_attempted ?? 0);
      recordAthleteMatchStat(String(aId), pts, reb, ast, fgm, fga);
    }
  });

  // Helper to resolve player stats
  const buildAthleteStats = (aId: string, p: any, u: any) => {
    const rawStats = p?.stats || u?.stats || {};
    const rawAverages = p?.averages || u?.averages || {};
    const mStats = matchStatsByAthlete.get(aId) || matchStatsByAthlete.get(aId.replace(/^ath_/, ''));

    const storedPpg = Number(
      rawAverages.ppg ??
      rawStats.ppg ??
      rawAverages.points ??
      rawStats.points ??
      rawAverages.pts ??
      rawStats.pts ??
      rawStats.points_per_game ??
      p?.ppg ??
      0
    );
    const storedRpg = Number(
      rawAverages.rpg ??
      rawStats.rpg ??
      rawAverages.rebounds ??
      rawStats.rebounds ??
      rawAverages.reb ??
      rawStats.reb ??
      0
    );
    const storedAst = Number(
      rawAverages.apg ??
      rawStats.apg ??
      rawAverages.ast ??
      rawStats.ast ??
      rawAverages.assists ??
      rawStats.assists ??
      0
    );
    const storedFg = Number(
      rawAverages.fg_percentage ??
      rawAverages.fg_pct ??
      rawStats.fg_pct ??
      rawStats.fg_percentage ??
      p?.shooting_efficiency?.fg_pct ??
      0
    );
    const storedGp = Number(rawAverages.games_played ?? rawStats.games_played ?? 0);

    let ppg = storedPpg;
    let rpg = storedRpg;
    let ast = storedAst;
    let fgPct = storedFg;
    let gamesPlayed = storedGp;

    if (!ppg && mStats && mStats.totalGames > 0 && mStats.totalPts > 0) {
      gamesPlayed = mStats.totalGames;
      ppg = parseFloat((mStats.totalPts / mStats.totalGames).toFixed(1));
      rpg = parseFloat((mStats.totalReb / mStats.totalGames).toFixed(1));
      ast = parseFloat((mStats.totalAst / mStats.totalGames).toFixed(1));
      if (mStats.totalFga > 0) {
        fgPct = parseFloat(((mStats.totalFgm / mStats.totalFga) * 100).toFixed(1));
      }
    }

    // If ppg is still 0, check scoring trends array
    if (ppg === 0) {
      const trends = Array.isArray(p?.scoring_trends_last_10)
        ? p.scoring_trends_last_10
        : Array.isArray(p?.analytics?.scoring_trend)
        ? p.analytics.scoring_trend
        : [];
      const validTrends = trends.filter((t: any) => Number(t) > 0);
      if (validTrends.length > 0) {
        ppg = parseFloat((validTrends.reduce((a: number, b: number) => a + Number(b), 0) / validTrends.length).toFixed(1));
      }
    }

    if (gamesPlayed === 0) {
      gamesPlayed = Number(rawAverages.games_played ?? rawStats.games_played ?? (ppg > 0 ? 8 : 0));
    }

    const per = Number(
      rawAverages.per_score ??
      rawStats.per_score ??
      rawStats.efficiency_rating ??
      p?.calculated_per ??
      p?.career_per ??
      (ppg > 0 ? Math.round(ppg * 1.3 + 12) : 25)
    );

    const eff = Number(
      p?.efficiency_pct ??
      rawStats.efficiency_pct ??
      (ppg > 0 ? Math.min(99, Math.round(ppg * 3.5 + 20)) : 75)
    );

    const mergedStats = {
      ...rawStats,
      ppg,
      rpg,
      ast,
      fg_pct: fgPct,
      games_played: gamesPlayed,
      times_50m_free: rawStats.times_50m_free || p?.best_times?.times_50m_free,
      times_100m: rawStats.times_100m || p?.best_times?.times_100m,
      times_200m: rawStats.times_200m || p?.best_times?.times_200m,
      times_400m: rawStats.times_400m || p?.best_times?.times_400m,
    };

    const mergedAverages = {
      ...rawAverages,
      ppg,
      rpg,
      apg: ast,
      fg_percentage: fgPct,
      games_played: gamesPlayed,
      per_score: per,
    };

    return { ppg, rpg, ast, fgPct, per, eff, stats: mergedStats, averages: mergedAverages };
  };

  // 1. Search Users collection for all registered user accounts with role === 'Athlete' or 'Player'
  for (const userDoc of usersSnapshot.docs) {
    const u = userDoc.data();
    const role = (u.role || '').toString().toLowerCase();

    if (role.includes('athlete') || role.includes('player') || role === 'user' || !u.role) {
      const uid = userDoc.id;
      const rawUid = uid.replace(/^ath_/, '');
      const canonicalAthleteId = uid.startsWith('ath_') ? uid : `ath_${uid}`;
      const athleteId = u.athlete_id || canonicalAthleteId;

      const p = profilesMap.get(canonicalAthleteId) || profilesMap.get(rawUid) || profilesMap.get(athleteId) || profilesMap.get(uid) || {};
      const uData = usersMap.get(rawUid) || usersMap.get(canonicalAthleteId) || u;

      const firstName = uData.first_name || p.first_name || '';
      const lastName = uData.last_name || p.last_name || '';
      const fullName = (p.full_name && !p.full_name.includes('undefined')) ? p.full_name : (uData.full_name && !uData.full_name.includes('undefined')) ? uData.full_name : `${firstName} ${lastName}`.trim() || 'Athlete';

      const docs = Array.isArray(p.eligibility_documents)
        ? p.eligibility_documents
        : Array.isArray(uData.eligibility_documents)
          ? uData.eligibility_documents
          : [];

      const phys = p.physical_profile || uData.physical_profile || p.physical_attributes || uData.physical_attributes || {};
      const heightCm = phys.height_cm ?? p.height_cm ?? uData.height_cm ?? null;
      const weightKg = phys.weight_kg ?? p.weight_kg ?? uData.weight_kg ?? null;
      const wingspanCm = phys.wingspan_cm ?? p.wingspan_cm ?? uData.wingspan_cm ?? null;

      const { ppg, per, eff, stats, averages } = buildAthleteStats(athleteId, p, uData);

      const athleteObj: RosterAthlete = {
        athlete_id: athleteId,
        user_id: rawUid,
        first_name: firstName || 'Athlete',
        last_name: lastName || '',
        full_name: fullName,
        position: p.position || uData.position || 'Unassigned',
        jersey_number: p.jersey_number ?? uData.jersey_number ?? null,
        sport_type: p.sport_type || uData.sport_type || '',
        sport_category: (p.sport_type || uData.sport_type || '').toUpperCase(),
        avatar_url: p.avatar_url || uData.avatar_url || undefined,
        eligibility_documents: docs,
        is_eligibility_verified: docs.length > 0,
        recruitment_status: p.recruitment_status || uData.recruitment_status || 'Available',
        province: p.province || uData.province || 'Camarines Sur',
        location: p.province || uData.province || 'Camarines Sur',
        height_cm: heightCm ? Number(heightCm) : null,
        weight_kg: weightKg ? Number(weightKg) : null,
        wingspan_cm: wingspanCm ? Number(wingspanCm) : null,
        physical_attributes: {
          height_cm: heightCm ? Number(heightCm) : undefined,
          weight_kg: weightKg ? Number(weightKg) : undefined,
          wingspan_cm: wingspanCm ? Number(wingspanCm) : undefined,
        },
        stats,
        averages,
        calculated_per: per,
        efficiency_pct: eff,
        player_status: p.player_status || p.playerStatus || uData.player_status || uData.playerStatus || 'Active',
        playerStatus: p.player_status || p.playerStatus || uData.player_status || uData.playerStatus || 'Active',
        injury_notes: p.injury_notes || p.injuryNotes || uData.injury_notes || uData.injuryNotes || '',
        injuryNotes: p.injury_notes || p.injuryNotes || uData.injury_notes || uData.injuryNotes || '',
        excel_tags: p.excel_tags || p.excelTags || p.specialties || uData.excel_tags || uData.excelTags || uData.specialties || [],
        excelTags: p.excel_tags || p.excelTags || p.specialties || uData.excel_tags || uData.excelTags || uData.specialties || [],
        specialties: p.excel_tags || p.excelTags || p.specialties || uData.excel_tags || uData.excelTags || uData.specialties || [],
      };

      const searchHaystack = `${fullName} ${athleteObj.position} ${athleteId} ${rawUid} ${uData.email || ''}`.toLowerCase();
      if (!queryLower || searchHaystack.includes(queryLower)) {
        resultsMap.set(athleteId, athleteObj);
        resultsMap.set(rawUid, athleteObj);
      }
    }
  }

  // 2. Search Athlete_Profiles collection for any profiles
  for (const profileDoc of profilesSnapshot.docs) {
    const p = profileDoc.data();
    const rawId = profileDoc.id.replace(/^ath_/, '');
    const canonicalAthleteId = profileDoc.id.startsWith('ath_') ? profileDoc.id : `ath_${profileDoc.id}`;
    const athleteId = p.athlete_id || canonicalAthleteId;

    if (!resultsMap.has(athleteId) && !resultsMap.has(rawId)) {
      const uid = p.user_id || rawId;
      const u = usersMap.get(uid) || usersMap.get(rawId) || usersMap.get(canonicalAthleteId) || {};
      const firstName = p.first_name || u.first_name || '';
      const lastName = p.last_name || u.last_name || '';
      const fullName = (p.full_name && !p.full_name.includes('undefined')) ? p.full_name : (u.full_name && !u.full_name.includes('undefined')) ? u.full_name : `${firstName} ${lastName}`.trim() || 'Athlete';

      const docs = Array.isArray(p.eligibility_documents) ? p.eligibility_documents : [];
      const phys = p.physical_profile || u.physical_profile || p.physical_attributes || u.physical_attributes || {};
      const heightCm = phys.height_cm ?? p.height_cm ?? u.height_cm ?? null;
      const weightKg = phys.weight_kg ?? p.weight_kg ?? u.weight_kg ?? null;
      const wingspanCm = phys.wingspan_cm ?? p.wingspan_cm ?? u.wingspan_cm ?? null;

      const { per, eff, stats, averages } = buildAthleteStats(athleteId, p, u);

      const athleteObj: RosterAthlete = {
        athlete_id: athleteId,
        user_id: uid,
        first_name: firstName || 'Athlete',
        last_name: lastName || '',
        full_name: fullName,
        position: p.position || 'Unassigned',
        jersey_number: p.jersey_number ?? null,
        sport_type: p.sport_type || u.sport_type || '',
        sport_category: (p.sport_type || u.sport_type || '').toUpperCase(),
        avatar_url: p.avatar_url || undefined,
        eligibility_documents: docs,
        is_eligibility_verified: docs.length > 0,
        recruitment_status: p.recruitment_status || u.recruitment_status || 'Available',
        province: p.province || u.province || 'Camarines Sur',
        location: p.province || u.province || 'Camarines Sur',
        height_cm: heightCm ? Number(heightCm) : null,
        weight_kg: weightKg ? Number(weightKg) : null,
        wingspan_cm: wingspanCm ? Number(wingspanCm) : null,
        physical_attributes: {
          height_cm: heightCm ? Number(heightCm) : undefined,
          weight_kg: weightKg ? Number(weightKg) : undefined,
          wingspan_cm: wingspanCm ? Number(wingspanCm) : undefined,
        },
        stats,
        averages,
        calculated_per: per,
        efficiency_pct: eff,
        player_status: p.player_status || p.playerStatus || u.player_status || u.playerStatus || 'Active',
        playerStatus: p.player_status || p.playerStatus || u.player_status || u.playerStatus || 'Active',
        injury_notes: p.injury_notes || p.injuryNotes || u.injury_notes || u.injuryNotes || '',
        injuryNotes: p.injury_notes || p.injuryNotes || u.injury_notes || u.injuryNotes || '',
        excel_tags: p.excel_tags || p.excelTags || p.specialties || u.excel_tags || u.excelTags || u.specialties || [],
        excelTags: p.excel_tags || p.excelTags || p.specialties || u.excel_tags || u.excelTags || u.specialties || [],
        specialties: p.excel_tags || p.excelTags || p.specialties || u.excel_tags || u.excelTags || u.specialties || [],
      };

      const searchHaystack = `${firstName} ${lastName} ${athleteObj.position} ${athleteId}`.toLowerCase();
      if (!queryLower || searchHaystack.includes(queryLower)) {
        resultsMap.set(athleteId, athleteObj);
        resultsMap.set(rawId, athleteObj);
      }
    }
  }

  // 3. Search Teams collection roster_list array for any athletes
  for (const teamDoc of teamsSnapshot.docs) {
    const teamData = teamDoc.data() as Team;
    const teamCoach = (teamData as any).coach_name || (teamData as any).head_coach || '';
    if (Array.isArray(teamData.roster_list)) {
      for (const item of teamData.roster_list) {
        if (typeof item === 'object' && item.athlete_id) {
          const athleteId = item.athlete_id;
          const cleanId = String(athleteId).replace(/^ath_/, '');
          const existing = resultsMap.get(athleteId) || resultsMap.get(cleanId);
          if (existing) {
            existing.team_id = teamDoc.id;
            existing.team_name = teamData.team_name;
            existing.coach_name = teamCoach;
            existing.has_coach = true;
          } else {
            const firstName = item.first_name || 'Athlete';
            const lastName = item.last_name || '';
            const fullName = `${firstName} ${lastName}`.trim();
            const docs = Array.isArray(item.eligibility_documents) ? item.eligibility_documents : [];

            const p = profilesMap.get(athleteId) || profilesMap.get(cleanId) || {};
            const u = usersMap.get(cleanId) || usersMap.get(athleteId) || {};
            const { per, eff, stats, averages } = buildAthleteStats(athleteId, p, u);

            const athleteObj: RosterAthlete = {
              athlete_id: athleteId,
              user_id: item.user_id || cleanId,
              first_name: firstName,
              last_name: lastName,
              full_name: fullName || 'Athlete',
              position: item.position || 'Unassigned',
              jersey_number: item.jersey_number ?? null,
              sport_type: teamData.sport_type || '',
              sport_category: (teamData.sport_type || '').toUpperCase(),
              eligibility_documents: docs,
              is_eligibility_verified: item.is_eligibility_verified ?? (docs.length > 0),
              recruitment_status: 'Rostered',
              province: 'Camarines Sur',
              location: 'Camarines Sur',
              team_id: teamDoc.id,
              team_name: teamData.team_name,
              coach_name: teamCoach,
              has_coach: true,
              stats,
              averages,
              calculated_per: per,
              efficiency_pct: eff,
            };

            const searchHaystack = `${firstName} ${lastName} ${athleteObj.position} ${athleteId}`.toLowerCase();
            if (!queryLower || searchHaystack.includes(queryLower)) {
              resultsMap.set(athleteId, athleteObj);
              resultsMap.set(cleanId, athleteObj);
            }
          }
        }
      }
    }
  }

  // Deduplicate and filter: if a player is used again, merge and update their stats
  const seenCanonicalIds = new Set<string>();
  const seenNames = new Map<string, RosterAthlete>();
  const allAthletes: RosterAthlete[] = [];

  for (const ath of resultsMap.values()) {
    const norm = String(ath.athlete_id || ath.user_id).replace(/^ath_/, '');
    const cleanName = (ath.full_name || `${ath.first_name || ''} ${ath.last_name || ''}`)
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '');

    const existing = (cleanName && seenNames.get(cleanName)) || (norm && seenNames.get(norm));

    if (existing) {
      // Player is used again: update stats, averages, efficiency, and team details
      const athPpg = Number(ath.stats?.ppg ?? ath.averages?.ppg ?? 0);
      const athRpg = Number(ath.stats?.rpg ?? ath.averages?.rpg ?? 0);
      const athAst = Number(ath.stats?.ast ?? ath.averages?.ast ?? 0);
      const athFg = Number(ath.stats?.fg_pct ?? ath.averages?.fg_percentage ?? 0);
      const athPer = Number(ath.calculated_per ?? 0);
      const athEff = Number(ath.efficiency_pct ?? 0);

      const exPpg = Number(existing.stats?.ppg ?? existing.averages?.ppg ?? 0);
      const exRpg = Number(existing.stats?.rpg ?? existing.averages?.rpg ?? 0);
      const exAst = Number(existing.stats?.ast ?? existing.averages?.ast ?? 0);
      const exFg = Number(existing.stats?.fg_pct ?? existing.averages?.fg_percentage ?? 0);

      const mergedPpg = Math.max(exPpg, athPpg);
      const mergedRpg = Math.max(exRpg, athRpg);
      const mergedAst = Math.max(exAst, athAst);
      const mergedFg = Math.max(exFg, athFg);
      const mergedPer = Math.max(Number(existing.calculated_per || 0), athPer);
      const mergedEff = Math.max(Number(existing.efficiency_pct || 0), athEff);

      existing.stats = {
        ...(existing.stats || {}),
        ppg: mergedPpg,
        rpg: mergedRpg,
        ast: mergedAst,
        fg_pct: mergedFg,
      };
      existing.averages = {
        ...(existing.averages || {}),
        ppg: mergedPpg,
        rpg: mergedRpg,
        apg: mergedAst,
        fg_percentage: mergedFg,
        per_score: mergedPer,
      };
      existing.calculated_per = mergedPer;
      existing.efficiency_pct = mergedEff;

      // Update team affiliation if incoming has one and existing doesn't
      if ((!existing.team_name || existing.team_name === 'Team') && ath.team_name) {
        existing.team_id = ath.team_id;
        existing.team_name = ath.team_name;
        existing.coach_name = ath.coach_name;
        existing.has_coach = true;
      }
      if ((!existing.position || existing.position === 'Unassigned') && ath.position && ath.position !== 'Unassigned') {
        existing.position = ath.position;
      }
      if (!existing.jersey_number && ath.jersey_number) {
        existing.jersey_number = ath.jersey_number;
      }
    } else {
      if (norm) seenCanonicalIds.add(norm);
      if (cleanName) seenNames.set(cleanName, ath);
      if (norm) seenNames.set(norm, ath);
      allAthletes.push(ath);
    }
  }

  if (!sportType || sportType.toUpperCase() === 'ALL') {
    return allAthletes;
  }

  return allAthletes.filter((a) => matchesSportCategory(a.sport_type, a.position, sportType));
}

/**
 * Get athlete's current team.
 */
export async function getAthleteTeam(athleteId: string): Promise<AthleteTeamResponse | null> {
  const cleanId = athleteId.replace(/^ath_/, '');
  const possibleIds = [athleteId, cleanId, `ath_${cleanId}`];

  // 1. Check if athlete's profile directly specifies team_id
  let directTeamId: string | null = null;
  const [profileDoc1, profileDoc2, userDoc] = await Promise.all([
    db.collection('Athlete_Profiles').doc(`ath_${cleanId}`).get().catch(() => null),
    db.collection('Athlete_Profiles').doc(cleanId).get().catch(() => null),
    db.collection('Users').doc(cleanId).get().catch(() => null),
  ]);

  const profData = (profileDoc1 && profileDoc1.exists ? profileDoc1.data() : null) || (profileDoc2 && profileDoc2.exists ? profileDoc2.data() : null);
  const uData = userDoc && userDoc.exists ? userDoc.data() : null;
  directTeamId = profData?.team_id || profData?.current_affiliation?.team_id || uData?.team_id || null;

  const snapshot = await db.collection('Teams').get();
  let matchedDoc: FirebaseFirestore.QueryDocumentSnapshot | null = null;

  if (directTeamId) {
    matchedDoc = snapshot.docs.find((d) => d.id === directTeamId || (d.data() as Team).team_id === directTeamId) || null;
  }

  if (!matchedDoc) {
    for (const doc of snapshot.docs) {
      const data = doc.data() as Team;
      if (Array.isArray(data.roster_list)) {
        const found = data.roster_list.some((item) => {
          const id = typeof item === 'string' ? item : (item.athlete_id || (item as any).user_id || '');
          const cId = String(id).replace(/^ath_/, '');
          return possibleIds.includes(id) || possibleIds.includes(cId);
        });
        if (found) {
          matchedDoc = doc;
          break;
        }
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
    years_of_experience: 0,
    quote: null,
    avatar_url: '',
  }));

  const roster = await enrichRoster(teamData.roster_list || []).catch(() => []);

  return {
    athlete_id: athleteId,
    team: {
      team_id: teamData.team_id || matchedDoc.id,
      team_name: teamData.team_name,
      sport_type: teamData.sport_type,
      division: teamData.division || 'Varsity',
      region: teamData.region || 'Camarines Sur',
      description: teamData.description || null,
      logo_url: (teamData as any).logo_url || (teamData as any).banner_url || (teamData as any).team_logo || null,
      mission_statement: (teamData as any).mission_statement || (teamData as any).quote || null,
      established_year: teamData.established_year || null,
    },
    coach: {
      coach_id: coach.coach_id,
      full_name: coach.full_name,
      current_institution: coach.current_institution,
      avatar_url: coach.avatar_url || '',
      role_title: coach.current_institution || 'HEAD COACH',
      years_experience: coach.years_of_experience ? `${coach.years_of_experience} Years` : 'Head Coach',
      quote: coach.quote || 'Dedicated to driving team excellence and athlete development.',
    },
    roster,
  };
}

/**
 * Calculate the complete performance statistics summary for an athlete earned while on a specific team.
 */
export async function calculateAthleteStatsForTeam(
  athleteId: string,
  teamId: string,
  teamName?: string,
): Promise<PastTeamStatsSummary> {
  const cleanId = athleteId.replace(/^ath_/, '');
  const canonicalAthleteId = athleteId.startsWith('ath_') ? athleteId : `ath_${athleteId}`;
  const possibleIds = [athleteId, cleanId, canonicalAthleteId];

  const [metricsSnapshot, profileDoc] = await Promise.all([
    db.collection('Performance_Metrics')
      .where('athlete_id', 'in', possibleIds)
      .get()
      .catch(() => ({ docs: [] } as any)),
    db.collection('Athlete_Profiles').doc(canonicalAthleteId).get().then(async (doc) => {
      if (doc.exists) return doc;
      return db.collection('Athlete_Profiles').doc(cleanId).get();
    }).catch(() => null),
  ]);

  const pData = profileDoc && profileDoc.exists ? (profileDoc.data() as any) : {};
  const rawStats = pData.stats || {};
  const rawAverages = pData.averages || {};
  const rawShooting = pData.shooting_efficiency || pData.shooting_accuracy_percentages || {};

  let totalGames = 0;
  let totalPts = 0;
  let totalReb = 0;
  let totalAst = 0;
  let totalStl = 0;
  let totalBlk = 0;
  let totalTo = 0;
  let totalFouls = 0;
  let totalFgm = 0;
  let totalFga = 0;
  let totalFtm = 0;
  let totalFta = 0;
  let total3pm = 0;
  let efficiencySum = 0;
  let wins = 0;
  let losses = 0;

  const cleanTeamName = (teamName || '').trim().toLowerCase();

  for (const doc of metricsSnapshot.docs) {
    const m = doc.data();
    const metricTeamId = String(m.team_id || m.home_team_id || m.away_team_id || '').trim();
    const metricTeamName = String(m.team_name || m.team || '').trim().toLowerCase();

    const matchesTeam =
      (teamId && metricTeamId === teamId) ||
      (cleanTeamName && (metricTeamName === cleanTeamName || metricTeamName.includes(cleanTeamName) || cleanTeamName.includes(metricTeamName)));

    if (matchesTeam) {
      totalGames++;
      const s = m.sport_stats || {};
      const pts = Number(s.points ?? s.pts ?? 0);
      const reb = Number((s.offensive_rebounds || 0) + (s.defensive_rebounds || 0) || s.rebounds || s.reb || 0);
      const ast = Number(s.assists ?? s.ast ?? 0);
      const stl = Number(s.steals ?? s.stl ?? 0);
      const blk = Number(s.blocks ?? s.blk ?? 0);
      const to = Number(s.turnovers ?? s.to ?? 0);
      const fouls = Number(s.fouls ?? s.pf ?? 0);
      const fgm = Number(s.fg_made || 0);
      const fga = Number(s.fg_attempted || 0);
      const ftm = Number(s.ft_made || 0);
      const fta = Number(s.ft_attempted || 0);
      const three = Number(s.three_made || 0);
      const eff = Number(m.calculated_player_efficiency || s.efficiency || 0);

      totalPts += pts;
      totalReb += reb;
      totalAst += ast;
      totalStl += stl;
      totalBlk += blk;
      totalTo += to;
      totalFouls += fouls;
      totalFgm += fgm;
      totalFga += fga;
      totalFtm += ftm;
      totalFta += fta;
      total3pm += three;
      efficiencySum += eff;

      if (m.game_result === 'WIN' || m.result === 'Win') wins++;
      if (m.game_result === 'LOSS' || m.result === 'Lose') losses++;
    }
  }

  // Fallback to Match_Logs if direct Performance_Metrics had 0 matches
  if (totalGames === 0) {
    try {
      const matchLogsSnap = await db.collection('Match_Logs').get();
      for (const mDoc of matchLogsSnap.docs) {
        const m = mDoc.data();
        const mTeamId = String(m.team_id || m.home_team_id || '').trim();
        const mTeamName = String(m.home_team_name || m.team_name || '').trim().toLowerCase();
        const matchesThisTeam = (teamId && mTeamId === teamId) || (cleanTeamName && mTeamName.includes(cleanTeamName));

        if (matchesThisTeam) {
          const pStats = Array.isArray(m.player_stats) ? m.player_stats : Array.isArray(m.playerStats) ? m.playerStats : [];
          const found = pStats.find((ps: any) => possibleIds.includes(ps.athlete_id || ps.user_id));
          if (found) {
            totalGames++;
            const pts = Number(found.points ?? found.pts ?? 0);
            const reb = Number(found.rebounds ?? found.reb ?? 0);
            const ast = Number(found.assists ?? found.ast ?? 0);
            const stl = Number(found.steals ?? found.stl ?? 0);
            const blk = Number(found.blocks ?? found.blk ?? 0);
            const to = Number(found.turnovers ?? found.to ?? 0);
            const fouls = Number(found.fouls ?? found.pf ?? 0);
            const fgm = Number(found.fg_made || 0);
            const fga = Number(found.fg_attempted || 0);
            const ftm = Number(found.ft_made || 0);
            const fta = Number(found.ft_attempted || 0);

            totalPts += pts;
            totalReb += reb;
            totalAst += ast;
            totalStl += stl;
            totalBlk += blk;
            totalTo += to;
            totalFouls += fouls;
            totalFgm += fgm;
            totalFga += fga;
            totalFtm += ftm;
            totalFta += fta;

            if (m.game_result === 'WIN' || m.result === 'Win') wins++;
            if (m.game_result === 'LOSS' || m.result === 'Lose') losses++;
          }
        }
      }
    } catch (_) {}
  }

  // Fallback to athlete profile career stats if player played for this team and had stats recorded
  if (totalGames === 0 && Number(rawStats.games_played || rawAverages.games_played || 0) > 0) {
    totalGames = Number(rawStats.games_played || rawAverages.games_played || 1);
    const ppg = Number(rawStats.ppg ?? rawAverages.ppg ?? 0);
    const rpg = Number(rawStats.rpg ?? rawAverages.rpg ?? 0);
    const apg = Number(rawStats.apg ?? rawAverages.apg ?? 0);
    const bpg = Number(rawStats.bpg ?? rawAverages.bpg ?? 0);
    totalPts = Math.round(ppg * totalGames);
    totalReb = Math.round(rpg * totalGames);
    totalAst = Math.round(apg * totalGames);
    totalBlk = Math.round(bpg * totalGames);
    totalStl = Math.round(Number(rawStats.spg || 0) * totalGames);
    wins = Number(rawStats.wins || 0);
    losses = Number(rawStats.losses || 0);
  }

  const ppg = totalGames > 0 ? parseFloat((totalPts / totalGames).toFixed(1)) : Number(rawStats.ppg ?? rawAverages.ppg ?? 0);
  const rpg = totalGames > 0 ? parseFloat((totalReb / totalGames).toFixed(1)) : Number(rawStats.rpg ?? rawAverages.rpg ?? 0);
  const apg = totalGames > 0 ? parseFloat((totalAst / totalGames).toFixed(1)) : Number(rawStats.apg ?? rawAverages.apg ?? 0);
  const spg = totalGames > 0 ? parseFloat((totalStl / totalGames).toFixed(1)) : 0;
  const bpg = totalGames > 0 ? parseFloat((totalBlk / totalGames).toFixed(1)) : Number(rawStats.bpg ?? 0);

  const fgPct = totalFga > 0
    ? parseFloat(((totalFgm / totalFga) * 100).toFixed(1))
    : Number(rawShooting.fg_pct ?? rawStats.fg_pct ?? rawAverages.fg_percentage ?? 45.0);

  const threePct = Number(rawShooting.three_pct ?? rawStats.three_pct ?? rawAverages.three_pt_percentage ?? 33.3);

  const ftPct = totalFta > 0
    ? parseFloat(((totalFtm / totalFta) * 100).toFixed(1))
    : Number(rawShooting.ft_pct ?? rawStats.ft_pct ?? rawAverages.ft_percentage ?? 75.0);

  const avgEfficiency = totalGames > 0
    ? parseFloat((efficiencySum / totalGames).toFixed(1))
    : Number(rawStats.efficiency_rating ?? rawAverages.efficiency_rating ?? 15.0);

  return {
    matches_played: totalGames,
    total_points: totalPts,
    ppg,
    total_rebounds: totalReb,
    rpg,
    total_assists: totalAst,
    apg,
    total_steals: totalStl,
    spg,
    total_blocks: totalBlk,
    bpg,
    total_turnovers: totalTo,
    total_fouls: totalFouls,
    fg_pct: fgPct,
    three_pct: threePct,
    ft_pct: ftPct,
    efficiency_rating: avgEfficiency,
    wins,
    losses,
  };
}

/**
 * Fetch an athlete's past teams affiliations along with the complete stats summary for each team.
 */
export async function getAthletePastTeams(athleteId: string): Promise<PastTeamAffiliation[]> {
  const cleanId = athleteId.replace(/^ath_/, '');
  const canonicalAthleteId = athleteId.startsWith('ath_') ? athleteId : `ath_${athleteId}`;
  const possibleIds = [athleteId, cleanId, canonicalAthleteId];

  let pDoc = await db.collection('Athlete_Profiles').doc(canonicalAthleteId).get();
  if (!pDoc.exists) {
    pDoc = await db.collection('Athlete_Profiles').doc(cleanId).get();
  }

  const pData = pDoc.exists ? pDoc.data()! : {};
  let pastTeams: PastTeamAffiliation[] = Array.isArray(pData.past_teams) ? [...pData.past_teams] : [];

  // Also check if any team in Teams collection has athlete in terminated_roster_list
  try {
    const teamsSnap = await db.collection('Teams').get();
    const currentTeamId = pData.team_id || pData.current_affiliation?.team_id || null;

    for (const tDoc of teamsSnap.docs) {
      const tData = tDoc.data();
      const tId = tData.team_id || tDoc.id;
      if (tId === currentTeamId) continue;

      const alreadyInPast = pastTeams.some((pt) => pt.team_id === tId);
      if (alreadyInPast) continue;

      const termList = Array.isArray(tData.terminated_roster_list) ? tData.terminated_roster_list : Array.isArray(tData.past_roster) ? tData.past_roster : [];
      const termMember = termList.find((m: any) =>
        typeof m === 'string' ? possibleIds.includes(m) : possibleIds.includes(m.athlete_id)
      );

      if (termMember) {
        const statsSummary = await calculateAthleteStatsForTeam(athleteId, tId, tData.team_name);
        pastTeams.push({
          team_id: tId,
          team_name: tData.team_name || 'Past Team',
          sport_type: tData.sport_type || 'Basketball',
          division: tData.division || 'Varsity',
          logo_url: tData.logo_url || tData.banner_url || null,
          coach_name: tData.coach_name || 'Head Coach',
          coach_id: tData.coach_id || '',
          jersey_number: typeof termMember !== 'string' ? (termMember.jersey_number ?? null) : null,
          position: typeof termMember !== 'string' ? (termMember.position ?? 'Unassigned') : 'Unassigned',
          joined_at: typeof termMember !== 'string' ? (termMember.added_at || tData.created_at) : (tData.created_at || new Date().toISOString()),
          terminated_at: typeof termMember !== 'string' ? (termMember.terminated_at || new Date().toISOString()) : new Date().toISOString(),
          status: 'Terminated',
          stats_summary: statsSummary,
        });
      }
    }
  } catch (err) {
    console.warn('Error fetching terminated roster list in getAthletePastTeams:', err);
  }

  return pastTeams;
}

/**
 * Explicitly terminate an athlete from a team roster and archive their historical stats.
 */
export async function terminateAthleteFromTeam(
  coachId: string,
  teamId: string,
  athleteId: string,
  reason: string = 'Terminated from squad roster',
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
    throw new ServiceError('Unauthorized. Coaches may only terminate players from teams they manage.', 403);
  }

  const cleanAthId = athleteId.replace(/^ath_/, '');
  const possibleAthIds = [athleteId, cleanAthId, `ath_${cleanAthId}`];

  const currentRoster: (string | TeamRosterMember)[] = Array.isArray(teamData.roster_list) ? teamData.roster_list : [];
  const memberIndex = currentRoster.findIndex((m) => {
    const id = typeof m === 'string' ? m : m.athlete_id;
    return possibleAthIds.includes(id);
  });

  if (memberIndex === -1) {
    throw new ServiceError(`Athlete '${athleteId}' is not an active member of this team roster.`, 404);
  }

  const removedMember = currentRoster[memberIndex];
  const newRoster = currentRoster.filter((_, idx) => idx !== memberIndex);

  // Calculate full stats of the player in that team
  const statsSummary = await calculateAthleteStatsForTeam(athleteId, teamId, teamData.team_name);

  const nowIso = new Date().toISOString();
  const pastRecord: PastTeamAffiliation = {
    team_id: teamId,
    team_name: teamData.team_name,
    sport_type: teamData.sport_type,
    division: teamData.division || 'Varsity',
    logo_url: (teamData as any).logo_url || (teamData as any).banner_url || null,
    coach_name: teamData.coach_name || 'Coach',
    coach_id: teamData.coach_id,
    jersey_number: typeof removedMember !== 'string' ? (removedMember.jersey_number ?? null) : null,
    position: typeof removedMember !== 'string' ? (removedMember.position ?? 'Unassigned') : 'Unassigned',
    joined_at: typeof removedMember !== 'string' && removedMember.added_at ? removedMember.added_at : (teamData.created_at || nowIso),
    terminated_at: nowIso,
    status: 'Terminated',
    termination_reason: reason,
    stats_summary: statsSummary,
  };

  // 1. Update Athlete_Profiles
  const canonicalAthId = `ath_${cleanAthId}`;
  const [pDoc1, pDoc2] = await Promise.all([
    db.collection('Athlete_Profiles').doc(canonicalAthId).get().catch(() => null),
    db.collection('Athlete_Profiles').doc(cleanAthId).get().catch(() => null),
  ]);
  const activeProfileDoc = (pDoc1 && pDoc1.exists ? pDoc1 : (pDoc2 && pDoc2.exists ? pDoc2 : null));
  const currentProfileData = activeProfileDoc ? activeProfileDoc.data()! : {};
  const existingPast: PastTeamAffiliation[] = Array.isArray(currentProfileData.past_teams) ? currentProfileData.past_teams : [];

  const updatedPast = [
    pastRecord,
    ...existingPast.filter((pt) => pt.team_id !== teamId),
  ];

  const athleteUpdates: Record<string, any> = {
    past_teams: updatedPast,
    updated_at: new Date().toISOString(),
  };

  if (currentProfileData.team_id === teamId) {
    athleteUpdates.team_id = null;
  }
  if (currentProfileData.current_affiliation?.team_id === teamId) {
    athleteUpdates.current_affiliation = null;
  }

  await Promise.all([
    db.collection('Athlete_Profiles').doc(canonicalAthId).set(athleteUpdates, { merge: true }),
    db.collection('Athlete_Profiles').doc(cleanAthId).set(athleteUpdates, { merge: true }).catch(() => null),
  ]);

  // 2. Update Team document
  const existingTerminated = Array.isArray((teamData as any).terminated_roster_list) ? (teamData as any).terminated_roster_list : [];
  const updatedTerminated = [
    ...existingTerminated.filter((m: any) => !possibleAthIds.includes(m.athlete_id || m)),
    {
      athlete_id: typeof removedMember === 'string' ? removedMember : removedMember.athlete_id,
      user_id: typeof removedMember === 'string' ? removedMember : (removedMember.user_id || cleanAthId),
      terminated_at: nowIso,
      jersey_number: typeof removedMember !== 'string' ? removedMember.jersey_number : null,
      position: typeof removedMember !== 'string' ? removedMember.position : 'Unassigned',
      reason,
      stats_summary: statsSummary,
    },
  ];

  await db.collection('Teams').doc(teamId).set({
    roster_list: newRoster,
    terminated_roster_list: updatedTerminated,
    timestamp: nowIso,
  }, { merge: true });

  // 3. Notify the athlete
  createNotification({
    recipient_id: cleanAthId,
    title: `Roster Status Update: ${teamData.team_name}`,
    message: `You have been released from ${teamData.team_name}. Your entire performance stats and achievements while playing with this team have been preserved in your past teams career portfolio.`,
    type: 'SYSTEM',
    metadata: {
      team_id: teamId,
      team_name: teamData.team_name,
      status: 'Terminated',
    },
  }).catch((notifErr) => console.warn('Could not send termination notification:', notifErr));

  invalidateTeamCache();
  return {
    message: `Player successfully terminated from ${teamData.team_name}. Past team stats archived.`,
    team: await getTeamDetails(teamId),
    past_team_record: pastRecord,
  };
}
