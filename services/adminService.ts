import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { auth, db } from '../utils/firebaseAdmin';
import { clientAuth } from '../utils/firebaseClient';
import { RegisterAdminDto, LoginAdminDto, AdminProfile, User, CoachAccreditationAuditLog } from '../models/userModel';
import { ServiceError } from '../validators/matchValidator';
import { createNotification } from './notificationService';
import { sendCoachStatusEmailService, sendOfficialStatusEmailService } from './emailService';
import { hashPassword, verifyPassword, sanitizeUser, sanitizeProfile } from '../utils/passwordUtils';

export interface AdminAuditLog {
  log_id: string;
  user_id: string;
  email: string;
  action: string;
  status: 'SUCCESS' | 'FAILED';
  endpoint: string;
  ip_address: string;
  timestamp: string;
  details?: Record<string, unknown> | string;
}

/**
 * Log all administrative access attempts and data mutations to audit logs.
 */
export async function logAdminAudit(entry: Omit<AdminAuditLog, 'log_id' | 'timestamp'>): Promise<AdminAuditLog> {
  const logId = crypto.randomUUID();
  const timestamp = new Date().toISOString();
  const fullLog: AdminAuditLog = {
    log_id: logId,
    timestamp,
    ...entry,
  };

  try {
    const hasCredentials = !!(
      process.env.FIREBASE_SERVICE_ACCOUNT ||
      process.env.FIREBASE_SERVICE_ACCOUNT_KEY ||
      process.env.FIREBASE_PRIVATE_KEY ||
      process.env.GOOGLE_APPLICATION_CREDENTIALS
    );
    if (hasCredentials && db && typeof db.collection === 'function') {
      await db.collection('Admin_Audit_Logs').doc(logId).set(fullLog).catch(() => {});
    }
  } catch (err) {
    // Audit logging is non-blocking and shouldn't crash unauthenticated requests
  }

  return fullLog;
}



/**
 * Generate an elevated Bearer JWT for System Admin accounts.
 */
export function generateElevatedAdminToken(
  uid: string,
  email: string,
  role: string = 'SystemAdmin',
  clearanceLevel: number = 4,
  departmentCode: string = 'SYS_ADMIN'
): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error('JWT_SECRET is not configured in environment');
  }
  const expiresIn = (process.env.JWT_EXPIRES_IN || '7d') as any;
  return jwt.sign(
    {
      uid,
      user_id: uid,
      email,
      role: 'SystemAdmin',
      clearance_level: clearanceLevel,
      department_code: departmentCode,
      is_elevated: true,
    },
    secret,
    { expiresIn }
  );
}

/**
 * Register a system admin account with institutional email and provision Admin_Profiles.
 */
export async function registerAdminService(
  data: RegisterAdminDto,
  clientIp: string = '127.0.0.1'
) {
  const email = data.email.trim().toLowerCase();
  const fullName = (data as any).fullName || data.full_name || '';
  const nameParts = fullName.trim().split(' ');
  const firstName = nameParts[0] || 'Admin';
  const lastName = nameParts.slice(1).join(' ') || 'User';

  // 1. Check uniqueness in Firestore Users collection
  const existingUsersSnap = await db.collection('Users').where('email', '==', email).limit(1).get();
  if (!existingUsersSnap.empty) {
    await logAdminAudit({
      user_id: 'UNKNOWN',
      email,
      action: 'POST /api/v1/admin/register',
      status: 'FAILED',
      endpoint: '/api/v1/admin/register',
      ip_address: clientIp,
      details: { error: 'Email already exists' },
    });
    throw new ServiceError('A user with this institutional email already exists.', 409);
  }

  // 2. Create user in Firebase Auth
  let uid: string;
  try {
    const userRecord = await auth.createUser({
      email,
      password: data.password,
      displayName: fullName,
    });
    uid = userRecord.uid;
  } catch (authErr: any) {
    if (authErr.code === 'auth/email-already-exists') {
      await logAdminAudit({
        user_id: 'UNKNOWN',
        email,
        action: 'POST /api/v1/admin/register',
        status: 'FAILED',
        endpoint: '/api/v1/admin/register',
        ip_address: clientIp,
        details: { error: 'Firebase auth email already exists' },
      });
      throw new ServiceError('A user with this institutional email already exists.', 409);
    }
    throw authErr;
  }

  const now = new Date();
  const adminId = `admin_${uid}`;
  const clearanceLevel = data.clearance_level ? Number(data.clearance_level) : 4;
  const departmentCode = data.department_code.trim();
  const institution = (data as any).institution || 'Ateneo de Naga University';

  const passwordHash = hashPassword(data.password);

  // 3. Provision Users Entity - COMPLETE DATA (NO PREFIX)
  const userData: any = {
    user_id: uid,
    full_name: fullName,
    first_name: firstName,
    last_name: lastName,
    email,
    password: passwordHash,
    password_hash: passwordHash,
    role: 'SystemAdmin',
    institution,
    department_code: departmentCode,
    clearance_level: clearanceLevel,
    is_active: true,
    is_elevated: true,
    created_at: now,
    updated_at: now,
  };

  // 4. Provision Admin_Profiles Subtype Entity - MINIMAL DATA
  const adminProfileData: any = {
    admin_id: adminId,
    user_id: uid,
    institution,
    department_code: departmentCode,
    clearance_level: clearanceLevel,
    is_active: true,
    is_elevated: true,
    created_at: now.toISOString(),
    updated_at: now.toISOString(),
  };

  // 5. Commit atomic batch to Firestore
  const batch = db.batch();

  batch.set(db.collection('Users').doc(uid), userData);
  batch.set(db.collection('Admin_Profiles').doc(adminId), adminProfileData);
  batch.set(db.collection('Admin_Profiles').doc(uid), adminProfileData);

  await batch.commit();

  // 6. Log successful registration audit event (non-blocking)
  logAdminAudit({
    user_id: uid,
    email,
    action: 'POST /api/v1/admin/register',
    status: 'SUCCESS',
    endpoint: '/api/v1/admin/register',
    ip_address: clientIp,
    details: {
      admin_id: adminId,
      department_code: departmentCode,
      clearance_level: clearanceLevel,
    },
  }).catch((err) => console.error('Async audit log error:', err));

  // 7. Generate elevated Bearer JWT
  const token = generateElevatedAdminToken(uid, email, 'SystemAdmin', clearanceLevel, departmentCode);

  return {
    user: sanitizeUser(userData),
    admin_profile: sanitizeProfile(adminProfileData),
    token,
  };
}

