import { db } from '../utils/firebaseAdmin';
import dotenv from 'dotenv';
dotenv.config();

async function checkInconsistencies() {
  console.log('🔍 [FIRESTORE DATA INCONSISTENCY INSPECTOR] Running...\n');

  // 1. Athlete Profiles
  console.log('--- Collection: Athlete_Profiles ---');
  const athletesSnap = await db.collection('Athlete_Profiles').limit(1).get();
  if (!athletesSnap.empty) {
    const doc = athletesSnap.docs[0];
    const data = doc.data();
    console.log(`Document ID: "${doc.id}"`);
    console.log(`Sample Fields:`, data);
    
    // Inconsistency checks
    if (data.first_name || data.last_name) {
      console.log(`  ⚠️  Redundancy Inconsistency: "first_name" and "last_name" are duplicated in Athlete_Profiles (should reside in Users only).`);
    }
    if (data.physical_profile === undefined) {
      console.log(`  ❌ Missing Field Inconsistency: "physical_profile" object (height, weight, wingspan) is missing.`);
    }
    if (data.rank === undefined && data.leaderboard_rank !== undefined) {
      console.log(`  ⚠️  Naming Inconsistency: Using "leaderboard_rank" instead of "rank".`);
    }
    if (Array.isArray(data.eligibility_documents)) {
      console.log(`  ⚠️  Type Inconsistency: "eligibility_documents" is string[] instead of a JSON Object.`);
    }
  } else {
    console.log('  (Collection is empty)');
  }
  console.log();

  // 2. Teams
  console.log('--- Collection: Teams ---');
  const teamsSnap = await db.collection('Teams').limit(1).get();
  if (!teamsSnap.empty) {
    const doc = teamsSnap.docs[0];
    const data = doc.data();
    console.log(`Document ID: "${doc.id}"`);
    console.log(`Sample Fields:`, data);
    
    if (data.coach_id !== undefined && data.managed_by_coach_id === undefined) {
      console.log(`  ❌ Naming Inconsistency: Using "coach_id" instead of "managed_by_coach_id".`);
    }
    if (data.roster_list !== undefined && data.roster_athletes === undefined) {
      console.log(`  ❌ Naming Inconsistency: Using "roster_list" instead of "roster_athletes".`);
    }
  } else {
    console.log('  (Collection is empty)');
  }
  console.log();

  // 3. Match Logs
  console.log('--- Collection: Match_Logs ---');
  const matchesSnap = await db.collection('Match_Logs').limit(1).get();
  if (!matchesSnap.empty) {
    const doc = matchesSnap.docs[0];
    const data = doc.data();
    console.log(`Document ID: "${doc.id}"`);
    console.log(`Sample Fields:`, data);
    
    if (data.logged_by_coach_id === undefined) {
      console.log(`  ❌ Missing Field Inconsistency: "logged_by_coach_id" is missing.`);
    }
    if (data.sport_type !== undefined && data.sport_category === undefined) {
      console.log(`  ⚠️  Naming Inconsistency: Using "sport_type" instead of "sport_category".`);
    }
    if (data.game_result === 'WIN' || data.game_result === 'LOSS') {
      console.log(`  ⚠️  Case Inconsistency: Stored result is "${data.game_result}" but manuscript expects "Win" or "Lose".`);
    }
    if (data.roster_athletes === undefined) {
      console.log(`  ❌ Missing Field Inconsistency: "roster_athletes" array is missing in Match_Logs.`);
    }
  } else {
    console.log('  (Collection is empty)');
  }
  console.log();

  // 4. Official Audits (Validations)
  console.log('--- Collection: Official_Audits ---');
  const auditsSnap = await db.collection('Official_Audits').limit(1).get();
  if (!auditsSnap.empty) {
    const doc = auditsSnap.docs[0];
    const data = doc.data();
    console.log(`Document ID: "${doc.id}"`);
    console.log(`Sample Fields:`, data);
    
    console.log(`  ❌ Collection Name Inconsistency: Stored in "Official_Audits" collection (should be "Official_Validations").`);
    if (data.audit_id !== undefined) {
      console.log(`  ❌ Naming Inconsistency: Using "audit_id" instead of "validation_id".`);
    }
    if (data.requested_by !== undefined) {
      console.log(`  ❌ Naming Inconsistency: Using "requested_by" instead of "requested_by_coach_id".`);
    }
    if (data.official_id !== undefined) {
      console.log(`  ❌ Naming Inconsistency: Using "official_id" instead of "audited_by_official_id".`);
    }
    if (data.status !== undefined) {
      console.log(`  ❌ Enum Inconsistency: Using status "${data.status}" instead of "verification_status" (values: "Pending", "Reject", "Certify").`);
    }
  } else {
    console.log('  (Collection is empty)');
  }
  console.log();

  // 5. Scouting Registry
  console.log('--- Collection: Scouting_Registry ---');
  const scoutsSnap = await db.collection('Scouting_Registry').limit(1).get();
  if (!scoutsSnap.empty) {
    const doc = scoutsSnap.docs[0];
    const data = doc.data();
    console.log(`Document ID: "${doc.id}"`);
    console.log(`Sample Fields:`, data);
    
    if (data.inquiry_id !== undefined) {
      console.log(`  ❌ Naming Inconsistency: Using "inquiry_id" instead of "scout_id".`);
    }
    if (data.coach_id !== undefined) {
      console.log(`  ❌ Naming Inconsistency: Using "coach_id" instead of "coach_scout_id".`);
    }
    if (data.initiated_by === undefined) {
      console.log(`  ❌ Missing Field Inconsistency: "initiated_by" (who sent it) is missing.`);
    }
    if (data.status !== undefined) {
      console.log(`  ❌ Naming Inconsistency: Using "status" instead of "offer_status".`);
    }
  } else {
    console.log('  (Collection is empty)');
  }
  console.log();

  // 6. Workload Analysis
  console.log('--- Collection: Workload_Analysis ---');
  const workloadSnap = await db.collection('Workload_Analysis').limit(1).get();
  if (!workloadSnap.empty) {
    const doc = workloadSnap.docs[0];
    const data = doc.data();
    console.log(`Document ID: "${doc.id}"`);
    console.log(`Sample Fields:`, data);
    
    if (data.workload_id !== undefined) {
      console.log(`  ⚠️  Naming Inconsistency: Using "workload_id" instead of "analysis_id".`);
    }
    if (data.short_term_load === undefined || data.long_term_load === undefined || data.injury_risk_index === undefined) {
      console.log(`  ❌ Missing Field Inconsistency: Manuscript requires computed values ("short_term_load", "long_term_load", "injury_risk_index", "monotony_score", "strain_score") to be saved directly in the document, but they are missing.`);
    }
  } else {
    console.log('  (Collection is empty)');
  }
  console.log();
}

checkInconsistencies();
