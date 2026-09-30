import crypto from 'crypto';
import { db, dbV1, dbV2 } from '../utils/firebaseAdmin';
import {
  SportsConfiguration,
  CreateSportDTO,
  UpdateSportDTO,
} from '../models/sportModel';
import { ServiceError } from '../validators/matchValidator';
import { logAdminAudit } from './adminService';
import { generateStandardId } from '../utils/idGenerator';
import { serverCache } from '../utils/cache';

const firestoreDb = dbV1 || db;

export const DEFAULT_SPORTS_CONFIGURATIONS: SportsConfiguration[] = [
  {
    sport_id: 'sport_basketball_default',
    sport_name: 'Basketball',
    short_identifier: 'BBALL',
    configurable_stats: [
      { stat_name_key: 'points', measurement_category: 'Cumulative Total' },
      { stat_name_key: 'assists', measurement_category: 'Cumulative Total' },
      { stat_name_key: 'offensive_rebounds', measurement_category: 'Cumulative Total' },
      { stat_name_key: 'defensive_rebounds', measurement_category: 'Cumulative Total' },
      { stat_name_key: 'fouls', measurement_category: 'Count' },
      { stat_name_key: 'turnovers', measurement_category: 'Count' },
      { stat_name_key: 'steals', measurement_category: 'Count' },
      { stat_name_key: 'blocks', measurement_category: 'Count' },
      { stat_name_key: 'fg_made', measurement_category: 'Count' },
      { stat_name_key: 'fg_attempted', measurement_category: 'Count' },
      { stat_name_key: 'ft_made', measurement_category: 'Count' },
      { stat_name_key: 'ft_attempted', measurement_category: 'Count' },
    ],
    is_active: true,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
  },
  {
    sport_id: 'sport_swimming_default',
    sport_name: 'Swimming',
    short_identifier: 'SWIM',
    configurable_stats: [
      { stat_name_key: 'finish_time_ms', measurement_category: 'Time (ms)' },
      { stat_name_key: 'distance_meters', measurement_category: 'Distance (m)' },
      { stat_name_key: 'split_times_ms', measurement_category: 'Time (ms)' },
      { stat_name_key: 'lap_count', measurement_category: 'Count' },
    ],
    is_active: true,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
  },
  {
    sport_id: 'sport_track_field_default',
    sport_name: 'Track & Field',
    short_identifier: 'TF',
    configurable_stats: [
      { stat_name_key: 'finish_time_ms', measurement_category: 'Time (ms)' },
      { stat_name_key: 'distance_meters', measurement_category: 'Distance (m)' },
      { stat_name_key: 'split_times_ms', measurement_category: 'Time (ms)' },
      { stat_name_key: 'attempt_number', measurement_category: 'Count' },
    ],
    is_active: true,
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
  },
];

/**
 * Ensures default sports exist in Firestore Sports_Configurations collection.
 */
export async function seedDefaultSportsIfEmpty(): Promise<void> {
  const snapshot = await firestoreDb.collection('Sports_Configurations').limit(1).get();
  if (snapshot.empty) {
    const batch = firestoreDb.batch();
    for (const sport of DEFAULT_SPORTS_CONFIGURATIONS) {
      batch.set(firestoreDb.collection('Sports_Configurations').doc(sport.sport_id), sport, { merge: true });
      batch.set(firestoreDb.collection('sports_configurations').doc(sport.sport_id), sport, { merge: true });
    }
    await batch.commit();
  }
}

/**
 * Retrieve all registered sports, metric keys, and measurement categories.
 * GET /api/v1/sports
 * Accessible by any authenticated user.
 */
