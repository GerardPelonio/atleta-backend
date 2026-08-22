import { db } from '../utils/firebaseAdmin';
import dotenv from 'dotenv';
dotenv.config();

async function listCollections() {
  try {
    const collections = await db.listCollections();
    console.log('📌 Collections in database:');
    for (const col of collections) {
      console.log(`  - ${col.id}`);
      // Show one document from each collection
      const snapshot = await col.limit(1).get();
      if (!snapshot.empty) {
        console.log(`    Sample:`, snapshot.docs[0].data());
      } else {
        console.log(`    (Empty collection)`);
      }
    }
  } catch (err) {
    console.error('Error listing collections:', err);
  }
}

listCollections();
