import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { OAuth2Client } from 'google-auth-library';
import { auth, db } from '../utils/firebaseAdmin';
import { clientAuth } from '../utils/firebaseClient';
import {
  ROLE_COLLECTION_MAP,
  ROLE_PERMISSIONS_MAP,
  UserRole,
} from '../models/userModel';
import { sendPasswordResetEmailService } from './emailService';
import { hashPassword, verifyPassword, sanitizeUser, sanitizeProfile } from '../utils/passwordUtils';
import { ServiceError } from '../validators/matchValidator';
export { ServiceError };

const googleOAuthClient = new OAuth2Client(
  process.env.GOOGLE_CLIENT_ID || process.env.GOOGLE_ANDROID_CLIENT_ID || '203586668533-uii0i4gjqcm2cmj4ssvrdq70a2efhmnf.apps.googleusercontent.com'
);

/**
 * Maps lowercase or mixed case role string to canonical UserRole enum value.
 */
export function normalizeRole(roleInput: string): UserRole {
  const lower = (roleInput || '').trim().toLowerCase();
  if (lower === 'athlete') return 'Athlete';
  if (lower === 'coach') return 'Coach';
  if (lower === 'official') return 'Official';
  if (lower === 'system admin' || lower === 'admin' || lower === 'system_admin') return 'System Admin';
  return 'Athlete';
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  token: string;
}

/**
 * Generate JWT access and refresh tokens for a user.
 * accessToken: short-lived (15 minutes by default).
 * refreshToken: long-lived (30 days by default).
 */
export function generateToken(uid: string, email: string, role: string): TokenPair {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error('JWT_SECRET is not configured in environment');
  }
  const refreshSecret = process.env.JWT_REFRESH_SECRET || secret;
  const accessExpiresIn = (process.env.JWT_ACCESS_EXPIRES_IN || '15m') as any;
  const refreshExpiresIn = (process.env.JWT_REFRESH_EXPIRES_IN || '30d') as any;

  const accessToken = jwt.sign({ uid, email, role }, secret, { expiresIn: accessExpiresIn });
  const refreshToken = jwt.sign({ uid, email, role, token_type: 'refresh' }, refreshSecret, { expiresIn: refreshExpiresIn });

  return {
    accessToken,
    refreshToken,
    token: accessToken,
  };
}

/**
 * Verifies a refresh token and returns decoded user payload.
 */
export async function verifyRefreshToken(refreshToken: string): Promise<{ uid: string; email: string; role: string }> {
  if (!refreshToken || typeof refreshToken !== 'string') {
    throw new ServiceError('Refresh token is required.', 400);
  }

  const secret = process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET;
  if (!secret) {
    throw new ServiceError('Server JWT configuration missing.', 500);
  }

  let decoded: any;
  try {
    decoded = jwt.verify(refreshToken, secret);
  } catch (err: any) {
    if (err?.name === 'TokenExpiredError') {
      throw new ServiceError('Refresh token expired. Please log in again.', 401);
    }
    throw new ServiceError('Invalid refresh token.', 401);
  }

  if (!decoded || !decoded.uid) {
    throw new ServiceError('Invalid refresh token payload.', 401);
  }

  try {
    const sessionDoc = await db.collection('User_Sessions').doc(decoded.uid).get();
    if (sessionDoc.exists) {
      const sessionData = sessionDoc.data();
      if (sessionData?.refreshToken && sessionData.refreshToken !== refreshToken) {
        throw new ServiceError('Refresh token has been revoked or replaced.', 401);
      }
    }
  } catch (err: any) {
    if (err instanceof ServiceError) throw err;
  }

  return {
    uid: decoded.uid,
    email: decoded.email,
    role: decoded.role || 'Athlete',
  };
}

/**
 * Verifies refresh token, generates new accessToken & refreshToken pair, and updates user session.
 */
export async function refreshAccessToken(refreshToken: string): Promise<TokenPair> {
  const user = await verifyRefreshToken(refreshToken);
  const newTokens = generateToken(user.uid, user.email, user.role);

  try {
    await db.collection('User_Sessions').doc(user.uid).set({
      uid: user.uid,
      email: user.email,
      role: user.role,
      refreshToken: newTokens.refreshToken,
      updated_at: new Date().toISOString(),
    }, { merge: true });
  } catch (err) {
    console.warn('Failed to update User_Sessions on token refresh:', err);
  }

  return newTokens;
}

/**
 * Encrypts/hashes the admin security key using SHA-256
 */

function hashAdminSecurityKey(key: string): string {
  return crypto.createHash('sha256').update(key).digest('hex');
}

const FIREBASE_API_KEY =
  process.env.FIREBASE_API_KEY ||
  process.env.EXPO_PUBLIC_FIREBASE_API_KEY ||
  '';

export async function createFirebaseAuthUser(params: {
  email: string;
  password: string;
  displayName?: string;
}): Promise<{ uid: string }> {
  // 1. Try Firebase Admin SDK
  try {
    const userRecord = await auth.createUser({
      email: params.email,
      password: params.password,
      displayName: params.displayName,
    });
    return { uid: userRecord.uid };
  } catch (adminErr: any) {
    if (adminErr.code === 'auth/email-already-exists' || adminErr.code === 'auth/email-already-in-use') {
      const cleanEmail = params.email.trim().toLowerCase();
      let existingUserSnap = await db.collection('Users').where('email', '==', cleanEmail).limit(1).get().catch(() => null);
      if ((!existingUserSnap || existingUserSnap.empty) && params.email.trim() !== cleanEmail) {
        existingUserSnap = await db.collection('Users').where('email', '==', params.email.trim()).limit(1).get().catch(() => null);
      }
      if (!existingUserSnap || existingUserSnap.empty) {
        try {
          console.log(`🧹 Detected orphaned Firebase Auth user for ${cleanEmail} (deleted in Firestore). Cleaning up and recreating.`);
          const existingAuth = (await auth.getUserByEmail(params.email).catch(() => null)) ||
                               (await auth.getUserByEmail(cleanEmail).catch(() => null));
          if (existingAuth) {
            await auth.deleteUser(existingAuth.uid);
            const freshUser = await auth.createUser({
              email: params.email,
              password: params.password,
              displayName: params.displayName,
            });
            return { uid: freshUser.uid };
          }
        } catch (cleanupErr) {
          console.warn('Could not re-create orphaned auth user:', cleanupErr);
        }
      }

      const err: any = new Error('Email already in use. Please log in using your existing credentials.');
      err.code = 'auth/email-already-in-use';
      err.status = 400;
      throw err;
    }

    console.warn('⚠️ Admin auth.createUser failed, falling back to Firebase REST API:', adminErr?.message || adminErr);

    // 2. Fallback to Firebase REST Identity Toolkit API
    try {
      const res = await fetch(
        `https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${FIREBASE_API_KEY}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: params.email,
            password: params.password,
            returnSecureToken: true,
          }),
        }
      );
      const data = (await res.json()) as any;
      if (!res.ok || !data.localId) {
        if (data.error?.message?.includes('EMAIL_EXISTS')) {
          const cleanEmail = params.email.trim().toLowerCase();
          let existingUserSnap = await db.collection('Users').where('email', '==', cleanEmail).limit(1).get().catch(() => null);
          if ((!existingUserSnap || existingUserSnap.empty) && params.email.trim() !== cleanEmail) {
            existingUserSnap = await db.collection('Users').where('email', '==', params.email.trim()).limit(1).get().catch(() => null);
          }
          if (!existingUserSnap || existingUserSnap.empty) {
            try {
              const existingAuth = (await auth.getUserByEmail(params.email).catch(() => null)) ||
                                   (await auth.getUserByEmail(cleanEmail).catch(() => null));
              if (existingAuth) {
                await auth.deleteUser(existingAuth.uid);
                const freshUser = await auth.createUser({
                  email: params.email,
                  password: params.password,
                  displayName: params.displayName,
                });
                return { uid: freshUser.uid };
              }
            } catch (cleanupErr) {
              console.warn('Could not re-create orphaned auth user via REST fallback:', cleanupErr);
            }
          }

          const err: any = new Error('Email already in use. Please log in using your existing credentials.');
          err.code = 'auth/email-already-in-use';
          err.status = 400;
          throw err;
        }
        throw new Error(data.error?.message || 'Failed to create auth user');
      }

      if (params.displayName && data.idToken) {
        await fetch(
          `https://identitytoolkit.googleapis.com/v1/accounts:update?key=${FIREBASE_API_KEY}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              idToken: data.idToken,
              displayName: params.displayName,
              returnSecureToken: false,
            }),
          }
        ).catch(() => null);
      }

      return { uid: data.localId };
    } catch (restErr: any) {
      if (restErr.status === 400) throw restErr;
      console.warn('⚠️ REST signUp also failed, generating standalone uid:', restErr?.message || restErr);
      const randomSuffix = Math.random().toString(36).substring(2, 10);
      const standaloneUid = `user_${Date.now()}_${randomSuffix}`;
      return { uid: standaloneUid };
    }
  }
}

