import * as dotenv from 'dotenv';
dotenv.config();

import { auth, db } from '../utils/firebaseAdmin';
import { hashPassword, verifyPassword } from '../utils/passwordUtils';
import { generateElevatedAdminToken } from '../services/adminService';

async function main() {
  const email = 'admin@gmail.com';
  const rawPassword = 'Admin@123';
  const fullName = 'System Admin';
  const role = 'SystemAdmin';
  const departmentCode = 'SYS_ADMIN';
  const clearanceLevel = 4;
  const institution = 'Ateneo de Naga University';

  console.log(`Starting account provisioning for ${email}...`);

  let uid: string;
  try {
    const existingAuth = await auth.getUserByEmail(email);
    console.log(`Found existing Firebase Auth user with UID: ${existingAuth.uid}`);
    uid = existingAuth.uid;
    await auth.updateUser(uid, {
      password: rawPassword,
      displayName: fullName,
      emailVerified: true,
      disabled: false,
    });
    console.log(`Updated Firebase Auth password for ${email}`);
  } catch (err: any) {
    if (err.code === 'auth/user-not-found') {
      const newAuth = await auth.createUser({
        email,
        password: rawPassword,
        displayName: fullName,
        emailVerified: true,
        disabled: false,
      });
      uid = newAuth.uid;
      console.log(`Created new Firebase Auth user with UID: ${uid}`);
    } else {
      throw err;
    }
  }

  const now = new Date();
  const passwordHash = hashPassword(rawPassword);
  console.log(`Password hash generated successfully (verified: ${verifyPassword(rawPassword, passwordHash)})`);

  const userData = {
    user_id: uid,
    full_name: fullName,
    first_name: 'System',
    last_name: 'Admin',
    email,
    password: passwordHash,
    password_hash: passwordHash,
    role: 'SystemAdmin',
    institution,
    department_code: departmentCode,
    clearance_level: clearanceLevel,
    is_active: true,
    is_elevated: true,
    email_verified: true,
    created_at: now,
    updated_at: now,
  };

  // Write to Users collection using UID as document ID
  await db.collection('Users').doc(uid).set(userData, { merge: true });
  console.log(`Set Users document for ${uid}`);

  const adminId = `admin_${uid}`;
  const adminProfileData = {
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

  // Write to Admin_Profiles collection with both admin_${uid} and ${uid} to ensure all query patterns match
  await db.collection('Admin_Profiles').doc(adminId).set(adminProfileData, { merge: true });
  await db.collection('Admin_Profiles').doc(uid).set(adminProfileData, { merge: true });
  console.log(`Set Admin_Profiles documents for ${adminId} and ${uid}`);

  // Generate an elevated JWT token to test JWT generation
  const token = generateElevatedAdminToken(uid, email, role, clearanceLevel, departmentCode);
  console.log(`\n======================================================`);
  console.log(`SUCCESS! System Admin account is created and ready:`);
  console.log(`Email:      ${email}`);
  console.log(`Password:   ${rawPassword}`);
  console.log(`Role:       SystemAdmin`);
  console.log(`UID:        ${uid}`);
  console.log(`Clearance:  Level 4 (${departmentCode})`);
  console.log(`Sample JWT: ${token.slice(0, 30)}...`);
  console.log(`======================================================\n`);
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Error creating admin account:', err);
    process.exit(1);
  });