/**
 * Validate admin credentials and return an elevated Bearer JWT.
 */
export async function loginAdminService(
  emailInput: string,
  passwordInput: string,
  clientIp: string = '127.0.0.1'
) {
  const email = emailInput.trim().toLowerCase();

  // 1. Fetch User document from Firestore first
  const usersSnap = await db.collection('Users').where('email', '==', email).limit(1).get();
  if (usersSnap.empty) {
    logAdminAudit({
      user_id: 'UNKNOWN',
      email,
      action: 'POST /api/v1/admin/login',
      status: 'FAILED',
      endpoint: '/api/v1/admin/login',
      ip_address: clientIp,
      details: { error: 'Users document missing' },
    }).catch(() => {});
    throw new ServiceError('Invalid credentials.', 401);
  }

  const userDoc = usersSnap.docs[0];
  const userData = userDoc.data();
  const uid = userData.user_id || userDoc.id;

  // 2. Validate credentials with local hash/password check first, fallback to Firebase Client SDK
  let authenticated = false;
  const storedPass = String(userData.password_hash || userData.password || '');
  if (storedPass && verifyPassword(passwordInput, storedPass)) {
    authenticated = true;
  } else {
    try {
      await signInWithEmailAndPassword(clientAuth, email, passwordInput);
      authenticated = true;
    } catch (err: any) {
      authenticated = false;
    }
  }

  if (!authenticated) {
    logAdminAudit({
      user_id: uid,
      email,
      action: 'POST /api/v1/admin/login',
      status: 'FAILED',
      endpoint: '/api/v1/admin/login',
      ip_address: clientIp,
      details: { error: 'Invalid email or password' },
    }).catch(() => {});
    throw new ServiceError('Invalid credentials.', 401);
  }

  const role = String(userData.role || '');

  // 3. Security Rule: Restrict access strictly to accounts with SystemAdmin role
  if (role !== 'SystemAdmin' && role !== 'System Admin') {
    logAdminAudit({
      user_id: uid,
      email,
      action: 'POST /api/v1/admin/login',
      status: 'FAILED',
      endpoint: '/api/v1/admin/login',
      ip_address: clientIp,
      details: { error: 'Role unauthorized', user_role: role },
    }).catch(() => {});
    throw new ServiceError('Access denied. System Admin role required.', 403);
  }

  // 4. Fetch Admin_Profiles Subtype Entity by user_id foreign key (with fallback to direct doc read by uid)
  let adminProfileData: AdminProfile;
  const adminProfilesSnap = await db.collection('Admin_Profiles').where('user_id', '==', uid).limit(1).get();

  if (!adminProfilesSnap.empty) {
    adminProfileData = adminProfilesSnap.docs[0].data() as AdminProfile;
  } else {
    const directAdminDoc = await db.collection('Admin_Profiles').doc(uid).get();
    if (directAdminDoc.exists) {
      adminProfileData = directAdminDoc.data() as AdminProfile;
    } else {
      logAdminAudit({
        user_id: uid,
        email,
        action: 'POST /api/v1/admin/login',
        status: 'FAILED',
        endpoint: '/api/v1/admin/login',
        ip_address: clientIp,
        details: { error: 'Admin_Profiles subtype missing' },
      }).catch(() => {});
      throw new ServiceError('System Admin profile not found.', 404);
    }
  }

  // 5. Verify active status
  if (adminProfileData.is_active === false) {
    logAdminAudit({
      user_id: uid,
      email,
      action: 'POST /api/v1/admin/login',
      status: 'FAILED',
      endpoint: '/api/v1/admin/login',
      ip_address: clientIp,
      details: { error: 'Admin account deactivated' },
    }).catch(() => {});
    throw new ServiceError('Access denied. Admin profile is deactivated.', 403);
  }

  const clearanceLevel = adminProfileData.clearance_level || 4;
  const departmentCode = adminProfileData.department_code || 'SYS_ADMIN';

  // 6. Generate elevated Bearer JWT
  const token = generateElevatedAdminToken(uid, email, 'SystemAdmin', clearanceLevel, departmentCode);

  // 7. Log successful login access event (non-blocking async)
  logAdminAudit({
    user_id: uid,
    email,
    action: 'POST /api/v1/admin/login',
    status: 'SUCCESS',
    endpoint: '/api/v1/admin/login',
    ip_address: clientIp,
    details: {
      admin_id: adminProfileData.admin_id,
      clearance_level: clearanceLevel,
      department_code: departmentCode,
    },
  }).catch((err) => console.error('Async audit log error:', err));

  return {
    user: sanitizeUser({
      user_id: uid,
      full_name: userData.full_name || `${userData.first_name || ''} ${userData.last_name || ''}`.trim(),
      email: userData.email,
      role: 'SystemAdmin',
    }),
    admin_profile: sanitizeProfile(adminProfileData),
    token,
  };
}