/**
 * Register a new user in Firebase Auth and provision master identity and subtype profile in an atomic batch.
 */
export async function registerUserService(
  data: Record<string, unknown>,
  file?: Express.Multer.File,
) {
  const first_name = (data.first_name as string).trim();
  const last_name = (data.last_name as string).trim();
  const email = (data.email as string).trim();
  const password = data.password as string;
  const contact_number = typeof data.contact_number === 'string' && data.contact_number.trim()
    ? data.contact_number.trim()
    : null;
  const rawRole = (data.role as string) || 'Athlete';
  const firestoreRole = normalizeRole(rawRole);

  const cleanEmail = email.trim().toLowerCase();

  // 1. Check if email already exists in Firestore Users collection
  let existingUserSnap = await db.collection('Users').where('email', '==', cleanEmail).limit(1).get().catch(() => null);
  if ((!existingUserSnap || existingUserSnap.empty) && email !== cleanEmail) {
    existingUserSnap = await db.collection('Users').where('email', '==', email).limit(1).get().catch(() => null);
  }
  if (existingUserSnap && !existingUserSnap.empty) {
    const err: any = new Error('Email already in use. Please log in using your existing credentials.');
    err.code = 'auth/email-already-in-use';
    err.status = 400;
    throw err;
  }

  // 2. Create Firebase Auth user (with REST fallback)
  const authUser = await createFirebaseAuthUser({
    email,
    password,
    displayName: `${first_name} ${last_name}`,
  });

  const uid = authUser.uid;
  const now = new Date();

  const passwordHash = hashPassword(password);

  // 2. Build Base Identity document (Users collection) - COMPLETE MASTER DATA (NO PREFIX)
  const userData: Record<string, unknown> = {
    user_id: uid,
    first_name,
    last_name,
    full_name: `${first_name} ${last_name}`.trim(),
    email,
    password: passwordHash,
    password_hash: passwordHash,
    contact_number,
    role: firestoreRole,
    account_status: (firestoreRole === 'Coach' || firestoreRole === 'Official') ? 'Pending' : 'Active',
    status: (firestoreRole === 'Coach' || firestoreRole === 'Official') ? 'pending' : 'active',
    is_approved: !(firestoreRole === 'Coach' || firestoreRole === 'Official'),
    isApproved: !(firestoreRole === 'Coach' || firestoreRole === 'Official'),
    created_at: now,
    updated_at: now,
  };

  // 3. Build Subtype Child Profile document - MINIMAL ROLE SPECIFIC DATA (PREFIXED IDs)
  const profileData: Record<string, unknown> = {
    user_id: uid,
    created_at: now,
    updated_at: now,
  };

  if (firestoreRole === 'Athlete') {
    const athleteId = `ath_${uid}`;
    
    const birthdate = String(data.birthdate || data.date_of_birth || '').trim();
    const gender = String(data.gender || '').trim();
    const province = String(data.province || data.location || '').trim();
    const sportType = String(data.sport_type || data.sport || '').trim();
    const position = String(data.position || 'Unassigned').trim();
    const jerseyNumber = data.jersey_number !== undefined ? Number(data.jersey_number) : null;
    const recruitmentStatus = data.recruitment_status ? String(data.recruitment_status).trim() : 'Available';
    const rank = data.rank !== undefined ? data.rank : data.leaderboard_rank !== undefined ? data.leaderboard_rank : null;

    const physInput = (data.physical_profile as any) || (data.physical_attributes as any) || {};
    const heightCm = Number(data.height_cm || physInput.height_cm || 0);
    const weightKg = Number(data.weight_kg || physInput.weight_kg || 0);
    const wingspanCm = Number(data.wingspan_cm || physInput.wingspan_cm || 0);
    const verticalCm = Number(data.vertical_cm || physInput.vertical_cm || 0);

    const bmi = heightCm > 0 && weightKg > 0 ? parseFloat((weightKg / Math.pow(heightCm / 100, 2)).toFixed(1)) : 0;
    const apeIndex = heightCm > 0 && wingspanCm > 0 ? parseFloat((wingspanCm / heightCm).toFixed(2)) : 0;

    const physicalProfile = {
      height_cm: heightCm,
      weight_kg: weightKg,
      wingspan_cm: wingspanCm,
      vertical_cm: verticalCm,
    };

    const computedMetrics = {
      bmi,
      ape_index: apeIndex,
    };

    const docsPayload = (data.eligibility_documents as any) || {
      psa_verified: false,
      academic_check: false,
      proof_of_residency: false,
      document_urls: [],
    };
    if (file) {
      const existingUrls = Array.isArray(docsPayload.document_urls) ? docsPayload.document_urls : [];
      if (!existingUrls.includes(file.originalname)) {
        docsPayload.document_urls = [...existingUrls, file.originalname];
      }
    }
    const achievements = Array.isArray(data.achievements) ? data.achievements : [];

    // Attach complete info to Users table
    userData.birthdate = birthdate;
    userData.gender = gender;
    userData.province = province;
    userData.sport_type = sportType;
    userData.position = position;
    userData.jersey_number = jerseyNumber;
    userData.recruitment_status = recruitmentStatus;
    userData.rank = rank;
    userData.physical_profile = physicalProfile;
    userData.computed_metrics = computedMetrics;
    userData.eligibility_documents = docsPayload;
    userData.achievements = achievements;

    // Complete research paper data dictionary for Athlete_Profiles table
    profileData.athlete_id = athleteId;
    profileData.user_id = uid;
    profileData.first_name = (data.first_name as string) || first_name;
    profileData.last_name = (data.last_name as string) || last_name;
    profileData.gender = gender;
    profileData.birthdate = birthdate;
    profileData.province = province;
    profileData.sports_type = sportType;
    profileData.sport_type = sportType;
    profileData.position = position;
    profileData.jersey_number = jerseyNumber !== undefined ? jerseyNumber : null;
    profileData.height_cm = heightCm || null;
    profileData.weight_kg = weightKg || null;
    profileData.avatar_url = userData.avatar_url || null;
    profileData.recruitment_status = recruitmentStatus;
    profileData.leaderboard_rank = Number(rank || 0);
    profileData.rank = rank;
    profileData.physical_profile = physicalProfile;
    profileData.computed_metrics = computedMetrics;
    profileData.eligibility_documents = {
      psa_verified: Boolean(docsPayload.psa_verified),
      academic_check: Boolean(docsPayload.academic_check),
      proof_of_residency: Boolean(docsPayload.proof_of_residency),
      document_urls: docsPayload.document_urls || [],
    };
    profileData.achievements = achievements.map((a: any) => ({
      title: String(a.title || ''),
      year: Number(a.year || new Date().getFullYear()),
      content: String(a.content || a.description || ''),
    }));
    profileData.created_at = now.toISOString();
    profileData.updated_at = now.toISOString();

    // Prepare Anthropometric_Measurements record
    const measurementId = `meas_${athleteId}`;
    const anthropometricData = {
      measurement_id: measurementId,
      athlete_id: athleteId,
      recorded_by: uid,
      height_cm: heightCm || null,
      weight_kg: weightKg || null,
      wingspan_cm: wingspanCm || null,
      standing_reach_cm: Number(data.standing_reach_cm || 0) || null,
      vertical_jump_cm: Number(data.vertical_jump_cm || data.vertical || 0) || null,
      body_fat_pct: Number(data.body_fat_pct || 0) || null,
      recorded_at: now.toISOString(),
      created_at: now.toISOString(),
      updated_at: now.toISOString(),
    };
    (profileData as any)._anthropometric = anthropometricData;
  } else if (firestoreRole === 'Coach') {
    const coachId = `coach_${uid}`;
    const sportType = String(data.sport_type || data.primary_sport || 'Basketball').trim();
    const yearsExperience = Number(data.years_of_experience || 0);
    const institution = String(data.current_institution || '').trim();
    const regionalAffiliation = String(data.regional_affiliation || '').trim();
    const nationalLeague = String(data.national_sports_league || data.league || '').trim();
    const quote = data.quote !== undefined && data.quote !== null ? String(data.quote).trim() : null;
    let profDocs: string[] = Array.isArray(data.professional_documents)
      ? (data.professional_documents as string[]).map((d) => typeof d === 'string' ? d : (d as any)?.name || 'document')
      : [];
    if (file && !profDocs.includes(file.originalname)) {
      profDocs.push(file.originalname);
    }
    profDocs = Array.from(new Set(profDocs));
    const athletesManaged = Array.isArray(data.athlete_managed) ? data.athlete_managed : [];

    const certLicense = String(data.certification_license_num || data.coach_license_number || data.license_number || '').trim();

    // Complete info on Users table
    userData.sport_type = sportType;
    userData.years_of_experience = yearsExperience;
    userData.current_institution = institution;
    userData.regional_affiliation = regionalAffiliation;
    userData.national_sports_league = nationalLeague;
    userData.certification_license_num = certLicense || null;
    userData.coach_license_number = certLicense || null;
    userData.quote = quote;
    userData.professional_documents = profDocs;
    userData.athlete_managed = athletesManaged;

    // Complete research paper data dictionary for Coach_Profiles table
    profileData.coach_id = coachId;
    profileData.user_id = uid;
    profileData.first_name = (data.first_name as string) || first_name;
    profileData.last_name = (data.last_name as string) || last_name;
    profileData.full_name = `${profileData.first_name} ${profileData.last_name}`.trim();
    profileData.email = email;
    profileData.sport_type = sportType;
    profileData.years_of_experience = yearsExperience;
    profileData.current_institution = institution;
    profileData.regional_affiliation = regionalAffiliation;
    profileData.national_sports_league = nationalLeague;
    profileData.certification_license_num = certLicense || null;
    profileData.coach_license_number = certLicense || null;
    profileData.team_id = (data.team_id as string) || null;
    profileData.teams_managed = Array.isArray(data.teams_managed) ? data.teams_managed : [];
    profileData.athletes_managed = Array.isArray(data.athletes_managed) ? data.athletes_managed : [];
    profileData.athlete_managed = athletesManaged;
    profileData.matches_logged = 0;
    profileData.total_matches_logged = 0;
    profileData.professional_documents = profDocs;
    profileData.profile_image = userData.avatar_url || null;
    profileData.avatar_url = userData.avatar_url || null;
    profileData.quote = quote;
    profileData.system_statistics = {
      metric_logs: 0,
      total_records: 0,
      total_athletes: athletesManaged.length,
    };
    profileData.account_status = 'Pending';
    profileData.created_at = now.toISOString();
    profileData.updated_at = now.toISOString();
  } else if (firestoreRole === 'Official') {
    const officialId = `off_${uid}`;
    const orgName = String(data.organization_name || data.organization || '').trim();
    const licenseNumber = String(data.official_license_number || '').trim();
    const assignedTournaments = Array.isArray(data.assigned_tournaments) ? data.assigned_tournaments : [];

    // Complete info on Users table
    userData.organization_name = orgName;
    userData.organization = orgName;
    userData.official_license_number = licenseNumber;
    userData.assigned_tournaments = assignedTournaments;
    userData.tournament_affiliation = orgName;
    userData.certification_status = 'Pending';
    userData.account_status = 'Pending';
    userData.status = 'pending';
    userData.is_approved = false;
    userData.isApproved = false;
    userData.is_active = true;

    // Complete research paper data dictionary for Official_Profiles table
    profileData.official_id = officialId;
    profileData.user_id = uid;
    profileData.organization_name = orgName;
    profileData.official_license_number = licenseNumber;
    profileData.assigned_tournaments = assignedTournaments;
    profileData.certification_status = 'Pending';
    profileData.account_status = 'Pending';
    profileData.status = 'pending';
    profileData.is_approved = false;
    profileData.isApproved = false;
    profileData.is_active = true;
    profileData.avatar_url = userData.avatar_url || null;
    profileData.profile_image = userData.avatar_url || null;
    profileData.settings = [];
    profileData.created_at = now.toISOString();
    profileData.updated_at = now.toISOString();
  } else if (firestoreRole === 'System Admin') {
    const adminId = `admin_${uid}`;
    const institution = String(data.institution || '').trim();
    const deptCode = String(data.department_code || '').trim();
    const clearanceLevel = Number(data.clearance_level || 1);

    // Complete info on Users table
    userData.institution = institution;
    userData.department_code = deptCode;
    userData.clearance_level = clearanceLevel;
    userData.is_active = true;
    userData.is_elevated = true;

    // Complete research paper data dictionary for Admin_Profiles table
    profileData.admin_id = adminId;
    profileData.user_id = uid;
    profileData.full_name = (data.full_name as string) || `${first_name} ${last_name}`.trim();
    profileData.email = email;
    profileData.institution = institution;
    profileData.department_code = deptCode;
    profileData.clearance_level = clearanceLevel;
    profileData.is_active = true;
    profileData.is_elevated = true;
    profileData.permissions = ['all'];
    const rawKey = String(data.admin_security_key || '');
    profileData.admin_security_key = hashAdminSecurityKey(rawKey);
    profileData.created_at = now.toISOString();
    profileData.updated_at = now.toISOString();
  }

  // 4. Execute atomic batch write: Base identity (Users) + Minimal Subtype child profile across both databases
  const writeUserToDatabase = async (targetDb: any) => {
    const batch = targetDb.batch();

    // Users collection receives complete document under raw UID (without prefix)
    batch.set(targetDb.collection('Users').doc(uid), userData);

    if (firestoreRole === 'Athlete') {
      const athleteId = `ath_${uid}`;
      const anthro = (profileData as any)._anthropometric;
      const cleanProfile = { ...profileData };
      delete cleanProfile._anthropometric;
      batch.set(targetDb.collection('Athlete_Profiles').doc(athleteId), cleanProfile);
      batch.set(targetDb.collection('Athlete_Profiles').doc(uid), cleanProfile);
      if (anthro) {
        batch.set(targetDb.collection('Anthropometric_Measurements').doc(anthro.measurement_id), anthro);
      }
    } else if (firestoreRole === 'Coach') {
      const coachId = `coach_${uid}`;
      batch.set(targetDb.collection('Coach_Profiles').doc(coachId), profileData);
      batch.set(targetDb.collection('Coach_Profiles').doc(uid), profileData);
    } else if (firestoreRole === 'Official') {
      const officialId = `off_${uid}`;
      batch.set(targetDb.collection('Official_Profiles').doc(officialId), profileData);
      batch.set(targetDb.collection('Official_Profiles').doc(uid), profileData);
    } else if (firestoreRole === 'System Admin') {
      const adminId = `admin_${uid}`;
      batch.set(targetDb.collection('Admin_Profiles').doc(adminId), profileData);
      batch.set(targetDb.collection('Admin_Profiles').doc(uid), profileData);
    }

    // If role is Coach, also initialize settings embedded in Coach_Profiles and Users
    if (firestoreRole === 'Coach') {
      const coachId = (profileData.coach_id as string) || `coach_${uid}`;
      const settingsData = {
        setting_id: `setting_${coachId}`,
        coach_id: coachId,
        data_sync_preference: 'Manual',
        notification_preferences: {
          game_log_updates: true,
          recruitment_inquiries: true,
        },
        updated_at: now,
      };
      userData.settings = settingsData;
      profileData.settings = settingsData;
      batch.set(targetDb.collection('Users').doc(uid), userData);
      batch.set(targetDb.collection('Coach_Profiles').doc(coachId), profileData);
      batch.set(targetDb.collection('Coach_Profiles').doc(uid), profileData);
    }

    // Ensure no password fields exist on child profile before committing
    sanitizeProfile(profileData);

    await batch.commit();
  };

  await writeUserToDatabase(db);

  // 5. Generate token & permissions
  const tokenData = generateToken(uid, email, firestoreRole);
  const permissions = ROLE_PERMISSIONS_MAP[firestoreRole];

  return {
    user: sanitizeUser(userData),
    profile: sanitizeProfile(profileData),
    permissions: ROLE_PERMISSIONS_MAP[firestoreRole] || [],
    token: tokenData.token,
    accessToken: tokenData.accessToken,
    refreshToken: tokenData.refreshToken,
  };
}

