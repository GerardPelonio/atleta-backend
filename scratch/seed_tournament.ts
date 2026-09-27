import { db } from '../utils/firebaseAdmin';
import dotenv from 'dotenv';
dotenv.config();

async function seed() {
  const orgName = 'Collegiate Athletic League';
  console.log(`Seeding Active organization: "${orgName}"...`);
  await db.collection('Tournament_Registry').doc('collegiate_athletic_league').set({
    organization_name: orgName,
    status: 'Active',
  });
  console.log('✅ Tournament Registry seeded successfully!');
  process.exit(0);
}

seed().catch(err => {
  console.error(err);
  process.exit(1);
});
