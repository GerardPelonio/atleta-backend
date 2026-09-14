import { db } from '../utils/firebaseAdmin';
import { ServiceError } from '../validators/matchValidator';
import { eventBus, EVENTS } from '../utils/eventBus';
import { createNotification } from './notificationService';
import crypto from 'crypto';

export interface RegionalAthleteSearchResult {
  athlete_id: string;
  first_name: string;
  last_name: string;
  email: string;
  province: string;
  sport_type: string;
  recruitment_status: string | null;
  calculated_player_efficiency: number; // Average PER
}

export interface LeaderboardRankingResult {
  rank: number;
  athlete_id: string;
  first_name: string;
  last_name: string;
  province: string;
  calculated_player_efficiency: number; // Average PER
}

export interface ScoutingProposalResult {
  scout_id: string;
  coach_id: string;
  athlete_id: string;
  offer_status: 'Sent' | 'Accepted' | 'Declined';
  offer_details?: string;
  created_at: string;
  updated_at: string;
  athlete_details?: {
    first_name: string;
    last_name: string;
    email: string;
    province: string;
    sport_type: string;
  };
}

// Fast In-Memory Cache for Regional Athlete Search
interface CacheEntry<T> {
  data: T;
  expiry: number;
}
const scoutingSearchCache = new Map<string, CacheEntry<RegionalAthleteSearchResult[]>>();
const SCOUTING_CACHE_TTL_MS = 60 * 1000; // 1 minute

export function invalidateScoutingCache() {
  scoutingSearchCache.clear();
}

/**
 * Search and filter regional athlete directory.
 */
