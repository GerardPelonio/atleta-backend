import { db } from '../utils/firebaseAdmin';
import dotenv from 'dotenv';
dotenv.config();

async function cleanAthleteDataFull() {
  console.log('🧹 [ATHLETE DATABASE CLEANUP] Starting Athlete-side full purge...');

  // 1. Clear Athlete_Profiles
  const profilesSnap = await db.collection('Athlete_Profiles').get();
  console.log(`Clearing collection "Athlete_Profiles" (${profilesSnap.size} documents)...`);
  if (!profilesSnap.empty) {
    const batch = db.batch();
    profilesSnap.forEach((doc) => batch.delete(doc.ref));
    await batch.commit();
  }

  // 2. Clear Workload_Analysis
  const workloadSnap = await db.collection('Workload_Analysis').get();
  console.log(`Clearing collection "Workload_Analysis" (${workloadSnap.size} documents)...`);
  if (!workloadSnap.empty) {
    const batch = db.batch();
    workloadSnap.forEach((doc) => batch.delete(doc.ref));
    await batch.commit();
  }

  // 3. Clear Anthropometric_Measurements
  const anthroSnap = await db.collection('Anthropometric_Measurements').get();
  console.log(`Clearing collection "Anthropometric_Measurements" (${anthroSnap.size} documents)...`);
  if (!anthroSnap.empty) {
    const batch = db.batch();
    anthroSnap.forEach((doc) => batch.delete(doc.ref));
    await batch.commit();
  }

  // 4. Clear Scouting_Registry
  const scoutingSnap = await db.collection('Scouting_Registry').get();
  console.log(`Clearing collection "Scouting_Registry" (${scoutingSnap.size} documents)...`);
  if (!scoutingSnap.empty) {
    const batch = db.batch();
    scoutingSnap.forEach((doc) => batch.delete(doc.ref));
    await batch.commit();
  }

  // 5. Clear Notifications
  const notifSnap = await db.collection('Notifications').get();
  console.log(`Clearing collection "Notifications" (${notifSnap.size} documents)...`);
  if (!notifSnap.empty) {
    const batch = db.batch();
    notifSnap.forEach((doc) => batch.delete(doc.ref));
    await batch.commit();
  }

  // 6. Delete Athlete users from Users collection
  const athleteUsersSnap = await db.collection('Users').where('role', '==', 'Athlete').get();
  console.log(`Deleting Athlete accounts from "Users" (${athleteUsersSnap.size} documents)...`);
  if (!athleteUsersSnap.empty) {
    const batch = db.batch();
    athleteUsersSnap.forEach((doc) => batch.delete(doc.ref));
    await batch.commit();
  }

  console.log('✨ [ATHLETE DATABASE CLEANUP] Athlete-side purge finished successfully!\n');
  process.exit(0);
}

cleanAthleteDataFull().catch((err) => {
  console.error('❌ Athlete cleanup failed:', err);
  process.exit(1);
});
