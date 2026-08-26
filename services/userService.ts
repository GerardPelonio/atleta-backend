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

const googleOAuthClient = new OAuth2Client(
  process.env.GOOGLE_CLIENT_ID || process.env.GOOGLE_ANDROID_CLIENT_ID
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

/**
 * Generate a custom JWT token for a user.
 */
export function generateToken(uid: string, email: string, role: string): string {
  const secret = process.env.JWT_SECRET || 'atleta-super-secret-jwt-key-2026';
  const expiresIn = (process.env.JWT_EXPIRES_IN || '7d') as any;
  return jwt.sign({ uid, email, role }, secret, { expiresIn });
}

/**
 * Encrypts/hashes the admin security key using SHA-256
 */

function hashAdminSecurityKey(key: string): string {
  return crypto.createHash('sha256').update(key).digest('hex');
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

  // 1. Create Firebase Auth user
  const userRecord = await auth.createUser({
    email,
    password,
    displayName: `${first_name} ${last_name}`,
  });

  const uid = userRecord.uid;
  const now = new Date();

  // 2. Build Base Identity document (Users collection) - COMPLETE MASTER DATA (NO PREFIX)
  const userData: Record<string, unknown> = {
    user_id: uid,
    first_name,
    last_name,
    full_name: `${first_name} ${last_name}`.trim(),
    email,
    password,
    contact_number,
    role: firestoreRole,
    account_status: firestoreRole === 'Coach' ? 'Pending' : 'Active',
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
    if (file && Array.isArray(docsPayload.document_urls)) {
      docsPayload.document_urls = [...docsPayload.document_urls, file.originalname];
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

    // Minimal info for Athlete_Profiles table
    profileData.athlete_id = athleteId;
    profileData.user_id = uid;
    profileData.sport_type = sportType;
    profileData.position = position;
    profileData.jersey_number = jerseyNumber;
    profileData.recruitment_status = recruitmentStatus;
    profileData.rank = rank;
    profileData.physical_profile = physicalProfile;
    profileData.computed_metrics = computedMetrics;
    profileData.eligibility_documents = docsPayload;
    profileData.achievements = achievements;
  } else if (firestoreRole === 'Coach') {
    const coachId = `coach_${uid}`;
    const sportType = String(data.sport_type || data.primary_sport || '').trim();
    const yearsExperience = Number(data.years_of_experience || 0);
    const institution = String(data.current_institution || '').trim();
    const quote = data.quote !== undefined && data.quote !== null ? String(data.quote).trim() : null;
    let profDocs = Array.isArray(data.professional_documents) ? data.professional_documents : [];
    if (file) {
      profDocs = [...profDocs, file.originalname];
    }
    const athletesManaged = Array.isArray(data.athlete_managed) ? data.athlete_managed : [];

    // Complete info on Users table
    userData.sport_type = sportType;
    userData.years_of_experience = yearsExperience;
    userData.current_institution = institution;
    userData.quote = quote;
    userData.professional_documents = profDocs;
    userData.athlete_managed = athletesManaged;

    // Minimal info on Coach_Profiles table
    profileData.coach_id = coachId;
    profileData.user_id = uid;
    profileData.sport_type = sportType;
    profileData.years_of_experience = yearsExperience;
    profileData.current_institution = institution;
    profileData.quote = quote;
    profileData.professional_documents = profDocs;
    profileData.athlete_managed = athletesManaged;
    profileData.account_status = 'Pending';
  } else if (firestoreRole === 'Official') {
    const officialId = `off_${uid}`;
    const orgName = String(data.organization_name || data.organization || 'Collegiate Athletic League').trim();
    const licenseNumber = String(data.official_license_number || 'SBP-LIC-2026-DEFAULT').trim();
    const assignedTournaments = Array.isArray(data.assigned_tournaments) ? data.assigned_tournaments : ['Regional Championships 2026'];

    // Complete info on Users table
    userData.organization_name = orgName;
    userData.organization = orgName;
    userData.official_license_number = licenseNumber;
    userData.assigned_tournaments = assignedTournaments;
    userData.tournament_affiliation = orgName;
    userData.certification_status = 'Pending';
    userData.is_active = true;

    // Minimal info on Official_Profiles table
    profileData.official_id = officialId;
    profileData.user_id = uid;
    profileData.organization_name = orgName;
    profileData.official_license_number = licenseNumber;
    profileData.assigned_tournaments = assignedTournaments;
    profileData.certification_status = 'Pending';
    profileData.is_active = true;
  } else if (firestoreRole === 'System Admin') {
    const adminId = `admin_${uid}`;
    const institution = String(data.institution || 'Ateneo de Naga University').trim();
    const deptCode = String(data.department_code || 'ATHLETICS_DEPT').trim();
    const clearanceLevel = Number(data.clearance_level || 4);

    // Complete info on Users table
    userData.institution = institution;
    userData.department_code = deptCode;
    userData.clearance_level = clearanceLevel;
    userData.is_active = true;
    userData.is_elevated = true;

    // Minimal info on Admin_Profiles table
    profileData.admin_id = adminId;
    profileData.user_id = uid;
    profileData.institution = institution;
    profileData.department_code = deptCode;
    profileData.clearance_level = clearanceLevel;
    profileData.is_active = true;
    profileData.is_elevated = true;
    const rawKey = String(data.admin_security_key || 'default_admin_sec_key');
    profileData.admin_security_key = hashAdminSecurityKey(rawKey);
  }

  // 4. Execute atomic batch write: Base identity (Users) + Minimal Subtype child profile
  const batch = db.batch();

  // Users collection receives complete document under raw UID (without prefix)
  batch.set(db.collection('Users').doc(uid), userData);

  if (firestoreRole === 'Athlete') {
    const athleteId = `ath_${uid}`;
    batch.set(db.collection('Athlete_Profiles').doc(athleteId), profileData);
  } else if (firestoreRole === 'Coach') {
    const coachId = `coach_${uid}`;
    batch.set(db.collection('Coach_Profiles').doc(coachId), profileData);
  } else if (firestoreRole === 'Official') {
    const officialId = `off_${uid}`;
    batch.set(db.collection('Official_Profiles').doc(officialId), profileData);
  } else if (firestoreRole === 'System Admin') {
    const adminId = `admin_${uid}`;
    batch.set(db.collection('Admin_Profiles').doc(adminId), profileData);
  }

  // If role is Coach, also initialize Coach_Settings document atomically
  if (firestoreRole === 'Coach') {
    const coachId = (profileData.coach_id as string) || `coach_${uid}`;
    const settingsRef = db.collection('Coach_Settings').doc(coachId);
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
    batch.set(settingsRef, settingsData);
  }

  await batch.commit();

  // 5. Generate token & permissions
  const token = generateToken(uid, email, firestoreRole);
  const permissions = ROLE_PERMISSIONS_MAP[firestoreRole];

  return {
    user: userData,
    profile: profileData,
    permissions: ROLE_PERMISSIONS_MAP[firestoreRole] || [],
    token,
  };
}

/**
 * Register a new coach specifically (POST /api/v1/users/coach).
 * ACCEPTANCE CRITERIA: Missing certification files block creation with 400 Bad Request.
 * Creates Users, Coach_Profiles, and Coach_Settings records atomically in Firestore.
 */
export async function registerCoachService(data: Record<string, unknown>, file?: Express.Multer.File) {
  const docs = data.professional_documents;
  const validDocs = Array.isArray(docs) ? docs.filter((d) => typeof d === 'string' && (d as string).trim().length > 0) : [];

  if (!file && validDocs.length === 0) {
    throw new Error('Minimum 1 certification document link or uploaded file is required upon registration. Missing certification files block creation.');
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

  const userQuery = await db.collection('Users').where('email', '==', cleanEmail).limit(1).get();
  let userDoc = userQuery.empty ? null : userQuery.docs[0];

  if (!userDoc) {
    const rawQuery = await db.collection('Users').where('email', '==', email.trim()).limit(1).get();
    userDoc = rawQuery.empty ? null : rawQuery.docs[0];
  }

  let uid = '';
  let firebaseIdToken = '';

  try {
    const userCredential = await signInWithEmailAndPassword(clientAuth, cleanEmail, password);
    firebaseIdToken = await userCredential.user.getIdToken();
    uid = userCredential.user.uid;
  } catch (err: any) {
    if (userDoc) {
      const userData = userDoc.data();
      if (userData.password && userData.password === password) {
        uid = userDoc.id;
        firebaseIdToken = await auth.createCustomToken(uid).catch(() => 'mock_firebase_id_token');
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
    const docRef = await db.collection('Users').doc(uid).get();
    if (!docRef.exists) {
      throw { code: 'USER_NOT_FOUND', message: 'User profile not found in Firestore.' };
    }
    userDoc = docRef as any;
  }

  const canonicalUid = userDoc!.id;
  const userData = (userDoc as any).data()!;
  const role = userData.role as UserRole;
  const token = generateToken(canonicalUid, userData.email, role);

  return {
    user: {
      user_id: canonicalUid,
      first_name: userData.first_name,
      last_name: userData.last_name,
      email: userData.email,
      role,
    },
    token,
    firebase_id_token: firebaseIdToken,
  };
}

/**
 * Authenticate or auto-register a user via Google or Facebook OAuth Token / Firebase ID Token.
 */
export async function socialLoginService(
  idToken: string,
  provider: 'google' | 'facebook' = 'google',
  roleInput: string = 'Athlete'
) {
  let uid = '';
  let email = '';
  let fullName = '';
  let avatarUrl = '';

  if (provider === 'google') {
    let authSuccess = false;

    // 1. If it explicitly looks like a Google Access Token (e.g. starts with 'ya29.'), try Google UserInfo API first
    if (idToken.startsWith('ya29.')) {
      try {
        const res = await fetch(`https://www.googleapis.com/oauth2/v3/userinfo?access_token=${encodeURIComponent(idToken)}`, {
          headers: { Authorization: `Bearer ${idToken}` },
        });
        if (res.ok) {
          const googleUser = (await res.json()) as any;
          if (googleUser && (googleUser.sub || googleUser.id) && googleUser.email) {
            uid = `google_${googleUser.sub || googleUser.id}`;
            email = googleUser.email;
            fullName = googleUser.name || 'Google User';
            avatarUrl = googleUser.picture || '';
            authSuccess = true;
          }
        }
      } catch (_) {
        // Fall through to other verification methods
      }
    }

    // 2. Try Firebase ID Token verification
    if (!authSuccess) {
      try {
        const decodedToken = await auth.verifyIdToken(idToken);
        uid = decodedToken.uid;
        email = decodedToken.email!;
        fullName = decodedToken.name || 'Social User';
        avatarUrl = decodedToken.picture || '';
        authSuccess = true;
      } catch (_) {
        // Not a Firebase ID token, proceed to Google ID Token check
      }
    }

    // 3. Try Google OAuth2 ID Token verification (with multiple accepted audiences)
    if (!authSuccess) {
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
          fullName = payload.name || 'Google User';
          avatarUrl = payload.picture || '';
          authSuccess = true;
        }
      } catch (_) {
        // Not a valid Google ID token with matching audience
      }
    }

    // 4. Fallback: Try Google UserInfo API (handles access tokens with other prefixes like 4/0..., 0.a..., etc.)
    if (!authSuccess) {
      try {
        const res = await fetch(`https://www.googleapis.com/oauth2/v3/userinfo?access_token=${encodeURIComponent(idToken)}`, {
          headers: { Authorization: `Bearer ${idToken}` },
        });
        if (res.ok) {
          const googleUser = (await res.json()) as any;
          if (googleUser && (googleUser.sub || googleUser.id) && googleUser.email) {
            uid = `google_${googleUser.sub || googleUser.id}`;
            email = googleUser.email;
            fullName = googleUser.name || 'Google User';
            avatarUrl = googleUser.picture || '';
            authSuccess = true;
          }
        }
      } catch (_) {
        // Userinfo lookup failed
      }
    }

    if (!authSuccess) {
      throw {
        code: 'INVALID_TOKEN',
        message: 'Invalid or expired Google authentication token.',
      };
    }
  } else {
    // Facebook or other provider
    try {
      const decodedToken = await auth.verifyIdToken(idToken);
      uid = decodedToken.uid;
      email = decodedToken.email!;
      fullName = decodedToken.name || 'Social User';
      avatarUrl = decodedToken.picture || '';
    } catch (err: any) {
      throw { code: 'INVALID_TOKEN', message: `Invalid or expired ${provider} authentication token.` };
    }
  }

  const nameParts = fullName.split(' ');
  let firstName = nameParts[0] || 'User';
  let lastName = nameParts.slice(1).join(' ') || 'Social';

  let userRef = db.collection('Users').doc(uid);
  let userDoc = await userRef.get();

  // Cross-reference Firestore Users collection (Picture 2) by email if not found by direct doc(uid)
  if (!userDoc.exists && email) {
    const cleanEmail = email.trim().toLowerCase();
    const snap = await db.collection('Users').where('email', '==', cleanEmail).limit(1).get();
    if (!snap.empty) {
      userDoc = snap.docs[0];
      userRef = userDoc.ref;
      uid = userDoc.id;
    } else {
      const snapRaw = await db.collection('Users').where('email', '==', email.trim()).limit(1).get();
      if (!snapRaw.empty) {
        userDoc = snapRaw.docs[0];
        userRef = userDoc.ref;
        uid = userDoc.id;
      }
    }
  }

  let userRole: UserRole;

  if (userDoc.exists) {
    const userData = userDoc.data()!;
    userRole = userData.role || 'Athlete';
    firstName = userData.first_name || firstName;
    lastName = userData.last_name || lastName;
    avatarUrl = userData.avatar_url || avatarUrl;
  } else {
    // New social user: provision User and Athlete Subtype records atomically
    userRole = normalizeRole(roleInput);
    const now = new Date();

    const userData = {
      user_id: uid,
      first_name: firstName,
      last_name: lastName,
      email,
      contact_number: null,
      role: userRole,
      provider,
      avatar_url: avatarUrl,
      created_at: now,
      updated_at: now,
    };

    const profileCollection = ROLE_COLLECTION_MAP[userRole];
    const profileRef = db.collection(profileCollection).doc(uid);

    const profileData: Record<string, unknown> = {
      user_id: uid,
      first_name: firstName,
      last_name: lastName,
      avatar_url: avatarUrl,
      created_at: now,
      updated_at: now,
    };

    if (userRole === 'Athlete') {
      profileData.athlete_id = `ath_${uid}`;
      profileData.birthdate = '2001-01-01';
      profileData.gender = 'Male';
      profileData.province = 'Camarines Sur';
      profileData.sport_type = 'Basketball';
    }

    const batch = db.batch();
    batch.set(userRef, userData);
    batch.set(profileRef, profileData);
    await batch.commit();
  }

  const token = generateToken(uid, email, userRole);

  return {
    user: {
      user_id: uid,
      first_name: firstName,
      last_name: lastName,
      email,
      role: userRole,
      avatar_url: avatarUrl,
      provider,
    },
    token,
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
  const profileDoc = await db.collection(profileCollection).doc(uid).get();
  const profileData = profileDoc.exists ? profileDoc.data() : null;
  const permissions = ROLE_PERMISSIONS_MAP[role] || [];

  return {
    user: {
      user_id: uid,
      first_name: userData.first_name,
      last_name: userData.last_name,
      email: userData.email,
      contact_number: userData.contact_number,
      role,
      created_at: userData.created_at,
      updated_at: userData.updated_at,
    },
    profile: profileData,
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

  const secret = process.env.JWT_SECRET || 'sanamakapasasafinaldefense';
  const resetToken = jwt.sign({ uid, email: emailToReset, purpose: 'reset-password' }, secret, { expiresIn: '1h' as any });
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
  const requestedAt = new Date().toISOString();

  // Dynamically determine frontend URL from request or environment:
  let baseUrl = (
    clientFrontendUrl ||
    process.env.FRONTEND_RESET_URL ||
    process.env.FRONTEND_URL ||
    'https://atleta-frontend.vercel.app/reset-password'
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
  const secret = process.env.JWT_SECRET || 'sanamakapasasafinaldefense';
  let uid = '';

  // 1. Verify JWT reset token if provided
  if (tokenOrIdentifier && tokenOrIdentifier.includes('.')) {
    try {
      const decoded = jwt.verify(tokenOrIdentifier, secret) as { uid: string; email: string; purpose: string };
      if (decoded.purpose === 'reset-password') {
        uid = decoded.uid;
      }
    } catch (err) {
      console.warn('JWT verification failed, checking Firestore token fallback...');
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

  const now = new Date();
  await Promise.all([
    db.collection('Users').doc(uid).set(
      {
        password: newPassword,
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

  await auth.updateUser(uid, { password: newPassword });
  await db.collection('Users').doc(uid).set(
    {
      password: newPassword,
      updated_at: new Date(),
    },
    { merge: true }
  );
}