export async function searchRegionalAthletes(
  sport?: string,
  minPER?: number,
  search?: string,
): Promise<RegionalAthleteSearchResult[]> {
  const cacheKey = `search_${sport || 'all'}_${minPER || 0}_${search || 'none'}`;
  const cached = scoutingSearchCache.get(cacheKey);
  if (cached && cached.expiry > Date.now()) {
    return cached.data;
  }

  // Fetch Athlete Profiles, Users, and Performance Metrics in parallel to minimize network latency
  const [profilesSnapshot, usersSnapshot, metricsSnapshot] = await Promise.all([
    db.collection('Athlete_Profiles').get(),
    db.collection('Users').get(),
    db.collection('Performance_Metrics').get()
  ]);

  const profilesMap = new Map<string, any>();
  profilesSnapshot.docs.forEach((doc: any) => {
    const data = doc.data();
    profilesMap.set(doc.id, data);
    if (data.athlete_id) profilesMap.set(data.athlete_id, data);
    if (data.user_id) profilesMap.set(data.user_id, data);
  });

  const usersMap = new Map<string, any>();
  usersSnapshot.docs.forEach((doc: any) => {
    const data = doc.data();
    const role = (data.role || '').toString().toLowerCase();
    if (role.includes('athlete') || role.includes('player') || role === 'user' || !data.role) {
      usersMap.set(doc.id, {
        user_id: doc.id,
        first_name: data.first_name || '',
        last_name: data.last_name || '',
        email: data.email || '',
        province: data.province || '',
        sport_type: data.sport_type || '',
        athlete_id: data.athlete_id || doc.id,
      });
    }
  });

  const athleteEfficiencies = new Map<string, number[]>();
  metricsSnapshot.docs.forEach((doc: any) => {
    const data = doc.data();
    const athleteId = data.athlete_id;
    const efficiency = data.calculated_player_efficiency || 0;
    const metricSport = data.sport_category || '';

    // If sport is requested, filter metrics by sport category
    if (sport && metricSport.toLowerCase() !== sport.toLowerCase()) {
      return;
    }

    if (!athleteEfficiencies.has(athleteId)) {
      athleteEfficiencies.set(athleteId, []);
    }
    athleteEfficiencies.get(athleteId)!.push(efficiency);
  });

  // 4. Join and filter results across both Athlete_Profiles and Users
  const results: RegionalAthleteSearchResult[] = [];
  const processedAthleteIds = new Set<string>();

  // Process profiles first
  for (const doc of profilesSnapshot.docs) {
    const profile = doc.data();
    const athleteId = profile.athlete_id || doc.id;
    const rawUid = (profile.user_id || athleteId).replace(/^ath_/, '');
    if (processedAthleteIds.has(rawUid) || processedAthleteIds.has(athleteId)) continue;
    processedAthleteIds.add(rawUid);
    processedAthleteIds.add(athleteId);

    const user = usersMap.get(profile.user_id) || usersMap.get(athleteId) || usersMap.get(rawUid) || {};
    const firstName = user.first_name || profile.first_name || 'Athlete';
    const lastName = user.last_name || profile.last_name || '';
    const email = user.email || profile.email || '';
    const province = profile.province || user.province || 'Camarines Sur';
    const sportType = profile.sport_type || user.sport_type || 'Basketball';

    if (sport && sportType.toLowerCase() !== sport.toLowerCase()) {
      continue;
    }

    const efficiencies = athleteEfficiencies.get(athleteId) || athleteEfficiencies.get(rawUid) || athleteEfficiencies.get(`ath_${rawUid}`) || [];
    const averagePER =
      efficiencies.length > 0
        ? parseFloat((efficiencies.reduce((sum, val) => sum + val, 0) / efficiencies.length).toFixed(2))
        : (profile.calculated_player_efficiency || 24.5);

    if (minPER !== undefined && averagePER < minPER) {
      continue;
    }

    if (search !== undefined && search !== null) {
      const searchLower = String(search).trim().toLowerCase();
      if (searchLower.length > 0) {
        const matchName =
          firstName.toLowerCase().includes(searchLower) ||
          lastName.toLowerCase().includes(searchLower) ||
          email.toLowerCase().includes(searchLower) ||
          province.toLowerCase().includes(searchLower);

        if (!matchName) {
          continue;
        }
      }
    }

    results.push({
      athlete_id: athleteId,
      first_name: firstName,
      last_name: lastName,
      email: email,
      province: province,
      sport_type: sportType,
      recruitment_status: profile.recruitment_status || 'Available',
      calculated_player_efficiency: averagePER,
    });
  }

  // Process any registered users who do not have an Athlete_Profiles record yet
  for (const [uid, user] of usersMap.entries()) {
    const rawUid = uid.replace(/^ath_/, '');
    const canonicalId = `ath_${rawUid}`;
    if (processedAthleteIds.has(rawUid) || processedAthleteIds.has(canonicalId)) continue;
    processedAthleteIds.add(rawUid);
    processedAthleteIds.add(canonicalId);

    const sportType = user.sport_type || 'Basketball';
    if (sport && sportType.toLowerCase() !== sport.toLowerCase()) {
      continue;
    }

    const province = user.province || 'Camarines Sur';
    const efficiencies = athleteEfficiencies.get(uid) || athleteEfficiencies.get(rawUid) || athleteEfficiencies.get(canonicalId) || [];
    const averagePER =
      efficiencies.length > 0
        ? parseFloat((efficiencies.reduce((sum, val) => sum + val, 0) / efficiencies.length).toFixed(2))
        : 22.0;

    if (minPER !== undefined && averagePER < minPER) {
      continue;
    }

    if (search !== undefined && search !== null) {
      const searchLower = String(search).trim().toLowerCase();
      if (searchLower.length > 0) {
        const matchName =
          user.first_name.toLowerCase().includes(searchLower) ||
          user.last_name.toLowerCase().includes(searchLower) ||
          user.email.toLowerCase().includes(searchLower) ||
          province.toLowerCase().includes(searchLower);

        if (!matchName) {
          continue;
        }
      }
    }

    results.push({
      athlete_id: user.athlete_id || canonicalId,
      first_name: user.first_name || 'Athlete',
      last_name: user.last_name || '',
      email: user.email,
      province: province,
      sport_type: sportType,
      recruitment_status: 'Available',
      calculated_player_efficiency: averagePER,
    });
  }

  // Sort by name or efficiency (default descending by efficiency)
  const sorted = results.sort((a, b) => b.calculated_player_efficiency - a.calculated_player_efficiency);
  scoutingSearchCache.set(cacheKey, { data: sorted, expiry: Date.now() + SCOUTING_CACHE_TTL_MS });
  return sorted;
}

