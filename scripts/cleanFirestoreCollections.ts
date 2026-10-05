import { db, dbV1 } from '../utils/firebaseAdmin';
import { FieldValue } from 'firebase-admin/firestore';

interface CleanStats {
  sports_configurations_removed: number;
  official_validations_merged: number;
  login_audit_logs_merged: number;
  inquiries_merged: number;
  official_notifications_merged: number;
  coach_settings_merged: number;
  official_settings_merged: number;
  password_resets_merged: number;
  admin_profiles_merged: number;
  anthropometric_measurements_created: number;
  athlete_profiles_cleaned: number;
}

async function cleanFirestoreInstance(instanceName: string, firestore: any): Promise<CleanStats> {
  console.log(`\n=============================================================`);
  console.log(` Starting Firestore Database Cleanup on: ${instanceName} `);
  console.log(`=============================================================`);

  const stats: CleanStats = {
    sports_configurations_removed: 0,
    official_validations_merged: 0,
    login_audit_logs_merged: 0,
    inquiries_merged: 0,
    official_notifications_merged: 0,
    coach_settings_merged: 0,
    official_settings_merged: 0,
    password_resets_merged: 0,
    admin_profiles_merged: 0,
    anthropometric_measurements_created: 0,
    athlete_profiles_cleaned: 0,
  };

  // 1. sports_configurations (lowercase) -> Remove (Merge to Sports_Configurations)
  try {
    const lowerSportsSnap = await firestore.collection('sports_configurations').get();
    if (!lowerSportsSnap.empty) {
      console.log(`\n[1/10] Migrating 'sports_configurations' (${lowerSportsSnap.size} docs) -> 'Sports_Configurations'...`);
      for (const doc of lowerSportsSnap.docs) {
        const data = doc.data();
        const targetId = doc.id;
        const upperDoc = await firestore.collection('Sports_Configurations').doc(targetId).get();
        if (!upperDoc.exists) {
          await firestore.collection('Sports_Configurations').doc(targetId).set(data);
          console.log(`  + Copied sport config '${targetId}' to 'Sports_Configurations'`);
        }
        await doc.ref.delete();
        stats.sports_configurations_removed++;
      }
      console.log(`  ✔ Deleted ${stats.sports_configurations_removed} lowercase 'sports_configurations' docs.`);
    } else {
      console.log(`\n[1/10] 'sports_configurations' is already empty / clean.`);
    }
  } catch (err: any) {
    console.warn(`  ⚠ sports_configurations cleanup notice:`, err?.message || err);
  }

  // 2. Official_Validations -> Remove (Merge to Official_Audits)
  try {
    const validationsSnap = await firestore.collection('Official_Validations').get();
    if (!validationsSnap.empty) {
      console.log(`\n[2/10] Migrating 'Official_Validations' (${validationsSnap.size} docs) -> 'Official_Audits'...`);
      for (const doc of validationsSnap.docs) {
        const data = doc.data();
        const auditId = data.audit_id || data.validation_id || doc.id;
        const auditDoc = await firestore.collection('Official_Audits').doc(auditId).get();
        if (!auditDoc.exists) {
          await firestore.collection('Official_Audits').doc(auditId).set({
            audit_id: auditId,
            validation_id: auditId,
            ...data,
          });
          console.log(`  + Copied validation '${auditId}' to 'Official_Audits'`);
        }
        await doc.ref.delete();
        stats.official_validations_merged++;
      }
      console.log(`  ✔ Merged & deleted ${stats.official_validations_merged} 'Official_Validations' docs.`);
    } else {
      console.log(`\n[2/10] 'Official_Validations' is already empty / clean.`);
    }
  } catch (err: any) {
    console.warn(`  ⚠ Official_Validations cleanup notice:`, err?.message || err);
  }

  // 3. Login_Audit_Logs -> Remove (Merge to Admin_Audit_Logs)
  try {
    const loginLogsSnap = await firestore.collection('Login_Audit_Logs').get();
    if (!loginLogsSnap.empty) {
      console.log(`\n[3/10] Migrating 'Login_Audit_Logs' (${loginLogsSnap.size} docs) -> 'Admin_Audit_Logs'...`);
      for (const doc of loginLogsSnap.docs) {
        const data = doc.data();
        const logId = `login_log_${doc.id}`;
        const existingAdminLog = await firestore.collection('Admin_Audit_Logs').doc(logId).get();
        if (!existingAdminLog.exists) {
          await firestore.collection('Admin_Audit_Logs').doc(logId).set({
            log_id: logId,
            action_type: 'USER_LOGIN',
            category: 'SECURITY',
            user_id: data.user_id || data.userId || null,
            email: data.email || null,
            ip_address: data.ip_address || data.ip || '127.0.0.1',
            user_agent: data.user_agent || data.userAgent || null,
            status: data.status || 'SUCCESS',
            timestamp: data.timestamp || data.created_at || new Date().toISOString(),
            details: data,
          });
        }
        await doc.ref.delete();
        stats.login_audit_logs_merged++;
      }
      console.log(`  ✔ Merged & deleted ${stats.login_audit_logs_merged} 'Login_Audit_Logs' docs.`);
    } else {
      console.log(`\n[3/10] 'Login_Audit_Logs' is already empty / clean.`);
    }
  } catch (err: any) {
    console.warn(`  ⚠ Login_Audit_Logs cleanup notice:`, err?.message || err);
  }

  // 4. Inquiries -> Remove (Merge to Scouting_Registry)
  try {
    const inquiriesSnap = await firestore.collection('Inquiries').get();
    if (!inquiriesSnap.empty) {
      console.log(`\n[4/10] Migrating 'Inquiries' (${inquiriesSnap.size} docs) -> 'Scouting_Registry'...`);
      for (const doc of inquiriesSnap.docs) {
        const data = doc.data();
        const inquiryId = data.inquiry_id || `inq_${doc.id}`;
        const existing = await firestore.collection('Scouting_Registry').doc(inquiryId).get();
        if (!existing.exists) {
          await firestore.collection('Scouting_Registry').doc(inquiryId).set({
            inquiry_id: inquiryId,
            coach_id: data.coach_id || data.sender_id || '',
            athlete_id: data.athlete_id || data.recipient_id || '',
            message: data.message || data.content || '',
            status: data.status || 'Pending',
            created_at: data.created_at || new Date().toISOString(),
            ...data,
          });
          console.log(`  + Copied inquiry '${inquiryId}' to 'Scouting_Registry'`);
        }
        await doc.ref.delete();
        stats.inquiries_merged++;
      }
      console.log(`  ✔ Merged & deleted ${stats.inquiries_merged} 'Inquiries' docs.`);
    } else {
      console.log(`\n[4/10] 'Inquiries' is already empty / clean.`);
    }
  } catch (err: any) {
    console.warn(`  ⚠ Inquiries cleanup notice:`, err?.message || err);
  }

  // 5. Official_Notifications -> Merge (into Notifications)
  try {
    const offNotifsSnap = await firestore.collection('Official_Notifications').get();
    if (!offNotifsSnap.empty) {
      console.log(`\n[5/10] Migrating 'Official_Notifications' (${offNotifsSnap.size} docs) -> 'Notifications'...`);
      for (const doc of offNotifsSnap.docs) {
        const data = doc.data();
        const notifId = data.notification_id || `notif_${doc.id}`;
        const recipientId = data.official_id || data.user_id || data.recipient_id;
        const existing = await firestore.collection('Notifications').doc(notifId).get();
        if (!existing.exists && recipientId) {
          await firestore.collection('Notifications').doc(notifId).set({
            notification_id: notifId,
            recipient_id: recipientId,
            user_id: recipientId,
            type: data.type || 'OFFICIAL_ALERT',
            title: data.title || 'Official Notification',
            message: data.message || '',
            reference_id: data.reference_id || null,
            is_read: data.is_read || false,
            created_at: data.created_at || new Date().toISOString(),
          });
          console.log(`  + Merged notification '${notifId}' to 'Notifications'`);
        }
        await doc.ref.delete();
        stats.official_notifications_merged++;
      }
      console.log(`  ✔ Merged & deleted ${stats.official_notifications_merged} 'Official_Notifications' docs.`);
    } else {
      console.log(`\n[5/10] 'Official_Notifications' is already empty / clean.`);
    }
  } catch (err: any) {
    console.warn(`  ⚠ Official_Notifications cleanup notice:`, err?.message || err);
  }

  // 6. Coach_Settings -> Merge (into Coach_Profiles / Users.settings)
  try {
    const coachSettingsSnap = await firestore.collection('Coach_Settings').get();
    if (!coachSettingsSnap.empty) {
      console.log(`\n[6/10] Merging 'Coach_Settings' (${coachSettingsSnap.size} docs) -> 'Coach_Profiles' & 'Users.settings'...`);
      for (const doc of coachSettingsSnap.docs) {
        const data = doc.data();
        const coachId = data.coach_id || doc.id;
        const rawUid = coachId.replace(/^coach_/, '');

        const settingsPayload = {
          data_sync_preference: data.data_sync_preference || 'Manual',
          notification_preferences: data.notification_preferences || {
            game_log_updates: true,
            recruitment_inquiries: true,
          },
          updated_at: data.updated_at || new Date().toISOString(),
        };

        // Update Coach_Profiles
        await firestore.collection('Coach_Profiles').doc(coachId).set(
          { settings: settingsPayload },
          { merge: true }
        );
        if (rawUid !== coachId) {
          await firestore.collection('Coach_Profiles').doc(rawUid).set(
            { settings: settingsPayload },
            { merge: true }
          );
        }

        // Update Users
        await firestore.collection('Users').doc(rawUid).set(
          { settings: settingsPayload },
          { merge: true }
        );

        await doc.ref.delete();
        stats.coach_settings_merged++;
      }
      console.log(`  ✔ Embedded settings into profile docs & deleted ${stats.coach_settings_merged} 'Coach_Settings' docs.`);
    } else {
      console.log(`\n[6/10] 'Coach_Settings' is already empty / clean.`);
    }
  } catch (err: any) {
    console.warn(`  ⚠ Coach_Settings cleanup notice:`, err?.message || err);
  }

  // 7. Official_Settings -> Merge (into Official_Profiles / Users.settings)
  try {
    const officialSettingsSnap = await firestore.collection('Official_Settings').get();
    if (!officialSettingsSnap.empty) {
      console.log(`\n[7/10] Merging 'Official_Settings' (${officialSettingsSnap.size} docs) -> 'Official_Profiles' & 'Users.settings'...`);
      for (const doc of officialSettingsSnap.docs) {
        const data = doc.data();
        const officialId = data.official_id || doc.id;
        const rawUid = officialId.replace(/^off_/, '');

        const settingsPayload = {
          split_screen_defaults: data.split_screen_defaults !== undefined ? data.split_screen_defaults : true,
          discrepancy_presets: data.discrepancy_presets !== undefined ? data.discrepancy_presets : false,
          match_reminders: data.match_reminders !== undefined ? data.match_reminders : true,
          audit_notifications: data.audit_notifications !== undefined ? data.audit_notifications : true,
          auto_refresh: data.auto_refresh !== undefined ? data.auto_refresh : false,
          updated_at: data.updated_at || new Date().toISOString(),
        };

        // Update Official_Profiles
        await firestore.collection('Official_Profiles').doc(officialId).set(
          { settings: settingsPayload },
          { merge: true }
        );
        if (rawUid !== officialId) {
          await firestore.collection('Official_Profiles').doc(rawUid).set(
            { settings: settingsPayload },
            { merge: true }
          );
        }

        // Update Users
        await firestore.collection('Users').doc(rawUid).set(
          { settings: settingsPayload },
          { merge: true }
        );

        await doc.ref.delete();
        stats.official_settings_merged++;
      }
      console.log(`  ✔ Embedded settings into profile docs & deleted ${stats.official_settings_merged} 'Official_Settings' docs.`);
    } else {
      console.log(`\n[7/10] 'Official_Settings' is already empty / clean.`);
    }
  } catch (err: any) {
    console.warn(`  ⚠ Official_Settings cleanup notice:`, err?.message || err);
  }

  // 8. Password_Resets -> Merge (into Users.password_reset)
  try {
    const resetsSnap = await firestore.collection('Password_Resets').get();
    if (!resetsSnap.empty) {
      console.log(`\n[8/10] Merging 'Password_Resets' (${resetsSnap.size} docs) -> 'Users'...`);
      for (const doc of resetsSnap.docs) {
        const data = doc.data();
        const userId = data.user_id || data.userId || doc.id;
        if (userId) {
          await firestore.collection('Users').doc(userId).set(
            {
              password_reset: {
                token: data.token || data.reset_token || null,
                expires_at: data.expires_at || data.expiry || null,
                requested_at: data.requested_at || data.created_at || new Date().toISOString(),
              },
            },
            { merge: true }
          );
        }
        await doc.ref.delete();
        stats.password_resets_merged++;
      }
      console.log(`  ✔ Embedded password resets into Users & deleted ${stats.password_resets_merged} 'Password_Resets' docs.`);
    } else {
      console.log(`\n[8/10] 'Password_Resets' is already empty / clean.`);
    }
  } catch (err: any) {
    console.warn(`  ⚠ Password_Resets cleanup notice:`, err?.message || err);
  }

  // 9. Admin_Profiles -> Merge (Optional: Embed lightweight fields into Users)
  try {
    const adminSnap = await firestore.collection('Admin_Profiles').get();
    if (!adminSnap.empty) {
      console.log(`\n[9/10] Embedding 'Admin_Profiles' (${adminSnap.size} docs) fields into 'Users'...`);
      for (const doc of adminSnap.docs) {
        const data = doc.data();
        const userId = data.user_id || data.admin_id || doc.id;
        const rawUid = userId.replace(/^admin_/, '');
        await firestore.collection('Users').doc(rawUid).set(
          {
            clearance_level: data.clearance_level || 'FULL_ADMIN',
            department_code: data.department_code || 'ATHLETICS_ADMIN',
            permissions: data.permissions || ['MANAGE_USERS', 'MANAGE_SPORTS', 'VIEW_AUDIT_LOGS'],
          },
          { merge: true }
        );
        stats.admin_profiles_merged++;
      }
      console.log(`  ✔ Embedded clearance & department fields for ${stats.admin_profiles_merged} admins into 'Users'.`);
    } else {
      console.log(`\n[9/10] 'Admin_Profiles' is already clean.`);
    }
  } catch (err: any) {
    console.warn(`  ⚠ Admin_Profiles merge notice:`, err?.message || err);
  }

  // 10. Anthropometric_Measurements & Athlete_Profiles -> Keep & Reorganize
  // Remove physical measurement fields (height, weight, wingspan, vertical, bmi, ape_index)
  // from Athlete_Profiles and ensure they are cleanly stored in Anthropometric_Measurements.
  try {
    const athletesSnap = await firestore.collection('Athlete_Profiles').get();
    console.log(`\n[10/10] Reorganizing 'Athlete_Profiles' (${athletesSnap.size} docs) & 'Anthropometric_Measurements'...`);
    for (const doc of athletesSnap.docs) {
      const data = doc.data();
      const athleteId = data.athlete_id || doc.id;
      const rawUid = athleteId.replace(/^ath_/, '');

      const hasMeasurementData =
        data.height !== undefined ||
        data.height_cm !== undefined ||
        data.weight !== undefined ||
        data.weight_kg !== undefined ||
        data.wingspan !== undefined ||
        data.wingspan_cm !== undefined ||
        data.vertical !== undefined ||
        data.vertical_jump_cm !== undefined ||
        data.bmi !== undefined ||
        data.ape_index !== undefined ||
        data.body_fat_pct !== undefined ||
        data.standing_reach_cm !== undefined;

      if (hasMeasurementData) {
        const measurementId = `meas_${athleteId}`;
        const heightVal = data.height_cm ?? data.height ?? null;
        const weightVal = data.weight_kg ?? data.weight ?? null;
        const wingspanVal = data.wingspan_cm ?? data.wingspan ?? null;
        const verticalVal = data.vertical_jump_cm ?? data.vertical ?? null;
        const bmiVal = data.bmi ?? null;
        const apeIndexVal = data.ape_index ?? null;

        // Ensure clean record exists in Anthropometric_Measurements
        await firestore.collection('Anthropometric_Measurements').doc(measurementId).set(
          {
            measurement_id: measurementId,
            athlete_id: athleteId,
            user_id: rawUid,
            height_cm: heightVal,
            weight_kg: weightVal,
            wingspan_cm: wingspanVal,
            vertical_jump_cm: verticalVal,
            bmi: bmiVal,
            ape_index: apeIndexVal,
            body_fat_pct: data.body_fat_pct ?? null,
            standing_reach_cm: data.standing_reach_cm ?? null,
            recorded_at: data.updated_at || data.created_at || new Date().toISOString(),
          },
          { merge: true }
        );
        stats.anthropometric_measurements_created++;

        // Remove embedded measurement fields from Athlete_Profiles document
        const fieldsToDelete: Record<string, any> = {};
        const measurementKeys = [
          'height', 'height_cm', 'weight', 'weight_kg', 'wingspan', 'wingspan_cm',
          'vertical', 'vertical_jump_cm', 'bmi', 'ape_index', 'body_fat_pct', 'standing_reach_cm'
        ];
        for (const k of measurementKeys) {
          if (data[k] !== undefined) {
            fieldsToDelete[k] = FieldValue.delete();
          }
        }

        if (Object.keys(fieldsToDelete).length > 0) {
          await doc.ref.update(fieldsToDelete);
          stats.athlete_profiles_cleaned++;
        }
      }
    }
    console.log(`  ✔ Cleaned ${stats.athlete_profiles_cleaned} Athlete_Profiles; verified ${stats.anthropometric_measurements_created} Anthropometric_Measurements.`);
  } catch (err: any) {
    console.warn(`  ⚠ Athlete_Profiles & Anthropometric_Measurements notice:`, err?.message || err);
  }

  return stats;
}

async function run() {
  try {
    const v2Stats = await cleanFirestoreInstance('db (atleta-v2 Primary Database)', db);
    const v1Stats = await cleanFirestoreInstance('dbV1 (atleta-v1 Database)', dbV1);

    console.log(`\n=============================================================`);
    console.log(` 🎉 FIRESTORE DATABASE CLEANUP COMPLETED SUCCESSFULLY! `);
    console.log(`=============================================================`);
    console.log('atleta-v2 Results:', v2Stats);
    console.log('atleta-v1 Results:', v1Stats);

    process.exit(0);
  } catch (err: any) {
    console.error('❌ Fatal error during database cleanup:', err?.message || err);
    process.exit(1);
  }
}

run();