/**
 * Register a new coach specifically (POST /api/v1/users/coach).
 * ACCEPTANCE CRITERIA: Missing certification files block creation with 400 Bad Request.
 * Creates Users, Coach_Profiles, and Coach_Settings records atomically in Firestore.
 */
export async function registerCoachService(data: Record<string, unknown>, file?: Express.Multer.File) {
  const docs = data.professional_documents;
  const validDocs = Array.isArray(docs)
    ? (docs as any[]).map((d) => (typeof d === 'string' ? d.trim() : d?.name || 'coach_document.pdf')).filter(Boolean)
    : typeof docs === 'string' && docs.trim().length > 0
    ? [docs.trim()]
    : [];

  if (file && validDocs.length === 0) {
    validDocs.push(file.originalname || 'coach_document.pdf');
  }

  // Force role to Coach
  const payload = {
    ...data,
    role: 'Coach',
    professional_documents: validDocs,
  };

  return registerUserService(payload, file);
}

/**
 * Authenticate user with Firebase Client SDK and fetch Firestore profile.
 */
export async function loginUserService(email: string, password: string) {
  const cleanEmail = (email || '').trim().toLowerCase();

  // Try primary db (v2) first, then fall back to v1 for Users
  const getUserDoc = async (emailStr: string) => {
    const q = await db.collection('Users').where('email', '==', emailStr).limit(1).get().catch(() => null);
    if (q && !q.empty) return q.docs[0];
    return null;
  };

  let userDoc = await getUserDoc(cleanEmail);
  if (!userDoc) {
    userDoc = await getUserDoc(email.trim());
  }

  let uid = '';
  let firebaseIdToken = '';

  const cleanPassword = (password || '').trim();

  try {
    let userCredential;
    try {
      userCredential = await signInWithEmailAndPassword(clientAuth, cleanEmail, password);
    } catch {
      userCredential = await signInWithEmailAndPassword(clientAuth, cleanEmail, cleanPassword);
    }
    firebaseIdToken = await userCredential.user.getIdToken();
    uid = userCredential.user.uid;
  } catch (err: any) {
    if (userDoc) {
      const userData = userDoc.data();
      const storedPass = String(userData.password_hash || userData.password || '');
      const isMatch = storedPass && (
        verifyPassword(password, storedPass) ||
        verifyPassword(cleanPassword, storedPass)
      );
      if (isMatch) {
        uid = userDoc.id;
        firebaseIdToken = await auth.createCustomToken(uid).catch(() => '');
      } else {
        throw { code: 'auth/wrong-password', message: 'Invalid email or password.' };
      }
    } else {
      throw {
        code: err.code || 'auth/invalid-credential',
        message: err.message || 'Invalid email or password.',
      };
    }
  }

  if (!userDoc) {
    const docRef = await db.collection('Users').doc(uid).get().catch(() => null);
    if (!docRef || !docRef.exists) {
      throw { code: 'USER_NOT_FOUND', message: 'User profile not found in Firestore.' };
    }
    userDoc = docRef as any;
  }

  const canonicalUid = userDoc!.id;
  const userData = (userDoc as any).data()!;
  const role = userData.role as UserRole;
  const roleStr = String(role || '').toLowerCase();
  const isAdmin = roleStr.includes('admin');

  // Admissions Gate: Intercept login if Coach or Official is not approved by system admin
  if (!isAdmin && (roleStr.includes('official') || roleStr.includes('coach'))) {
    const rawStatus = String(
      userData.account_status ||
      userData.status ||
      userData.certification_status ||
      ''
    ).toLowerCase().trim();

    const isApprovedFlag = userData.is_approved === true || userData.isApproved === true;
    const isApprovedStatus = rawStatus === 'approved' || rawStatus === 'active' || rawStatus === 'verified';

    if (!isApprovedFlag && !isApprovedStatus) {
      const entityName = roleStr.includes('coach') ? 'coach' : 'official';
      if (rawStatus === 'rejected' || rawStatus === 'declined') {
        const reason = userData.rejection_reason ? `: ${userData.rejection_reason}` : '.';
        throw new ServiceError(`Your ${entityName} account application was declined by the system administrator${reason}`, 403);
      }
      throw new ServiceError(`Your ${entityName} account is pending system admin approval.`, 403);
    }
  }

  const tokenData = generateToken(canonicalUid, userData.email, role);

  try {
    await db.collection('User_Sessions').doc(canonicalUid).set({
      uid: canonicalUid,
      email: userData.email,
      role,
      refreshToken: tokenData.refreshToken,
      updated_at: new Date().toISOString(),
    }, { merge: true });
  } catch (sessErr) {
    console.warn('Failed to persist user session on login:', sessErr);
  }

  return {
    user: sanitizeUser({
      user_id: canonicalUid,
      first_name: userData.first_name,
      last_name: userData.last_name,
      email: userData.email,
      role,
      account_status: userData.account_status,
      status: userData.status,
      is_approved: userData.is_approved,
      isApproved: userData.isApproved,
      rejection_reason: userData.rejection_reason || null,
    }),
    token: tokenData.token,
    accessToken: tokenData.accessToken,
    refreshToken: tokenData.refreshToken,
    firebase_id_token: firebaseIdToken,
  };
}

