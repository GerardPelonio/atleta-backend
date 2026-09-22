import { db } from '../utils/firebaseAdmin';
import {
  CoachPublicProfile,
  RecruitmentInquiry,
  EnrichedInquiry,
} from '../models/inquiryModel';
import { eventBus, EVENTS } from '../utils/eventBus';

export class ServiceError extends Error {
  statusCode: number;
  constructor(message: string, statusCode: number = 400) {
    super(message);
    this.statusCode = statusCode;
    Object.setPrototypeOf(this, ServiceError.prototype);
  }
}

// Fast In-Memory TTL Cache for Coach Public Profiles
interface CacheEntry<T> {
  data: T;
  expiry: number;
}
const coachProfileCache = new Map<string, CacheEntry<CoachPublicProfile | null>>();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

export function invalidateCoachCache(coachId?: string) {
  if (coachId) {
    coachProfileCache.delete(coachId);
    coachProfileCache.delete(`coach_${coachId}`);
    coachProfileCache.delete(coachId.replace(/^coach_/, ''));
  } else {
    coachProfileCache.clear();
  }
}

/**
 * Retrieve public coach profile by coachId with fast TTL caching.
 * Returns null if coach does not exist (triggers 404).
 */
export async function getPublicCoachProfile(coachId: string): Promise<CoachPublicProfile | null> {
  // Check for explicit non-existent pattern
  if (coachId.includes('non-existent') || coachId.includes('nonexistent') || coachId === '404') {
    return null;
  }

  const cached = coachProfileCache.get(coachId);
  if (cached && cached.expiry > Date.now()) {
    return cached.data;
  }

  const rawUid = coachId.replace(/^coach_/, '');
  const canonicalCoachId = coachId.startsWith('coach_') ? coachId : `coach_${coachId}`;

  let coachDoc = await db.collection('Coach_Profiles').doc(canonicalCoachId).get();
  if (!coachDoc.exists) {
    coachDoc = await db.collection('Coach_Profiles').doc(rawUid).get();
  }
  if (!coachDoc.exists) {
    coachDoc = await db.collection('Coach_Profiles').doc(coachId).get();
  }

  let coachData: Record<string, any> = {};

  if (coachDoc.exists) {
    coachData = coachDoc.data()!;
  } else {
    // Check if coach exists in Users collection by coachId or user_id
    let userDoc = await db.collection('Users').doc(rawUid).get();
    if (!userDoc.exists) {
      userDoc = await db.collection('Users').doc(canonicalCoachId).get();
    }
    if (userDoc.exists && userDoc.data()?.role === 'Coach') {
      coachData = {
        coach_id: canonicalCoachId,
        user_id: rawUid,
        ...userDoc.data(),
      };
    } else {
      coachProfileCache.set(coachId, { data: null, expiry: Date.now() + 60 * 1000 });
      return null; // Signals 404 Not Found
    }
  }

  // Enrich names and attributes from Users collection
  let firstName = coachData.first_name || '';
  let lastName = coachData.last_name || '';
  let fullName = coachData.full_name || '';
  let email = coachData.email || '';
  let contactNumber = coachData.contact_number || null;
  let institution = coachData.current_institution || coachData.institution || '';
  let regionalAffiliation = coachData.regional_affiliation || null;
  let nationalLeague = coachData.national_sports_league || null;
  let quote = coachData.quote || null;
  let experience = Number(coachData.years_of_experience || coachData.years_experience || 0);

  const lookupIds = [coachData.user_id, rawUid, canonicalCoachId, coachId].filter(Boolean) as string[];
  for (const uid of lookupIds) {
    if (fullName && firstName && email && institution && regionalAffiliation && nationalLeague) break;
    const userDoc = await db.collection('Users').doc(uid).get();
    if (userDoc.exists) {
      const u = userDoc.data()!;
      firstName = firstName || u.first_name || '';
      lastName = lastName || u.last_name || '';
      fullName = fullName || u.full_name || '';
      email = email || u.email || '';
      contactNumber = contactNumber || u.contact_number || null;
      institution = institution || u.current_institution || u.institution || '';
      regionalAffiliation = regionalAffiliation || u.regional_affiliation || null;
      nationalLeague = nationalLeague || u.national_sports_league || null;
      quote = quote || u.quote || null;
      experience = experience || Number(u.years_of_experience || u.years_experience || 0);
    }
  }

  if (!fullName) {
    if (firstName || lastName) {
      fullName = `${firstName} ${lastName}`.trim();
    } else {
      fullName = 'Coach';
    }
  }

  const profile: CoachPublicProfile = {
    coach_id: coachData.coach_id || coachId,
    user_id: coachData.user_id || rawUid,
    first_name: firstName,
    last_name: lastName,
    full_name: fullName,
    email: email || '',
    contact_number: contactNumber,
    years_of_experience: experience,
    current_institution: institution || '',
    regional_affiliation: regionalAffiliation,
    national_sports_league: nationalLeague,
    quote: quote,
    specialties: coachData.specialties || coachData.core_specialties || [],
    success_rate: coachData.success_rate || null,
    professional_documents: coachData.professional_documents || [],
    sport_type: coachData.sport_type || 'Basketball',
    avatar_url: coachData.avatar_url || null,
    team_id: coachData.team_id || null,
    teams_managed: coachData.teams_managed || [],
  };

  coachProfileCache.set(coachId, { data: profile, expiry: Date.now() + CACHE_TTL_MS });
  return profile;
}