/**
 * Retrieve pending coach verification applications and uploaded document links.
 * Returns ALL coach accounts, whether or not they submitted optional documents during sign-up.
 */
export async function getPendingCoachQueueService(filterStatus?: string) {
  const [profileSnap, userCoachSnap, userPendingSnap] = await Promise.all([
    db.collection('Coach_Profiles').get().catch(() => ({ docs: [] } as any)),
    db.collection('Users').where('role', 'in', ['Coach', 'coach', 'COACH']).get().catch(() => ({ docs: [] } as any)),
    db.collection('Users').where('account_status', 'in', ['Pending', 'pending', 'PENDING']).get().catch(() => ({ docs: [] } as any)),
  ]);

  const coachesMap = new Map<string, any>();
  const emailToUid = new Map<string, string>();
  const normalizeUid = (id: string) => String(id || '').replace(/^coach_/, '');

  // 1. Process Users collection first (captures all signed up coaches)
  const allUserDocs = [
    ...userCoachSnap.docs,
    ...userPendingSnap.docs.filter((d: any) => {
      const r = String(d.data()?.role || '').toLowerCase();
      return r === 'coach' || (!r.includes('athlete') && !r.includes('official') && !r.includes('admin'));
    }),
  ];

  allUserDocs.forEach((doc: any) => {
    const data = doc.data();
    const cleanUid = normalizeUid(doc.id);
    const emailKey = String(data.email || '').trim().toLowerCase();
    const effectiveStatus = data.account_status || data.status || 'Pending';
    const isApproved = String(effectiveStatus).toLowerCase() === 'active' || String(effectiveStatus).toLowerCase() === 'approved';
    const isRejected = String(effectiveStatus).toLowerCase() === 'rejected';
    const displayStatus = isApproved ? 'VERIFIED' : (isRejected ? 'REJECTED' : 'PENDING');

    const item = {
      coach_id: `coach_${cleanUid}`,
      user_id: cleanUid,
      first_name: data.first_name || '',
      last_name: data.last_name || '',
      full_name: data.full_name || `${data.first_name || ''} ${data.last_name || ''}`.trim() || 'Coach Applicant',
      email: data.email || '',
      certification_license_num: data.certification_license_num || data.coach_license_number || data.license_number || 'N/A',
      sport_type: data.sport_type || data.sport || 'Unassigned',
      years_of_experience: data.years_of_experience || 0,
      current_institution: data.current_institution || data.institution || 'N/A',
      institutional_affiliation: data.current_institution || data.institutional_affiliation || data.institution || 'N/A',
      professional_documents: data.professional_documents || data.uploaded_documents || [],
      account_status: effectiveStatus,
      status: displayStatus,
      rejection_reason: data.rejection_reason || '',
      created_at: data.created_at || new Date().toISOString(),
      date_uploaded: data.date_uploaded || data.created_at || new Date().toISOString(),
    };

    const targetKey = (emailKey && emailToUid.has(emailKey)) ? emailToUid.get(emailKey)! : cleanUid;
    coachesMap.set(targetKey, item);
    if (emailKey) emailToUid.set(emailKey, targetKey);
  });

  // 2. Overlay / Merge Coach_Profiles collection
  profileSnap.docs.forEach((doc: any) => {
    const data = doc.data();
    const rawUid = data.user_id || doc.id;
    const cleanUid = normalizeUid(rawUid);
    const emailKey = String(data.email || '').trim().toLowerCase();

    const targetKey = (emailKey && emailToUid.has(emailKey))
      ? emailToUid.get(emailKey)!
      : (coachesMap.has(cleanUid) ? cleanUid : (emailKey ? cleanUid : cleanUid));

    const existing = coachesMap.get(targetKey) || {};
    const existingStatus = existing.account_status || existing.status;
    const profileStatus = data.account_status || data.status;
    const isApproved =
      String(existingStatus || '').toLowerCase() === 'active' ||
      String(existingStatus || '').toLowerCase() === 'approved' ||
      String(profileStatus || '').toLowerCase() === 'active' ||
      String(profileStatus || '').toLowerCase() === 'approved';
    const isRejected =
      !isApproved && (
        String(existingStatus || '').toLowerCase() === 'rejected' ||
        String(profileStatus || '').toLowerCase() === 'rejected'
      );
    const effectiveStatus = isApproved ? 'Active' : (isRejected ? 'Rejected' : (profileStatus || existingStatus || 'Pending'));
    const displayStatus = isApproved ? 'VERIFIED' : (isRejected ? 'REJECTED' : 'PENDING');

    coachesMap.set(targetKey, {
      ...existing,
      coach_id: data.coach_id || existing.coach_id || (doc.id.startsWith('coach_') ? doc.id : `coach_${doc.id}`),
      user_id: existing.user_id || cleanUid,
      first_name: data.first_name || existing.first_name || '',
      last_name: data.last_name || existing.last_name || '',
      full_name: data.full_name || existing.full_name || `${data.first_name || existing.first_name || ''} ${data.last_name || existing.last_name || ''}`.trim(),
      email: data.email || existing.email || '',
      certification_license_num: data.certification_license_num || data.coach_license_number || data.license_number || existing.certification_license_num || 'N/A',
      sport_type: data.sport_type || existing.sport_type || 'Unassigned',
      years_of_experience: data.years_of_experience ?? existing.years_of_experience ?? 0,
      current_institution: data.current_institution || existing.current_institution || 'N/A',
      institutional_affiliation: data.current_institution || data.institutional_affiliation || existing.institutional_affiliation || 'N/A',
      professional_documents: (Array.isArray(data.professional_documents) && data.professional_documents.length > 0)
        ? data.professional_documents
        : (Array.isArray(existing.professional_documents) ? existing.professional_documents : []),
      account_status: effectiveStatus,
      status: displayStatus,
      rejection_reason: data.rejection_reason || existing.rejection_reason || '',
      created_at: data.created_at || existing.created_at || new Date().toISOString(),
      date_uploaded: data.date_uploaded || existing.date_uploaded || data.created_at || new Date().toISOString(),
    });

    if (emailKey) emailToUid.set(emailKey, targetKey);
  });

  let coaches = Array.from(coachesMap.values());

  if (filterStatus) {
    coaches = coaches.filter(
      (c) => (c.account_status || '').toLowerCase() === filterStatus.toLowerCase()
    );
  }

  return coaches;
}