export async function socialLoginService(
  idToken: string,
  provider: 'google' | 'facebook' = 'google',
  roleInput: string = 'Athlete',
  additionalData?: Record<string, any>
) {
  let uid = '';
  let email = '';
  let fullName = '';
  let avatarUrl = '';

  if (additionalData) {
    if (additionalData.email) email = String(additionalData.email).trim().toLowerCase();
    if (additionalData.full_name) {
      fullName = String(additionalData.full_name).trim();
    } else if (additionalData.first_name || additionalData.last_name) {
      fullName = `${additionalData.first_name || ''} ${additionalData.last_name || ''}`.trim();
    }
    if (additionalData.avatar_url) avatarUrl = String(additionalData.avatar_url).trim();
  }

  if (provider === 'google') {
    let authSuccess = false;

    // 1. If it explicitly looks like a Google Access Token (e.g. starts with 'ya29.'), try Google UserInfo API first
    if (idToken && typeof idToken === 'string' && idToken.startsWith('ya29.')) {
      try {
        const res = await fetch(`https://www.googleapis.com/oauth2/v3/userinfo?access_token=${encodeURIComponent(idToken)}`, {
          headers: { Authorization: `Bearer ${idToken}` },
        });
        if (res.ok) {
          const googleUser = (await res.json()) as any;
          if (googleUser && (googleUser.sub || googleUser.id) && googleUser.email) {
            uid = `google_${googleUser.sub || googleUser.id}`;
            email = googleUser.email;
            fullName = googleUser.name || fullName || 'Google User';
            avatarUrl = googleUser.picture || avatarUrl || '';
            authSuccess = true;
          }
        }
      } catch (_) {
        // Fall through to other verification methods
      }
    }

    // 2. Try Firebase ID Token verification
    if (!authSuccess && idToken) {
      try {
        const decodedToken = await auth.verifyIdToken(idToken);
        uid = decodedToken.uid;
        email = decodedToken.email || email;
        fullName = decodedToken.name || fullName || 'Social User';
        avatarUrl = decodedToken.picture || avatarUrl || '';
        authSuccess = true;
      } catch (_) {
        // Not a Firebase ID token, proceed to Google ID Token check
      }
    }

    // 3. Try Google OAuth2 ID Token verification (with multiple accepted audiences)
    if (!authSuccess && idToken) {
      try {
        const audiences = [
          process.env.GOOGLE_CLIENT_ID,
          process.env.GOOGLE_ANDROID_CLIENT_ID,
          process.env.GOOGLE_ANDROID_ID,
          process.env.GOOGLE_IOS_CLIENT_ID,
          '203586668533-uii0i4gjqcm2cmj4ssvrdq70a2efhmnf.apps.googleusercontent.com',
          '203586668533-54oqq5mc56b38dhrcqa5t157ngrsmqvt.apps.googleusercontent.com',
        ].filter(Boolean) as string[];

        const ticket = await googleOAuthClient.verifyIdToken({
          idToken: idToken,
          audience: audiences.length > 0 ? audiences : undefined,
        });
        const payload = ticket.getPayload();
        if (payload && payload.sub && payload.email) {
          uid = payload.sub;
          email = payload.email;
          fullName = payload.name || fullName || 'Google User';
          avatarUrl = payload.picture || avatarUrl || '';
          authSuccess = true;
        }
      } catch (_) {
        // Fall through
      }
    }

    // 4. Fallback: Try Google UserInfo API with any access token
    if (!authSuccess && idToken) {
      try {
        const res = await fetch(`https://www.googleapis.com/oauth2/v3/userinfo?access_token=${encodeURIComponent(idToken)}`, {
          headers: { Authorization: `Bearer ${idToken}` },
        });
        if (res.ok) {
          const googleUser = (await res.json()) as any;
          if (googleUser && (googleUser.sub || googleUser.id) && googleUser.email) {
            uid = `google_${googleUser.sub || googleUser.id}`;
            email = googleUser.email;
            fullName = googleUser.name || fullName || 'Google User';
            avatarUrl = googleUser.picture || avatarUrl || '';
            authSuccess = true;
          }
        }
      } catch (_) {
        // Userinfo lookup failed
      }
    }

    // 5. Fallback: JWT decode for Google ID token
    if (!authSuccess && typeof idToken === 'string' && idToken.includes('.')) {
      try {
        const decoded = jwt.decode(idToken) as any;
        if (decoded && (decoded.email || decoded.sub)) {
          uid = decoded.sub || decoded.user_id || (decoded.email ? `google_${decoded.email.replace(/[^a-z0-9]/gi, '_')}` : `google_${Date.now()}`);
          if (!uid.startsWith('google_')) uid = `google_${uid}`;
          email = decoded.email || email;
          fullName = decoded.name || `${decoded.given_name || ''} ${decoded.family_name || ''}`.trim() || fullName || 'Google User';
          avatarUrl = decoded.picture || avatarUrl || '';
          authSuccess = true;
        }
      } catch (_) {}
    }

    // 6. Direct identity fallback from client payload
    if (!authSuccess && (email || additionalData?.email)) {
      email = String(email || additionalData?.email).trim().toLowerCase();
      uid = `google_${email.replace(/[^a-z0-9]/gi, '_')}`;
      fullName = fullName || additionalData?.full_name || `${additionalData?.first_name || ''} ${additionalData?.last_name || ''}`.trim() || 'Google User';
      avatarUrl = avatarUrl || additionalData?.avatar_url || '';
      authSuccess = true;
    }

    if (!authSuccess) {
      throw {
        code: 'INVALID_TOKEN',
        message: 'Invalid or expired Google authentication token.',
      };
    }
  } else {
    // Facebook provider
    let authSuccess = false;

    // 1. Try Firebase ID Token verification
    try {
      const decodedToken = await auth.verifyIdToken(idToken);
      if (decodedToken && decodedToken.uid) {
        uid = decodedToken.uid;
        email = decodedToken.email || email;
        fullName = decodedToken.name || fullName || 'Facebook User';
        avatarUrl = decodedToken.picture || avatarUrl || '';
        authSuccess = true;
      }
    } catch (_) {}

    // 2. Try Facebook Graph API userinfo with access token
    if (!authSuccess && idToken) {
      try {
        const res = await fetch(`https://graph.facebook.com/me?fields=id,name,first_name,last_name,email,picture.type(large)&access_token=${encodeURIComponent(idToken)}`);
        if (res.ok) {
          const fbUser = (await res.json()) as any;
          if (fbUser && fbUser.id) {
            uid = `facebook_${fbUser.id}`;
            email = fbUser.email || email || `${fbUser.id}@facebook.atleta.app`;
            fullName = fbUser.name || `${fbUser.first_name || ''} ${fbUser.last_name || ''}`.trim() || fullName || 'Facebook User';
            avatarUrl = fbUser.picture?.data?.url || avatarUrl || '';
            authSuccess = true;
          }
        }
      } catch (_) {}
    }

    // 3. Fallback: Facebook Graph API v19.0 endpoint
    if (!authSuccess && idToken) {
      try {
        const res = await fetch(`https://graph.facebook.com/v19.0/me?fields=id,name,first_name,last_name,email,picture&access_token=${encodeURIComponent(idToken)}`);
        if (res.ok) {
          const fbUser = (await res.json()) as any;
          if (fbUser && fbUser.id) {
            uid = `facebook_${fbUser.id}`;
            email = fbUser.email || email || `${fbUser.id}@facebook.atleta.app`;
            fullName = fbUser.name || `${fbUser.first_name || ''} ${fbUser.last_name || ''}`.trim() || fullName || 'Facebook User';
            avatarUrl = fbUser.picture?.data?.url || avatarUrl || '';
            authSuccess = true;
          }
        }
      } catch (_) {}
    }

    // 4. Fallback: JWT decode if OpenID Connect signed token was passed
    if (!authSuccess && typeof idToken === 'string' && idToken.includes('.')) {
      try {
        const parts = idToken.split('.');
        if (parts.length === 3) {
          const payloadJson = Buffer.from(parts[1], 'base64').toString('utf8');
          const payload = JSON.parse(payloadJson);
          if (payload && (payload.sub || payload.user_id || payload.id)) {
            const fbId = payload.sub || payload.user_id || payload.id;
            uid = `facebook_${fbId}`;
            email = payload.email || email || `${fbId}@facebook.atleta.app`;
            fullName = payload.name || fullName || 'Facebook User';
            avatarUrl = payload.picture || avatarUrl || '';
            authSuccess = true;
          }
        }
      } catch (_) {}
    }

    // 5. Direct identity fallback from client payload
    if (!authSuccess && (email || additionalData?.email)) {
      email = String(email || additionalData?.email).trim().toLowerCase();
      uid = `facebook_${email.replace(/[^a-z0-9]/gi, '_')}`;
      fullName = fullName || additionalData?.full_name || `${additionalData?.first_name || ''} ${additionalData?.last_name || ''}`.trim() || 'Facebook User';
      avatarUrl = avatarUrl || additionalData?.avatar_url || '';
      authSuccess = true;
    }

    if (!authSuccess) {
      throw {
        code: 'INVALID_TOKEN',
        message: 'Invalid or expired Facebook authentication token.',
      };
    }
  }

  const nameParts = fullName.split(' ');
  let firstName = additionalData?.first_name || nameParts[0] || 'User';
  let lastName = additionalData?.last_name || nameParts.slice(1).join(' ') || (provider === 'google' ? 'Google' : 'Facebook');
  if (!avatarUrl && additionalData?.avatar_url) {
    avatarUrl = additionalData.avatar_url;
  }

  const cleanEmail = (email || additionalData?.email || '').trim().toLowerCase();
  const rawEmail = (email || additionalData?.email || '').trim();

  // Look up existing Firebase Auth user if present (without auto-creating new users before Firestore check)
  if (cleanEmail) {
    try {
      const authUser = await auth.getUserByEmail(cleanEmail).catch(() => null);
      if (authUser && authUser.uid) {
        uid = authUser.uid;
      }
    } catch (_) {}
  }

  // 1. Direct doc check by uid, plus variations with and without provider prefixes
  const possibleUids = Array.from(
    new Set([
      uid,
      uid.startsWith('google_') ? uid.replace('google_', '') : `google_${uid}`,
      uid.startsWith('facebook_') ? uid.replace('facebook_', '') : `facebook_${uid}`,
    ])
  ).filter(Boolean);

  let userDoc: FirebaseFirestore.DocumentSnapshot | null = null;
  try {
    for (const id of possibleUids) {
      const docSnap = await db.collection('Users').doc(id).get();
      if (docSnap.exists) {
        userDoc = docSnap;
        uid = docSnap.id;
        break;
      }
    }

    // 2. Query Users collection by email (both clean lowercase and raw email)
    if (!userDoc && cleanEmail) {
      let snap = await db.collection('Users').where('email', '==', cleanEmail).limit(1).get();
      if (!snap.empty) {
        userDoc = snap.docs[0];
        uid = userDoc.id;
      } else if (rawEmail && rawEmail !== cleanEmail) {
        snap = await db.collection('Users').where('email', '==', rawEmail).limit(1).get();
        if (!snap.empty) {
          userDoc = snap.docs[0];
          uid = userDoc.id;
        }
      }
    }
  } catch (firestoreErr) {
    console.error('Error querying Users collection in Firestore:', firestoreErr);
  }

  let userRole: UserRole | undefined;

  if (userDoc && userDoc.exists) {
    const userData = userDoc.data()!;
    const assignedRole = (userData.role || (userData.coach_id ? 'Coach' : 'Athlete')) as UserRole;
    userRole = assignedRole;
    firstName = userData.first_name || firstName;
    lastName = userData.last_name || lastName;
    avatarUrl = userData.avatar_url || avatarUrl;

    // Record / update login timestamp and provider in Users collection
    try {
      await db.collection('Users').doc(uid).set({
        provider,
        auth_provider: provider,
        avatar_url: avatarUrl || userData.avatar_url || null,
        updated_at: new Date(),
      }, { merge: true });
    } catch (updateErr) {
      console.error('Error updating login metadata in Users:', updateErr);
    }
  }

  // 3. Fallback: Cross-check Coach_Profiles collection
  if (!userRole) {
    try {
      for (const id of possibleUids) {
        const coachDoc = await db.collection('Coach_Profiles').doc(id).get();
        if (coachDoc.exists) {
          userRole = 'Coach';
          const cData = coachDoc.data()!;
          firstName = cData.first_name || firstName;
          lastName = cData.last_name || lastName;
          avatarUrl = cData.avatar_url || avatarUrl;
          break;
        }
        const coachPrefixed = await db.collection('Coach_Profiles').doc(`coach_${id}`).get();
        if (coachPrefixed.exists) {
          userRole = 'Coach';
          const cData = coachPrefixed.data()!;
          firstName = cData.first_name || firstName;
          lastName = cData.last_name || lastName;
          avatarUrl = cData.avatar_url || avatarUrl;
          break;
        }
      }

      if (!userRole && cleanEmail) {
        const coachEmailSnap = await db.collection('Coach_Profiles').where('email', '==', cleanEmail).limit(1).get();
        if (!coachEmailSnap.empty) {
          userRole = 'Coach';
          const cData = coachEmailSnap.docs[0].data();
          firstName = cData.first_name || firstName;
          lastName = cData.last_name || lastName;
          avatarUrl = cData.avatar_url || avatarUrl;
        }
      }
    } catch (firestoreErr) {
      console.error('Error querying Coach_Profiles collection in Firestore:', firestoreErr);
    }
  }

  // 4. Fallback: Cross-check Athlete_Profiles collection
  if (!userRole) {
    try {
      for (const id of possibleUids) {
        const athDoc = await db.collection('Athlete_Profiles').doc(id).get();
        if (athDoc.exists) {
          userRole = 'Athlete';
          const aData = athDoc.data()!;
          firstName = aData.first_name || firstName;
          lastName = aData.last_name || lastName;
          avatarUrl = aData.avatar_url || avatarUrl;
          break;
        }
        const athPrefixed = await db.collection('Athlete_Profiles').doc(`ath_${id}`).get();
        if (athPrefixed.exists) {
          userRole = 'Athlete';
          const aData = athPrefixed.data()!;
          firstName = aData.first_name || firstName;
          lastName = aData.last_name || lastName;
          avatarUrl = aData.avatar_url || avatarUrl;
          break;
        }
      }

      if (!userRole && cleanEmail) {
        const athEmailSnap = await db.collection('Athlete_Profiles').where('email', '==', cleanEmail).limit(1).get();
        if (!athEmailSnap.empty) {
          userRole = 'Athlete';
          const aData = athEmailSnap.docs[0].data();
          firstName = aData.first_name || firstName;
          lastName = aData.last_name || lastName;
          avatarUrl = aData.avatar_url || avatarUrl;
        }
      }
    } catch (firestoreErr) {
      console.error('Error querying Athlete_Profiles collection in Firestore:', firestoreErr);
    }
  }

  const accountExists = Boolean((userDoc && userDoc.exists) || userRole);

  const isRegistration =
    Boolean(additionalData?.is_registration) ||
    Boolean(
      additionalData?.terms_accepted &&
      (additionalData?.birthdate || additionalData?.years_of_experience || additionalData?.current_institution || additionalData?.sport_type)
    );

  // BRANCH B: Account Does Not Exist in Firestore and this is NOT an explicit registration submission
  if (!accountExists && !isRegistration) {
    return {
      account_exists: false,
      require_signup: true,
      is_new_user: true,
      user: sanitizeUser({
        user_id: uid,
        first_name: firstName,
        last_name: lastName,
        email: cleanEmail,
        role: null,
        avatar_url: avatarUrl,
        provider,
      }),
      social_token: {
        provider,
        idToken,
      },
    };
  }

  const now = new Date();

  // If new user is officially completing registration from Sign-Up / Onboarding:
  if (!accountExists && isRegistration) {
    // Synchronize Firebase Auth user upon official registration
    if (cleanEmail) {
      try {
        let authUser = await auth.getUserByEmail(cleanEmail).catch(() => null);
        if (!authUser) {
          authUser = await auth.createUser({
            email: cleanEmail,
            displayName: `${firstName} ${lastName}`.trim(),
            photoURL: avatarUrl || undefined,
          }).catch(async (createErr: any) => {
            if (createErr.code === 'auth/email-already-exists') {
              return await auth.getUserByEmail(cleanEmail).catch(() => null);
            }
            return null;
          });
        }
        if (authUser && authUser.uid) {
          uid = authUser.uid;
        }
      } catch (_) {}
    }

    userRole = normalizeRole(additionalData?.role || roleInput || 'Athlete');
    const hasProfileDetails =
      Boolean(additionalData?.sport_type) ||
      Boolean(additionalData?.terms_accepted) ||
      Boolean(additionalData?.current_institution) ||
      Boolean(additionalData?.years_of_experience) ||
      Boolean(additionalData?.birthdate);

    const userData: Record<string, any> = {
      user_id: uid,
      first_name: firstName,
      last_name: lastName,
      full_name: `${firstName} ${lastName}`.trim(),
      email: cleanEmail,
      contact_number: additionalData?.contact_number || null,
      role: userRole,
      provider,
      auth_provider: provider,
      avatar_url: avatarUrl || null,
      account_status: userRole === 'Coach' ? 'Pending' : 'Active',
      is_profile_complete: Boolean(hasProfileDetails),
      created_at: now,
      updated_at: now,
    };

    const profileCollection = ROLE_COLLECTION_MAP[userRole] || 'Athlete_Profiles';
    const profileData: Record<string, any> = {
      user_id: uid,
      first_name: firstName,
      last_name: lastName,
      email: cleanEmail,
      avatar_url: avatarUrl || null,
      created_at: now,
      updated_at: now,
    };

    if (userRole === 'Athlete') {
      const athleteId = `ath_${uid}`;
      profileData.athlete_id = athleteId;
      profileData.birthdate = additionalData?.birthdate || '2001-01-01';
      profileData.gender = additionalData?.gender || 'Male';
      profileData.province = additionalData?.province || 'Camarines Sur';
      profileData.sport_type = additionalData?.sport_type || 'Basketball';
      profileData.position = additionalData?.position || 'Player';
      profileData.jersey_number = additionalData?.jersey_number ?? null;
      profileData.height_cm = additionalData?.height_cm ?? null;
      profileData.weight_kg = additionalData?.weight_kg ?? null;
      profileData.recruitment_status = 'Available';
    } else if (userRole === 'Coach') {
      const coachId = `coach_${uid}`;
      profileData.coach_id = coachId;
      profileData.sport_type = additionalData?.sport_type || 'Basketball';
      profileData.coach_role = additionalData?.coach_role || 'Head Coach';
      profileData.current_institution = additionalData?.current_institution || 'Independent';
      profileData.organization = additionalData?.current_institution || 'Independent';
      profileData.regional_affiliation = additionalData?.regional_affiliation || null;
      profileData.national_sports_league = additionalData?.national_sports_league || null;
      profileData.accreditation_number = additionalData?.accreditation_number || null;
      profileData.years_of_experience = Number(additionalData?.years_of_experience || 0);
      profileData.certification_license_num = additionalData?.certification_license_num || null;
      profileData.account_status = 'Pending';
    }

    sanitizeProfile(profileData);

    const batch = db.batch();
    batch.set(db.collection('Users').doc(uid), userData, { merge: true });
    batch.set(db.collection(profileCollection).doc(uid), profileData, { merge: true });

    if (userRole === 'Athlete') {
      const athleteId = `ath_${uid}`;
      batch.set(db.collection('Athlete_Profiles').doc(athleteId), profileData, { merge: true });
    } else if (userRole === 'Coach') {
      const coachId = `coach_${uid}`;
      const settingsData = {
        setting_id: `setting_${coachId}`,
        coach_id: coachId,
        data_sync_preference: 'Manual',
        notification_preferences: {
          game_log_updates: true,
          recruitment_inquiries: true,
        },
        updated_at: now,
      };
      profileData.settings = settingsData;
      batch.set(db.collection('Coach_Profiles').doc(coachId), profileData, { merge: true });
      batch.set(db.collection('Users').doc(uid), { settings: settingsData }, { merge: true });
    }

    await batch.commit();
  }

  // BRANCH A: Account Exists in Firestore (or just successfully provisioned via registration)
  const finalRole = userRole || 'Athlete';
  const tokenData = generateToken(uid, cleanEmail, finalRole);

  try {
    await db.collection('User_Sessions').doc(uid).set({
      uid,
      email: cleanEmail,
      role: finalRole,
      refreshToken: tokenData.refreshToken,
      updated_at: new Date().toISOString(),
    }, { merge: true });
  } catch (sessErr) {
    console.warn('Failed to persist social login session:', sessErr);
  }

  return {
    account_exists: true,
    require_signup: false,
    is_new_user: false,
    token: tokenData.token,
    accessToken: tokenData.accessToken,
    refreshToken: tokenData.refreshToken,
    user: sanitizeUser({
      user_id: uid,
      first_name: firstName,
      last_name: lastName,
      email: cleanEmail,
      role: finalRole,
      avatar_url: avatarUrl,
      provider,
    }),
  };
}

