import { ValidationError } from './userValidator';
import { MeasurementCategory } from '../models/sportModel';

export const VALID_MEASUREMENT_CATEGORIES: MeasurementCategory[] = [
  'Cumulative Total',
  'Percentage',
  'Time (ms)',
  'Distance (m)',
  'Count',
];

/**
 * Validates snake_case format: lowercase letters/numbers separated by single underscores.
 * Examples: 'points', 'fg_made', 'three_pointers_attempted', 'time_ms'
 */
export function isSnakeCase(key: string): boolean {
  if (!key || typeof key !== 'string') return false;
  const snakeCaseRegex = /^[a-z0-9]+(_[a-z0-9]+)*$/;
  return snakeCaseRegex.test(key);
}

/**
 * Validates sport registration payload (POST /api/v1/sports).
 *
 * ACCEPTANCE CRITERIA:
 * 1. Require Idempotency-Key header on POST /api/v1/sports.
 * 2. Duplicate metric keys within the same sport payload return HTTP 400 Bad Request.
 */
export function validateCreateSport(
  data: Record<string, unknown>,
  idempotencyKey?: string
): ValidationError[] {
  const errors: ValidationError[] = [];

  // Idempotency-Key header check
  if (!idempotencyKey || typeof idempotencyKey !== 'string' || idempotencyKey.trim().length === 0) {
    errors.push({
      field: 'Idempotency-Key',
      message: 'Idempotency-Key header is required on sport registration to prevent duplicate creation.',
    });
  }

  // sport_name (Required, Max 100)
  const sportName = typeof data.sport_name === 'string' ? data.sport_name.trim() : '';
  if (!sportName) {
    errors.push({ field: 'sport_name', message: 'Sport name (sport_name) is required.' });
  } else if (sportName.length > 100) {
    errors.push({ field: 'sport_name', message: 'Sport name (sport_name) cannot exceed 100 characters.' });
  }

  // short_identifier (Required, Max 20)
  const shortId = typeof data.short_identifier === 'string' ? data.short_identifier.trim() : '';
  if (!shortId) {
    errors.push({ field: 'short_identifier', message: 'Short identifier (short_identifier) is required.' });
  } else if (shortId.length > 20) {
    errors.push({ field: 'short_identifier', message: 'Short identifier (short_identifier) cannot exceed 20 characters.' });
  }

  // configurable_stats (Required array, min 1 item)
  if (!data.configurable_stats || !Array.isArray(data.configurable_stats)) {
    errors.push({
      field: 'configurable_stats',
      message: 'Configurable stats (configurable_stats) array is required.',
    });
  } else if (data.configurable_stats.length === 0) {
    errors.push({
      field: 'configurable_stats',
      message: 'At least one configurable stat is required in configurable_stats.',
    });
  } else {
    const seenKeys = new Set<string>();

    data.configurable_stats.forEach((stat: any, index: number) => {
      if (!stat || typeof stat !== 'object') {
        errors.push({
          field: `configurable_stats[${index}]`,
          message: `Item at index ${index} must be an object.`,
        });
        return;
      }

      // stat_name_key (Required, Snake_Case format, Max 100)
      const rawKey = typeof stat.stat_name_key === 'string' ? stat.stat_name_key.trim() : '';
      if (!rawKey) {
        errors.push({
          field: `configurable_stats[${index}].stat_name_key`,
          message: `stat_name_key is required at index ${index}.`,
        });
      } else if (rawKey.length > 100) {
        errors.push({
          field: `configurable_stats[${index}].stat_name_key`,
          message: `stat_name_key at index ${index} cannot exceed 100 characters.`,
        });
      } else if (!isSnakeCase(rawKey)) {
        errors.push({
          field: `configurable_stats[${index}].stat_name_key`,
          message: `stat_name_key '${rawKey}' at index ${index} must be in snake_case format (e.g. 'points', 'fg_made').`,
        });
      } else {
        // ACCEPTANCE CRITERIA: Duplicate metric keys within the same sport payload return HTTP 400 Bad Request.
        const normalizedKey = rawKey.toLowerCase();
        if (seenKeys.has(normalizedKey)) {
          errors.push({
            field: `configurable_stats[${index}].stat_name_key`,
            message: `Duplicate metric key '${rawKey}' found in configurable_stats. Each stat_name_key must be unique within the sport payload.`,
          });
        } else {
          seenKeys.add(normalizedKey);
        }
      }

      // measurement_category (Enum, Required)
      const category = typeof stat.measurement_category === 'string' ? stat.measurement_category.trim() : '';
      if (!category) {
        errors.push({
          field: `configurable_stats[${index}].measurement_category`,
          message: `measurement_category is required at index ${index}.`,
        });
      } else if (!VALID_MEASUREMENT_CATEGORIES.includes(category as MeasurementCategory)) {
        errors.push({
          field: `configurable_stats[${index}].measurement_category`,
          message: `Invalid measurement_category '${category}' at index ${index}. Must be one of: ${VALID_MEASUREMENT_CATEGORIES.join(', ')}.`,
        });
      }
    });
  }

  // is_active (Optional boolean)
  if (data.is_active !== undefined && typeof data.is_active !== 'boolean') {
    errors.push({ field: 'is_active', message: 'is_active must be a boolean value.' });
  }

  return errors;
}