export async function getAllSportsService(onlyActive: boolean = false): Promise<SportsConfiguration[]> {
  const allSports = await serverCache.getOrSet(
    'sports_configurations_catalog_all',
    async () => {
      await seedDefaultSportsIfEmpty();

      const snapshot = await firestoreDb.collection('Sports_Configurations').get();
      let rawSports: any[] = snapshot.docs.map((doc) => ({
        sport_id: doc.id,
        ...(doc.data() as object),
      }));

      try {
        const lowerSnap = await firestoreDb.collection('sports_configurations').get();
        if (!lowerSnap.empty) {
          const lowerList = lowerSnap.docs.map((doc) => ({
            sport_id: doc.id,
            ...(doc.data() as object),
          }));
          rawSports = [...rawSports, ...lowerList];
        }
      } catch {}

      try {
        const singularSnap = await firestoreDb.collection('sports_configuration').get();
        if (!singularSnap.empty) {
          const singularList = singularSnap.docs.map((doc) => ({
            sport_id: doc.id,
            ...(doc.data() as object),
          }));
          rawSports = [...rawSports, ...singularList];
        }
      } catch {}

      if (rawSports.length === 0 && dbV2) {
        try {
          const v2Snap = await dbV2.collection('Sports_Configurations').get();
          if (!v2Snap.empty) {
            rawSports = v2Snap.docs.map((doc) => ({
              sport_id: doc.id,
              ...(doc.data() as object),
            }));
          }
        } catch {}
      }

      const seenNames = new Set<string>();
      const normalizedSports: SportsConfiguration[] = [];

      for (const item of rawSports) {
        const rawName = String(item.sport_name || item.name || '').trim();
        if (!rawName) continue;
        const normKey = rawName.toLowerCase();
        if (seenNames.has(normKey)) continue;
        seenNames.add(normKey);

        const sportObj: SportsConfiguration = {
          sport_id: item.sport_id || item.id || `sport_${normKey.replace(/[^a-z0-9]/g, '_')}`,
          sport_name: rawName,
          short_identifier: item.short_identifier || rawName.slice(0, 5).toUpperCase(),
          category: item.category || 'Team',
          is_active: item.is_active !== false,
          configurable_stats: item.configurable_stats || item.metric_keys || [],
          created_at: item.created_at || new Date().toISOString(),
          updated_at: item.updated_at || new Date().toISOString(),
          ...(item.is_timed_sport !== undefined ? { is_timed_sport: item.is_timed_sport } : {}),
          ...(item.measurement_type ? { measurement_type: item.measurement_type } : {}),
          ...(item.positions ? { positions: item.positions } : {}),
          ...(item.stat_schema ? { stat_schema: item.stat_schema } : {}),
        };

        normalizedSports.push(sportObj);
      }

      return normalizedSports;
    },
    600, // 10 minutes cache TTL
    ['sports', 'catalog']
  );

  if (onlyActive) {
    return allSports.filter((s) => s.is_active !== false);
  }

  return allSports;
}

/**
 * Retrieve single sport configuration by sport_id.
 */
export async function getSportByIdService(sportId: string): Promise<SportsConfiguration> {
  let doc = await firestoreDb.collection('Sports_Configurations').doc(sportId).get();
  if (!doc.exists) {
    doc = await firestoreDb.collection('sports_configurations').doc(sportId).get();
  }
  if (!doc.exists && dbV2) {
    doc = await dbV2.collection('Sports_Configurations').doc(sportId).get();
  }
  if (!doc.exists) {
    throw new ServiceError(`Sport configuration with ID '${sportId}' was not found.`, 404);
  }
  return doc.data() as SportsConfiguration;
}

/**
 * Find sport configuration by sport_name or short_identifier (case-insensitive).
 */
export async function findSportByNameOrId(identifier: string): Promise<SportsConfiguration | null> {
  const normalized = identifier.trim().toLowerCase();
  const allSports = await getAllSportsService();
  const found = allSports.find(
    (s) =>
      s.sport_id.toLowerCase() === normalized ||
      s.sport_name.toLowerCase() === normalized ||
      s.short_identifier.toLowerCase() === normalized
  );
  return found || null;
}

/**
 * Register a new sport configuration with dynamic metric keys.
 * POST /api/v1/sports
 *
 * ACCEPTANCE CRITERIA:
 * 1. Require valid Bearer token with System Admin role.
 * 2. Require Idempotency-Key header on POST /api/v1/sports.
 * 3. Duplicate metric keys within the same sport payload return HTTP 400 Bad Request.
 * 4. Newly registered sports instantly populate across coach sideline logging choices.
 */