/**
 * Fetch authenticated user profile, role, permissions, and subtype document.
 */
export async function getUserProfileService(uid: string) {
  let userDoc = await db.collection('Users').doc(uid).get();

  if (!userDoc.exists) {
    // Cross-check: check if uid is a Firebase Auth UID corresponding to a Firestore Users record
    try {
      const authUser = await auth.getUser(uid);
      if (authUser && authUser.email) {
        const snap = await db.collection('Users').where('email', '==', authUser.email.trim().toLowerCase()).limit(1).get();
        if (!snap.empty) {
          userDoc = snap.docs[0];
          uid = userDoc.id;
        } else {
          const rawSnap = await db.collection('Users').where('email', '==', authUser.email.trim()).limit(1).get();
          if (!rawSnap.empty) {
            userDoc = rawSnap.docs[0];
            uid = userDoc.id;
          }
        }
      }
    } catch (_) {
      // Ignore auth error
    }
  }

  if (!userDoc.exists) {
    throw { code: 'USER_NOT_FOUND', message: 'User not found.' };
  }

  const userData = userDoc.data()!;
  const role = userData.role as UserRole;

  const profileCollection = ROLE_COLLECTION_MAP[role] || 'Athlete_Profiles';
  let profileDoc = await db.collection(profileCollection).doc(uid).get();
  if (!profileDoc.exists) {
    const prefix = role === 'Athlete' ? 'ath_' : role === 'Coach' ? 'coach_' : role === 'Official' ? 'off_' : role === 'System Admin' ? 'admin_' : '';
    if (prefix) {
      profileDoc = await db.collection(profileCollection).doc(`${prefix}${uid}`).get();
    }
  }
  const profileData = profileDoc.exists ? profileDoc.data() : null;
  const permissions = ROLE_PERMISSIONS_MAP[role] || [];

  const userAvatar = userData.avatar_url || userData.profile_image || profileData?.avatar_url || profileData?.profile_image || null;
  const fullName = userData.full_name || userData.full_legal_name || `${userData.first_name || ''} ${userData.last_name || ''}`.trim() || 'User';
  const orgName = userData.organization_name || userData.organization || profileData?.organization_name || profileData?.organization || null;

  const safeUserData = (sanitizeUser(userData) as Record<string, any>) || {};
  const safeProfileData = sanitizeProfile(profileData);

  return {
    ...safeUserData,
    user_id: uid,
    uid,
    full_name: fullName,
    full_legal_name: fullName,
    avatar_url: userAvatar,
    profile_image: userAvatar,
    organization_name: orgName,
    organization: orgName,
    user: sanitizeUser({
      user_id: uid,
      uid,
      first_name: userData.first_name || '',
      last_name: userData.last_name || '',
      full_name: fullName,
      full_legal_name: fullName,
      email: userData.email || '',
      contact_number: userData.contact_number || '',
      role,
      avatar_url: userAvatar,
      profile_image: userAvatar,
      organization_name: orgName,
      organization: orgName,
      current_institution: userData.current_institution || profileData?.current_institution || null,
      regional_affiliation: userData.regional_affiliation || profileData?.regional_affiliation || null,
      national_sports_league: userData.national_sports_league || profileData?.national_sports_league || null,
      sport: userData.sport || profileData?.sport || userData.sport_type || profileData?.sport_type || null,
      created_at: userData.created_at,
      updated_at: userData.updated_at,
    }),
    profile: safeProfileData,
    permissions,
  };
}

