import { db, dbV1 } from '../utils/firebaseAdmin';
import { FieldValue } from 'firebase-admin/firestore';
import { hashPassword, isBcryptHash } from '../utils/passwordUtils';

interface EncryptionStats {
  users_checked: number;
  users_encrypted: number;
  users_already_hashed: number;
  profile_passwords_removed: number;
  audit_previews_removed: number;
}

async function encryptAndSanitizeInstance(instanceName: string, firestore: any): Promise<EncryptionStats> {
  console.log(`\n=============================================================`);
  console.log(` Encrypting Passwords & Sanitizing Firestore: ${instanceName} `);
  console.log(`=============================================================`);

  const stats: EncryptionStats = {
    users_checked: 0,
    users_encrypted: 0,
    users_already_hashed: 0,
    profile_passwords_removed: 0,
    audit_previews_removed: 0,
  };

  // 1. Encrypt plaintext passwords in Users collection
  try {
    const usersSnap = await firestore.collection('Users').get();
    stats.users_checked = usersSnap.size;
    console.log(`\n[1/4] Checking 'Users' collection (${usersSnap.size} docs)...`);

    for (const doc of usersSnap.docs) {
      const data = doc.data();
      const currentPass = data.password;
      const currentHash = data.password_hash;

      let needsUpdate = false;
      const updates: Record<string, any> = {};

      if (currentPass && typeof currentPass === 'string') {
        if (!isBcryptHash(currentPass)) {
          const newHash = hashPassword(currentPass);
          updates.password = newHash;
          updates.password_hash = newHash;
          needsUpdate = true;
        } else {
          stats.users_already_hashed++;
          if (!currentHash) {
            updates.password_hash = currentPass;
            needsUpdate = true;
          }
        }
      } else if (currentHash && typeof currentHash === 'string') {
        if (!currentPass) {
          updates.password = currentHash;
          needsUpdate = true;
        }
      }

      if (needsUpdate) {
        updates.updated_at = new Date();
        await doc.ref.set(updates, { merge: true });
        stats.users_encrypted++;
      }
    }
    console.log(`  ✔ Users: ${stats.users_encrypted} passwords hashed with bcrypt, ${stats.users_already_hashed} already hashed.`);
  } catch (err: any) {
    console.error(`  ❌ Error processing Users collection:`, err?.message || err);
  }

  // 2. Remove any password / password_hash leaks from Profile collections
  const profileCollections = ['Athlete_Profiles', 'Coach_Profiles', 'Official_Profiles', 'Admin_Profiles', 'Official_Settings', 'Password_Resets'];
  console.log(`\n[2/4] Verifying profile collections for exposed credentials...`);

  for (const colName of profileCollections) {
    try {
      const snap = await firestore.collection(colName).get();
      let leaksInCol = 0;
      for (const doc of snap.docs) {
        const data = doc.data();
        const deletes: Record<string, any> = {};
        if (data.password !== undefined) deletes.password = FieldValue.delete();
        if (data.password_hash !== undefined) deletes.password_hash = FieldValue.delete();

        if (Object.keys(deletes).length > 0) {
          await doc.ref.update(deletes);
          leaksInCol++;
          stats.profile_passwords_removed++;
        }
      }
      console.log(`  ✔ '${colName}' (${snap.size} docs): ${leaksInCol} credential leaks purged.`);
    } catch (err: any) {
      console.warn(`  ⚠ Warning checking '${colName}':`, err?.message || err);
    }
  }

  // 3. Purge password_preview and password_len from Login_Audit_Logs
  console.log(`\n[3/4] Purging password previews from 'Login_Audit_Logs'...`);
  try {
    const logsSnap = await firestore.collection('Login_Audit_Logs').get();
    for (const doc of logsSnap.docs) {
      const data = doc.data();
      const deletes: Record<string, any> = {};
      if (data.password_preview !== undefined) deletes.password_preview = FieldValue.delete();
      if (data.password_len !== undefined) deletes.password_len = FieldValue.delete();
      if (data.password !== undefined) deletes.password = FieldValue.delete();

      if (Object.keys(deletes).length > 0) {
        await doc.ref.update(deletes);
        stats.audit_previews_removed++;
      }
    }
    console.log(`  ✔ 'Login_Audit_Logs' (${logsSnap.size} docs): purged ${stats.audit_previews_removed} exposed log fields.`);
  } catch (err: any) {
    console.warn(`  ⚠ Warning checking 'Login_Audit_Logs':`, err?.message || err);
  }

  // 4. Verification Check across all collections
  console.log(`\n[4/4] Final Verification of all collections in ${instanceName}...`);
  const collections = await firestore.listCollections();
  let anyExposed = false;

  for (const col of collections) {
    const snap = await col.get();
    let plainCount = 0;
    let previewCount = 0;

    snap.docs.forEach((d: any) => {
      const data = d.data();
      if (data.password && typeof data.password === 'string' && !isBcryptHash(data.password)) {
        plainCount++;
      }
      if (data.password_preview) {
        previewCount++;
      }
      // Profiles should have no password at all
      if (col.id !== 'Users' && (data.password || data.password_hash)) {
        plainCount++;
      }
    });

    if (plainCount > 0 || previewCount > 0) {
      anyExposed = true;
      console.error(`  ❌ Collection '${col.id}' still has ${plainCount} plain passwords / ${previewCount} previews!`);
    }
  }

  if (!anyExposed) {
    console.log(`  ✔ ALL collections verified secure! 0 plain-text passwords or previews exist.`);
  }

  return stats;
}

async function run() {
  try {
    const mainStats = await encryptAndSanitizeInstance('Firestore Main (atleta-v1)', db);
    console.log(`\n=============================================================`);
    console.log(` 🎉 ENCRYPTION & SANITIZATION SUMMARY `);
    console.log(`=============================================================`);
    console.table(mainStats);
    process.exit(0);
  } catch (err: any) {
    console.error('Fatal execution error:', err);
    process.exit(1);
  }
}

run();