/**
 * Validate credentials, mark coach account as active, and grant full platform access (< 200ms).
 */
export async function approveCoachService(adminId: string, coachIdParam: string) {
  const canonicalCoachId = coachIdParam.startsWith('coach_') ? coachIdParam : `coach_${coachIdParam}`;
  const userId = coachIdParam.replace('coach_', '');

  const coachRef = db.collection('Coach_Profiles').doc(canonicalCoachId);
  const rawCoachRef = db.collection('Coach_Profiles').doc(userId);
  const userRef = db.collection('Users').doc(userId);

  // Fast direct primary key check
  const coachSnap = await coachRef.get();
  if (!coachSnap.exists) {
    const rawSnap = await rawCoachRef.get();
    if (!rawSnap.exists) {
      const querySnap = await db.collection('Coach_Profiles').where('coach_id', '==', coachIdParam).limit(1).get();
      if (querySnap.empty) {
        const userSnap = await userRef.get();
        if (!userSnap.exists) {
          throw new ServiceError(`Coach application with ID '${coachIdParam}' not found.`, 404);
        }
      }
    }
  }

  const now = new Date();

  // Standardized coach approval attributes across all platform naming conventions
  const coachApprovalUpdates = {
    account_status: 'Active',
    status: 'approved',
    certification_status: 'approved',
    is_approved: true,
    isApproved: true,
    is_verified: true,
    isVerified: true,
    rejection_reason: null,
    updated_at: now,
    updatedAt: now,
  };

  // Perform atomic batch update across Coach_Profiles, Users, and users collections
  const batch = db.batch();

  batch.set(coachRef, coachApprovalUpdates, { merge: true });
  batch.set(rawCoachRef, coachApprovalUpdates, { merge: true });
  batch.set(userRef, coachApprovalUpdates, { merge: true });
  batch.set(db.collection('users').doc(userId), coachApprovalUpdates, { merge: true });

  const coachData = coachSnap.exists ? coachSnap.data() : null;
  const linkedUserId = coachData?.user_id || coachData?.uid;
  if (linkedUserId && linkedUserId !== userId) {
    batch.set(db.collection('Users').doc(linkedUserId), coachApprovalUpdates, { merge: true });
    batch.set(db.collection('users').doc(linkedUserId), coachApprovalUpdates, { merge: true });
  }

  // Write Admin_Audit_Logs record for accreditation decision
  const auditLogId = crypto.randomUUID();
  const auditRef = db.collection('Admin_Audit_Logs').doc(auditLogId);
  const auditData: CoachAccreditationAuditLog = {
    audit_log_id: auditLogId,
    admin_id: adminId,
    coach_id: canonicalCoachId,
    action: 'APPROVED',
    timestamp: now.toISOString(),
  };

  batch.set(auditRef, auditData);

  await batch.commit();

  // Set Firebase Auth custom claims and trigger token refresh readiness
  try {
    const authTargetUid = linkedUserId || userId;
    await auth.setCustomUserClaims(authTargetUid, {
      role: 'Coach',
      approved: true,
      isApproved: true,
      isVerified: true,
      status: 'approved',
    });
    await auth.revokeRefreshTokens(authTargetUid).catch(() => null);
  } catch (_) {
    // Non-blocking notice for auth claims
  }

  // Dispatch confirmation notification asynchronously (non-blocking for < 200ms SLA)
  createNotification({
    recipient_id: userId,
    type: 'SYSTEM',
    title: 'Coach Accreditation Approved',
    message: 'Your coach accreditation application and professional certificates have been verified and approved. Your account is now active with full platform access.',
  }).catch((err) => console.error('Failed to send coach approval notification:', err));

  // Dispatch confirmation email to applicant coach (awaited for serverless delivery completion)
  try {
    let coachEmail: string | undefined;
    let coachName: string | undefined;

    const uSnap = await userRef.get();
    if (uSnap.exists) {
      const uData = uSnap.data();
      coachEmail = uData?.email;
      coachName = uData?.full_name || `${uData?.first_name || ''} ${uData?.last_name || ''}`.trim();
    }

    if (!coachEmail) {
      const cSnap = await coachRef.get();
      if (cSnap.exists) {
        const cData = cSnap.data();
        coachEmail = cData?.email;
        coachName = coachName || cData?.full_name || `${cData?.first_name || ''} ${cData?.last_name || ''}`.trim();
      }
    }

    if (coachEmail) {
      await sendCoachStatusEmailService(coachEmail, coachName || 'Coach', 'APPROVED');
    }
  } catch (err) {
    console.warn('Failed to dispatch coach approval status email:', err);
  }

  return {
    message: 'Coach account approved and activated successfully.',
    coach_id: canonicalCoachId,
    account_status: 'Active',
    status: 'VERIFIED',
    is_approved: true,
    audit_log_id: auditLogId,
  };
}

