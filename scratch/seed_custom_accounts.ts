import dotenv from 'dotenv';
dotenv.config();

import { registerAdminService } from '../services/adminService';
import { registerOfficialService } from '../services/officialService';

async function seedAccounts() {
  console.log('🌱 Creating requested System Admin and Tournament Official accounts...\n');

  // 1. System Admin
  try {
    console.log('1. Creating System Admin (admin@gmail.com)...');
    const adminRes = await registerAdminService({
      full_name: 'System Administrator',
      email: 'admin@gmail.com',
      password: 'Admin@123',
      department_code: 'SYS_ADMIN',
      clearance_level: 4,
      rbac_compliance_accepted: true,
    }, '127.0.0.1');
    console.log('   ✅ System Admin created successfully!');
    console.log(`      Email: ${adminRes.user.email}`);
    console.log(`      User ID: ${adminRes.user.user_id}`);
    console.log(`      Role: ${adminRes.user.role}`);
  } catch (err: any) {
    console.error('   ❌ Error creating System Admin:', err?.message || err);
  }

  console.log('');

  // 2. Tournament Official
  try {
    console.log('2. Creating Tournament Official (official1025@gmail.com)...');
    const officialRes = await registerOfficialService({
      full_legal_name: 'Tournament Official',
      email: 'official1025@gmail.com',
      password: 'Official@123',
      organization_name: 'Regional Athletic Tournament Board',
    });
    console.log('   ✅ Tournament Official created successfully!');
    console.log(`      Email: ${officialRes.user.email}`);
    console.log(`      User ID: ${officialRes.user.user_id}`);
    console.log(`      Role: ${officialRes.user.role}`);
  } catch (err: any) {
    console.error('   ❌ Error creating Tournament Official:', err?.message || err);
  }

  console.log('\n🎉 Account provisioning complete!');
}

seedAccounts()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