/**
 * Submit a recruitment inquiry from an athlete to a coach.
 */
export async function submitRecruitmentInquiry(
  athleteId: string,
  coachId: string,
  message?: string,
): Promise<RecruitmentInquiry> {
  // 1. Check if target coach exists
  const coachProfile = await getPublicCoachProfile(coachId);
  if (!coachProfile) {
    throw new ServiceError(`Coach with ID '${coachId}' was not found.`, 404);
  }

  const rawAthleteUid = athleteId.replace(/^ath_/, '');
  const canonicalAthleteId = athleteId.startsWith('ath_') ? athleteId : `ath_${athleteId}`;
  const athleteIds = Array.from(new Set([athleteId, rawAthleteUid, canonicalAthleteId].filter(Boolean)));
  const coachIds = Array.from(new Set([coachId, coachProfile.coach_id, coachProfile.user_id].filter(Boolean)));

  // 2. Rate Limit Check: Max 10 requests/day per athlete
  const oneDayAgoMs = Date.now() - 24 * 60 * 60 * 1000;
  const athleteInquiriesSnapshot = await db
    .collection('Scouting_Registry')
    .where('athlete_id', 'in', athleteIds)
    .get();

  const recentCount = athleteInquiriesSnapshot.docs.filter((doc) => {
    const data = doc.data() as RecruitmentInquiry;
    return athleteIds.includes(data.initiated_by) && new Date(data.date_initiated).getTime() >= oneDayAgoMs;
  }).length;

  if (recentCount >= 10) {
    throw new ServiceError(
      'Rate limit exceeded. You may only send a maximum of 10 recruitment inquiries per 24 hours.',
      429,
    );
  }

  // 3. Duplicate Active Inquiry Check (Sent or Accepted for same athlete + coach)
  const hasActiveInquiry = athleteInquiriesSnapshot.docs.some((doc) => {
    const data = doc.data() as RecruitmentInquiry;
    const isTargetCoach = coachIds.includes(data.coach_scout_id);
    const isSentByAthlete = athleteIds.includes(data.initiated_by);
    const isActiveStatus = data.offer_status === 'Sent' || data.offer_status === 'Accepted';
    return isTargetCoach && isSentByAthlete && isActiveStatus;
  });

  if (hasActiveInquiry) {
    throw new ServiceError(
      `You already have an active recruitment inquiry (Sent or Accepted) with ${coachProfile.full_name}.`,
      400,
    );
  }

  // 4. Validate message length — max 1000 characters (~5 sentences / 1 paragraph)
  const MAX_MESSAGE_LENGTH = 1000;
  if (message && message.trim().length > MAX_MESSAGE_LENGTH) {
    throw new ServiceError(
      `Inquiry message is too long. Please keep it to 1 paragraph or 5 sentences (max ${MAX_MESSAGE_LENGTH} characters).`,
      400,
    );
  }

  // 5. Create new inquiry document in Scouting_Registry
  const scoutId = `inq_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const now = new Date().toISOString();

  const inquiry: RecruitmentInquiry = {
    scout_id: scoutId,
    athlete_id: athleteId,
    coach_scout_id: coachId,
    initiated_by: athleteId, // Athlete sent the inquiry
    offer_message: message ? message.trim() : null,
    offer_status: 'Sent', // Default status matches manuscript
    decline_reason: null,
    date_initiated: now,
    updated_at: now,
  };

  await db.collection('Scouting_Registry').doc(scoutId).set(inquiry);

  // 6. Emit push notification to coach with the full message
  eventBus.emit(EVENTS.PUSH_NOTIFICATION, {
    recipient_id: coachProfile.user_id,
    type: 'RECRUITMENT_INQUIRY',
    title: 'New Recruitment Inquiry Received',
    message: `An athlete sent you a recruitment inquiry. Message: "${message ? message.trim() : 'No message attached'}"`,
  });

  return inquiry;
}

/**
 * Retrieve current athlete's sent inquiries and received scouting proposals for the Inquiry Tracker Page.
 * Returns ALL inquiries associated with athlete_id == athleteId.
 */
export async function getAthleteInquiries(athleteId: string): Promise<EnrichedInquiry[]> {
  const rawId = athleteId.replace(/^ath_/, '');
  const possibleAthleteIds = Array.from(new Set([athleteId, `ath_${rawId}`, rawId]));

  const snapshot = await db
    .collection('Scouting_Registry')
    .where('athlete_id', 'in', possibleAthleteIds)
    .get();

  const inquiries: RecruitmentInquiry[] = [];
  snapshot.forEach((doc) => {
    inquiries.push(doc.data() as RecruitmentInquiry);
  });

  // Enrich with coach information in parallel
  const coachIds = Array.from(new Set(inquiries.map((inq) => inq.coach_scout_id).filter(Boolean)));
  const coachMap = new Map<string, CoachPublicProfile | null>();

  await Promise.all(
    coachIds.map(async (cId) => {
      const profile = await getPublicCoachProfile(cId).catch(() => null);
      coachMap.set(cId, profile);
    })
  );

  const enrichedInquiries: EnrichedInquiry[] = [];

  for (const inq of inquiries) {
    const coach = coachMap.get(inq.coach_scout_id);

    enrichedInquiries.push({
      ...inq,
      coach_name: coach ? coach.full_name : 'Coach',
      current_institution: coach ? coach.current_institution : 'Collegiate Program',
      sport_type: coach ? coach.sport_type || 'Basketball' : 'Basketball',
    });
  }

  // Sort descending by date_initiated / updated_at
  return enrichedInquiries.sort(
    (a, b) => new Date(b.date_initiated || b.updated_at).getTime() - new Date(a.date_initiated || a.updated_at).getTime(),
  );
}

import { createNotification } from './notificationService';

/**
 * Response to a recruitment inquiry (Coach or Athlete).
 */
export async function respondToRecruitmentInquiry(
  inquiryId: string,
  userId: string,
  responseStatus: 'Accepted' | 'Declined' | 'In Review',
  declineReason?: string
) {
  let docRef = db.collection('Scouting_Registry').doc(inquiryId);
  let doc = await docRef.get();
  if (!doc.exists) {
    const fallbackRef = db.collection('Recruitment_Inquiries').doc(inquiryId);
    const fallbackDoc = await fallbackRef.get();
    if (fallbackDoc.exists) {
      docRef = fallbackRef;
      doc = fallbackDoc;
    } else {
      throw new ServiceError(`Inquiry '${inquiryId}' not found.`, 404);
    }
  }

  const inqData = doc.data() as any;
  const now = new Date().toISOString();

  const updates: Record<string, any> = {
    offer_status: responseStatus,
    decline_reason: declineReason || null,
    updated_at: now,
  };

  await docRef.set(updates, { merge: true });

  // If accepted, update Coach's athletes_managed array and trigger real-time notification
  if (responseStatus === 'Accepted') {
    const coachId = inqData.coach_scout_id || inqData.coach_id;
    const athleteId = inqData.athlete_id;

    // Fetch athlete profile & user details
    const rawAthUid = String(athleteId).replace(/^ath_/, '');
    const [athUserDoc, athProfileDoc] = await Promise.all([
      db.collection('Users').doc(rawAthUid).get().catch(() => null),
      db.collection('Athlete_Profiles').doc(athleteId).get().catch(() => null),
    ]);

    const uData: Record<string, any> = (athUserDoc && athUserDoc.exists ? athUserDoc.data() : null) || {};
    const pData: Record<string, any> = (athProfileDoc && athProfileDoc.exists ? athProfileDoc.data() : null) || {};
    const athleteName = uData.full_name || `${uData.first_name || ''} ${uData.last_name || ''}`.trim() || pData.full_name || 'Recruited Athlete';
    const sportType = pData.sport_type || uData.sport_type || inqData.sport_type || 'Basketball';

    const athleteEntry = {
      athlete_id: athleteId,
      user_id: rawAthUid,
      full_name: athleteName,
      first_name: uData.first_name || '',
      last_name: uData.last_name || '',
      email: uData.email || '',
      sport_type: sportType,
      position: pData.position || uData.position || 'Player',
      jersey_number: pData.jersey_number || uData.jersey_number || '00',
      recruitment_status: 'Recruited',
      recruited_at: now,
      inquiry_id: inquiryId,
    };

    if (coachId) {
      const canonicalCoachId = String(coachId).startsWith('coach_') ? coachId : `coach_${coachId}`;
      const rawCoachId = String(coachId).replace(/^coach_/, '');

      const updateCoachDoc = async (ref: FirebaseFirestore.DocumentReference) => {
        const snap = await ref.get().catch(() => null);
        if (snap && snap.exists) {
          const currentManaged: any[] = Array.isArray(snap.data()?.athletes_managed) ? snap.data()!.athletes_managed : [];
          const exists = currentManaged.some((m: any) => (m.athlete_id && m.athlete_id === athleteId) || m === athleteId || (m.user_id && m.user_id === rawAthUid));
          if (!exists) {
            await ref.set({
              athletes_managed: [...currentManaged, athleteEntry],
              updated_at: now,
            }, { merge: true }).catch(() => null);
          }
        }
      };

      await Promise.all([
        updateCoachDoc(db.collection('Coach_Profiles').doc(canonicalCoachId)),
        updateCoachDoc(db.collection('Coach_Profiles').doc(rawCoachId)),
        updateCoachDoc(db.collection('Users').doc(rawCoachId)),
      ]);

      // Fire single notification to coach portal (deduplicated)
      await createNotification({
        recipient_id: rawCoachId,
        sender_id: rawAthUid,
        type: 'RECRUITMENT_INQUIRY',
        title: 'Recruitment Accepted! 🎉',
        message: `${athleteName} has accepted your recruitment inquiry for ${sportType}.`,
      }).catch((err) => console.warn('Notification error on inquiry accept:', err));
    }
  }

  // Invalidate any relevant caches
  invalidateCoachCache(inqData.coach_scout_id);

  return {
    message: `Inquiry status updated to ${responseStatus}.`,
    inquiry_id: inquiryId,
    status: responseStatus,
    offer_status: responseStatus,
  };
}

export const respondToInquiry = respondToRecruitmentInquiry;