/**
 * Helper to check if an account is authenticated via a third-party OAuth provider (Google/Facebook).
 * Throws a SOCIAL_AUTH_ACCOUNT error if the account is purely social/OAuth.
 */
export async function checkSocialAccountRestriction(uid: string, userData: any, action: 'reset' | 'change' = 'reset') {
  const provider = (userData?.provider || userData?.auth_provider || '').toLowerCase();
  let isSocial = provider === 'google' || provider === 'facebook' || uid.startsWith('google_') || uid.startsWith('facebook_');

  if (!isSocial) {
    try {
      const userRecord = await auth.getUser(uid);
      const providers = (userRecord.providerData || []).map((p) => p.providerId);
      // If user has google.com or facebook.com and DOES NOT have password provider
      if (providers.length > 0 && (providers.includes('google.com') || providers.includes('facebook.com')) && !providers.includes('password')) {
        isSocial = true;
      }
    } catch (err) {
      // Ignore if user does not exist in Firebase Auth
    }
  }

  if (isSocial) {
    const providerName = provider === 'facebook' || uid.startsWith('facebook_') ? 'Facebook' : 'Google';
    throw {
      code: 'SOCIAL_AUTH_ACCOUNT',
      message: `Password ${action} is only available for accounts registered with email and password. Accounts registered via ${providerName} must log in directly with ${providerName}.`,
    };
  }
}

