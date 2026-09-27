import { db } from '../utils/firebaseAdmin';
import dotenv from 'dotenv';
dotenv.config();

async function seed() {
  const orgName = 'BUCAL';
  console.log(`Seeding Active organization: "${orgName}" into Tournament_Registry...`);
  await db.collection('Tournament_Registry').doc('org_bucal').set({
    organization_name: orgName,
    status: 'Active',
    created_at: new Date().toISOString(),
  });
  console.log(`✅ Organization "${orgName}" registered and set to Active successfully!`);
  process.exit(0);
}

seed().catch(err => {
  console.error(err);
  process.exit(1);
});