export async function createSportService(
  payload: CreateSportDTO,
  idempotencyKey: string,
  adminUserId: string = 'SYS_ADMIN',
  clientIp: string = '127.0.0.1'
): Promise<{ message: string; sport: SportsConfiguration }> {
  const key = idempotencyKey.trim();

  // 1. Check idempotency cache in Firestore (atleta-v1)
  const idempotencyDoc = await firestoreDb.collection('Idempotency_Keys').doc(key).get();
  if (idempotencyDoc.exists) {
    console.log(`ℹ️ [IDEMPOTENCY REPLAY] Returning cached result for key '${key}'`);
    return idempotencyDoc.data()!.response;
  }

  // 2. Fetch existing sports to check uniqueness
  const existingSports = await getAllSportsService();
  const trimmedName = payload.sport_name.trim();
  const trimmedShortId = payload.short_identifier.trim().toUpperCase();

  const nameConflict = existingSports.find(
    (s) => s?.sport_name && s.sport_name.toLowerCase() === trimmedName.toLowerCase()
  );
  if (nameConflict) {
    throw new ServiceError(`Sport with name '${trimmedName}' already exists.`, 400);
  }

  const shortIdConflict = existingSports.find(
    (s) => s?.short_identifier && s.short_identifier.toUpperCase() === trimmedShortId
  );
  if (shortIdConflict) {
    throw new ServiceError(`Sport with short identifier '${trimmedShortId}' already exists.`, 400);
  }

  // 3. Create Sports_Configuration document
  const sportId = await generateStandardId('SPORT');
  const now = new Date().toISOString();

  const newSport: SportsConfiguration = {
    sport_id: sportId,
    sport_name: trimmedName,
    short_identifier: trimmedShortId,
    configurable_stats: payload.configurable_stats,
    is_active: payload.is_active !== undefined ? Boolean(payload.is_active) : true,
    ...(payload.positions && { positions: payload.positions }),
    ...(payload.scoring_rules && { scoring_rules: payload.scoring_rules }),
    ...(payload.stat_schema && { stat_schema: payload.stat_schema }),
    ...(payload.category && { category: payload.category }),
    ...(payload.is_timed_sport !== undefined && { is_timed_sport: Boolean(payload.is_timed_sport) }),
    created_at: now,
    updated_at: now,
  };

  // Atomic batch write to atleta-v1 (writes to both Sports_Configurations and sports_configurations)
  const batch = firestoreDb.batch();
  batch.set(firestoreDb.collection('Sports_Configurations').doc(sportId), newSport);
  batch.set(firestoreDb.collection('sports_configurations').doc(sportId), newSport);

  const responsePayload = {
    message: 'Sport configuration registered successfully.',
    sport: newSport,
  };

  const idempotencyRef = firestoreDb.collection('Idempotency_Keys').doc(key);
  batch.set(idempotencyRef, {
    key,
    response: responsePayload,
    created_at: now,
  });

  await batch.commit();

  // Dual-write to dbV2 if distinct for disaster recovery / backup sync
  try {
    if (dbV2 && dbV2 !== firestoreDb) {
      const v2Batch = dbV2.batch();
      v2Batch.set(dbV2.collection('Sports_Configurations').doc(sportId), newSport);
      v2Batch.set(dbV2.collection('sports_configurations').doc(sportId), newSport);
      await v2Batch.commit().catch(() => {});
    }
  } catch {}

  // Invalidate in-memory sports catalog cache
  try {
    serverCache.invalidateTags(['sports', 'catalog']);
  } catch {}

  // Log administrative audit entry
  logAdminAudit({
    user_id: adminUserId,
    email: 'admin@atleta.edu',
    action: 'POST /api/v1/sports',
    status: 'SUCCESS',
    endpoint: '/api/v1/sports',
    ip_address: clientIp,
    details: {
      sport_id: sportId,
      sport_name: newSport.sport_name,
      short_identifier: newSport.short_identifier,
      total_stats_configured: newSport.configurable_stats.length,
    },
  }).catch((err) => console.error('Admin audit error on createSport:', err));

  return responsePayload;
}