/**
 * Decline application, log rejection reasons, and notify applicant.
 */
export async function rejectCoachService(adminId: string, coachIdParam: string, rejectionReason: string) {
  const reason = (rejectionReason || '').trim();
  if (!reason) {
    throw new ServiceError('Rejection reason is required when declining a coach application.', 400);
  }

  const canonicalCoachId = coachIdParam.startsWith('coach_') ? coachIdParam : `coach_${coachIdParam}`;
  const userId = coachIdParam.replace('coach_', '');

  const coachRef = db.collection('Coach_Profiles').doc(canonicalCoachId);
  const rawCoachRef = db.collection('Coach_Profiles').doc(userId);
  const userRef = db.collection('Users').doc(userId);

  const coachSnap = await coachRef.get();
  if (!coachSnap.exists) {
    const rawSnap = await rawCoachRef.get();
    if (!rawSnap.exists) {
      const querySnap = await db.collection('Coach_Profiles').where('coach_id', '==', coachIdParam).limit(1).get();
      if (querySnap.empty) {
        const userSnap = await userRef.get();
        if (!userSnap.exists) {
          throw new ServiceError(`Coach application with ID '${coachIdParam}' not found.`, 404);
        }
      }
    }
  }

  const now = new Date();

  // Perform atomic batch update to update account_status to "Rejected" across Coach_Profiles and Users
  // Preserves user account record, strictly updating status and recording rejection reason
  const batch = db.batch();

  const coachRejectionUpdates = {
    account_status: 'Rejected',
    status: 'REJECTED',
    is_approved: false,
    isApproved: false,
    rejection_reason: reason,
    updated_at: now,
  };

  batch.set(coachRef, coachRejectionUpdates, { merge: true });
  batch.set(rawCoachRef, coachRejectionUpdates, { merge: true });
  batch.set(userRef, coachRejectionUpdates, { merge: true });

  // Write Admin_Audit_Logs record with rejection reason
  const auditLogId = crypto.randomUUID();
  const auditRef = db.collection('Admin_Audit_Logs').doc(auditLogId);
  const auditData: CoachAccreditationAuditLog = {
    audit_log_id: auditLogId,
    admin_id: adminId,
    coach_id: canonicalCoachId,
    action: 'REJECTED',
    rejection_reason: reason,
    timestamp: now.toISOString(),
  };

  batch.set(auditRef, auditData);

  await batch.commit();

  // Dispatch rejection notification asynchronously
  createNotification({
    recipient_id: userId,
    type: 'SYSTEM',
    title: 'Coach Accreditation Application Declined',
    message: `Your coach accreditation application was declined. Reason: ${reason}. You may upload updated verification documents to re-apply.`,
  }).catch((err) => console.error('Failed to send coach rejection notification:', err));

  // Dispatch rejection email to applicant coach (awaited for serverless delivery completion)
  try {
    let coachEmail: string | undefined;
    let coachName: string | undefined;

    const uSnap = await userRef.get();
    if (uSnap.exists) {
      const uData = uSnap.data();
      coachEmail = uData?.email;
      coachName = uData?.full_name || `${uData?.first_name || ''} ${uData?.last_name || ''}`.trim();
    }

    if (!coachEmail) {
      const cSnap = await coachRef.get();
      if (cSnap.exists) {
        const cData = cSnap.data();
        coachEmail = cData?.email;
        coachName = coachName || cData?.full_name || `${cData?.first_name || ''} ${cData?.last_name || ''}`.trim();
      }
    }

    if (coachEmail) {
      await sendCoachStatusEmailService(coachEmail, coachName || 'Coach', 'REJECTED', reason);
    }
  } catch (err) {
    console.warn('Failed to dispatch coach rejection status email:', err);
  }

  return {
    message: 'Coach application declined.',
    coach_id: canonicalCoachId,
    account_status: 'Rejected',
    status: 'REJECTED',
    is_approved: false,
    rejection_reason: reason,
    audit_log_id: auditLogId,
  };
}

