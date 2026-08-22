import { db } from '../utils/firebaseAdmin';

async function seedBucal() {
  console.log('🏛️ Seeding BUCAL into Tournament_Registry...');

  const bucalEntries = [
    {
      org_id: 'org_bucal',
      organization_name: 'BUCAL',
      full_name: 'Bicol University Inter-Collegiate Athletic League (BUCAL)',
      region: 'Region V - Bicol',
      status: 'Active',
      created_at: new Date(),
    },
    {
      org_id: 'org_bucal_full',
      organization_name: 'Bicol University Inter-Collegiate Athletic League (BUCAL)',
      region: 'Region V - Bicol',
      status: 'Active',
      created_at: new Date(),
    },
    {
      org_id: 'org_bucal_collegiate',
      organization_name: 'Bicol University Collegiate Athletic League',
      region: 'Region V - Bicol',
      status: 'Active',
      created_at: new Date(),
    },
  ];

  const batch = db.batch();
  for (const entry of bucalEntries) {
    batch.set(db.collection('Tournament_Registry').doc(entry.org_id), entry, { merge: true });
  }

  await batch.commit();
  console.log('✅ Successfully added BUCAL to Tournament_Registry in Firestore!');
}

seedBucal()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Error seeding BUCAL:', err);
    process.exit(1);
  });