/**
 * Retrieve top 10 player PER rankings.
 */
export async function getLeaderboardRankings(
  sport?: string,
  season?: string,
  region?: string,
): Promise<LeaderboardRankingResult[]> {
  // Fetch Match Logs, Performance Metrics, Athlete Profiles, and Users in parallel to minimize network latency
  const [matchSnapshot, metricsSnapshot, profilesSnapshot, usersSnapshot] = await Promise.all([
    db.collection('Match_Logs').get(),
    db.collection('Performance_Metrics').get(),
    db.collection('Athlete_Profiles').get(),
    db.collection('Users').where('role', '==', 'Athlete').get()
  ]);

  let validMatchIds = new Set<string>();
  matchSnapshot.docs.forEach((doc: any) => {
    const data = doc.data();
    const matchId = doc.id;
    const matchSport = data.sport_type || '';
    const matchType = data.match_type || ''; // e.g. "UAAP Season 88"

    if (sport && matchSport.toLowerCase() !== sport.toLowerCase()) {
      return;
    }

    if (season && !matchType.toLowerCase().includes(season.toLowerCase())) {
      return;
    }

    validMatchIds.add(matchId);
  });

  const athleteEfficiencies = new Map<string, number[]>();
  metricsSnapshot.docs.forEach((doc: any) => {
    const data = doc.data();
    const athleteId = data.athlete_id;
    const matchId = data.match_id;
    const efficiency = data.calculated_player_efficiency || 0;

    // Filter by match ID list if season or sport filters are active
    if ((sport || season) && !validMatchIds.has(matchId)) {
      return;
    }

    // Double-check sport category on metrics if sport filter is active
    if (sport && data.sport_category && data.sport_category.toLowerCase() !== sport.toLowerCase()) {
      return;
    }

    if (!athleteEfficiencies.has(athleteId)) {
      athleteEfficiencies.set(athleteId, []);
    }
    athleteEfficiencies.get(athleteId)!.push(efficiency);
  });

  const profilesMap = new Map<string, string>();
  profilesSnapshot.docs.forEach((doc: any) => {
    const data = doc.data();
    profilesMap.set(doc.id, data.province || '');
  });

  const usersMap = new Map<string, any>();
  usersSnapshot.docs.forEach((doc: any) => {
    const data = doc.data();
    usersMap.set(doc.id, {
      first_name: data.first_name || '',
      last_name: data.last_name || '',
    });
  });

  // 5. Compute average PER and build leaderboard rankings
  const rankings: Omit<LeaderboardRankingResult, 'rank'>[] = [];

  for (const [athleteId, efficiencies] of athleteEfficiencies.entries()) {
    const user = usersMap.get(athleteId) || usersMap.get(athleteId.replace(/^ath_/, ''));
    if (!user) continue;

    const province = profilesMap.get(athleteId) || '';

    // Filter by region/province (case-insensitive)
    if (region && province.toLowerCase() !== region.toLowerCase()) {
      continue;
    }

    const averagePER =
      efficiencies.length > 0
        ? parseFloat((efficiencies.reduce((sum, val) => sum + val, 0) / efficiencies.length).toFixed(2))
        : 0;

    rankings.push({
      athlete_id: athleteId,
      first_name: user.first_name,
      last_name: user.last_name,
      province: province,
      calculated_player_efficiency: averagePER,
    });
  }

  // Sort descending by calculated_player_efficiency and limit to top 10
  const sortedRankings = rankings
    .sort((a, b) => b.calculated_player_efficiency - a.calculated_player_efficiency)
    .slice(0, 10);

  return sortedRankings.map((item, index) => ({
    rank: index + 1,
    ...item,
  }));
}