/**
 * Retrieve all registered tournament officials for admin review and approval queue.
 */
export async function getOfficialsQueueService() {
  const [profilesSnap, usersSnap1, usersSnap2, usersSnap3] = await Promise.all([
    db.collection('Official_Profiles').get().catch(() => ({ docs: [] } as any)),
    db.collection('Users').where('role', '==', 'Official').get().catch(() => ({ docs: [] } as any)),
    db.collection('Users').where('role', '==', 'official').get().catch(() => ({ docs: [] } as any)),
    db.collection('Users').where('role', '==', 'OFFICIAL').get().catch(() => ({ docs: [] } as any)),
  ]);

  const officialsMap = new Map<string, any>();
  const emailToUid = new Map<string, string>();
  const normalizeUid = (id: string) => String(id || '').replace(/^off_|^official_/, '');

  const allUserDocs = [...usersSnap1.docs, ...usersSnap2.docs, ...usersSnap3.docs];
  allUserDocs.forEach((doc: any) => {
    const data = doc.data();
    const uid = doc.id;
    const cleanUid = normalizeUid(uid);
    const emailKey = String(data.email || '').trim().toLowerCase();
    const rawStatus = String(data.account_status || data.status || data.certification_status || 'Pending');
    const isApproved = data.is_approved === true || data.isApproved === true || rawStatus.toLowerCase() === 'active' || rawStatus.toLowerCase() === 'approved';
    const isRejected = rawStatus.toLowerCase() === 'rejected' || rawStatus.toLowerCase() === 'declined';
    const displayStatus = isApproved ? 'Approved' : (isRejected ? 'Rejected' : 'Pending');

    const item = {
      official_id: `off_${cleanUid}`,
      user_id: cleanUid,
      first_name: data.first_name || '',
      last_name: data.last_name || '',
      full_name: data.full_name || data.full_legal_name || `${data.first_name || ''} ${data.last_name || ''}`.trim() || 'Tournament Official',
      email: data.email || '',
      organization_name: data.organization_name || data.organization || data.tournament_affiliation || 'N/A',
      official_license_number: data.official_license_number || 'N/A',
      assigned_tournaments: Array.isArray(data.assigned_tournaments) ? data.assigned_tournaments : [],
      account_status: rawStatus,
      status: displayStatus,
      is_approved: isApproved,
      rejection_reason: data.rejection_reason || '',
      created_at: data.created_at || new Date().toISOString(),
    };

    const targetKey = (emailKey && emailToUid.has(emailKey)) ? emailToUid.get(emailKey)! : cleanUid;
    officialsMap.set(targetKey, item);
    if (emailKey) emailToUid.set(emailKey, targetKey);
  });

  profilesSnap.docs.forEach((doc: any) => {
    const data = doc.data();
    const rawUid = data.user_id || doc.id.replace(/^off_|^official_/, '');
    const cleanUid = normalizeUid(rawUid);
    const existing = officialsMap.get(cleanUid) || {};

    const rawStatus = String(data.account_status || data.status || data.certification_status || existing.account_status || 'Pending');
    const isApproved = data.is_approved === true || data.isApproved === true || existing.is_approved === true || rawStatus.toLowerCase() === 'active' || rawStatus.toLowerCase() === 'approved';
    const isRejected = rawStatus.toLowerCase() === 'rejected' || rawStatus.toLowerCase() === 'declined';
    const displayStatus = isApproved ? 'Approved' : (isRejected ? 'Rejected' : 'Pending');

    officialsMap.set(cleanUid, {
      ...existing,
      official_id: data.official_id || existing.official_id || (doc.id.startsWith('off_') ? doc.id : `off_${doc.id}`),
      user_id: rawUid || existing.user_id || doc.id,
      organization_name: data.organization_name || existing.organization_name || 'N/A',
      official_license_number: data.official_license_number || existing.official_license_number || 'N/A',
      assigned_tournaments: (Array.isArray(data.assigned_tournaments) && data.assigned_tournaments.length > 0)
        ? data.assigned_tournaments
        : (existing.assigned_tournaments || []),
      account_status: rawStatus,
      status: displayStatus,
      is_approved: isApproved,
      rejection_reason: data.rejection_reason || existing.rejection_reason || '',
      created_at: data.created_at || existing.created_at || new Date().toISOString(),
    });
  });

  return Array.from(officialsMap.values());
}