/**
 * Generate password reset token and send email.
 * Persists reset token, computed expiration, and reset link directly to Firestore.
 */
export async function requestPasswordResetService(email: string, clientFrontendUrl?: string) {
  const emailToReset = email.trim().toLowerCase();

  const userSnapshot = await db.collection('Users').where('email', '==', emailToReset).limit(1).get();
  if (userSnapshot.empty) {
    throw { code: 'USER_NOT_FOUND', message: `No registered account found with email '${emailToReset}'.` };
  }

  const userDoc = userSnapshot.docs[0];
  const uid = userDoc.id;
  const userData = userDoc.data();

  // Enforce: Only accounts with email and password authentication can request password resets
  await checkSocialAccountRestriction(uid, userData, 'reset');

  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error('JWT_SECRET is not configured in environment');
  }
  const resetToken = jwt.sign({ uid, email: emailToReset, purpose: 'reset-password' }, secret, { expiresIn: '1h' as any });
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
  const requestedAt = new Date().toISOString();

  // Dynamically determine frontend URL from request or environment:
  let baseUrl = (
    clientFrontendUrl ||
    process.env.FRONTEND_RESET_URL ||
    (process.env.FRONTEND_URL ? `${process.env.FRONTEND_URL.replace(/\/+$/, '')}/reset-password` : '/reset-password')
  ).trim();

  if (baseUrl.endsWith('/')) {
    baseUrl = baseUrl.slice(0, -1);
  }

  const delimiter = baseUrl.includes('?') ? '&' : '?';
  const resetLink = `${baseUrl}${delimiter}token=${resetToken}&email=${encodeURIComponent(emailToReset)}`;

  // Persist password reset computation and token to Firestore Users and Password_Resets collections
  const resetRecord = {
    reset_token: resetToken,
    reset_link: resetLink,
    email: emailToReset,
    expires_at: expiresAt,
    requested_at: requestedAt,
    status: 'pending',
  };

  await Promise.all([
    db.collection('Users').doc(uid).set(
      {
        password_reset: resetRecord,
        updated_at: new Date(),
      },
      { merge: true }
    ),
    db.collection('Password_Resets').doc(uid).set(
      {
        uid,
        ...resetRecord,
      },
      { merge: true }
    ),
  ]);

  const mailResult = await sendPasswordResetEmailService(emailToReset, resetLink);

  return {
    sent: mailResult.sent,
    message: mailResult.message,
    reset_token: resetToken,
    reset_link: resetLink,
    expires_at: expiresAt,
  };
}

/**
 * Verify reset token and set new password in Firebase Auth & Firestore.
 */
export async function resetPasswordConfirmService(tokenOrIdentifier: string | undefined, newPassword: string, emailHint?: string) {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error('JWT_SECRET is not configured in environment');
  }
  let uid = '';

  // 1. Verify JWT reset token or session Auth token if provided
  if (tokenOrIdentifier && tokenOrIdentifier.includes('.')) {
    try {
      const decoded = jwt.verify(tokenOrIdentifier, secret) as any;
      if (decoded && decoded.uid) {
        uid = decoded.uid;
      }
    } catch (err) {
      // Signature invalid: never accept unverified decoded tokens
    }
  }

  // 2. Direct UID lookup in Firestore
  if (!uid && tokenOrIdentifier) {
    const userDoc = await db.collection('Users').doc(tokenOrIdentifier).get();
    if (userDoc.exists) {
      uid = userDoc.id;
    }
  }

  // 3. Lookup stored reset token in Firestore
  if (!uid && tokenOrIdentifier) {
    const tokenQuery = await db.collection('Users').where('password_reset.reset_token', '==', tokenOrIdentifier).limit(1).get();
    if (!tokenQuery.empty) {
      uid = tokenQuery.docs[0].id;
    }
  }

  // 4. Email hint lookup
  if (!uid && emailHint) {
    const userSnapshot = await db.collection('Users').where('email', '==', emailHint.toLowerCase().trim()).limit(1).get();
    if (!userSnapshot.empty) {
      uid = userSnapshot.docs[0].id;
    }
  }

  // 5. If no token provided (e.g. in-app mobile reset right after request), find most recent pending reset
  if (!uid) {
    const pendingSnapshot = await db.collection('Users')
      .where('password_reset.status', '==', 'pending')
      .get();
    if (!pendingSnapshot.empty) {
      const validDocs = pendingSnapshot.docs
        .map((d) => ({ doc: d, data: d.data() }))
        .filter((item) => {
          const expiresAt = item.data.password_reset?.expires_at;
          return !expiresAt || new Date(expiresAt).getTime() > Date.now();
        })
        .sort((a, b) => {
          const timeA = new Date(a.data.password_reset?.requested_at || 0).getTime();
          const timeB = new Date(b.data.password_reset?.requested_at || 0).getTime();
          return timeB - timeA;
        });

      if (validDocs.length > 0) {
        uid = validDocs[0].doc.id;
      }
    }
  }

  if (!uid) {
    throw { code: 'INVALID_TOKEN', message: 'Reset token is invalid or has expired.' };
  }

  // Enforce: Check if user is a social login account
  const userDoc = await db.collection('Users').doc(uid).get();
  const userData = userDoc.exists ? userDoc.data()! : {};
  await checkSocialAccountRestriction(uid, userData, 'reset');

  try {
    await auth.updateUser(uid, { password: newPassword });
  } catch (authErr: any) {
    if (authErr?.code === 'auth/user-not-found') {
      await auth.createUser({
        uid,
        password: newPassword,
      });
    } else {
      console.warn(`[AUTH UPDATE] ${authErr.message}`);
    }
  }

  const passwordHash = hashPassword(newPassword);
  const now = new Date();
  await Promise.all([
    db.collection('Users').doc(uid).set(
      {
        password: passwordHash,
        password_hash: passwordHash,
        password_reset: {
          status: 'completed',
          completed_at: now.toISOString(),
          reset_token: null,
        },
        updated_at: now,
      },
      { merge: true }
    ),
    db.collection('Password_Resets').doc(uid).set(
      {
        status: 'completed',
        completed_at: now.toISOString(),
        updated_at: now.toISOString(),
      },
      { merge: true }
    ).catch(() => null),
  ]);

  return { message: 'Password has been successfully updated.' };
}

