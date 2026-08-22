import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { auth, db } from '../utils/firebaseAdmin';
import { clientAuth } from '../utils/firebaseClient';
import { RegisterAdminDto, LoginAdminDto, AdminProfile, User, CoachAccreditationAuditLog } from '../models/userModel';
import { ServiceError } from '../validators/matchValidator';
import { createNotification } from './notificationService';

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
    await db.collection('Admin_Audit_Logs').doc(logId).set(fullLog);
  } catch (err) {
    console.error('Failed to persist admin audit log:', err);
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
  const secret = process.env.JWT_SECRET || 'atleta-super-secret-jwt-key-2026';
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

  // 3. Provision Users Entity - COMPLETE DATA (NO PREFIX)
  const userData: any = {
    user_id: uid,
    full_name: fullName,
    first_name: firstName,
    last_name: lastName,
    email,
    password: data.password,
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
    user: userData,
    admin_profile: adminProfileData,
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
  if (userData.password && userData.password === passwordInput) {
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
    user: {
      user_id: uid,
      full_name: userData.full_name || `${userData.first_name || ''} ${userData.last_name || ''}`.trim(),
      email: userData.email,
      role: 'SystemAdmin',
    },
    admin_profile: adminProfileData,
    token,
  };
}

/**
 * Retrieve pending coach verification applications and uploaded document links.
 */
export async function getPendingCoachQueueService() {
  const snapshot = await db.collection('Coach_Profiles').get();

  const pendingCoaches: any[] = [];
  const userIds: string[] = [];
  const seenUserIds = new Set<string>();

  snapshot.docs.forEach((doc) => {
    const data = doc.data();
    const status = data.account_status || 'Pending';
    const effectiveUserId = data.user_id || doc.id;
    if (status === 'Pending' && !seenUserIds.has(effectiveUserId)) {
      seenUserIds.add(effectiveUserId);
      pendingCoaches.push({
        coach_id: data.coach_id || (doc.id.startsWith('coach_') ? doc.id : `coach_${doc.id}`),
        user_id: effectiveUserId,
        first_name: data.first_name || '',
        last_name: data.last_name || '',
        full_name: data.full_name || `${data.first_name || ''} ${data.last_name || ''}`.trim(),
        sport_type: data.sport_type || 'Unassigned',
        years_of_experience: data.years_of_experience || 0,
        current_institution: data.current_institution || 'N/A',
        professional_documents: data.professional_documents || [],
        account_status: 'Pending',
        created_at: data.created_at || new Date().toISOString(),
      });
      if (effectiveUserId) userIds.push(effectiveUserId);
    }
  });

  // Resolve user emails & names in parallel
  if (userIds.length > 0) {
    const uniqueUids = Array.from(new Set(userIds));
    const userDocs = await Promise.all(uniqueUids.map((uid) => db.collection('Users').doc(uid).get()));
    const userMap = new Map<string, any>();
    userDocs.forEach((uDoc) => {
      if (uDoc.exists) {
        userMap.set(uDoc.id, uDoc.data());
      }
    });

    pendingCoaches.forEach((coach) => {
      const uData = userMap.get(coach.user_id);
      if (uData) {
        coach.email = uData.email || '';
        coach.full_name = coach.full_name || `${uData.first_name || ''} ${uData.last_name || ''}`.trim();
      }
    });
  }

  return pendingCoaches;
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
        throw new ServiceError(`Coach application with ID '${coachIdParam}' not found.`, 404);
      }
    }
  }

  const now = new Date();

  // Perform atomic batch update to update account_status to "Active" across Coach_Profiles and Users
  const batch = db.batch();

  batch.set(coachRef, { account_status: 'Active', updated_at: now }, { merge: true });
  batch.set(rawCoachRef, { account_status: 'Active', updated_at: now }, { merge: true });
  batch.set(userRef, { account_status: 'Active', updated_at: now }, { merge: true });

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

  // Dispatch confirmation notification asynchronously (non-blocking for < 200ms SLA)
  createNotification({
    recipient_id: userId,
    type: 'SYSTEM',
    title: 'Coach Accreditation Approved',
    message: 'Your coach accreditation application and professional certificates have been verified and approved. Your account is now active with full platform access.',
  }).catch((err) => console.error('Failed to send coach approval notification:', err));

  return {
    message: 'Coach account approved and activated successfully.',
    coach_id: canonicalCoachId,
    account_status: 'Active',
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
        throw new ServiceError(`Coach application with ID '${coachIdParam}' not found.`, 404);
      }
    }
  }

  const now = new Date();

  // Perform atomic batch update to update account_status to "Rejected" across Coach_Profiles and Users
  const batch = db.batch();

  batch.set(coachRef, { account_status: 'Rejected', updated_at: now }, { merge: true });
  batch.set(rawCoachRef, { account_status: 'Rejected', updated_at: now }, { merge: true });
  batch.set(userRef, { account_status: 'Rejected', updated_at: now }, { merge: true });

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
    message: `Your coach accreditation application was declined. Reason: ${reason}`,
  }).catch((err) => console.error('Failed to send coach rejection notification:', err));

  return {
    message: 'Coach application declined.',
    coach_id: canonicalCoachId,
    account_status: 'Rejected',
    rejection_reason: reason,
    audit_log_id: auditLogId,
  };
}