/**
 * Update dynamic stat schemas or measurement parameters.
 * PATCH /api/v1/sports/:sportId
 *
 * ACCEPTANCE CRITERIA:
 * 1. Require valid Bearer token with System Admin role.
 * 2. Duplicate metric keys within the same sport payload return HTTP 400 Bad Request.
 */
export async function updateSportService(
  sportId: string,
  payload: UpdateSportDTO,
  adminUserId: string = 'SYS_ADMIN',
  clientIp: string = '127.0.0.1'
): Promise<{ message: string; sport: SportsConfiguration }> {
  let sportDoc = await firestoreDb.collection('Sports_Configurations').doc(sportId).get();
  if (!sportDoc.exists) {
    sportDoc = await firestoreDb.collection('sports_configurations').doc(sportId).get();
  }
  if (!sportDoc.exists && dbV2) {
    sportDoc = await dbV2.collection('Sports_Configurations').doc(sportId).get();
  }
  if (!sportDoc.exists) {
    throw new ServiceError(`Sport configuration with ID '${sportId}' was not found.`, 404);
  }

  const existingSport = sportDoc.data() as SportsConfiguration;
  const existingSports = await getAllSportsService();

  // Check unique constraints if name or short identifier is modified
  if (payload.sport_name) {
    const trimmedName = payload.sport_name.trim();
    const nameConflict = existingSports.find(
      (s) => s.sport_id !== sportId && s?.sport_name && s.sport_name.toLowerCase() === trimmedName.toLowerCase()
    );
    if (nameConflict) {
      throw new ServiceError(`Sport with name '${trimmedName}' already exists.`, 400);
    }
  }

  if (payload.short_identifier) {
    const trimmedShortId = payload.short_identifier.trim().toUpperCase();
    const shortIdConflict = existingSports.find(
      (s) => s.sport_id !== sportId && s?.short_identifier && s.short_identifier.toUpperCase() === trimmedShortId
    );
    if (shortIdConflict) {
      throw new ServiceError(`Sport with short identifier '${trimmedShortId}' already exists.`, 400);
    }
  }

  const now = new Date().toISOString();
  const updatedSport: SportsConfiguration = {
    ...existingSport,
    ...(payload.sport_name && { sport_name: payload.sport_name.trim() }),
    ...(payload.short_identifier && { short_identifier: payload.short_identifier.trim().toUpperCase() }),
    ...(payload.configurable_stats && { configurable_stats: payload.configurable_stats }),
    ...(payload.is_active !== undefined && { is_active: Boolean(payload.is_active) }),
    ...(payload.positions && { positions: payload.positions }),
    ...(payload.scoring_rules && { scoring_rules: payload.scoring_rules }),
    ...(payload.stat_schema && { stat_schema: payload.stat_schema }),
    ...(payload.category && { category: payload.category }),
    ...(payload.is_timed_sport !== undefined && { is_timed_sport: Boolean(payload.is_timed_sport) }),
    updated_at: now,
  };

  const updateBatch = firestoreDb.batch();
  updateBatch.set(firestoreDb.collection('Sports_Configurations').doc(sportId), updatedSport, { merge: true });
  updateBatch.set(firestoreDb.collection('sports_configurations').doc(sportId), updatedSport, { merge: true });
  await updateBatch.commit();

  if (dbV2 && dbV2 !== firestoreDb) {
    try {
      const v2Batch = dbV2.batch();
      v2Batch.set(dbV2.collection('Sports_Configurations').doc(sportId), updatedSport, { merge: true });
      v2Batch.set(dbV2.collection('sports_configurations').doc(sportId), updatedSport, { merge: true });
      await v2Batch.commit().catch(() => {});
    } catch {}
  }

  // Invalidate in-memory sports catalog cache
  try {
    serverCache.invalidateTags(['sports', 'catalog']);
  } catch {}

  // Log administrative audit entry
  logAdminAudit({
    user_id: adminUserId,
    email: 'admin@atleta.edu',
    action: `PATCH /api/v1/sports/${sportId}`,
    status: 'SUCCESS',
    endpoint: `/api/v1/sports/${sportId}`,
    ip_address: clientIp,
    details: {
      sport_id: sportId,
      sport_name: updatedSport.sport_name,
      updated_fields: Object.keys(payload),
    },
  }).catch((err) => console.error('Admin audit error on updateSport:', err));

  return {
    message: 'Sport configuration updated successfully.',
    sport: updatedSport,
  };
}