/**
 * Approve an official's sign-up request, allowing them to log in.
 */
export async function approveOfficialService(adminId: string, officialIdParam: string) {
  const cleanId = officialIdParam.replace(/^off_|^official_/, '');
  const canonicalOfficialId = `off_${cleanId}`;

  const offProfileRef = db.collection('Official_Profiles').doc(canonicalOfficialId);
  const rawProfileRef = db.collection('Official_Profiles').doc(cleanId);
  const userRef = db.collection('Users').doc(cleanId);

  const userSnap = await userRef.get();
  if (!userSnap.exists) {
    const offSnap = await offProfileRef.get();
    if (!offSnap.exists) {
      const qSnap = await db.collection('Official_Profiles').where('official_id', '==', officialIdParam).limit(1).get();
      if (qSnap.empty) {
        throw new ServiceError(`Official account '${officialIdParam}' not found.`, 404);
      }
    }
  }

  const now = new Date();
  const batch = db.batch();

  const updates = {
    account_status: 'Active',
    status: 'approved',
    is_approved: true,
    isApproved: true,
    certification_status: 'Approved',
    rejection_reason: null,
    updated_at: now,
  };

  batch.set(userRef, updates, { merge: true });
  batch.set(offProfileRef, updates, { merge: true });
  batch.set(rawProfileRef, updates, { merge: true });

  const auditLogId = crypto.randomUUID();
  const auditRef = db.collection('Admin_Audit_Logs').doc(auditLogId);
  batch.set(auditRef, {
    audit_log_id: auditLogId,
    admin_id: adminId,
    official_id: canonicalOfficialId,
    user_id: cleanId,
    action: 'OFFICIAL_APPROVED',
    timestamp: now.toISOString(),
  });

  await batch.commit();

  createNotification({
    recipient_id: cleanId,
    type: 'SYSTEM',
    title: 'Official Account Approved',
    message: 'Your official account has been approved by the system administrator. You may now log in to the tournament platform.',
  }).catch(() => null);

  // Dispatch confirmation email directly to the official's email address (awaited for serverless delivery completion)
  try {
    let officialEmail: string | undefined;
    let officialName: string | undefined;

    const uSnap = await userRef.get();
    if (uSnap.exists) {
      const uData = uSnap.data();
      officialEmail = uData?.email;
      officialName = uData?.full_name || uData?.full_legal_name || `${uData?.first_name || ''} ${uData?.last_name || ''}`.trim();
    }

    if (!officialEmail) {
      const offSnap = await offProfileRef.get();
      if (offSnap.exists) {
        const offData = offSnap.data();
        officialEmail = offData?.email;
        officialName = officialName || offData?.full_name || offData?.full_legal_name || `${offData?.first_name || ''} ${offData?.last_name || ''}`.trim();
      }
    }

    if (!officialEmail) {
      const rawSnap = await rawProfileRef.get();
      if (rawSnap.exists) {
        const rawData = rawSnap.data();
        officialEmail = rawData?.email;
        officialName = officialName || rawData?.full_name || rawData?.full_legal_name || `${rawData?.first_name || ''} ${rawData?.last_name || ''}`.trim();
      }
    }

    if (officialEmail) {
      await sendOfficialStatusEmailService(officialEmail, officialName || 'Official', 'APPROVED');
    }
  } catch (emailErr) {
    console.warn('Failed to dispatch official approval status email:', emailErr);
  }

  return {
    message: 'Official account approved successfully.',
    official_id: canonicalOfficialId,
    user_id: cleanId,
    account_status: 'Active',
    status: 'approved',
    is_approved: true,
    audit_log_id: auditLogId,
  };
}