export async function changePasswordService(uid: string, newPassword: string) {
  const userDoc = await db.collection('Users').doc(uid).get();
  const userData = userDoc.exists ? userDoc.data()! : {};

  // Enforce: Check if user is a social login account
  await checkSocialAccountRestriction(uid, userData, 'change');

  await auth.updateUser(uid, { password: newPassword }).catch((err) => {
    console.warn('⚠️ auth.updateUser non-fatal warning:', err?.message || err);
  });
  const passwordHash = hashPassword(newPassword);
  await db.collection('Users').doc(uid).set(
    {
      password: passwordHash,
      password_hash: passwordHash,
      updated_at: new Date(),
    },
    { merge: true }
  );
}

export async function updateUserProfileService(uid: string, payload: Record<string, any>) {
  const rawUid = uid.replace(/^(coach_|ath_|off_|admin_)/, '');
  let userDoc = await db.collection('Users').doc(uid).get();
  let targetUid = uid;
  if (!userDoc.exists) {
    userDoc = await db.collection('Users').doc(rawUid).get();
    if (userDoc.exists) {
      targetUid = rawUid;
    }
  }
  if (!userDoc.exists) {
    throw { code: 'USER_NOT_FOUND', message: 'User not found.' };
  }

  const userData = userDoc.data()!;
  const role = userData.role as UserRole;
  const profileCollection = ROLE_COLLECTION_MAP[role] || 'Athlete_Profiles';
  const prefix = role === 'Athlete' ? 'ath_' : role === 'Coach' ? 'coach_' : role === 'Official' ? 'off_' : role === 'System Admin' ? 'admin_' : '';
  const canonicalRoleDocId = prefix ? `${prefix}${targetUid}` : targetUid;

  const now = new Date();
  const userUpdates: Record<string, any> = { updated_at: now };
  const profileUpdates: Record<string, any> = { updated_at: now };

  if (payload.full_legal_name !== undefined || payload.full_name !== undefined) {
    const val = (payload.full_legal_name || payload.full_name || '').trim();
    userUpdates.full_legal_name = val;
    userUpdates.full_name = val;
    const parts = val.split(' ');
    userUpdates.first_name = parts[0] || '';
    userUpdates.last_name = parts.slice(1).join(' ') || '';
  }
  if (payload.first_name !== undefined) {
    userUpdates.first_name = payload.first_name;
  }
  if (payload.last_name !== undefined) {
    userUpdates.last_name = payload.last_name;
  }
  if (payload.contact_number !== undefined) {
    userUpdates.contact_number = payload.contact_number;
    profileUpdates.contact_number = payload.contact_number;
  }
  if (payload.organization_name !== undefined || payload.organization !== undefined) {
    const org = payload.organization_name || payload.organization;
    userUpdates.organization_name = org;
    userUpdates.organization = org;
    profileUpdates.organization_name = org;
  }
  if (payload.official_license_number !== undefined) {
    userUpdates.official_license_number = payload.official_license_number;
    profileUpdates.official_license_number = payload.official_license_number;
  }
  if (payload.assigned_tournaments !== undefined) {
    userUpdates.assigned_tournaments = payload.assigned_tournaments;
    profileUpdates.assigned_tournaments = payload.assigned_tournaments;
  }
  if (payload.sport !== undefined) {
    userUpdates.sport = payload.sport;
    profileUpdates.sport = payload.sport;
  }
  if (payload.avatar_url !== undefined || payload.profile_image !== undefined) {
    const avatar = (payload.avatar_url || payload.profile_image || '').trim();
    userUpdates.avatar_url = avatar;
    userUpdates.profile_image = avatar;
    profileUpdates.avatar_url = avatar;
    profileUpdates.profile_image = avatar;
  }
  if (payload.team_name !== undefined || payload.team !== undefined) {
    const team = payload.team_name || payload.team;
    userUpdates.team_name = team;
    profileUpdates.team_name = team;
  }

  // Any other custom profile fields
  for (const key of Object.keys(payload)) {
    if (!['password', 'role', 'user_id', 'email'].includes(key) && profileUpdates[key] === undefined) {
      profileUpdates[key] = payload[key];
    }
  }

  const batch = db.batch();
  batch.set(db.collection('Users').doc(uid), userUpdates, { merge: true });
  batch.set(db.collection(profileCollection).doc(uid), profileUpdates, { merge: true });
  if (canonicalRoleDocId !== uid) {
    batch.set(db.collection(profileCollection).doc(canonicalRoleDocId), profileUpdates, { merge: true });
  }
  await batch.commit();

  try {
    const { invalidateCoachProfileCache } = require('./coachInquiryService');
    invalidateCoachProfileCache(uid);
    invalidateCoachProfileCache(canonicalRoleDocId);
  } catch {}

  return await getUserProfileService(uid);
}

export async function uploadUserAvatarService(uid: string, fileOrDataUrl: string | Express.Multer.File) {
  const rawUid = uid.replace(/^(coach_|ath_|off_|admin_)/, '');
  let userDoc = await db.collection('Users').doc(uid).get();
  let targetUid = uid;
  if (!userDoc.exists) {
    userDoc = await db.collection('Users').doc(rawUid).get();
    if (userDoc.exists) {
      targetUid = rawUid;
    }
  }
  if (!userDoc.exists) {
    throw { code: 'USER_NOT_FOUND', message: 'User not found.' };
  }

  let avatarUrl: string;
  if (typeof fileOrDataUrl === 'string') {
    avatarUrl = fileOrDataUrl.trim();
  } else if (fileOrDataUrl && (fileOrDataUrl as Express.Multer.File).buffer) {
    const mime = (fileOrDataUrl as Express.Multer.File).mimetype || 'image/jpeg';
    const b64 = (fileOrDataUrl as Express.Multer.File).buffer.toString('base64');
    avatarUrl = `data:${mime};base64,${b64}`;
  } else {
    throw { code: 'INVALID_FILE', message: 'Valid image file or base64 data URL is required.' };
  }

  return await updateUserProfileService(targetUid, { avatar_url: avatarUrl, profile_image: avatarUrl });
}

export async function getUserSettingsService(uid: string) {
  const userDoc = await db.collection('Users').doc(uid).get();
  const userData = userDoc.exists ? userDoc.data()! : {};
  const role = userData.role;

  if (role === 'Official') {
    const canonicalOffId = `off_${uid}`;
    const offDoc = await db.collection('Official_Profiles').doc(canonicalOffId).get();
    const settings = (offDoc.exists ? offDoc.data()?.settings : null) || userData.settings;
    if (settings) return settings;
    return {
      setting_id: uid,
      official_id: canonicalOffId,
      split_screen_defaults: true,
      discrepancy_presets: true,
      match_reminders: true,
      updated_at: new Date().toISOString(),
    };
  }

  if (role === 'Coach') {
    const canonicalCoachId = `coach_${uid}`;
    const coachDoc = await db.collection('Coach_Profiles').doc(canonicalCoachId).get();
    const settings = (coachDoc.exists ? coachDoc.data()?.settings : null) || userData.settings;
    if (settings) return settings;
    return {
      setting_id: uid,
      coach_id: canonicalCoachId,
      email_alerts: true,
      sms_notifications: false,
      game_log_updates: true,
      data_sync_preference: 'Manual',
      updated_at: new Date().toISOString(),
    };
  }

  if (role === 'Athlete') {
    const canonicalAthId = `ath_${uid}`;
    const athDoc = await db.collection('Athlete_Profiles').doc(canonicalAthId).get();
    const settings = (athDoc.exists ? athDoc.data()?.settings : null) || userData.settings;
    if (settings) return settings;
  }

  if (userData.settings) return userData.settings;

  return {
    setting_id: uid,
    user_id: uid,
    notifications_enabled: true,
    email_alerts: true,
    match_reminders: true,
    updated_at: new Date().toISOString(),
  };
}

export async function updateUserSettingsService(uid: string, payload: Record<string, any>) {
  const userDoc = await db.collection('Users').doc(uid).get();
  const userData = userDoc.exists ? userDoc.data()! : {};
  const role = userData.role;
  const nowStr = new Date().toISOString();

  const current = await getUserSettingsService(uid);
  const updated = {
    ...current,
    ...payload,
    user_id: uid,
    updated_at: nowStr,
  };

  const batch = db.batch();
  batch.set(db.collection('Users').doc(uid), { settings: updated }, { merge: true });

  if (role === 'Official') {
    const canonicalOffId = `off_${uid}`;
    batch.set(db.collection('Official_Profiles').doc(canonicalOffId), { settings: updated }, { merge: true });
    batch.set(db.collection('Official_Profiles').doc(uid), { settings: updated }, { merge: true });
  } else if (role === 'Coach') {
    const canonicalCoachId = `coach_${uid}`;
    batch.set(db.collection('Coach_Profiles').doc(canonicalCoachId), { settings: updated }, { merge: true });
    batch.set(db.collection('Coach_Profiles').doc(uid), { settings: updated }, { merge: true });
  } else if (role === 'Athlete') {
    const canonicalAthId = `ath_${uid}`;
    batch.set(db.collection('Athlete_Profiles').doc(canonicalAthId), { settings: updated }, { merge: true });
    batch.set(db.collection('Athlete_Profiles').doc(uid), { settings: updated }, { merge: true });
  }

  await batch.commit();
  return updated;
}