/**
 * Permanently delete a custom sport configuration.
 * DELETE /api/v1/sports/:sportId
 *
 * ACCEPTANCE CRITERIA:
 * 1. Require valid Bearer token with System Admin role.
 * 2. Prevent deletion of core default sports (Basketball, Swimming, Track & Field).
 * 3. Invalidate server-side cache and log administrative audit trail.
 */
export async function deleteSportService(
  sportId: string,
  adminUserId: string = 'SYS_ADMIN',
  clientIp: string = '127.0.0.1'
): Promise<{ message: string; sport_id: string }> {
  let sportDoc = await firestoreDb.collection('Sports_Configurations').doc(sportId).get();
  if (!sportDoc.exists) {
    sportDoc = await firestoreDb.collection('sports_configurations').doc(sportId).get();
  }
  if (!sportDoc.exists && dbV2) {
    sportDoc = await dbV2.collection('Sports_Configurations').doc(sportId).get();
  }
  if (!sportDoc.exists) {
    throw new ServiceError(`Sport configuration with ID '${sportId}' was not found.`, 404);
  }

  const existingSport = sportDoc.data() as SportsConfiguration;

  // Prevent deletion of core system sports
  const isDefaultSport = DEFAULT_SPORTS_CONFIGURATIONS.some(
    (d) =>
      d.sport_id.toLowerCase() === sportId.toLowerCase() ||
      d.sport_name.toLowerCase() === (existingSport.sport_name || '').toLowerCase()
  );
  if (isDefaultSport) {
    throw new ServiceError(
      `Core system sport '${existingSport.sport_name}' cannot be deleted. You can deactivate it instead.`,
      400
    );
  }

  // Delete from atleta-v1 Firestore (both canonical and lowercase collections)
  const delBatch = firestoreDb.batch();
  delBatch.delete(firestoreDb.collection('Sports_Configurations').doc(sportId));
  delBatch.delete(firestoreDb.collection('sports_configurations').doc(sportId));
  await delBatch.commit().catch(async () => {
    await firestoreDb.collection('Sports_Configurations').doc(sportId).delete().catch(() => {});
    await firestoreDb.collection('sports_configurations').doc(sportId).delete().catch(() => {});
  });

  if (dbV2 && dbV2 !== firestoreDb) {
    try {
      const v2DelBatch = dbV2.batch();
      v2DelBatch.delete(dbV2.collection('Sports_Configurations').doc(sportId));
      v2DelBatch.delete(dbV2.collection('sports_configurations').doc(sportId));
      await v2DelBatch.commit().catch(() => {});
    } catch {}
  }

  // Invalidate server cache
  try {
    serverCache.invalidateTags(['sports', 'catalog']);
  } catch {}

  // Log administrative audit entry
  logAdminAudit({
    user_id: adminUserId,
    email: 'admin@atleta.edu',
    action: `DELETE /api/v1/sports/${sportId}`,
    status: 'SUCCESS',
    endpoint: `/api/v1/sports/${sportId}`,
    ip_address: clientIp,
    details: {
      sport_id: sportId,
      sport_name: existingSport.sport_name,
      short_identifier: existingSport.short_identifier,
    },
  }).catch((err) => console.error('Admin audit error on deleteSport:', err));

  return {
    message: `Sport configuration '${existingSport.sport_name}' deleted successfully.`,
    sport_id: sportId,
  };
}