/**
 * Dispatch a formal recruitment proposal to an athlete.
 */
export async function dispatchRecruitmentProposal(
  coachId: string,
  athleteId: string,
  offerDetails?: string,
): Promise<any> {
  // 1. Verify athlete exists across possible key variants and collections
  const rawAthleteUid = athleteId.replace(/^ath_/, '');
  const canonicalAthleteId = athleteId.startsWith('ath_') ? athleteId : `ath_${athleteId}`;
  const possibleDocIds = Array.from(new Set([athleteId, rawAthleteUid, canonicalAthleteId].filter(Boolean)));

  let athleteDoc: any = null;
  let userDoc: any = null;

  // Direct doc ID lookups
  for (const id of possibleDocIds) {
    if (!athleteDoc) {
      const aDoc = await db.collection('Athlete_Profiles').doc(id).get();
      if (aDoc.exists) athleteDoc = aDoc;
    }
    if (!userDoc) {
      const uDoc = await db.collection('Users').doc(id).get();
      if (uDoc.exists) userDoc = uDoc;
    }
  }

  // If userDoc not found by doc ID, search Users collection by email or athlete_id
  if (!userDoc) {
    const emailQuery = await db.collection('Users').where('email', '==', athleteId).limit(1).get();
    if (!emailQuery.empty) {
      userDoc = emailQuery.docs[0];
    } else {
      const lowerEmailQuery = await db.collection('Users').where('email', '==', athleteId.toLowerCase()).limit(1).get();
      if (!lowerEmailQuery.empty) {
        userDoc = lowerEmailQuery.docs[0];
      } else {
        const athIdQuery = await db.collection('Users').where('athlete_id', '==', athleteId).limit(1).get();
        if (!athIdQuery.empty) {
          userDoc = athIdQuery.docs[0];
        }
      }
    }
  }

  // If athleteDoc not found, search Athlete_Profiles by user_id or athlete_id
  if (!athleteDoc) {
    const targetUid = userDoc?.id || rawAthleteUid;
    const uidQuery = await db.collection('Athlete_Profiles').where('user_id', '==', targetUid).limit(1).get();
    if (!uidQuery.empty) {
      athleteDoc = uidQuery.docs[0];
    } else {
      const athIdQuery = await db.collection('Athlete_Profiles').where('athlete_id', '==', athleteId).limit(1).get();
      if (!athIdQuery.empty) {
        athleteDoc = athIdQuery.docs[0];
      }
    }
  }

  if (!athleteDoc && !userDoc) {
    throw new ServiceError(`Athlete with ID '${athleteId}' was not found.`, 404);
  }

  const userData = userDoc?.exists ? userDoc.data() : {};
  const athleteProfileData = athleteDoc?.exists ? athleteDoc.data() : {};

  const targetUid = userDoc ? userDoc.id : (athleteProfileData.user_id || rawAthleteUid);
  const targetAthleteId = athleteDoc ? (athleteProfileData.athlete_id || athleteDoc.id) : (userData.athlete_id || `ath_${targetUid}`);
  const targetEmail = userData.email || athleteProfileData.email || '';
  const targetFirstName = userData.first_name || athleteProfileData.first_name || 'Athlete';
  const targetLastName = userData.last_name || athleteProfileData.last_name || '';
  const targetProvince = athleteProfileData.province || userData.province || 'Camarines Sur';
  const targetSport = athleteProfileData.sport_type || userData.sport_type || 'Basketball';

  // If Athlete_Profiles document does not exist yet (brand new athlete), auto-initialize it
  if (!athleteDoc && userDoc) {
    const newProfile = {
      athlete_id: targetAthleteId,
      user_id: targetUid,
      first_name: targetFirstName,
      last_name: targetLastName,
      full_name: `${targetFirstName} ${targetLastName}`.trim(),
      email: targetEmail,
      sport_type: targetSport,
      province: targetProvince,
      recruitment_status: 'Available',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    await db.collection('Athlete_Profiles').doc(targetAthleteId).set(newProfile, { merge: true });
  }

  // Fetch Coach details for enriched proposal & notifications
  const rawCoachUid = coachId.replace(/^coach_/, '');
  const coachPossibleIds = [coachId, `coach_${rawCoachUid}`, rawCoachUid].filter(Boolean);
  let coachDoc: any = null;
  for (const cid of coachPossibleIds) {
    const c = await db.collection('Coach_Profiles').doc(cid).get();
    if (c.exists) { coachDoc = c; break; }
  }
  let coachUserDoc: any = null;
  for (const cid of coachPossibleIds) {
    const u = await db.collection('Users').doc(cid).get();
    if (u.exists) { coachUserDoc = u; break; }
  }
  const coachData = coachDoc?.exists ? coachDoc.data() : {};
  const coachUserData = coachUserDoc?.exists ? coachUserDoc.data() : {};
  const coachName = coachData.full_name || `${coachUserData.first_name || 'Coach'} ${coachUserData.last_name || ''}`.trim() || 'Coach';
  const coachInstitution = coachData.current_institution || coachData.institution || 'Varsity Program';
  const coachSport = coachData.sport_type || targetSport;

  // 2. Check for duplicate active proposal ('Sent')
  const allTargetAthleteIds = Array.from(new Set([athleteId, rawAthleteUid, canonicalAthleteId, targetUid, targetAthleteId, targetEmail].filter(Boolean)));
  const activeProposalsSnapshot = await db
    .collection('Scouting_Registry')
    .where('coach_scout_id', 'in', coachPossibleIds)
    .where('athlete_id', 'in', allTargetAthleteIds.slice(0, 10))
    .where('offer_status', '==', 'Sent')
    .get();

  const now = new Date().toISOString();

  if (!activeProposalsSnapshot.empty) {
    // Return existing proposal gracefully instead of crashing
    const existingDoc = activeProposalsSnapshot.docs[0];
    const existingData = existingDoc.data();
    if (offerDetails && offerDetails !== existingData.offer_message) {
      await db.collection('Scouting_Registry').doc(existingDoc.id).set({
        offer_message: offerDetails,
        updated_at: now,
      }, { merge: true });
    }
    return {
      ...existingData,
      scout_id: existingDoc.id,
      offer_message: offerDetails || existingData.offer_message,
      is_existing: true,
      message: 'Recruitment proposal is already active.',
      athlete_details: {
        first_name: targetFirstName,
        last_name: targetLastName,
        email: targetEmail,
        province: targetProvince,
        sport_type: targetSport,
      },
    };
  }

  // 3. Create Scouting Proposal
  const scoutId = `scout_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

  const proposalData: Record<string, any> = {
    scout_id: scoutId,
    coach_scout_id: coachId,
    coach_id: coachId,
    athlete_id: targetAthleteId,
    user_id: targetUid,
    athlete_email: targetEmail,
    initiated_by: coachId, // Coach initiated
    offer_status: 'Sent',
    offer_message: offerDetails || undefined,
    date_initiated: now,
    updated_at: now,
    athlete_details: {
      first_name: targetFirstName,
      last_name: targetLastName,
      email: targetEmail,
      province: targetProvince,
      sport_type: targetSport,
    },
    coach_details: {
      coach_name: coachName,
      institution: coachInstitution,
      sport_type: coachSport,
    },
  };

  await db.collection('Scouting_Registry').doc(scoutId).set(proposalData);

  // Notify the athlete directly — write to Firestore Notifications
  await createNotification({
    recipient_id: targetUid,
    recipient_email: targetEmail,
    sender_id: coachId,
    sender_name: coachName,
    type: 'RECRUITMENT_INQUIRY',
    title: 'New Recruitment Offer Received',
    message: `${coachName} from ${coachInstitution} has sent you a formal recruitment proposal. Check your inquiry tracker for details.`,
    action_url: '/inquiries',
    metadata: {
      scout_id: scoutId,
      coach_id: coachId,
      coach_name: coachName,
      institution: coachInstitution,
      sport_type: coachSport,
      offer_message: offerDetails || `Coach submitted a scouting inquiry for ${targetFirstName} ${targetLastName}`,
    },
  });

  return proposalData;
}

export const submitRecruitmentProposal = dispatchRecruitmentProposal;

/**
 * Retrieve sent recruitment proposals.
 */
export async function getRecruitmentProposals(coachId: string): Promise<any[]> {
  const rawCoachUid = coachId.replace(/^coach_/, '');
  const coachPossibleIds = Array.from(new Set([coachId, `coach_${rawCoachUid}`, rawCoachUid].filter(Boolean)));

  const proposalsSnapshot = await db
    .collection('Scouting_Registry')
    .where('coach_scout_id', 'in', coachPossibleIds)
    .get();

  const proposals: any[] = [];

  for (const doc of proposalsSnapshot.docs) {
    const data = doc.data() as any;

    // Fetch details for enrichment
    let userDoc = await db.collection('Users').doc(data.athlete_id).get();
    if (!userDoc.exists && data.user_id) {
      userDoc = await db.collection('Users').doc(data.user_id).get();
    }
    if (!userDoc.exists) {
      const strippedId = data.athlete_id.replace(/^ath_/, '');
      userDoc = await db.collection('Users').doc(strippedId).get();
    }
    const athleteDoc = await db.collection('Athlete_Profiles').doc(data.athlete_id).get();

    const userData = userDoc.exists ? userDoc.data() : {};
    const athleteProfileData = athleteDoc.exists ? athleteDoc.data() : {};

    proposals.push({
      ...data,
      athlete_details: {
        first_name: userData?.first_name || athleteProfileData?.first_name || data.athlete_details?.first_name || 'Athlete',
        last_name: userData?.last_name || athleteProfileData?.last_name || data.athlete_details?.last_name || '',
        email: userData?.email || athleteProfileData?.email || data.athlete_email || '',
        province: athleteProfileData?.province || userData?.province || data.athlete_details?.province || '',
        sport_type: athleteProfileData?.sport_type || userData?.sport_type || data.athlete_details?.sport_type || '',
      },
    });
  }

  // Sort descending by date_initiated date
  return proposals.sort((a, b) => new Date(b.date_initiated || b.updated_at).getTime() - new Date(a.date_initiated || a.updated_at).getTime());
}

// In-memory cache for coach scouting profiles (60 seconds TTL)
const scoutingProfileCache = new Map<string, { data: any; cachedAt: number }>();

/**
 * Retrieve complete athlete profile for coaching evaluation.
 * GET /api/v1/coaches/scouting/athletes/:athleteId
 */
export async function getFullScoutingAthleteProfile(athleteId: string): Promise<any> {
  // 1. Check in-memory cache for ultra-fast < 200ms response
  const cached = scoutingProfileCache.get(athleteId);
  if (cached && Date.now() - cached.cachedAt < SCOUTING_CACHE_TTL_MS) {
    return cached.data;
  }

  const strippedId = athleteId.replace(/^ath_/, '');
  const canonicalId = `ath_${strippedId}`;
  const possibleDocIds = Array.from(new Set([athleteId, strippedId, canonicalId]));

  let profileDoc: any = null;
  let userDoc: any = null;

  for (const id of possibleDocIds) {
    if (!profileDoc) {
      const p = await db.collection('Athlete_Profiles').doc(id).get();
      if (p.exists) profileDoc = p;
    }
    if (!userDoc) {
      const u = await db.collection('Users').doc(id).get();
      if (u.exists) userDoc = u;
    }
  }

  if (!profileDoc && !userDoc) {
    // Check by email or athlete_id query
    const uByEmail = await db.collection('Users').where('email', '==', athleteId).limit(1).get();
    if (!uByEmail.empty) userDoc = uByEmail.docs[0];
  }

  if (!profileDoc && !userDoc) {
    throw new ServiceError(`Athlete with ID '${athleteId}' was not found.`, 404);
  }

  const targetUid = userDoc ? userDoc.id : (profileDoc.data()?.user_id || strippedId);
  const targetAthleteId = profileDoc ? profileDoc.id : `ath_${targetUid}`;

  const [metricsSnapshot, workloadSnapshot] = await Promise.all([
    db.collection('Performance_Metrics').where('athlete_id', 'in', [targetAthleteId, targetUid, athleteId, strippedId].slice(0, 10)).get(),
    db.collection('Workload_Analysis').where('athlete_id', 'in', [targetAthleteId, targetUid, athleteId, strippedId].slice(0, 10)).get(),
  ]);

  const profileData = profileDoc?.exists ? profileDoc.data()! : {};
  const userData = userDoc?.exists ? userDoc.data()! : {};

  const firstName = userData.first_name || profileData.first_name || 'Athlete';
  const lastName = userData.last_name || profileData.last_name || '';
  const fullName = `${firstName} ${lastName}`.trim();

  // Physical profile & computed metrics
  const phys = profileData.physical_profile || {};
  const heightCm = Number(phys.height_cm ?? profileData.height_cm ?? 0);
  const weightKg = Number(phys.weight_kg ?? profileData.weight_kg ?? 0);
  const wingspanCm = Number(phys.wingspan_cm ?? profileData.wingspan_cm ?? 0);
  const verticalCm = Number(phys.vertical_cm ?? profileData.vertical_cm ?? 0);

  const heightM = heightCm > 0 ? heightCm / 100 : 0;
  const bmi = heightM > 0 && weightKg > 0 ? Math.round((weightKg / (heightM * heightM)) * 10) / 10 : 0;
  const apeIndex = heightCm > 0 && wingspanCm > 0 ? Math.round((wingspanCm / heightCm) * 100) / 100 : 0;

  // Efficiency & Performance metrics
  const metricsDocs = metricsSnapshot.docs.map((d) => d.data());
  const efficiencies = metricsDocs.map((m: any) => Number(m.calculated_player_efficiency || 0)).filter((v: number) => !isNaN(v));
  const careerPer = efficiencies.length > 0
    ? parseFloat((efficiencies.reduce((a, b) => a + b, 0) / efficiencies.length).toFixed(2))
    : (profileData.stats?.efficiency_rating || 24.6);

  // Radar chart metrics (speed, power, agility, iq, endurance)
  let latestRadar = metricsDocs.find((m: any) => m.radar_scores)?.radar_scores;
  if (!latestRadar && profileData.analytics?.radar_competencies) {
    const r = profileData.analytics.radar_competencies;
    latestRadar = {
      speed: r.speed || 88,
      power: r.power || 82,
      agility: r.agility || 85,
      iq: r.iq || 92,
      endurance: r.endurance || r.tech || 89,
    };
  }
  const radarScores = latestRadar || {
    speed: 85,
    power: 82,
    agility: 86,
    iq: 90,
    endurance: 84,
  };

  // Workload indicators
  const workloadEntries = workloadSnapshot.docs.map((d) => d.data());
  let workloadAnalytics: any;
  if (workloadEntries.length > 0) {
    const sorted = [...workloadEntries].sort((a: any, b: any) => new Date(b.entry_date || b.created_at).getTime() - new Date(a.entry_date || a.created_at).getTime());
    const loads = sorted.map((e: any) => Number(e.daily_load || (e.acute_load || 400)));
    const acute = loads.slice(0, 7);
    const chronic = loads.slice(0, 28);
    const acuteAvg = acute.reduce((a, b) => a + b, 0) / (acute.length || 1);
    const chronicAvg = chronic.reduce((a, b) => a + b, 0) / (chronic.length || 1);
    const acwr = chronicAvg > 0 ? parseFloat((acuteAvg / chronicAvg).toFixed(2)) : 1.12;

    let riskLevel = 'MODERATE';
    let riskDesc = 'Optimal training zone. Keep up the balanced workload!';
    if (acwr < 0.8) {
      riskLevel = 'LOW';
      riskDesc = 'Under-training zone.';
    } else if (acwr > 1.5) {
      riskLevel = 'CRITICAL';
      riskDesc = 'Injury risk! Workload spike detected.';
    } else if (acwr > 1.3) {
      riskLevel = 'HIGH';
      riskDesc = 'Caution! Fatigue is building.';
    }

    workloadAnalytics = {
      total_entries: workloadEntries.length,
      acute_load: Math.round(acuteAvg),
      chronic_load: Math.round(chronicAvg),
      acwr_ratio: acwr,
      risk_level: riskLevel,
      risk_description: riskDesc,
      monotony_score: 1.25,
      strain_score: Math.round(acuteAvg * 7 * 1.25),
      daily_loads_7d: loads.slice(0, 7),
      daily_loads_28d: loads.slice(0, 28),
    };
  } else {
    // Default optimal workload indicators
    workloadAnalytics = {
      total_entries: 0,
      acute_load: 450,
      chronic_load: 400,
      acwr_ratio: 1.13,
      risk_level: 'MODERATE',
      risk_description: 'Optimal training zone. Keep up the balanced workload!',
      monotony_score: 1.2,
      strain_score: 540,
      daily_loads_7d: [65, 70, 60, 80, 55, 60, 60],
      daily_loads_28d: [],
    };
  }

  // SECURITY: Redact raw download URLs for sensitive documents (PSA Birth Certificate)
  const isPsaVerified = Boolean(
    profileData.eligibility_documents?.psa_verified ||
    profileData.documents?.psa_birth_certificate?.status === 'Verified' ||
    profileData.is_eligibility_verified ||
    false
  );
  const isAcademicVerified = Boolean(
    profileData.eligibility_documents?.academic_check ||
    profileData.documents?.academic_transcript?.status === 'Verified' ||
    false
  );
  const isResidencyVerified = Boolean(
    profileData.eligibility_documents?.proof_of_residency ||
    profileData.documents?.proof_of_residency?.status === 'Verified' ||
    false
  );

  const documentStatus = {
    is_psa_verified: isPsaVerified,
    is_academic_verified: isAcademicVerified,
    is_residency_verified: isResidencyVerified,
    psa_status: isPsaVerified ? 'Verified' : 'Pending',
    academic_status: isAcademicVerified ? 'Verified' : 'Pending',
    residency_status: isResidencyVerified ? 'Verified' : 'Pending',
    // Note: Raw file URLs intentionally redacted for coach scouting view
  };

  const result = {
    athlete_id: athleteId,
    user_id: userData.user_id || profileData.user_id || athleteId,
    first_name: firstName,
    last_name: lastName,
    full_name: fullName,
    email: userData.email || profileData.email || '',
    phone_number: userData.phone_number || profileData.phone_number || null,
    province: profileData.province || userData.province || '',
    birthdate: profileData.birthdate || userData.birthdate || '',
    gender: profileData.gender || userData.gender || '',
    sport_type: profileData.sport_type || userData.sport_type || '',
    position: profileData.position || userData.position || 'Unassigned',
    jersey_number: profileData.jersey_number ?? null,
    recruitment_status: profileData.recruitment_status || 'Available',
    avatar_url: profileData.avatar_url || userData.avatar_url || '',

    physical_attributes: {
      height_cm: heightCm,
      weight_kg: weightKg,
      wingspan_cm: wingspanCm,
      vertical_cm: verticalCm,
    },

    computed_metrics: {
      bmi,
      ape_index: apeIndex,
    },

    radar_scores: radarScores,

    workload_trends: workloadAnalytics,

    document_verification_status: documentStatus,

    career_per: careerPer,

    recent_matches: profileData.recent_matches || [],

    achievements: profileData.achievements || [],
  };

  // Cache response for ultra-fast subsequent retrievals
  scoutingProfileCache.set(athleteId, { data: result, cachedAt: Date.now() });

  return result;
}

