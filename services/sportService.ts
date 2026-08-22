import crypto from 'crypto';
import { db } from '../utils/firebaseAdmin';
import {
  SportsConfiguration,
  CreateSportDTO,
  UpdateSportDTO,
} from '../models/sportModel';
import { ServiceError } from '../validators/matchValidator';
import { logAdminAudit } from './adminService';

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
  const snapshot = await db.collection('Sports_Configurations').limit(1).get();
  if (snapshot.empty) {
    const batch = db.batch();
    for (const sport of DEFAULT_SPORTS_CONFIGURATIONS) {
      const ref = db.collection('Sports_Configurations').doc(sport.sport_id);
      batch.set(ref, sport);
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
  await seedDefaultSportsIfEmpty();

  const snapshot = await db.collection('Sports_Configurations').get();
  const sports: SportsConfiguration[] = snapshot.docs.map((doc) => doc.data() as SportsConfiguration);

  if (onlyActive) {
    return sports.filter((s) => s.is_active !== false);
  }

  return sports;
}

/**
 * Retrieve single sport configuration by sport_id.
 */
export async function getSportByIdService(sportId: string): Promise<SportsConfiguration> {
  const doc = await db.collection('Sports_Configurations').doc(sportId).get();
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

  // 1. Check idempotency cache in Firestore
  const idempotencyDoc = await db.collection('Idempotency_Keys').doc(key).get();
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
  const sportId = crypto.randomUUID();
  const now = new Date().toISOString();

  const newSport: SportsConfiguration = {
    sport_id: sportId,
    sport_name: trimmedName,
    short_identifier: trimmedShortId,
    configurable_stats: payload.configurable_stats,
    is_active: payload.is_active !== undefined ? Boolean(payload.is_active) : true,
    created_at: now,
    updated_at: now,
  };

  // Atomic batch write: Sport Config + Idempotency record
  const batch = db.batch();
  const sportRef = db.collection('Sports_Configurations').doc(sportId);
  batch.set(sportRef, newSport);

  const responsePayload = {
    message: 'Sport configuration registered successfully.',
    sport: newSport,
  };

  const idempotencyRef = db.collection('Idempotency_Keys').doc(key);
  batch.set(idempotencyRef, {
    key,
    response: responsePayload,
    created_at: now,
  });

  await batch.commit();

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
  const sportDoc = await db.collection('Sports_Configurations').doc(sportId).get();
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
    updated_at: now,
  };

  await db.collection('Sports_Configurations').doc(sportId).set(updatedSport);

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