/**
 * Reject an official's sign-up request with a reason.
 */
export async function rejectOfficialService(adminId: string, officialIdParam: string, reason: string = 'Application does not meet platform criteria.') {
  const cleanId = officialIdParam.replace(/^off_|^official_/, '');
  const canonicalOfficialId = `off_${cleanId}`;

  const offProfileRef = db.collection('Official_Profiles').doc(canonicalOfficialId);
  const rawProfileRef = db.collection('Official_Profiles').doc(cleanId);
  const userRef = db.collection('Users').doc(cleanId);

  const now = new Date();
  const batch = db.batch();

  const updates = {
    account_status: 'Rejected',
    status: 'rejected',
    is_approved: false,
    isApproved: false,
    certification_status: 'Rejected',
    rejection_reason: reason,
    updated_at: now,
  };

  batch.set(userRef, updates, { merge: true });
  batch.set(offProfileRef, updates, { merge: true });
  batch.set(rawProfileRef, updates, { merge: true });

  const auditLogId = crypto.randomUUID();
  const auditRef = db.collection('Admin_Audit_Logs').doc(auditLogId);
  batch.set(auditRef, {
    audit_log_id: auditLogId,
    admin_id: adminId,
    official_id: canonicalOfficialId,
    user_id: cleanId,
    action: 'OFFICIAL_REJECTED',
    rejection_reason: reason,
    timestamp: now.toISOString(),
  });

  await batch.commit();

  createNotification({
    recipient_id: cleanId,
    type: 'SYSTEM',
    title: 'Official Application Declined',
    message: `Your official account application was declined by the system administrator. Reason: ${reason}`,
  }).catch(() => null);

  // Dispatch rejection notification email directly to the official's email address (awaited for serverless delivery completion)
  try {
    let officialEmail: string | undefined;
    let officialName: string | undefined;

    const uSnap = await userRef.get();
    if (uSnap.exists) {
      const uData = uSnap.data();
      officialEmail = uData?.email;
      officialName = uData?.full_name || uData?.full_legal_name || `${uData?.first_name || ''} ${uData?.last_name || ''}`.trim();
    }

    if (!officialEmail) {
      const offSnap = await offProfileRef.get();
      if (offSnap.exists) {
        const offData = offSnap.data();
        officialEmail = offData?.email;
        officialName = officialName || offData?.full_name || offData?.full_legal_name || `${offData?.first_name || ''} ${offData?.last_name || ''}`.trim();
      }
    }

    if (!officialEmail) {
      const rawSnap = await rawProfileRef.get();
      if (rawSnap.exists) {
        const rawData = rawSnap.data();
        officialEmail = rawData?.email;
        officialName = officialName || rawData?.full_name || rawData?.full_legal_name || `${rawData?.first_name || ''} ${rawData?.last_name || ''}`.trim();
      }
    }

    if (officialEmail) {
      await sendOfficialStatusEmailService(officialEmail, officialName || 'Official', 'REJECTED', reason);
    }
  } catch (emailErr) {
    console.warn('Failed to dispatch official rejection status email:', emailErr);
  }

  return {
    message: 'Official account application declined.',
    official_id: canonicalOfficialId,
    user_id: cleanId,
    account_status: 'Rejected',
    status: 'rejected',
    is_approved: false,
    rejection_reason: reason,
    audit_log_id: auditLogId,
  };
}

