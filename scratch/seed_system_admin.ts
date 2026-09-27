import dotenv from 'dotenv';
dotenv.config();

import { registerAdminService } from '../services/adminService';

async function seedAdmin() {
  console.log('Seeding default System Admin account into Firestore...');
  try {
    const adminData = {
      full_name: 'Super System Administrator',
      email: 'admin@atleta.edu',
      password: 'AdminPassword123!',
      department_code: 'SYS_ADMIN',
      clearance_level: 4,
      rbac_compliance_accepted: true,
    };

    const res = await registerAdminService(adminData, '127.0.0.1');
    console.log('✅ System Admin successfully seeded!');
    console.log('-------------------------------------------');
    console.log(`Email: ${res.user.email}`);
    console.log(`User ID: ${res.user.user_id}`);
    console.log(`Admin ID: ${res.admin_profile.admin_id}`);
    console.log(`Clearance Level: ${res.admin_profile.clearance_level}`);
    console.log(`Department: ${res.admin_profile.department_code}`);
    console.log('-------------------------------------------');
  } catch (err: any) {
    if (err.message && err.message.includes('already exists')) {
      console.log('ℹ️ System Admin account (admin@atleta.edu) already exists in Firestore.');
    } else {
      console.error('Error seeding System Admin:', err);
    }
  }
}

seedAdmin().then(() => process.exit(0));