/**
 * Validates sport update payload (PATCH /api/v1/sports/:sportId).
 */
export function validateUpdateSport(data: Record<string, unknown>): ValidationError[] {
  const errors: ValidationError[] = [];

  const hasName = data.sport_name !== undefined;
  const hasShortId = data.short_identifier !== undefined;
  const hasStats = data.configurable_stats !== undefined;
  const hasActive = data.is_active !== undefined;

  if (!hasName && !hasShortId && !hasStats && !hasActive) {
    errors.push({
      field: 'payload',
      message: 'At least one field (sport_name, short_identifier, configurable_stats, is_active) must be provided for update.',
    });
    return errors;
  }

  if (hasName) {
    const sportName = typeof data.sport_name === 'string' ? data.sport_name.trim() : '';
    if (!sportName) {
      errors.push({ field: 'sport_name', message: 'Sport name (sport_name) cannot be empty.' });
    } else if (sportName.length > 100) {
      errors.push({ field: 'sport_name', message: 'Sport name (sport_name) cannot exceed 100 characters.' });
    }
  }

  if (hasShortId) {
    const shortId = typeof data.short_identifier === 'string' ? data.short_identifier.trim() : '';
    if (!shortId) {
      errors.push({ field: 'short_identifier', message: 'Short identifier (short_identifier) cannot be empty.' });
    } else if (shortId.length > 20) {
      errors.push({ field: 'short_identifier', message: 'Short identifier (short_identifier) cannot exceed 20 characters.' });
    }
  }

  if (hasStats) {
    if (!Array.isArray(data.configurable_stats)) {
      errors.push({
        field: 'configurable_stats',
        message: 'Configurable stats (configurable_stats) must be an array.',
      });
    } else if (data.configurable_stats.length === 0) {
      errors.push({
        field: 'configurable_stats',
        message: 'At least one configurable stat is required in configurable_stats.',
      });
    } else {
      const seenKeys = new Set<string>();

      data.configurable_stats.forEach((stat: any, index: number) => {
        if (!stat || typeof stat !== 'object') {
          errors.push({
            field: `configurable_stats[${index}]`,
            message: `Item at index ${index} must be an object.`,
          });
          return;
        }

        const rawKey = typeof stat.stat_name_key === 'string' ? stat.stat_name_key.trim() : '';
        if (!rawKey) {
          errors.push({
            field: `configurable_stats[${index}].stat_name_key`,
            message: `stat_name_key is required at index ${index}.`,
          });
        } else if (rawKey.length > 100) {
          errors.push({
            field: `configurable_stats[${index}].stat_name_key`,
            message: `stat_name_key at index ${index} cannot exceed 100 characters.`,
          });
        } else if (!isSnakeCase(rawKey)) {
          errors.push({
            field: `configurable_stats[${index}].stat_name_key`,
            message: `stat_name_key '${rawKey}' at index ${index} must be in snake_case format.`,
          });
        } else {
          const normalizedKey = rawKey.toLowerCase();
          if (seenKeys.has(normalizedKey)) {
            errors.push({
              field: `configurable_stats[${index}].stat_name_key`,
              message: `Duplicate metric key '${rawKey}' found in configurable_stats. Each stat_name_key must be unique within the sport payload.`,
            });
          } else {
            seenKeys.add(normalizedKey);
          }
        }

        const category = typeof stat.measurement_category === 'string' ? stat.measurement_category.trim() : '';
        if (!category) {
          errors.push({
            field: `configurable_stats[${index}].measurement_category`,
            message: `measurement_category is required at index ${index}.`,
          });
        } else if (!VALID_MEASUREMENT_CATEGORIES.includes(category as MeasurementCategory)) {
          errors.push({
            field: `configurable_stats[${index}].measurement_category`,
            message: `Invalid measurement_category '${category}' at index ${index}. Must be one of: ${VALID_MEASUREMENT_CATEGORIES.join(', ')}.`,
          });
        }
      });
    }
  }

  if (hasActive && typeof data.is_active !== 'boolean') {
    errors.push({ field: 'is_active', message: 'is_active must be a boolean value.' });
  }

  return errors;
}
